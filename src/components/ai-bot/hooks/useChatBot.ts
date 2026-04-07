import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Client } from '@langchain/langgraph-sdk'
import type { ChatMessage, ChatStatus, ChatFile, CustomContent } from '../lib/message-types'
import type { PromptInputMessage } from '../lib/input-types'
import { fetchModels, getDefaultModel, type ModelInfo } from '../lib/models'
import type { ToolEventPayload, ToolEventPhase, ToolEventState } from '../lib/tool-events'
import { createThread, findActiveRun, loadThreadHistory } from '../lib/thread'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChatBotOptions {
  assistantId?: string
  systemPrompt?: string
  threadId?: string
  userId?: string
  suggestions?: string[]
  apiUrl?: string
  apiKey?: string
}

export interface UseChatBotReturn {
  messages: ChatMessage[]
  visibleMessages: ChatMessage[]
  status: ChatStatus
  isLoading: boolean
  isMaximized: boolean
  suggestions: string[]
  models: ModelInfo[]
  currentModel: ModelInfo | null
  initialTodos: any[]
  todoToolEvents: ToolEventPayload[]
  threadId: string | null
  useWebSearch: boolean
  modelSelectorOpen: boolean
  setCurrentModel: (model: ModelInfo) => void
  setUseWebSearch: (val: boolean) => void
  setModelSelectorOpen: (val: boolean) => void
  toggleMaximize: () => void
  handleFormSubmit: (message: PromptInputMessage) => void
  handleStop: () => Promise<void>
  handleSuggestionClick: (suggestion: string) => void
  handleSubmit: (userMessage: string, files?: ChatFile[]) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STREAM_MODE = ['messages-tuple', 'custom'] as const

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatBot(options: UseChatBotOptions = {}): UseChatBotReturn {
  const {
    assistantId = 'research',
    systemPrompt = '你是一个有用的助手，帮用户解决各种问题。',
    threadId: initialThreadId,
    userId = 'user001',
    suggestions: initialSuggestions = [],
    apiUrl = 'http://localhost:2024',
    apiKey,
  } = options

  // ---- LangGraph client (stable across renders) ----
  const clientRef = useRef(
    new Client({ apiUrl, apiKey: apiKey || undefined })
  )

  // ---- Simple state ----
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null)
  const [initialTodos, setInitialTodos] = useState<any[]>([])
  const [todoToolEvents, setTodoToolEvents] = useState<ToolEventPayload[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)

