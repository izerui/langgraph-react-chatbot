import { useState, useRef, useEffect, useCallback } from 'react'
import { nanoid } from 'nanoid'
import type {
  AttachmentFile,
  PromptInputAttachment,
  PromptInputMessage,
} from '../lib/input-types'
import type { ChatStatus } from '../lib/message-types'
import type { PromptInputContextValue } from '../contexts/PromptInputContext'

// ============== Helpers ==============

export function normalizeBase64Data(data: string): string {
  return data.startsWith('data:') ? (data.split(',')[1] || '') : data
}

export async function convertBlobUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result =
          typeof reader.result === 'string'
            ? normalizeBase64Data(reader.result)
            : null
        resolve(result)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function revokeBlobUrl(file: { url?: string }) {
  if (file.url?.startsWith('blob:')) {
    URL.revokeObjectURL(file.url)
  }
}

// ============== Hook ==============

export function usePromptInput(options: {
  status: ChatStatus
  onSubmit: (message: PromptInputMessage) => void
}): PromptInputContextValue & { sendMessage: () => Promise<void> } {
  const { status, onSubmit } = options

  const [textInput, setTextInputState] = useState('')
  const [files, setFiles] = useState<AttachmentFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Keep a ref so sendMessage always sees current files/text
  const filesRef = useRef(files)
  filesRef.current = files
  const textRef = useRef(textInput)
  textRef.current = textInput
  const statusRef = useRef(status)
  statusRef.current = status

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.url && f.url.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
    }
  }, [])

  const setTextInput = useCallback((val: string) => {
    setTextInputState(val)
  }, [])

  const addAttachments = useCallback((incoming: PromptInputAttachment[]) => {
    setFiles((prev) => {
      const existingFilenames = new Set(
        prev
          .map((file) => file.filename?.trim())
          .filter((name): name is string => !!name),
      )

      const newAttachments: AttachmentFile[] = incoming.flatMap((attachment) => {
        const normalized: AttachmentFile =
          attachment.type === 'file_url'
            ? {
                ...attachment,
                id: attachment.id || nanoid(),
                type: 'file_url' as const,
                url: attachment.url,
                mediaType: attachment.mediaType || 'application/octet-stream',
                filename: attachment.filename,
              }
            : 'file' in attachment
              ? {
                  ...attachment,
                  id: attachment.id || nanoid(),
                  url: URL.createObjectURL(attachment.file),
                  mediaType:
                    attachment.mediaType || attachment.file.type || '',
                  filename: attachment.filename || attachment.file.name,
                  file: attachment.file,
                }
              : {
                  ...attachment,
                  id: attachment.id || nanoid(),
                  mediaType: attachment.mediaType,
                  filename: attachment.filename,
                  data: normalizeBase64Data(attachment.data),
                }

        const normalizedName = normalized.filename?.trim()
        if (normalizedName && existingFilenames.has(normalizedName)) {
          if ('url' in normalized) {
            revokeBlobUrl(normalized)
          }
          return []
        }

        if (normalizedName) {
          existingFilenames.add(normalizedName)
        }

        return [normalized]
      })

      return [...prev, ...newAttachments]
    })
  }, [])

  const addFiles = useCallback(
    (incoming: File[] | FileList) => {
      const fileList = Array.from(incoming)
      const attachments: PromptInputAttachment[] = fileList.map((file) => {
        if (file.type.startsWith('image/')) {
          return { type: 'image', file }
        }
        return { type: 'file', file }
      })
      addAttachments(attachments)
    },
    [addAttachments],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.url && f.url.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
      return []
    })
  }, [])

  const clearInput = useCallback(() => {
    setTextInputState('')
  }, [])

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const sendMessage = useCallback(async () => {
    if (statusRef.current === 'streaming') {
      return
    }

    const currentFiles = filesRef.current
    const currentText = textRef.current

    // Process files (convert blob urls to base64 if needed)
    const processedFiles = await Promise.all(
      currentFiles.map(async (item) => {
        if (item.url && item.url.startsWith('blob:')) {
          const data = await convertBlobUrlToBase64(item.url)
          return { ...item, data: data ?? item.data }
        }
        return item
      }),
    )

    const message: PromptInputMessage = {
      text: currentText,
      files: processedFiles,
    }

    onSubmit(message)
    setTextInputState('')
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.url && f.url.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
      return []
    })
  }, [onSubmit])

  return {
    textInput,
    files,
    fileInputRef,
    isLoading,
    setTextInput,
    addAttachments,
    addFiles,
    removeFile,
    clearFiles,
    clearInput,
    openFileDialog,
    sendMessage,
  }
}
