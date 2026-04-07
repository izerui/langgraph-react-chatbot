import React from 'react'
import {
  Ban,
  ChevronsDown,
  ChevronsUp,
  Circle,
  CircleCheckBig,
  LoaderCircle,
} from 'lucide-react'
import type { ToolEventPayload } from './lib/tool-events'
import type { ChatStatus } from './lib/message-types'
import { useTodoList, type TodoItem } from './hooks/useTodoList'

// ============== Shimmer inline component ==============

function Shimmer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={className}
      style={{
        background:
          'linear-gradient(90deg, var(--color-muted-foreground, rgba(100,100,100,0.36)) 0%, var(--color-background, #6366f1) 50%, var(--color-muted-foreground, rgba(100,100,100,0.36)) 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'shimmer-slide 2s linear infinite',
      }}
    >
      {children}
    </span>
  )
}

// ============== Styles ==============

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '2px 12px 0',
  },
  card: {
    borderRadius: 6,
    border: '1px solid var(--ai-plan-border)',
    background:
      'linear-gradient(180deg, var(--ai-plan-bg-strong), var(--ai-plan-bg)), var(--ai-plan-bg-strong)',
    boxShadow:
      'inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent), 0 4px 12px color-mix(in srgb, var(--ai-plan-border) 36%, transparent)',
    overflow: 'hidden',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid transparent',
    transition:
      'background-color 0.18s ease, border-color 0.18s ease, padding 0.18s ease',
  },
  dividerCollapsed: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  titleChevron: {
    color: 'var(--ai-plan-muted)',
  },
  titleLabel: {
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 700,
    color: 'var(--foreground)',
    marginRight: 4,
    letterSpacing: '0.01em',
  },
  titleSummary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 17,
    padding: '0 6px',
    borderRadius: 999,
    fontSize: 10,
    lineHeight: 1,
    fontWeight: 700,
    background:
      'color-mix(in srgb, var(--ai-plan-bg-strong) 82%, var(--ai-plan-border))',
    border: '1px solid var(--ai-plan-border)',
    color:
      'color-mix(in srgb, var(--foreground) 72%, var(--ai-plan-muted))',
  },
  titleMeta: {
    fontSize: 10,
    lineHeight: 1,
    color: 'var(--ai-plan-muted)',
  },
  todoList: {
    padding: '0 6px 6px',
    maxHeight: 180,
    overflowY: 'auto',
    overflowX: 'hidden',
    borderTop: '1px solid var(--ai-plan-border)',
  },
  todoItem: {
    padding: '3px 8px',
  },
  todoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  todoContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 24,
    padding: '2px 8px',
    borderRadius: 6,
  },
  todoIndex: {
    minWidth: 14,
    textAlign: 'right' as const,
    flexShrink: 0,
    color: 'color-mix(in srgb, var(--ai-plan-muted) 88%, transparent)',
    fontSize: 11,
  },
  indicator: {
    width: 16,
    height: 16,
    border: 0,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    flexShrink: 0,
    padding: 0,
    pointerEvents: 'none' as const,
  },
  titleTextBase: {
    fontSize: 13,
    lineHeight: 1.35,
  },
  titleText: {
    color: 'color-mix(in srgb, var(--foreground) 88%, transparent)',
  },
}

const statusColors: Record<TodoItem['status'], string> = {
  completed: 'var(--ai-plan-complete)',
  pending: 'color-mix(in srgb, var(--ai-plan-muted) 84%, transparent)',
  in_progress: 'var(--ai-plan-progress)',
  interrupted: 'var(--ai-plan-interrupted)',
}

// ============== Component ==============

interface TodoListProps {
  initialTodos?: any[]
  toolEvents?: ToolEventPayload[]
  chatStatus?: ChatStatus
}

export function TodoList({
  initialTodos = [],
  toolEvents = [],
  chatStatus = 'ready',
}: TodoListProps) {
  const {
    todos,
    expanded,
    toggleExpanded,
    completedCount,
    inProgressCount,
    interruptedCount,
    pendingCount,
  } = useTodoList({ initialTodos, toolEvents, chatStatus })

  if (todos.length === 0) return null

  const ChevronIcon = expanded ? ChevronsDown : ChevronsUp

  const metaText =
    inProgressCount > 0
      ? `进行中 ${inProgressCount}`
      : interruptedCount > 0
        ? `已停止 ${interruptedCount}`
        : pendingCount > 0
          ? `待处理 ${pendingCount}`
          : '已完成'

  return (
    <div style={styles.section}>
      <div style={styles.card}>
        {/* Header / toggle */}
        <div
          style={{
            ...styles.divider,
            ...(!expanded ? styles.dividerCollapsed : {}),
          }}
          onClick={toggleExpanded}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.background =
              'var(--ai-plan-hover)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.background = ''
          }}
        >
          <div style={styles.title}>
            <ChevronIcon size={13} style={styles.titleChevron} />
            <span style={styles.titleLabel}>执行计划</span>
            <span style={styles.titleSummary}>
              {completedCount}/{todos.length}
            </span>
            <span style={styles.titleMeta}>{metaText}</span>
          </div>
        </div>

        {/* Todo list */}
        {expanded && (
          <div style={styles.todoList}>
            {todos.map((todo, index) => {
              const indicatorColor = statusColors[todo.status]

              return (
                <div key={todo.id} style={styles.todoItem}>
                  <div style={styles.todoRow}>
                    <div style={styles.todoContent}>
                      <span style={styles.todoIndex}>{index + 1}.</span>

                      <span style={{ ...styles.indicator, color: indicatorColor }}>
                        {todo.status === 'pending' && (
                          <Circle size={13} />
                        )}
                        {todo.status === 'in_progress' && (
                          <LoaderCircle
                            size={13}
                            style={{
                              animation: 'todo-spin 1.4s linear infinite',
                            }}
                          />
                        )}
                        {todo.status === 'interrupted' && (
                          <Ban size={13} />
                        )}
                        {todo.status === 'completed' && (
                          <CircleCheckBig size={13} />
                        )}
                      </span>

                      {todo.status === 'in_progress' ? (
                        <Shimmer
                          className="title-text-shimmer"
                        >
                          <span
                            style={{
                              ...styles.titleTextBase,
                              fontSize: 12,
                            }}
                          >
                            {todo.title}
                          </span>
                        </Shimmer>
                      ) : (
                        <div
                          style={{
                            ...styles.titleTextBase,
                            ...styles.titleText,
                            fontSize: 12,
                            ...(todo.status === 'interrupted'
                              ? {
                                  color:
                                    'color-mix(in srgb, var(--foreground) 74%, var(--ai-plan-interrupted))',
                                }
                              : todo.status === 'completed'
                                ? {
                                    color:
                                      'color-mix(in srgb, var(--foreground) 62%, var(--ai-plan-complete))',
                                  }
                                : {}),
                          }}
                        >
                          {todo.title}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes todo-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer-slide {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .title-text-shimmer {
          --color-muted-foreground: color-mix(in srgb, var(--ai-plan-progress) 36%, transparent);
          --color-background: var(--ai-plan-progress);
        }
      `}</style>
    </div>
  )
}

export default TodoList
