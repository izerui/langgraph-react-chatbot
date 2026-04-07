import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Client } from '@langchain/langgraph-sdk'
import type {
  AiBotInputApi,
  AiBotPublicApi,
  AttachmentTriggerSlotProps,
  PromptInputMessage,
} from './lib/input-types'
import type {
  ChatFile,
  ChatMessage,
  ChatStatus,
  CustomContent,
} from './lib/message-types'
import type { AiBotTheme } from './lib/theme'
import type { ModelInfo } from './lib/models'
import { fetchModels, getDefaultModel } from './lib/models'
import type {
  ToolEventPayload,
  ToolEventPhase,
  ToolEventState,
} from './lib/tool-events'
import { createThread, findActiveRun, loadThreadHistory } from './lib/thread'
import { PortalHostContext } from './contexts/PortalHostContext'

import { ChatHeader } from './ChatHeader'
import ChatMessages from './ChatMessages'
import ChatInput from './ChatInput'
import { Loader } from './Loader'
import { GeneratedFiles } from './GeneratedFiles'
import TodoList from './TodoList'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatBotProps {
  assistantId?: string
  assistantName?: string
  systemPrompt?: string
  threadId?: string
  userId?: string
  showHeaderActions?: boolean
  suggestions?: string[]
  apiUrl?: string
  apiKey?: string
  theme?: AiBotTheme
  allowModelSwitch?: boolean
  onClose?: () => void
  onMaximizeChange?: (value: boolean) => void
  renderEmpty?: (props: {
    sendMessage: (message: string, files?: ChatFile[]) => void
  }) => ReactNode
  renderCustom?: (props: {
    customContent: CustomContent
    threadId: string | null
  }) => ReactNode
  renderAttachmentTrigger?: (props: AttachmentTriggerSlotProps) => ReactNode
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = `
.chat-bot {
  position: relative;
  width: 100%;
  height: 100%;
}

.chat-bot-portal-host {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  isolation: isolate;
}

.chat-bot-portal-host > * {
  pointer-events: auto;
}

.chat-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ai-surface);
  border-radius: 8px;
  border: 1px solid var(--ai-border-subtle);
  box-shadow: var(--ai-shadow);
  overflow: hidden;
  position: relative;
}

.chat-window.maximized {
  border-radius: 8px;
  border: 1px solid var(--ai-border-subtle);
}

.default-empty-state {
  display: flex;
  min-height: 400px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.default-empty-badge {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 999px;
  background: var(--ai-accent-soft);
  color: var(--ai-accent-soft-foreground);
  font-size: 18px;
  font-weight: 700;
}

.default-empty-title {
  margin: 16px 0 8px;
  font-size: 28px;
  line-height: 1.2;
  color: var(--foreground);
}

.default-empty-desc {
  max-width: 520px;
  margin: 0;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.loading-mask {
  position: absolute;
  inset: 0;
  background: var(--ai-overlay);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10;
}
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STREAM_MODE = ['messages-tuple', 'custom'] as const

function isTodoTool(toolName?: string): boolean {
  const name = toolName || ''
  return name.includes('todo') || name === 'write_todos'
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
  const hasNonEmptyChunkArgs = toolCallChunks.some((chunk) => {
    const args = typeof chunk.args === 'string' ? chunk.args : ''
    return args.trim().length > 0
  })
  return !hasNonEmptyChunkArgs
}

function resolveToolStreamIndex(
  toolCall: { id?: string; name?: string },
  fallbackIndex: number,
  toolCallChunks?: Array<{
    id?: string | null
    name?: string | null
    index?: number
  }>
): number {
  if (!toolCallChunks?.length) return fallbackIndex
  const matchedChunk = toolCallChunks.find(
    (chunk) =>
      (toolCall.id && chunk.id === toolCall.id) ||
      (toolCall.name && chunk.name === toolCall.name)
  )
  return matchedChunk?.index ?? fallbackIndex
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatBot = forwardRef<AiBotPublicApi, ChatBotProps>(function ChatBot(
  {
    assistantId = 'research',
    assistantName = 'Chat',
    systemPrompt = '\u4f60\u662f\u4e00\u4e2a\u6709\u7528\u7684\u52a9\u624b\uff0c\u5e2e\u7528\u6237\u89e3\u51b3\u5404\u79cd\u95ee\u9898\u3002',
    threadId: threadIdProp,
    userId = 'user001',
    showHeaderActions = true,
    suggestions: suggestionsProp = [],
    apiUrl = 'http://localhost:2024',
    apiKey,
    theme = 'light',
    allowModelSwitch = true,
    onClose,
    onMaximizeChange,
    renderEmpty,
    renderCustom,
    renderAttachmentTrigger,
  },
  ref
) {
  // Refs
  const chatInputRef = useRef<AiBotInputApi | null>(null)
  const portalHostRef = useRef<HTMLDivElement | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  // LangGraph Client (stable across renders)
  const clientRef = useRef<Client | null>(null)
  if (!clientRef.current) {
    clientRef.current = new Client({
      apiUrl,
      apiKey: apiKey || undefined,
    })
  }
  const client = clientRef.current

  // State
  const [isMaximized, setIsMaximized] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [isLoading, setIsLoading] = useState(true)
  const [isRejoiningStream, setIsRejoiningStream] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [initialTodos, setInitialTodos] = useState<any[]>([])
  const [todoToolEvents, setTodoToolEvents] = useState<ToolEventPayload[]>([])

  // Mutable refs for values needed inside stream callbacks without stale closures
  const runIdRef = useRef<string>('')
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages
  const threadIdRef = useRef<string | null>(null)
  threadIdRef.current = threadId
  const statusRef = useRef<ChatStatus>('ready')
  statusRef.current = status

  // Visible messages
  const visibleMessages = useMemo(() => {
    if (!isRejoiningStream) return messages
    return messages.filter((m) => m.type !== 'custom')
  }, [messages, isRejoiningStream])

  // -----------------------------------------------------------------------
  // Tool event dispatch
  // -----------------------------------------------------------------------

  const handleToolEvent = useCallback(
    (params: {
      phase: ToolEventPhase
      id?: string
      name?: string
      rawArgs?: string
      result?: string
      state: ToolEventState
    }) => {
      if (!isTodoTool(params.name)) return
      setTodoToolEvents((prev) => [
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
    },
    []
  )

  // -----------------------------------------------------------------------
  // consumeStream
  // -----------------------------------------------------------------------

  const consumeStream = useCallback(
    async (streamResponse: AsyncIterable<any>) => {
      type PendingToolCall = {
        id: string
        name: string
        args: string
        messageKey?: string
        streamId: string
        streamIndex?: number
      }

      const assistantToolCalls = new Map<string, PendingToolCall>()

      function getToolCallMapKey(
        toolCallId?: string,
        streamId?: string,
        streamIndex?: number
      ) {
        if (toolCallId) return `id:${toolCallId}`
        if (streamId && streamIndex !== undefined)
          return `stream:${streamId}_${streamIndex}`
        return undefined
      }

      function setToolCallRecord(
        record: PendingToolCall,
        previousKey?: string
      ) {
        const nextKey = getToolCallMapKey(
          record.id,
          record.streamId,
          record.streamIndex
        )
        if (!nextKey) return
        if (previousKey && previousKey !== nextKey) {
          assistantToolCalls.delete(previousKey)
        }
        assistantToolCalls.set(nextKey, record)
      }

      function findToolCallRecord({
        toolCallId,
        streamId,
        streamIndex,
      }: {
        toolCallId?: string
        streamId?: string
        streamIndex?: number
      }): { key?: string; record?: PendingToolCall } {
        const exactKey = getToolCallMapKey(toolCallId, streamId, streamIndex)
        if (exactKey) {
          const exact = assistantToolCalls.get(exactKey)
          if (exact) return { key: exactKey, record: exact }
        }
        if (toolCallId) {
          for (const [key, record] of assistantToolCalls) {
            if (record.id === toolCallId) return { key, record }
          }
        }
        if (streamId) {
          const candidates = Array.from(assistantToolCalls.entries()).filter(
            ([, record]) => record.streamId === streamId
          )
          if (streamIndex !== undefined) {
            const sameIndex = candidates.find(
              ([, record]) => record.streamIndex === streamIndex
            )
            if (sameIndex)
              return { key: sameIndex[0], record: sameIndex[1] }
          }
        }
        return {}
      }

      // Work on a mutable local copy; flush via setMessages at strategic points
      let localMessages = [...messagesRef.current]

      function flushMessages() {
        messagesRef.current = localMessages
        setMessages([...localMessages])
      }

      function getMessageIndexByKey(messageKey: string) {
        return localMessages.findIndex((m) => m.key === messageKey)
      }

      function getPendingAssistantIndex() {
        for (let i = localMessages.length - 1; i >= 0; i--) {
          const m = localMessages[i]
          if (
            m.type === 'ai' &&
            m.key.startsWith('pending-ai-') &&
            !m.content
          ) {
            return i
          }
        }
        return -1
      }

      function ensureAssistantMessageByStreamId(messageKey?: string) {
        if (messageKey) {
          const idx = getMessageIndexByKey(messageKey)
          if (idx >= 0) return idx
        }
        const pendingIdx = getPendingAssistantIndex()
        if (pendingIdx >= 0) {
          if (messageKey) localMessages[pendingIdx].key = messageKey
          localMessages[pendingIdx].batchId = runIdRef.current
          return pendingIdx
        }
        const key = messageKey || `ai-${Date.now()}-${Math.random()}`
        localMessages.push({
          key,
          type: 'ai',
          content: '',
          batchId: runIdRef.current,
        })
        return localMessages.length - 1
      }

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
              completedAt:
                state === 'completed' || state === 'error' ? now : undefined,
            },
          ],
        }
      }

      function updateToolMessage(
        messageKey: string,
        updates: { args?: string; result?: string; state?: string }
      ) {
        const msg = localMessages[Number(messageKey)]
        if (msg?.toolCalls?.[0]) {
          const tc = msg.toolCalls[0]
          if (updates.args !== undefined) tc.args = updates.args
          if (updates.result !== undefined) tc.result = updates.result
          if (updates.state !== undefined) {
            const prev = tc.state
            const now = Date.now()
            tc.state = updates.state
            if (
              !tc.startedAt &&
              ['start', 'running', 'completed', 'error'].includes(
                updates.state
              )
            )
              tc.startedAt = now
            if (
              updates.state === 'running' &&
              prev !== 'running' &&
              !tc.startedAt
            )
              tc.startedAt = now
            if (
              updates.state === 'completed' ||
              updates.state === 'error'
            )
              tc.completedAt = now
            else tc.completedAt = undefined
          }
        }
      }

      function ensureToolMessage(record: PendingToolCall, state: string) {
        if (record.messageKey !== undefined) return
        const toolMsg = createToolMessage(
          record.id,
          record.name,
          record.args,
          state
        )
        localMessages.push(toolMsg)
        record.messageKey = (localMessages.length - 1).toString()
      }

      // Handle custom events (suggested_questions, etc.)
      function handleCustomEvent(data: any) {
        if (
          data?.type === 'suggested_questions' &&
          Array.isArray(data?.content)
        ) {
          setSuggestions(data.content)
          return
        }
        console.log('Custom event received:', data)
      }

      try {
        for await (const chunk of streamResponse) {
          const chunkEvent = chunk.event as string
          const data = chunk.data as any

          // metadata event -> run_id
          if (chunkEvent === 'metadata' && data?.run_id) {
            runIdRef.current = data.run_id
          }

          // custom event
          if (chunkEvent === 'custom') {
            handleCustomEvent(data)

            if (data?.type === 'suggested_questions') continue

            const customContent: CustomContent = {
              type: data?.type || 'unknown',
              content: data?.content,
            }
            localMessages.push({
              key: `custom-${Date.now()}`,
              type: 'custom',
              content: '',
              customContent,
            })
            flushMessages()
            continue
          }

          if (
            chunkEvent === 'messages' ||
            chunkEvent === 'messages/partial'
          ) {
            const messageArray = Array.isArray(data) ? data : [data]
            const message = messageArray[0] as any
            const messageMeta = messageArray[1] as any
            if (messageMeta?.run_id) {
              runIdRef.current = messageMeta.run_id
            }

            if (!message) continue

            const messageType = message.type

            // Phase 4: tool result
            if (messageType === 'tool') {
              const toolCallId = message.tool_call_id
              const toolName = message.name || 'Unknown tool'
              const toolResult =
                typeof message.content === 'string'
                  ? message.content
                  : JSON.stringify(message.content)
              const toolStatus = message.status

              const { key: foundKey, record: foundToolCall } =
                findToolCallRecord({ toolCallId })
              if (foundKey) assistantToolCalls.delete(foundKey)

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

              if (
                foundToolCall &&
                foundToolCall.messageKey !== undefined
              ) {
                updateToolMessage(foundToolCall.messageKey, {
                  args: foundToolCall.args,
                  result: toolResult,
                  state: uiState,
                })
              } else {
                const now = Date.now()
                localMessages.push({
                  key: `tool-${toolCallId}-${Date.now()}`,
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
                      error:
                        toolStatus === 'error' ? toolResult : undefined,
                      startedAt: now,
                      completedAt:
                        uiState === 'completed' || uiState === 'error'
                          ? now
                          : undefined,
                    },
                  ],
                })
              }

              handleToolEvent({
                phase: 'tool_result',
                id: toolCallId,
                name: toolName,
                rawArgs: foundToolCall?.args || '',
                result: toolResult,
                state: uiState as ToolEventState,
              })

              flushMessages()
              continue
            }

            // Phase 3: tool call chunks ended
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
            }

            // Phase 1-2: tool declarations and streaming args
            const messageId = message.id
            const hasToolCalls =
              message.tool_calls && message.tool_calls.length > 0
            const hasChunks =
              message.tool_call_chunks &&
              message.tool_call_chunks.length > 0

            if (hasToolCalls || hasChunks) {
              // Phase 1
              if (hasToolCalls) {
                for (const [index, tc] of message.tool_calls.entries()) {
                  if (!tc.id && !tc.name) continue
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
                  const { key: existingKey, record: existing } =
                    findToolCallRecord({
                      toolCallId: tc.id,
                      streamId: messageId,
                      streamIndex,
                    })
                  if (!existing) {
                    const toolMsg = createToolMessage(
                      tc.id,
                      tc.name,
                      initialArgs,
                      'start'
                    )
                    localMessages.push(toolMsg)
                    const msgIndex = localMessages.length - 1
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
                  } else {
                    if (tc.id) existing.id = tc.id
                    if (tc.name) existing.name = tc.name
                    if (!existing.args && initialArgs)
                      existing.args = initialArgs
                    existing.streamId = messageId
                    existing.streamIndex = streamIndex
                    ensureToolMessage(
                      existing,
                      existing.args ? 'running' : 'start'
                    )
                    setToolCallRecord(existing, existingKey)
                  }
                }
              }

              // Phase 2
              if (hasChunks) {
                for (const tcChunk of message.tool_call_chunks) {
                  const index = tcChunk.index
                  if (index === undefined) continue

                  const { key: existingKey, record: existing } =
                    findToolCallRecord({
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
                    localMessages.push(toolMsg)
                    const msgIndex = localMessages.length - 1
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
                    if (tcChunk.id && !existing.id)
                      existing.id = tcChunk.id
                    if (tcChunk.name) existing.name = tcChunk.name
                    existing.streamId = messageId
                    existing.streamIndex = index
                    if (
                      (existing.id || existing.name) &&
                      existing.messageKey === undefined
                    ) {
                      ensureToolMessage(existing, 'running')
                    }
                    if (
                      existing.messageKey &&
                      tcChunk.args &&
                      tcChunk.args.trim()
                    ) {
                      updateToolMessage(existing.messageKey, {
                        args: existing.args,
                        state: 'running',
                      })
                    }
                    setToolCallRecord(existing, existingKey)
                  }
                }
              }
            }

            // AI content accumulation
            let content = ''
            if (typeof message.content === 'string') {
              content = message.content
            } else if (Array.isArray(message.content)) {
              content = message.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text)
                .join('')
            }

            const assistantIndex =
              ensureAssistantMessageByStreamId(message.id)
            if (assistantIndex >= 0) {
              if (content !== undefined) {
                localMessages[assistantIndex].content += content
              }
              localMessages[assistantIndex].batchId = runIdRef.current
            }

            flushMessages()
          }
        }
      } finally {
        setStatus('ready')
      }
    },
    [handleToolEvent]
  )

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function init() {
      setIsLoading(true)
      setSuggestions([...suggestionsProp])

      await Promise.all([
        (async () => {
          const data = await fetchModels(apiUrl)
          if (cancelled) return
          setModels(data)
          setCurrentModel(getDefaultModel(data) || null)
        })(),
        threadIdProp
          ? (async () => {
              const tid = await createThread(
                client,
                threadIdProp,
                userId
              )
              if (cancelled) return
              setThreadId(tid)
              threadIdRef.current = tid
              const loaded = await loadThreadHistory(
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
                messagesRef.current = loaded
                setMessages(loaded)
              }
            })()
          : Promise.resolve(),
      ])

      if (cancelled) return
      setIsLoading(false)

      // Check for active run to rejoin
      const currentThreadId = threadIdRef.current
      if (currentThreadId) {
        const activeRun = await findActiveRun(client, currentThreadId)
        if (activeRun && !cancelled) {
          runIdRef.current = activeRun.run_id
          setStatus('streaming')
          setIsRejoiningStream(true)
          try {
            await consumeStream(
              client.runs.joinStream(currentThreadId, activeRun.run_id, {
                streamMode: [...STREAM_MODE],
              })
            )
          } catch (error) {
            console.error('Failed to rejoin active run:', error)
          } finally {
            if (!cancelled) {
              setIsRejoiningStream(false)
              runIdRef.current = ''
            }
          }
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => {
      const next = !prev
      onMaximizeChange?.(next)
      return next
    })
  }, [onMaximizeChange])

  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  const handleSubmit = useCallback(
    async (userMessage: string, files: ChatFile[] = []) => {
      if (statusRef.current === 'streaming') return
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
          file.type ||
          (file.data
            ? mimeType.startsWith('image/')
              ? 'image'
              : 'file'
            : 'file_url')

        if (
          (normalizedType === 'file' || normalizedType === 'image') &&
          file.data
        ) {
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

      // Add user message locally
      const userMessageId = `human-${Date.now()}`
      const newMessages: ChatMessage[] = [
        ...messagesRef.current,
        {
          key: userMessageId,
          type: 'human',
          content: userMessage,
          files: files.map((f) => ({
            url: f.url,
            mediaType: f.mediaType,
            filename: f.filename,
          })),
        },
      ]
      messagesRef.current = newMessages
      setMessages([...newMessages])

      try {
        let tid = threadIdRef.current
        if (!tid) {
          const thread = await client.threads.create({
            metadata: {
              user_id: userId,
              name: userMessage.slice(0, 50),
            },
          })
          tid = thread.thread_id
          setThreadId(tid)
          threadIdRef.current = tid
        }

        const streamResponse = client.runs.stream(tid!, assistantId, {
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
              model_provider: currentModel?.provider || 'openai',
              model: currentModel?.name || '',
              base_url: currentModel?.base_url || '',
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

        // Add empty assistant message
        const assistantMessageId = `ai-${Date.now()}`
        const withPending: ChatMessage[] = [
          ...messagesRef.current,
          {
            key: `pending-${assistantMessageId}`,
            type: 'ai',
            content: '',
            batchId: '',
          },
        ]
        messagesRef.current = withPending
        setMessages([...withPending])

        await consumeStream(streamResponse)

        const lastIndex = messagesRef.current.length - 1
        if (lastIndex >= 0) {
          messagesRef.current[lastIndex].batchId = runIdRef.current
        }

        runIdRef.current = ''
        setStatus('ready')
      } catch (error: any) {
        console.error('Error sending message:', error)

        let errorDisplayMessage =
          '\u62b1\u6b49\uff0c\u53d1\u751f\u4e86\u4e00\u4e9b\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        if (error) {
          const errorMsg =
            error.message || error.error?.message || String(error)
          const errorType = error.error?.error || error.name || 'APIError'

          if (errorMsg && errorMsg !== '[object Object]') {
            if (
              errorType === 'APIError' &&
              errorMsg.includes('internal error')
            ) {
              errorDisplayMessage =
                '\u670d\u52a1\u5185\u90e8\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
            } else if (
              errorMsg.includes('timeout') ||
              errorMsg.includes('Timeout')
            ) {
              errorDisplayMessage =
                '\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
            } else if (
              errorMsg.includes('network') ||
              errorMsg.includes('Network')
            ) {
              errorDisplayMessage =
                '\u7f51\u7edc\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002'
            } else if (
              errorMsg.includes('401') ||
              errorMsg.includes('unauthorized')
            ) {
              errorDisplayMessage =
                '\u8ba4\u8bc1\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002'
            } else if (
              errorMsg.includes('403') ||
              errorMsg.includes('forbidden')
            ) {
              errorDisplayMessage =
                '\u6ca1\u6709\u6743\u9650\u6267\u884c\u6b64\u64cd\u4f5c\u3002'
            } else if (
              errorMsg.includes('429') ||
              errorMsg.includes('rate limit')
            ) {
              errorDisplayMessage =
                '\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002'
            } else {
              errorDisplayMessage = `\u62b1\u6b49\uff0c\u53d1\u751f\u9519\u8bef: ${errorMsg}`
            }
          }
        }

        const errorMessageId = `error-${Date.now()}`
        const withError: ChatMessage[] = [
          ...messagesRef.current,
          {
            key: errorMessageId,
            type: 'ai',
            content: errorDisplayMessage,
            batchId: errorMessageId,
          },
        ]
        messagesRef.current = withError
        setMessages([...withError])
        setStatus('ready')
      }
    },
    [
      assistantId,
      client,
      consumeStream,
      currentModel,
      systemPrompt,
      userId,
    ]
  )

  const handleFormSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = !!message.text
      const hasAttachments = (message.files?.length ?? 0) > 0
      if (!hasText && !hasAttachments) return
      const text = message.text?.trim() || ''
      handleSubmit(
        text || '\u4ec5\u53d1\u9001\u4e86\u9644\u4ef6',
        message.files || []
      )
    },
    [handleSubmit]
  )

  const handleStop = useCallback(async () => {
    const tid = threadIdRef.current
    const rid = runIdRef.current
    if (tid && rid) {
      try {
        await client.runs.cancel(tid, rid)
        setStatus('ready')
      } catch (error) {
        console.error('Cancel request failed:', error)
        setStatus('ready')
      }
    } else {
      setStatus('ready')
    }
  }, [client])

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit(suggestion)
    },
    [handleSubmit]
  )

  // -----------------------------------------------------------------------
  // renderCustom wrapper: handle generated_files internally
  // -----------------------------------------------------------------------

  const renderCustomWrapper = useCallback(
    (customContent: CustomContent) => {
      if (customContent?.type === 'generated_files') {
        return (
          <GeneratedFiles
            customContent={customContent}
            apiUrl={apiUrl}
            threadId={threadId}
          />
        )
      }
      if (renderCustom) {
        return renderCustom({ customContent, threadId })
      }
      return null
    },
    [apiUrl, threadId, renderCustom]
  )

  // -----------------------------------------------------------------------
  // Imperative handle
  // -----------------------------------------------------------------------

  useImperativeHandle(
    ref,
    () => ({
      setTextInput: (text: string) => {
        chatInputRef.current?.setTextInput(text)
      },
      addAttachments: (attachments) => {
        chatInputRef.current?.addAttachments(attachments)
      },
      sendMessage: async () => {
        await chatInputRef.current?.sendMessage()
      },
    }),
    []
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="chat-bot" data-ai-theme={theme}>
      <style>{styles}</style>
      <div
        ref={(el) => {
          portalHostRef.current = el
          if (el && el !== portalHost) setPortalHost(el)
        }}
        className="chat-bot-portal-host"
      />
      <PortalHostContext.Provider value={portalHost}>
        <div
          className={`chat-window${isMaximized ? ' maximized' : ''}`}
        >
          <ChatHeader
            title={assistantName}
            isMaximized={isMaximized}
            showHeaderActions={showHeaderActions}
            onClose={handleClose}
            onToggleMaximize={toggleMaximize}
          />

          {/* Empty state when no messages */}
          {!isLoading && messages.length === 0 ? (
            <div className="flex-1 overflow-y-hidden flex flex-col items-center justify-center">
              {renderEmpty ? (
                renderEmpty({ sendMessage: handleSubmit })
              ) : (
                <div className="default-empty-state">
                  <div className="default-empty-badge">AI</div>
                  <h2 className="default-empty-title">
                    {'\u6b22\u8fce\u4f7f\u7528'} {assistantName}
                  </h2>
                  <p className="default-empty-desc">
                    {'\u8bf7\u8f93\u5165\u4f60\u7684\u95ee\u9898\uff0c\u5f00\u59cb\u4e00\u6bb5\u65b0\u7684\u5bf9\u8bdd\u3002'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ChatMessages
              messages={visibleMessages}
              isStreaming={status === 'streaming'}
              theme={theme}
              renderCustom={renderCustomWrapper}
            />
          )}

          {/* Todo list */}
          <TodoList
            initialTodos={initialTodos}
            toolEvents={todoToolEvents}
            chatStatus={status}
          />

          <ChatInput
            ref={chatInputRef}
            status={status}
            currentModel={currentModel}
            models={models}
            suggestions={suggestions}
            useWebSearch={useWebSearch}
            allowModelSwitch={allowModelSwitch}
            modelSelectorOpen={modelSelectorOpen}
            onSubmit={handleFormSubmit}
            onStop={handleStop}
            onSelectSuggestion={handleSuggestionClick}
            onCurrentModelChange={setCurrentModel}
            onUseWebSearchChange={setUseWebSearch}
            onModelSelectorOpenChange={setModelSelectorOpen}
            renderAttachmentTrigger={renderAttachmentTrigger}
          />

          {/* Loading overlay */}
          {isLoading && (
            <div className="loading-mask">
              <Loader size={24} />
            </div>
          )}
        </div>
      </PortalHostContext.Provider>
    </div>
  )
})

export default ChatBot
