import type { ChatFile } from './message-types'

export interface PromptInputMessage {
  text: string
  files: ChatFile[]
}

export interface AttachmentFile extends ChatFile {
  id: string
  file?: File
}

export type PromptInputBase64Attachment = {
  id?: string
  filename: string
  mediaType: string
  data: string
}

export type PromptInputFileAttachment =
  | {
      id?: string
      type: 'file'
      file: File
      filename?: string
      mediaType?: string
    }
  | ({
      id?: string
      type: 'file'
    } & PromptInputBase64Attachment)

export type PromptInputImageAttachment =
  | {
      id?: string
      type: 'image'
      file: File
      filename?: string
      mediaType?: string
    }
  | ({
      id?: string
      type: 'image'
    } & PromptInputBase64Attachment)

export type PromptInputFileUrlAttachment = {
  id?: string
  type: 'file_url'
  url: string
  filename?: string
  mediaType?: string
}

export type PromptInputAttachment =
  | PromptInputFileAttachment
  | PromptInputImageAttachment
  | PromptInputFileUrlAttachment

export interface AttachmentTriggerSlotProps {
  addAttachments: (attachments: PromptInputAttachment[]) => void
}

export interface AiBotVisibilityOptions {
  ensureVisible?: boolean
}

export interface AiBotInputApi {
  setTextInput: (text: string) => void
  addAttachments: (attachments: PromptInputAttachment[]) => void
  sendMessage: (options?: AiBotVisibilityOptions) => Promise<void>
}

export interface AiBotPublicApi extends AiBotInputApi {}

export interface AskAiBotPublicApi extends AiBotPublicApi {
  open: () => void
  close: () => void
}
