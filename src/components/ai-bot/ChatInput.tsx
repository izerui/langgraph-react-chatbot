import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { nanoid } from 'nanoid'
import type { ChatStatus } from './lib/message-types'
import type {
  AiBotInputApi,
  AttachmentFile,
  AttachmentTriggerSlotProps,
  PromptInputAttachment,
  PromptInputMessage,
} from './lib/input-types'
import { getProviderByModelName, type ModelInfo } from './lib/models'
import { PromptInputContext, type PromptInputContextValue } from './contexts/PromptInputContext'
import { usePortalHost } from './contexts/PortalHostContext'
import InputAttachmentsDisplay from './InputAttachmentsDisplay'
import ChatSuggestions from './ChatSuggestions'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
  InputGroupButton,
} from './ui/input-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from './ui/dropdown-menu'
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  CornerDownLeftIcon,
  PaperclipIcon,
} from 'lucide-react'

// ============== Types ==============

interface ChatInputProps {
  status: ChatStatus
  currentModel: ModelInfo | null
  models: ModelInfo[]
  suggestions: string[]
  useWebSearch: boolean
  allowModelSwitch?: boolean
  modelSelectorOpen: boolean
  onSubmit: (message: PromptInputMessage) => void
  onStop: () => void
  onSelectSuggestion: (suggestion: string) => void
  onCurrentModelChange: (model: ModelInfo) => void
  onUseWebSearchChange: (value: boolean) => void
  onModelSelectorOpenChange: (value: boolean) => void
  renderAttachmentTrigger?: (props: AttachmentTriggerSlotProps) => React.ReactNode
}

// ============== Styles ==============

const styles: Record<string, React.CSSProperties> = {
  inputWrapper: {
    padding: '4px 12px 8px',
    borderTop: '1px solid var(--ai-border-subtle)',
    background: 'var(--ai-input-panel-bg)',
    flexShrink: 0,
  },
  inputTop: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    alignItems: 'flex-start',
  },
  inputSuggestions: {
    width: '100%',
    padding: '8px 12px 0',
  },
  inputAttachments: {
    width: '100%',
    maxHeight: '120px',
    padding: '4px 12px',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--ai-scrollbar-thumb) transparent',
  },
  attachmentsDivider: {
    width: 'calc(100% - 24px)',
    margin: '4px 12px 0',
    borderTop: '1px solid var(--ai-border-subtle)',
  },
}

// ============== Helpers ==============

function normalizeBase64Data(data: string): string {
  return data.startsWith('data:') ? (data.split(',')[1] || '') : data
}

function revokeBlobUrl(file: { url?: string }) {
  if (file.url?.startsWith('blob:')) {
    URL.revokeObjectURL(file.url)
  }
}

async function convertBlobUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result =
          typeof reader.result === 'string' ? normalizeBase64Data(reader.result) : null
        resolve(result)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ============== Component ==============

