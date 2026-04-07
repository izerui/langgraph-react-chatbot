import { createContext, useContext } from 'react'
import type { AttachmentFile, PromptInputAttachment } from '../lib/input-types'

export interface PromptInputContextValue {
  textInput: string
  files: AttachmentFile[]
  isLoading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  setTextInput: (val: string) => void
  addAttachments: (attachments: PromptInputAttachment[]) => void
  addFiles: (files: File[] | FileList) => void
  removeFile: (id: string) => void
  clearFiles: () => void
  clearInput: () => void
  openFileDialog: () => void
  sendMessage: () => void
}

export const PromptInputContext = createContext<PromptInputContextValue | null>(null)

export function usePromptInputContext(): PromptInputContextValue {
  const ctx = useContext(PromptInputContext)
  if (!ctx) {
    throw new Error('usePromptInputContext must be used within PromptInputContext.Provider')
  }
  return ctx
}