  // ---- Mutable refs (no re-render needed) ----
  const runIdRef = useRef<string>('')
  const isRejoiningStreamRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const currentModelRef = useRef<ModelInfo | null>(null)
  const threadIdRef = useRef<string | null>(null)

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { currentModelRef.current = currentModel }, [currentModel])
  useEffect(() => { threadIdRef.current = threadId }, [threadId])

  // ---- Flush helper: copy messagesRef into React state ----
  const flushMessages = useCallback(() => {
    setMessages([...messagesRef.current])
  }, [])

  // ---- visibleMessages (computed) ----
  const visibleMessages = useMemo(() => {
    if (!isRejoiningStreamRef.current) return messages
    return messages.filter(m => m.type !== 'custom')
  }, [messages])

  // ---------------------------------------------------------------------------
  // Message helpers (operate on messagesRef.current)
  // ---------------------------------------------------------------------------

  function getMessageIndexByKey(messageKey: string): number {
    return messagesRef.current.findIndex(m => m.key === messageKey)
  }

  function getPendingAssistantIndex(): number {
    for (let i = messagesRef.current.length - 1; i >= 0; i--) {
      const m = messagesRef.current[i]
      if (m.type === 'ai' && m.key.startsWith('pending-ai-') && !m.content) {
        return i
      }
    }
    return -1
  }

  function ensureAssistantMessageByStreamId(messageKey?: string): number {
    if (messageKey) {
      const existingIndex = getMessageIndexByKey(messageKey)
      if (existingIndex >= 0) return existingIndex
    }

    const pendingIndex = getPendingAssistantIndex()
    if (pendingIndex >= 0) {
      if (messageKey) {
        messagesRef.current[pendingIndex].key = messageKey
      }
      messagesRef.current[pendingIndex].batchId = runIdRef.current
      return pendingIndex
    }

    const nextMessageKey = messageKey || `ai-${Date.now()}-${Math.random()}`
    messagesRef.current.push({
      key: nextMessageKey,
      type: 'ai',
      content: '',
      batchId: runIdRef.current,
    })
    return messagesRef.current.length - 1
  }

  // ---------------------------------------------------------------------------
  // Tool helpers
  // ---------------------------------------------------------------------------

  function isTodoTool(toolName?: string): boolean {
    const name = toolName || ''
    return name.includes('todo') || name === 'write_todos'
  }

  function handleToolEvent(params: {
    phase: ToolEventPhase
    id?: string
    name?: string
    rawArgs?: string
    result?: string
    state: ToolEventState
  }) {
    if (!isTodoTool(params.name)) return

    setTodoToolEvents(prev => [
      ...prev,
      {
        phase: params.phase,
        id: params.id,
        name: params.name,
        args: params.rawArgs,
        result: params.result,
        state: params.state,
      },
    ])
  }

  // ---------------------------------------------------------------------------
  // Custom event handler
  // ---------------------------------------------------------------------------

  function handleCustomEvent(data: any) {
    if (data?.type === 'suggested_questions' && Array.isArray(data?.content)) {
      setSuggestions(data.content)
      console.log('📝 更新建议问题:', data.content)
      return
    }
    console.log('Custom event received:', data)
  }

  // ---------------------------------------------------------------------------
  // consumeStream — the core streaming logic
  // ---------------------------------------------------------------------------

  async function consumeStream(streamResponse: AsyncIterable<any>) {
    type PendingToolCall = {
      id: string
      name: string
      args: string
      messageKey?: string
      streamId: string
      streamIndex?: number
    }

    const assistantToolCalls = new Map<string, PendingToolCall>()

    // -- helper: create tool message --
    function createToolMessage(
      toolCallId: string,
      name: string,
      args: string,
      state: string
    ): ChatMessage {
      const now = Date.now()
      return {
        key: `tool-${toolCallId}-${Date.now()}`,
        type: 'tool',
        content: '',
        batchId: runIdRef.current,
        toolCalls: [
          {
            id: toolCallId,
            name,
            args,
            result: '',
            state,
            startedAt: now,
            completedAt: state === 'completed' || state === 'error' ? now : undefined,
          },
        ],
      }
    }

    // -- helper: update tool message by index --
    function updateToolMessage(
      messageKey: string,
      updates: { args?: string; result?: string; state?: string }
    ) {
      const msg = messagesRef.current[Number(messageKey)]
      if (msg && msg.toolCalls && msg.toolCalls.length > 0) {
        const toolCall = msg.toolCalls[0]
        if (updates.args !== undefined) toolCall.args = updates.args
        if (updates.result !== undefined) toolCall.result = updates.result
        if (updates.state !== undefined) {
          const previousState = toolCall.state
          const now = Date.now()
          toolCall.state = updates.state
          if (
            !toolCall.startedAt &&
            (updates.state === 'start' ||
              updates.state === 'running' ||
              updates.state === 'completed' ||
              updates.state === 'error')
          ) {
            toolCall.startedAt = now
          }
          if (updates.state === 'running' && previousState !== 'running' && !toolCall.startedAt) {
            toolCall.startedAt = now
          }
          if (updates.state === 'completed' || updates.state === 'error') {
            toolCall.completedAt = now
          } else {
            toolCall.completedAt = undefined
          }
        }
      }
    }

    function ensureToolMessage(record: PendingToolCall, state: string) {
      if (record.messageKey !== undefined) return
      const toolMsg = createToolMessage(record.id, record.name, record.args, state)
      messagesRef.current.push(toolMsg)
      record.messageKey = (messagesRef.current.length - 1).toString()
    }

    function normalizeToolArgs(rawArgs: unknown): string {
      if (typeof rawArgs === 'string') return rawArgs
      if (rawArgs && typeof rawArgs === 'object') {
        if (Array.isArray(rawArgs)) {
          return rawArgs.length > 0 ? JSON.stringify(rawArgs, null, 2) : ''
        }
        if (Object.keys(rawArgs as Record<string, unknown>).length === 0) {
          return ''
        }
        return JSON.stringify(rawArgs, null, 2)
      }
      return ''
    }

    function shouldUseInitialToolArgs(
      initialArgs: string,
      toolCallChunks?: Array<{ args?: string | null }>
    ): boolean {
      if (!initialArgs) return false
      if (!toolCallChunks?.length) return true

      const hasNonEmptyChunkArgs = toolCallChunks.some(chunk => {
        const args = typeof chunk.args === 'string' ? chunk.args : ''
        return args.trim().length > 0
      })

      return !hasNonEmptyChunkArgs
    }

    function resolveToolStreamIndex(
      toolCall: { id?: string; name?: string },
      fallbackIndex: number,
      toolCallChunks?: Array<{ id?: string | null; name?: string | null; index?: number }>
    ): number {
      if (!toolCallChunks?.length) return fallbackIndex

      const matchedChunk = toolCallChunks.find(
        chunk =>
          (toolCall.id && chunk.id === toolCall.id) ||
          (toolCall.name && chunk.name === toolCall.name)
      )

      return matchedChunk?.index ?? fallbackIndex
    }

    function getToolCallMapKey(
      toolCallId?: string,
      streamId?: string,
      streamIndex?: number
    ): string | undefined {
      if (toolCallId) return `id:${toolCallId}`
      if (streamId && streamIndex !== undefined) return `stream:${streamId}_${streamIndex}`
      return undefined
    }

    function setToolCallRecord(record: PendingToolCall, previousKey?: string) {
      const nextKey = getToolCallMapKey(record.id, record.streamId, record.streamIndex)
      if (!nextKey) return
      if (previousKey && previousKey !== nextKey) {
        assistantToolCalls.delete(previousKey)
      }
      assistantToolCalls.set(nextKey, record)
    }

    function findToolCallRecord(query: {
      toolCallId?: string
      streamId?: string
      streamIndex?: number
    }): { key?: string; record?: PendingToolCall } {
      const exactKey = getToolCallMapKey(query.toolCallId, query.streamId, query.streamIndex)
      if (exactKey) {
        const exact = assistantToolCalls.get(exactKey)
        if (exact) return { key: exactKey, record: exact }
      }

      if (query.toolCallId) {
        for (const [key, record] of assistantToolCalls) {
          if (record.id === query.toolCallId) return { key, record }
        }
      }

      if (query.streamId) {
        const candidates = Array.from(assistantToolCalls.entries()).filter(
          ([, record]) => record.streamId === query.streamId
        )
        if (query.streamIndex !== undefined) {
          const sameIndex = candidates.find(
            ([, record]) => record.streamIndex === query.streamIndex
          )
          if (sameIndex) return { key: sameIndex[0], record: sameIndex[1] }
        }
      }

      return {}
    }

    // ---- Main streaming loop ----
    try {
      for await (const chunk of streamResponse) {
        const chunkEvent = chunk.event as string
        const data = chunk.data as any

        // metadata event -> run_id
        if (chunkEvent === 'metadata' && data?.run_id) {
          runIdRef.current = data.run_id
        }

        // custom events
        if (chunkEvent === 'custom') {
          handleCustomEvent(data)

          if (data?.type === 'suggested_questions') {
            continue
          }

          const customContent: CustomContent = {
            type: data?.type || 'unknown',
            content: data?.content,
          }
          const customMessageId = `custom-${Date.now()}`
          messagesRef.current = [
            ...messagesRef.current,
            {
              key: customMessageId,
              type: 'custom',
              content: '',
              customContent,
            },
          ]
          flushMessages()
          console.log('📦 Custom 消息:', customContent)
          continue
        }

        // messages / messages/partial events
        if (chunkEvent === 'messages' || chunkEvent === 'messages/partial') {
          const messageArray = Array.isArray(data) ? data : [data]
          const message = messageArray[0] as any

          const messageMeta = messageArray[1] as any
          if (messageMeta?.run_id) {
            runIdRef.current = messageMeta.run_id
          }

          if (!message) continue

          const messageType = message.type

          // ---- Phase 4: tool result ----
          if (messageType === 'tool') {
            const toolCallId = message.tool_call_id
            const toolName = message.name || '未知工具'
            const toolResult =
              typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
            const toolStatus = message.status

            const { key: foundKey, record: foundToolCall } = findToolCallRecord({
              toolCallId,
            })
            if (foundKey) {
              assistantToolCalls.delete(foundKey)
            }

            const mapToolStatus = (s: string): string => {
              switch (s) {
                case 'success':
                  return 'completed'
                case 'error':
                  return 'error'
                case 'running':
                  return 'running'
                default:
                  return 'completed'
              }
            }
            const uiState = mapToolStatus(toolStatus)

            if (foundToolCall && foundToolCall.messageKey !== undefined) {
              updateToolMessage(foundToolCall.messageKey, {
                args: foundToolCall.args,
                result: toolResult,
                state: uiState,
              })
            } else {
              const toolMessageId = `tool-${toolCallId}-${Date.now()}`
              const now = Date.now()
              const toolMessage: ChatMessage = {
                key: toolMessageId,
                type: 'tool',
                content: toolResult,
                batchId: runIdRef.current,
                toolCalls: [
                  {
                    id: toolCallId,
                    name: toolName,
                    args: foundToolCall?.args || '',
                    result: toolResult,
                    state: uiState,
                    error: toolStatus === 'error' ? toolResult : undefined,
                    startedAt: now,
                    completedAt: uiState === 'completed' || uiState === 'error' ? now : undefined,
                  },
                ],
              }
              messagesRef.current.push(toolMessage)
            }

            handleToolEvent({
              phase: 'tool_result',
              id: toolCallId,
              name: toolName,
              rawArgs: foundToolCall?.args || '',
              result: toolResult,
              state: uiState as ToolEventState,
            })

            console.log('🔧 阶段4 - 工具结果返回:', {
              name: toolName,
              id: toolCallId,
              args: foundToolCall?.args || '',
              result: toolResult,
              status: toolStatus,
              messageCount: messagesRef.current.length,
            })

            flushMessages()
            continue
          }

          // ---- Phase 3: chunk_position === 'last' ----
          if (message.chunk_position === 'last') {
            for (const [, tc] of assistantToolCalls) {
              if (tc.streamId !== message.id) continue
              if (tc.messageKey !== undefined) {
                updateToolMessage(tc.messageKey, { state: 'running' })
              }
              handleToolEvent({
                phase: 'tool_call_finished',
                id: tc.id,
                name: tc.name,
                rawArgs: tc.args,
                state: 'running',
              })
            }
            console.log('🛑 阶段3 - 工具调用结束', {
              chunk_position: message.chunk_position,
              toolCallsCount: assistantToolCalls.size,
              allToolCalls: Array.from(assistantToolCalls.values()).map(t => ({
                id: t.id,
                name: t.name,
                args: t.args,
              })),
            })
          }

          // ---- Phases 1-2: tool_calls declaration + tool_call_chunks accumulation ----
          const messageId = message.id
          const hasToolCalls = message.tool_calls && message.tool_calls.length > 0
          const hasChunks = message.tool_call_chunks && message.tool_call_chunks.length > 0

          if (hasToolCalls || hasChunks) {
            // Phase 1: tool_calls
            if (hasToolCalls) {
              for (const [index, tc] of message.tool_calls.entries()) {
                const hasStableIdentity = Boolean(tc.id || tc.name)
                if (!hasStableIdentity) continue

                const normalizedInitialArgs = normalizeToolArgs(tc.args)
                const initialArgs = shouldUseInitialToolArgs(
                  normalizedInitialArgs,
                  message.tool_call_chunks
                )
                  ? normalizedInitialArgs
                  : ''
                const streamIndex = resolveToolStreamIndex(
                  tc,
                  index,
                  message.tool_call_chunks
                )
                const { key: existingKey, record: existing } = findToolCallRecord({
                  toolCallId: tc.id,
                  streamId: messageId,
                  streamIndex,
                })

                if (!existing) {
                  const toolMsg = createToolMessage(tc.id, tc.name, initialArgs, 'start')
                  messagesRef.current.push(toolMsg)
                  const msgIndex = messagesRef.current.length - 1

                  setToolCallRecord({
                    id: tc.id,
                    name: tc.name,
                    args: initialArgs,
                    messageKey: msgIndex.toString(),
                    streamId: messageId,
                    streamIndex,
                  })
                  handleToolEvent({
                    phase: 'tool_call_started',
                    id: tc.id,
                    name: tc.name,
                    rawArgs: initialArgs,
                    state: 'start',
                  })
                  console.log('📝 阶段1 - 工具调用开始:', {
                    messageId,
                    index: streamIndex,
                    toolCallId: tc.id,
                    name: tc.name,
                    msgIndex,
                  })
                } else {
                  if (tc.id) existing.id = tc.id
                  if (tc.name) existing.name = tc.name
                  if (!existing.args && initialArgs) existing.args = initialArgs
                  existing.streamId = messageId
                  existing.streamIndex = streamIndex
                  ensureToolMessage(existing, existing.args ? 'running' : 'start')
                  setToolCallRecord(existing, existingKey)
                }
              }
            }

            // Phase 2: tool_call_chunks
            if (hasChunks) {
              for (const tcChunk of message.tool_call_chunks) {
                const index = tcChunk.index
                if (index === undefined) continue

                const { key: existingKey, record: existing } = findToolCallRecord({
                  toolCallId: tcChunk.id || undefined,
                  streamId: messageId,
                  streamIndex: index,
                })

                if (!existing) {
                  if (!tcChunk.id && !tcChunk.name) {
                    setToolCallRecord({
                      id: '',
                      name: '',
                      args: tcChunk.args || '',
                      streamId: messageId,
                      streamIndex: index,
                    })
                    continue
                  }

                  const toolMsg = createToolMessage(
                    tcChunk.id || '',
                    tcChunk.name || '',
                    tcChunk.args || '',
                    'running'
                  )
                  messagesRef.current.push(toolMsg)
                  const msgIndex = messagesRef.current.length - 1

                  setToolCallRecord({
                    id: tcChunk.id || '',
                    name: tcChunk.name || '',
                    args: tcChunk.args || '',
                    messageKey: msgIndex.toString(),
                    streamId: messageId,
                    streamIndex: index,
                  })
                  handleToolEvent({
                    phase: 'tool_args_streaming',
                    id: tcChunk.id || '',
                    name: tcChunk.name || '',
                    rawArgs: tcChunk.args || '',
                    state: 'running',
                  })
                  console.log('📝 阶段1 - 工具调用开始:', {
                    messageId,
                    index,
                    toolCallId: tcChunk.id || '(暂无)',
                    name: tcChunk.name || '(暂无)',
                    msgIndex,
                  })
                } else {
                  if (tcChunk.args && tcChunk.args.trim()) {
                    existing.args = (existing.args || '') + tcChunk.args
                    if (existing.messageKey) {
                      updateToolMessage(existing.messageKey, {
                        args: existing.args,
                        state: 'running',
                      })
                    }
                    handleToolEvent({
                      phase: 'tool_args_streaming',
                      id: existing.id || tcChunk.id || '',
                      name: existing.name || tcChunk.name || '',
                      rawArgs: existing.args,
                      state: 'running',
                    })
                  }
                  if (tcChunk.id && !existing.id) existing.id = tcChunk.id
                  if (tcChunk.name) existing.name = tcChunk.name
                  existing.streamId = messageId
                  existing.streamIndex = index
                  if ((existing.id || existing.name) && existing.messageKey === undefined) {
                    ensureToolMessage(existing, 'running')
                  }
                  if (existing.messageKey && tcChunk.args && tcChunk.args.trim()) {
                    updateToolMessage(existing.messageKey, {
                      args: existing.args,
                      state: 'running',
                    })
                  }
                  setToolCallRecord(existing, existingKey)

                  console.log('📝 阶段2 - args 流式累加:', {
                    messageId,
                    index,
                    newArgs: tcChunk.args,
                    accumulatedArgs: existing.args,
                  })
                }
              }
            }
          }

          // ---- AI content streaming ----
          let content = ''
          if (typeof message.content === 'string') {
            content = message.content
          } else if (Array.isArray(message.content)) {
            content = message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('')
          }

          const assistantIndex = ensureAssistantMessageByStreamId(message.id)
          if (assistantIndex >= 0) {
            if (content !== undefined) {
              messagesRef.current[assistantIndex].content += content
            }
            messagesRef.current[assistantIndex].batchId = runIdRef.current
          }

          flushMessages()
        }
      }
    } finally {
      setStatus('ready')
    }
  }

  // ---------------------------------------------------------------------------
  // handleSubmit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (userMessage: string, files: ChatFile[] = []) => {
      if (status === 'streaming') return
      setStatus('streaming')

      // Build content blocks
      const contentBlocks: any[] = []

      if (userMessage.trim()) {
        contentBlocks.push({ type: 'text', text: userMessage })
      }

      for (const file of files) {
        const mimeType = file.mediaType || 'application/octet-stream'
        const filename = file.filename || file.id || 'unknown'
        const normalizedType =
          file.type || (file.data ? (mimeType.startsWith('image/') ? 'image' : 'file') : 'file_url')

        if ((normalizedType === 'file' || normalizedType === 'image') && file.data) {
          if (normalizedType === 'image') {
            contentBlocks.push({
              type: 'image',
              mimeType,
              data: file.data,
              metadata: { name: filename },
            })
          } else {
            contentBlocks.push({
              type: 'file',
              mimeType,
              data: file.data,
              metadata: { filename },
            })
          }
          continue
        }

        if (file.url) {
          contentBlocks.push({
            type: 'file_url',
            url: file.url,
            mimeType,
            metadata: { filename },
          })
        }
      }

      // Add user message to local list
      const userMessageId = `human-${Date.now()}`
      messagesRef.current = [
        ...messagesRef.current,
        {
          key: userMessageId,
          type: 'human',
          content: userMessage,
          files: files.map(f => ({
            url: f.url,
            mediaType: f.mediaType,
            filename: f.filename,
          })),
        },
      ]
      flushMessages()

      try {
        const client = clientRef.current
        let currentThreadId = threadIdRef.current

        if (!currentThreadId) {
          const thread = await client.threads.create({
            metadata: {
              user_id: userId,
              name: userMessage.slice(0, 50),
            },
          })
          currentThreadId = thread.thread_id
          threadIdRef.current = currentThreadId
          setThreadId(currentThreadId)
        }

        const model = currentModelRef.current

        const streamResponse = client.runs.stream(currentThreadId!, assistantId, {
          input: {
            messages: [
              ...(systemPrompt
                ? [
                    {
                      type: 'system' as const,
                      content: [{ type: 'text', text: systemPrompt }],
                    },
                  ]
                : []),
              {
                type: 'human' as const,
                content: contentBlocks,
              },
            ],
          },
          config: {
            tags: ['serv'],
            configurable: {
              model_provider: model?.provider || 'openai',
              model: model?.name || '',
              base_url: model?.base_url || '',
            },
          },
          metadata: {
            user_id: userId,
            name: userMessage.slice(0, 50),
          },
          streamMode: [...STREAM_MODE],
          stream_resumable: false,
          on_disconnect: 'cancel',
        } as any)

        // Add empty assistant message placeholder
        const assistantMessageId = `ai-${Date.now()}`
        messagesRef.current = [
          ...messagesRef.current,
          {
            key: `pending-${assistantMessageId}`,
            type: 'ai',
            content: '',
            batchId: '',
          },
        ]
        flushMessages()

        await consumeStream(streamResponse)

        const lastIndex = messagesRef.current.length - 1
        if (lastIndex >= 0) {
          messagesRef.current[lastIndex].batchId = runIdRef.current
        }

        runIdRef.current = ''
        setStatus('ready')
      } catch (error: any) {
        console.error('Error sending message:', error)

        let errorDisplayMessage = '抱歉，发生了一些错误，请稍后重试。'
        if (error) {
          const errorMsg = error.message || error.error?.message || String(error)
          const errorType = error.error?.error || error.name || 'APIError'

          if (errorMsg && errorMsg !== '[object Object]') {
            if (errorType === 'APIError' && errorMsg.includes('internal error')) {
              errorDisplayMessage = '服务内部错误，请稍后重试。'
            } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
              errorDisplayMessage = '请求超时，请稍后重试。'
            } else if (errorMsg.includes('network') || errorMsg.includes('Network')) {
              errorDisplayMessage = '网络连接失败，请检查网络后重试。'
            } else if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
              errorDisplayMessage = '认证失败，请重新登录。'
            } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
              errorDisplayMessage = '没有权限执行此操作。'
            } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
              errorDisplayMessage = '请求过于频繁，请稍后再试。'
            } else {
              errorDisplayMessage = `抱歉，发生错误: ${errorMsg}`
            }
          }
        }

        const errorMessageId = `error-${Date.now()}`
        messagesRef.current = [
          ...messagesRef.current,
          {
            key: errorMessageId,
            type: 'ai',
            content: errorDisplayMessage,
            batchId: errorMessageId,
          },
        ]
        flushMessages()
        setStatus('ready')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, assistantId, systemPrompt, userId, flushMessages]
  )

  // ---------------------------------------------------------------------------
  // handleFormSubmit
  // ---------------------------------------------------------------------------

  const handleFormSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = !!message.text
      const hasAttachments = message.files?.length > 0

      if (!hasText && !hasAttachments) return

      const text = message.text?.trim() || ''
      handleSubmit(text || '仅发送了附件', message.files || [])
    },
    [handleSubmit]
  )

  // ---------------------------------------------------------------------------
  // handleStop
  // ---------------------------------------------------------------------------

  const handleStop = useCallback(async () => {
    const client = clientRef.current
    const tid = threadIdRef.current
    const rid = runIdRef.current

    console.log('🛑 点击停止按钮:', { threadId: tid, runId: rid })

    if (tid && rid) {
      try {
        console.log('📡 发送 cancel 请求...')
        await client.runs.cancel(tid, rid)
        console.log('✅ cancel 请求成功')
        setStatus('ready')
      } catch (error) {
        console.error('❌ cancel 请求失败:', error)
        setStatus('ready')
      }
    } else {
      console.log('⚠️ 缺少 threadId 或 runId，直接重置状态')
      setStatus('ready')
    }
  }, [])

  // ---------------------------------------------------------------------------
  // handleSuggestionClick
  // ---------------------------------------------------------------------------

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit(suggestion)
    },
    [handleSubmit]
  )

  // ---------------------------------------------------------------------------
  // toggleMaximize
  // ---------------------------------------------------------------------------

  const toggleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev)
  }, [])

  // ---------------------------------------------------------------------------
  // Initialization (onMounted equivalent)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function init() {
      setIsLoading(true)
      setSuggestions([...initialSuggestions])

      const client = clientRef.current

      await Promise.all([
        // Fetch models
        (async () => {
          const data = await fetchModels(apiUrl)
          if (cancelled) return
          setModels(data)
          const defaultModel = getDefaultModel(data) || null
          setCurrentModel(defaultModel)
          currentModelRef.current = defaultModel
        })(),
        // Load thread history if threadId provided
        initialThreadId
          ? (async () => {
              const tid = await createThread(client, initialThreadId, userId)
              if (cancelled) return
              setThreadId(tid)
              threadIdRef.current = tid
              const loadedMessages = await loadThreadHistory(
                client,
                tid,
                (questions) => {
                  if (!cancelled) setSuggestions(questions)
                },
                (todos) => {
                  if (!cancelled) setInitialTodos(todos)
                }
              )
              if (!cancelled) {
                messagesRef.current = loadedMessages
                setMessages(loadedMessages)
              }
            })()
          : Promise.resolve(),
      ])

      if (cancelled) return
      setIsLoading(false)

      // Check for active run to rejoin
      const currentTid = threadIdRef.current
      if (currentTid) {
        const activeRun = await findActiveRun(client, currentTid)
        if (activeRun && !cancelled) {
          runIdRef.current = activeRun.run_id
          setStatus('streaming')
          isRejoiningStreamRef.current = true

          const rejoinPromise = consumeStream(
            client.runs.joinStream(currentTid, activeRun.run_id, {
              streamMode: [...STREAM_MODE],
            })
          )
          void rejoinPromise
            .catch((error) => {
              console.error('Failed to rejoin active run:', error)
            })
            .finally(() => {
              isRejoiningStreamRef.current = false
              runIdRef.current = ''
            })
        }
      }
    }

    init()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    messages,
    visibleMessages,
    status,
    isLoading,
    isMaximized,
    suggestions,
    models,
    currentModel,
    initialTodos,
    todoToolEvents,
    threadId,
    useWebSearch,
    modelSelectorOpen,
    setCurrentModel,
    setUseWebSearch,
    setModelSelectorOpen,
    toggleMaximize,
    handleFormSubmit,
    handleStop,
    handleSuggestionClick,
    handleSubmit,
  }
}