const ChatInput = forwardRef<AiBotInputApi, ChatInputProps>(function ChatInput(props, ref) {
  const {
    status,
    currentModel,
    models,
    suggestions,
    allowModelSwitch = true,
    modelSelectorOpen,
    onSubmit,
    onStop,
    onSelectSuggestion,
    onCurrentModelChange,
    onModelSelectorOpenChange,
    renderAttachmentTrigger,
  } = props

  // ============== Local state ==============
  const [inputText, setInputTextState] = useState('')
  const [files, setFiles] = useState<AttachmentFile[]>([])
  const [isLoading] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef(files)
  const portalHost = usePortalHost()

  // Keep filesRef in sync
  useEffect(() => {
    filesRef.current = files
  }, [files])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.url?.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
    }
  }, [])

  const hasFiles = files.length > 0

  const setTextInput = useCallback((val: string) => {
    setInputTextState(val)
  }, [])

  const addAttachments = useCallback((incoming: PromptInputAttachment[]) => {
    setFiles((prev) => {
      const existingFilenames = new Set(
        prev.map((file) => file.filename?.trim()).filter((name): name is string => !!name),
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
                  mediaType: attachment.mediaType || attachment.file.type || '',
                  filename: attachment.filename || attachment.file.name,
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

  const addFilesFromInput = useCallback(
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
      if (file?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.url?.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
      return []
    })
  }, [])

  const clearInput = useCallback(() => {
    setInputTextState('')
  }, [])

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // We need a ref-based sendMessage so it always reads the latest state
  const inputTextRef = useRef(inputText)
  useEffect(() => {
    inputTextRef.current = inputText
  }, [inputText])

  const sendMessage = useCallback(async () => {
    if (status === 'streaming') return

    const currentFiles = filesRef.current
    const processedFiles = await Promise.all(
      currentFiles.map(async (item) => {
        if (item.url?.startsWith('blob:')) {
          const data = await convertBlobUrlToBase64(item.url)
          return { ...item, data: data ?? item.data }
        }
        return item
      }),
    )

    const message: PromptInputMessage = {
      text: inputTextRef.current,
      files: processedFiles,
    }

    onSubmit(message)
    setInputTextState('')
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.url?.startsWith('blob:')) {
          URL.revokeObjectURL(f.url)
        }
      })
      return []
    })
  }, [status, onSubmit])

  // ============== Expose API ==============
  useImperativeHandle(
    ref,
    () => ({
      setTextInput,
      addAttachments,
      sendMessage,
    }),
    [setTextInput, addAttachments, sendMessage],
  )

  // ============== Context value ==============
  const contextValue: PromptInputContextValue = useMemo(
    () => ({
      textInput: inputText,
      files,
      isLoading,
      fileInputRef,
      setTextInput,
      addAttachments,
      addFiles: addFilesFromInput,
      removeFile,
      clearFiles,
      clearInput,
      openFileDialog,
      sendMessage,
    }),
    [
      inputText,
      files,
      isLoading,
      setTextInput,
      addAttachments,
      addFilesFromInput,
      removeFile,
      clearFiles,
      clearInput,
      openFileDialog,
      sendMessage,
    ],
  )

  // ============== Computed values ==============
  const isEmpty = !inputText.trim() && !hasFiles
  const isLoadingStatus = status === 'streaming'

  const selectedModelData = currentModel || models.find((m) => m.is_default) || models[0] || null

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {}
    models.forEach((model) => {
      const provider = model.provider || 'Other'
      if (!groups[provider]) {
        groups[provider] = []
      }
      groups[provider].push(model)
    })
    return groups
  }, [models])

  const providers = useMemo(() => Object.keys(groupedModels), [groupedModels])

  // ============== Handlers ==============

  function handleModelSelect(name: string) {
    const model = models.find((m) => m.name === name)
    if (model) {
      onCurrentModelChange(model)
    }
    onModelSelectorOpenChange(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      if (isLoadingStatus) {
        if (!e.shiftKey) e.preventDefault()
        return
      }
      if (isComposing || e.shiftKey) return
      e.preventDefault()
      sendMessage()
    }

    if (e.key === 'Backspace' && inputText === '' && files.length > 0) {
      const lastFile = files[files.length - 1]
      if (lastFile) {
        removeFile(lastFile.id)
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return

    const pastedFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault()
      addFilesFromInput(pastedFiles)
    }
  }

  function handleSubmitClick() {
    if (isLoadingStatus) {
      onStop()
    } else {
      sendMessage()
    }
  }

  function handleImageError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    img.src = 'https://models.dev/logos/openai.svg'
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFilesFromInput(e.target.files)
    }
    e.target.value = ''
  }

  // ============== Submit button config ==============
  const buttonVariant = isLoadingStatus ? 'destructive' : 'submit'
  const SubmitIcon = isLoadingStatus ? Loader2Icon : CornerDownLeftIcon
  const iconClassName = isLoadingStatus ? 'size-4 animate-spin' : 'size-4'
  const isDisabled = isLoadingStatus ? false : isEmpty

  // ============== Render ==============
  return (
    <PromptInputContext.Provider value={contextValue}>
      <div style={styles.inputWrapper}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={onFileChange}
        />

        <div className="w-full">
          <InputGroup className="overflow-hidden" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={styles.inputTop}>
              {suggestions.length > 0 && (
                <div style={styles.inputSuggestions}>
                  <ChatSuggestions
                    suggestions={suggestions}
                    onSelect={onSelectSuggestion}
                  />
                </div>
              )}

              {suggestions.length > 0 && <div style={styles.attachmentsDivider} />}

              {files.length > 0 && (
                <div style={styles.inputAttachments}>
                  <InputAttachmentsDisplay />
                </div>
              )}
            </div>

            {/* Textarea (PromptInputBody) */}
            <div className="contents">
              <InputGroupTextarea
                value={inputText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setInputTextState(e.target.value)
                }
                placeholder="有什么我能帮您的?"
                name="message"
                className="field-sizing-content max-h-48 min-h-16 pt-2 pb-3"
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
              />
            </div>

            {/* Footer toolbar (PromptInputFooter) */}
            <InputGroupAddon align="block-end" className="justify-between gap-1">
              {/* Left side: attachment tools */}
              <div className="flex items-center gap-1">
                <InputGroupButton
                  type="button"
                  className="cursor-pointer text-muted-foreground"
                  onClick={openFileDialog}
                  style={{
                    background: 'transparent',
                  }}
                >
                  <PaperclipIcon className="size-4" />
                </InputGroupButton>
                {renderAttachmentTrigger?.({ addAttachments })}
              </div>

              {/* Right side: model selector + submit */}
              <div className="flex items-center gap-1">
                {/* Model selector */}
                {allowModelSwitch && (
                  <DropdownMenu
                    open={modelSelectorOpen}
                    onOpenChange={onModelSelectorOpenChange}
                  >
                    <DropdownMenuTrigger asChild>
                      <InputGroupButton
                        type="button"
                        className="flex items-center gap-1 cursor-pointer"
                      >
                        {selectedModelData && (
                          <img
                            src={`https://models.dev/logos/${getProviderByModelName(selectedModelData.name)}.svg`}
                            className="size-4 rounded-sm object-contain"
                            alt={selectedModelData.name}
                            onError={handleImageError}
                          />
                        )}
                        {selectedModelData ? (
                          <span className="whitespace-nowrap">{selectedModelData.name}</span>
                        ) : (
                          <span className="text-muted-foreground">选择模型</span>
                        )}
                        <ChevronDownIcon className="size-4 opacity-50 shrink-0" />
                      </InputGroupButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="start" container={portalHost} className="max-h-64 overflow-y-auto">
                      {providers.map((provider) => (
                        <React.Fragment key={provider}>
                          <div className="px-2 py-1.5 text-xs font-semibold" style={{ color: 'var(--ai-menu-heading)' }}>
                            请选择模型
                          </div>
                          {groupedModels[provider].map((model) => (
                            <DropdownMenuItem
                              key={model.name}
                              onSelect={() => handleModelSelect(model.name)}
                              className="cursor-pointer gap-1 text-[13px]"
                              style={{ color: 'var(--ai-menu-text)' }}
                            >
                              <img
                                src={`https://models.dev/logos/${getProviderByModelName(model.name)}.svg`}
                                className="size-4 rounded-sm object-contain"
                                alt={model.name}
                                onError={handleImageError}
                              />
                              <span className="flex-1 truncate">
                                {model.name}
                                {model.is_default && (
                                  <span
                                    className="ml-1.5 rounded px-1.5 py-0.5 text-[11px]"
                                    style={{
                                      backgroundColor: 'var(--ai-muted-surface)',
                                      color: 'var(--ai-menu-heading)',
                                    }}
                                  >
                                    默认
                                  </span>
                                )}
                              </span>
                              {selectedModelData?.name === model.name && (
                                <CheckIcon className="size-4" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Submit / Stop button */}
                <InputGroupButton
                  aria-label="Submit"
                  type="button"
                  size="icon-sm"
                  variant={buttonVariant}
                  className="cursor-pointer disabled:cursor-not-allowed"
                  disabled={isDisabled}
                  onClick={handleSubmitClick}
                >
                  <SubmitIcon className={iconClassName} />
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </div>
    </PromptInputContext.Provider>
  )
})

export default ChatInput
