export { default as ChatBot } from './ChatBot'
export { default as AskAiBot } from './AskAiBot'
export { GeneratedFiles } from './GeneratedFiles'

export type {
  AiBotInputApi,
  AiBotPublicApi,
  AiBotVisibilityOptions,
  AskAiBotPublicApi,
  AttachmentFile,
  AttachmentTriggerSlotProps,
  PromptInputAttachment,
  PromptInputBase64Attachment,
  PromptInputFileAttachment,
  PromptInputFileUrlAttachment,
  PromptInputImageAttachment,
  PromptInputMessage,
} from './lib/input-types'

export type {
  ChatFile,
  ChatFileType,
  ChatMessage,
  ChatStatus,
  CustomContent,
  MessageType,
  ToolCall,
} from './lib/message-types'

export type { AiBotTheme } from './lib/theme'
