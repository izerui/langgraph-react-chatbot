export type ChatStatus = 'ready' | 'streaming'
export type MessageType = 'ai' | 'human' | 'system' | 'tool' | 'custom'

export interface CustomContent {
  type: string
  content: any
}

export interface ToolCall {
  id: string
  name: string
  args: string
  result?: string
  state?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export type ChatFileType = 'file' | 'image' | 'file_url'

export interface ChatFile {
  id?: string
  type?: ChatFileType
  url?: string
  mediaType?: string
  filename?: string
  data?: string
}

export interface ChatMessage {
  key: string
  type: MessageType
  content: string
  toolCalls?: ToolCall[]
  batchId?: string
  files?: ChatFile[]
  customContent?: CustomContent
}
