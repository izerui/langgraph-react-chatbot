import { useState, useEffect, useCallback, useRef } from 'react'
import type { ToolEventPayload } from '../lib/tool-events'
import type { ChatStatus } from '../lib/message-types'

// ============== Types ==============

export interface TodoItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'interrupted'
}

type RawTodo = {
  id?: string
  title?: string
  task?: string
  content?: string
  text?: string
  name?: string
  status?: string
  state?: string
}

type RawTodoContainer = {
  todo?: RawTodo
  todos?: RawTodo[]
  item?: RawTodo
  items?: RawTodo[]
}

// ============== Pure helpers ==============

function isRawTodoContainer(
  payload: RawTodo | RawTodoContainer,
): payload is RawTodoContainer {
  return (
    'todo' in payload ||
    'todos' in payload ||
    'item' in payload ||
    'items' in payload
  )
}

export function parseRawTodoItems(raw?: string): RawTodo[] {
  if (!raw) return []
  try {
    const payload = JSON.parse(raw) as RawTodo | RawTodo[] | RawTodoContainer
    if (Array.isArray(payload)) return payload
    if (isRawTodoContainer(payload)) {
      if (Array.isArray(payload.todos)) return payload.todos
      if (Array.isArray(payload.items)) return payload.items
      if (payload.todo) return [payload.todo]
      if (payload.item) return [payload.item]
    }
    return []
  } catch {
    return []
  }
}

export function normalizeTodoStatus(
  rawStatus: unknown,
  fallback: TodoItem['status'],
): TodoItem['status'] {
  const status = String(rawStatus || '').toLowerCase()
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in_progress'
  if (status === 'pending') return 'pending'
  if (status === 'interrupted') return 'interrupted'
  return fallback
}

export function normalizeHistoricalTodoStatus(
  rawStatus: unknown,
): TodoItem['status'] {
  const status = normalizeTodoStatus(rawStatus, 'pending')
  return status === 'in_progress' ? 'interrupted' : status
}

export function statusByPhase(event: ToolEventPayload): TodoItem['status'] {
  if (event.state === 'completed') return 'completed'
  if (event.state === 'interrupted') return 'interrupted'
  if (event.phase === 'tool_call_started') return 'pending'
  return 'in_progress'
}

export function mapRawTodos(
  rawTodos: RawTodo[],
  fallbackState: TodoItem['status'] = 'pending',
): TodoItem[] {
  return rawTodos
    .map((todo, index) => ({
      id: todo.id || `todo-${index + 1}`,
      title:
        todo.title || todo.task || todo.content || todo.text || todo.name || '',
      status: normalizeTodoStatus(todo.status || todo.state, fallbackState),
    }))
    .filter((todo) => todo.title)
}

export function mapHistoricalTodos(rawTodos: RawTodo[]): TodoItem[] {
  return rawTodos
    .map((todo, index) => ({
      id: todo.id || `todo-${index + 1}`,
      title:
        todo.title || todo.task || todo.content || todo.text || todo.name || '',
      status: normalizeHistoricalTodoStatus(todo.status || todo.state),
    }))
    .filter((todo) => todo.title)
}

export function parseToolTodos(
  raw?: string,
  fallbackState: TodoItem['status'] = 'pending',
): TodoItem[] {
  const rawTodos = parseRawTodoItems(raw)
  return mapRawTodos(rawTodos, fallbackState)
}

export function replaceWriteTodos(
  raw: string | undefined,
  fallbackState: TodoItem['status'] = 'pending',
): TodoItem[] | null {
  const nextTodos = parseToolTodos(raw, fallbackState)
  if (nextTodos.length === 0) return null
  return nextTodos
}

function isWriteTodosTool(toolName?: string): boolean {
  return (toolName || '') === 'write_todos'
}

export function applyToolEvent(
  event: ToolEventPayload,
): TodoItem[] | null {
  const fallbackState = statusByPhase(event)
  if (!isWriteTodosTool(event.name)) return null
  return replaceWriteTodos(event.args, fallbackState)
}

export function finalizeInProgressTodos(todos: TodoItem[]): TodoItem[] {
  return todos.map((todo) => {
    if (todo.status !== 'in_progress') return todo
    return { ...todo, status: 'interrupted' as const }
  })
}

// ============== Hook ==============

export function useTodoList(options: {
  initialTodos: any[]
  toolEvents: ToolEventPayload[]
  chatStatus: ChatStatus
}): {
  todos: TodoItem[]
  expanded: boolean
  toggleExpanded: () => void
  completedCount: number
  inProgressCount: number
  interruptedCount: number
  pendingCount: number
} {
  const { initialTodos, toolEvents, chatStatus } = options

  const [todos, setTodos] = useState<TodoItem[]>([])
  const [expanded, setExpanded] = useState(false)

  const processedEventCountRef = useRef(0)
  const userCollapsedRef = useRef(false)
  const chatStatusRef = useRef(chatStatus)
  const prevChatStatusRef = useRef(chatStatus)

  // Keep chatStatus ref in sync
  chatStatusRef.current = chatStatus

  // Helper to sync expanded state
  const syncExpandedWithTodos = useCallback(
    (nextTodos: TodoItem[]) => {
      if (nextTodos.length === 0) {
        setExpanded(false)
        userCollapsedRef.current = false
        return
      }
      if (!userCollapsedRef.current && chatStatusRef.current === 'streaming') {
        setExpanded(true)
      }
    },
    [],
  )

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      userCollapsedRef.current = !next
      return next
    })
  }, [])

  // Watch initialTodos
  useEffect(() => {
    const nextTodos = mapHistoricalTodos(initialTodos || [])
    setTodos(nextTodos)
    syncExpandedWithTodos(nextTodos)
  }, [initialTodos, syncExpandedWithTodos])

  // Watch toolEvents
  useEffect(() => {
    if (!toolEvents.length) {
      processedEventCountRef.current = 0
      return
    }

    if (toolEvents.length < processedEventCountRef.current) {
      setTodos([])
      processedEventCountRef.current = 0
      syncExpandedWithTodos([])
    }

    const nextEvents = toolEvents.slice(processedEventCountRef.current)
    let currentTodos: TodoItem[] | null = null

    nextEvents.forEach((event) => {
      const result = applyToolEvent(event)
      if (result) {
        currentTodos = result
      }
    })

    if (currentTodos !== null) {
      setTodos(currentTodos)
      syncExpandedWithTodos(currentTodos)
    }

    processedEventCountRef.current = toolEvents.length
  }, [toolEvents, syncExpandedWithTodos])

  // Watch chatStatus transitions: streaming -> ready => finalize
  useEffect(() => {
    if (
      prevChatStatusRef.current === 'streaming' &&
      chatStatus === 'ready'
    ) {
      setTodos((prev) => {
        const finalized = finalizeInProgressTodos(prev)
        syncExpandedWithTodos(finalized)
        return finalized
      })
    }
    prevChatStatusRef.current = chatStatus
  }, [chatStatus, syncExpandedWithTodos])

  // Computed counts
  const completedCount = todos.filter((t) => t.status === 'completed').length
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length
  const interruptedCount = todos.filter(
    (t) => t.status === 'interrupted',
  ).length
  const pendingCount = todos.filter((t) => t.status === 'pending').length

  return {
    todos,
    expanded,
    toggleExpanded,
    completedCount,
    inProgressCount,
    interruptedCount,
    pendingCount,
  }
}
