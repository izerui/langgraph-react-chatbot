import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { ToolCall as ToolCallType } from './lib/message-types'
import { cn } from './lib/utils'
import {
  ChevronDown,
  PlayCircle,
  Loader,
  CheckCircle,
  XCircle,
  Brain,
  Globe,
  FileText,
  FolderSearch,
  FileEdit,
  ListTodo,
  Eye,
  SquarePen,
  FileSearch,
  BookOpenCheck,
  FolderSearch as FolderSearchIcon,
  Zap,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

// ============== Maps ==============

const toolNameMap: Record<string, string> = {
  think_tool: '战略反思',
  fetch_markdown: '获取网页',
  convert_to_markdown: '文件转换',
  ls: '列出目录',
  read_file: '读取文件',
  write_file: '写入文件',
  edit_file: '编辑文件',
  glob: '查找文件',
  grep: '搜索文本',
  execute: '执行命令',
  write_todos: '待办事项',
  task: '子任务',
}

const toolIconMap: Record<string, LucideIcon> = {
  think_tool: Brain,
  fetch_markdown: Globe,
  convert_to_markdown: FileText,
  ls: FolderSearchIcon,
  read_file: Eye,
  write_file: FileEdit,
  edit_file: SquarePen,
  glob: FolderSearch,
  grep: FileSearch,
  execute: Zap,
  write_todos: ListTodo,
  task: BookOpenCheck,
}

function getStateIcon(state: string): { icon: LucideIcon; color: string } {
  switch (state) {
    case 'start':
      return { icon: PlayCircle, color: 'text-blue-500' }
    case 'running':
      return { icon: Loader, color: 'text-yellow-500 animate-spin' }
    case 'completed':
      return { icon: CheckCircle, color: 'text-green-500' }
    case 'error':
      return { icon: XCircle, color: 'text-red-500' }
    default:
      return { icon: PlayCircle, color: 'text-muted-foreground' }
  }
}

function getToolName(name: string): string {
  return toolNameMap[name] || name
}

function getToolIcon(name: string): LucideIcon {
  return toolIconMap[name] || Wrench
}

export function isTodoTool(name: string): boolean {
  return name === 'write_todos' || name.includes('todo')
}

function formatArgs(args: string): string {
  if (!args) return ''
  return args.length > 50 ? args.slice(0, 100) + '...' : args
}

const activeStates = new Set(['start', 'running'])

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

// ============== Component ==============

interface ToolCallProps {
  toolCalls: ToolCallType[]
}

export function ToolCall({ toolCalls }: ToolCallProps) {
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggle = useCallback((id: string) => {
    setOpenStates((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const getDurationText = useCallback(
    (tool: ToolCallType) => {
      if (!tool.startedAt) return ''
      const endAt =
        tool.completedAt ??
        (activeStates.has(tool.state || '') ? now : undefined)
      if (!endAt) return ''
      return formatElapsed(endAt - tool.startedAt)
    },
    [now],
  )

  return (
    <div className="mb-3 text-xs max-w-full">
      {toolCalls.map((tool) => {
        if (isTodoTool(tool.name)) return null

        const ToolIcon = getToolIcon(tool.name)
        const stateInfo = getStateIcon(tool.state || '')
        const StateIcon = stateInfo.icon
        const durationText = getDurationText(tool)
        const isOpen = openStates[tool.id]

        return (
          <div key={tool.id} className="overflow-hidden">
            <div
              className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-2 py-1.5 transition-colors cursor-pointer"
              onClick={() => toggle(tool.id)}
            >
              <ChevronDown
                className={cn('h-4 w-4 shrink-0', !isOpen && '-rotate-90')}
              />
              <ToolIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{getToolName(tool.name)}</span>
              {durationText && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {durationText}
                </span>
              )}
              <span className="text-muted-foreground truncate flex-1 min-w-0">
                {formatArgs(tool.args)}
              </span>
              <StateIcon
                className={cn('h-3 w-3 shrink-0 ml-auto', stateInfo.color)}
              />
            </div>

            {isOpen && (
              <div className="mt-2 ml-6 flex flex-col gap-2">
                <div>
                  <p className="text-muted-foreground mb-1">请求:</p>
                  <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto max-w-full">
                    {tool.args}
                  </pre>
                </div>
                {(tool.result || tool.error) && (
                  <div>
                    <p className="text-muted-foreground mb-1">
                      {tool.state === 'error' ? 'Error:' : '结果:'}
                    </p>
                    <pre
                      className={cn(
                        'bg-muted p-2 rounded text-[10px] overflow-x-auto max-w-full',
                        tool.state === 'error' && 'text-red-500',
                      )}
                    >
                      {tool.error || tool.result}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ToolCall
