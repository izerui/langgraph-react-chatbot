import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AiBotPublicApi,
  AskAiBotPublicApi,
  AttachmentTriggerSlotProps,
} from './lib/input-types'
import type { ChatFile, CustomContent } from './lib/message-types'
import type { AiBotTheme } from './lib/theme'
import ChatBot from './ChatBot'
import { FloatButton } from './FloatButton'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AskAiBotProps {
  assistantId?: string
  assistantName?: string
  defaultExpanded?: boolean
  systemPrompt?: string
  threadId?: string
  userId?: string
  suggestions?: string[]
  apiUrl?: string
  apiKey?: string
  width?: number | string
  height?: number | string
  theme?: AiBotTheme
  allowModelSwitch?: boolean
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
.ask-ai-bot {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 99;
}

.chat-window-container {
  position: fixed;
  bottom: 74px;
  right: 20px;
  transition: height 0.3s ease;
}

.chat-window-container.maximized {
  top: 20px;
  right: 20px;
  bottom: 20px;
  left: 20px;
  width: auto !important;
  height: auto !important;
}

.chat-window-container.slide-up-enter {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.chat-window-container.slide-up-enter-active {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: all 0.3s ease;
}

.chat-window-container.slide-up-exit {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.chat-window-container.slide-up-exit-active {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s ease;
}

.chat-window-container.slide-up-hidden {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  pointer-events: none;
}

.chat-window-container.slide-up-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
  background: transparent;
}

@media (max-width: 480px) {
  .chat-window-container {
    width: calc(100vw - 40px) !important;
    height: 80vh !important;
    right: -10px;
  }
}
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AskAiBot = forwardRef<AskAiBotPublicApi, AskAiBotProps>(
  function AskAiBot(
    {
      assistantId = 'research',
      assistantName = 'Chat',
      defaultExpanded = false,
      systemPrompt = '\u7528\u4e2d\u6587\u56de\u7b54',
      threadId,
      userId = 'user001',
      suggestions = [],
      apiUrl = 'http://localhost:2024',
      apiKey,
      width: widthProp = 400,
      height: heightProp = 'calc(100vh - 90px)',
      theme = 'light',
      allowModelSwitch = true,
      renderEmpty,
      renderCustom,
      renderAttachmentTrigger,
    },
    ref
  ) {
    const chatBotRef = useRef<AiBotPublicApi | null>(null)
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)
    const [isMaximized, setIsMaximized] = useState(false)
    const [chatWidth, setChatWidth] = useState(
      typeof widthProp === 'number' ? widthProp : 500
    )
    const isResizingRef = useRef(false)

    // Toggle expand/collapse
    const toggleExpanded = useCallback(() => {
      setIsExpanded((prev) => {
        if (prev) {
          // collapsing
          setIsMaximized(false)
        }
        return !prev
      })
    }, [])

    const open = useCallback(() => {
      setIsExpanded(true)
    }, [])

    const close = useCallback(() => {
      setIsExpanded(false)
      setIsMaximized(false)
    }, [])

    const handleMaximizeChange = useCallback((value: boolean) => {
      setIsMaximized(value)
    }, [])

    // Resize by dragging
    const handleResize = useCallback((e: MouseEvent) => {
      if (!isResizingRef.current) return
      const newWidth = window.innerWidth - e.clientX - 20
      setChatWidth(Math.max(300, Math.min(1400, newWidth)))
    }, [])

    const stopResize = useCallback(() => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', stopResize)
    }, [handleResize])

    const startResize = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        isResizingRef.current = true
        document.addEventListener('mousemove', handleResize)
        document.addEventListener('mouseup', stopResize)
      },
      [handleResize, stopResize]
    )

    // Cleanup resize listeners on unmount
    useEffect(() => {
      return () => {
        document.removeEventListener('mousemove', handleResize)
        document.removeEventListener('mouseup', stopResize)
      }
    }, [handleResize, stopResize])

    // Imperative handle
    useImperativeHandle(
      ref,
      () => ({
        open,
        close,
        setTextInput: (text: string) => {
          chatBotRef.current?.setTextInput(text)
        },
        addAttachments: (attachments) => {
          chatBotRef.current?.addAttachments(attachments)
        },
        resetThread: async () => {
          if (!isExpanded) {
            setIsExpanded(true)
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
          await chatBotRef.current?.resetThread()
        },
        sendMessage: async () => {
          if (!isExpanded) {
            setIsExpanded(true)
            // Wait a tick for ChatBot to mount
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
          await chatBotRef.current?.sendMessage()
        },
      }),
      [open, close, isExpanded]
    )

    // Compute container style
    const containerStyle: React.CSSProperties = isMaximized
      ? {}
      : {
          width:
            typeof widthProp === 'number'
              ? `${chatWidth}px`
              : widthProp,
          height:
            typeof heightProp === 'number'
              ? `${heightProp}px`
              : heightProp,
        }

    return (
      <div className="ask-ai-bot" data-ai-theme={theme}>
        <style>{styles}</style>

        {/* Chat window */}
        <div
          className={`chat-window-container${
            isMaximized ? ' maximized' : ''
          }${isExpanded ? ' slide-up-visible' : ' slide-up-hidden'}`}
          style={containerStyle}
        >
          {isExpanded && (
            <ChatBot
              ref={chatBotRef}
              apiUrl={apiUrl}
              apiKey={apiKey}
              assistantId={assistantId}
              assistantName={assistantName}
              systemPrompt={systemPrompt}
              threadId={threadId}
              userId={userId}
              suggestions={suggestions}
              theme={theme}
              allowModelSwitch={allowModelSwitch}
              onClose={toggleExpanded}
              onMaximizeChange={handleMaximizeChange}
              renderEmpty={renderEmpty}
              renderCustom={renderCustom}
              renderAttachmentTrigger={renderAttachmentTrigger}
            />
          )}
          {/* Resize handle */}
          {!isMaximized && (
            <div className="resize-handle" onMouseDown={startResize} />
          )}
        </div>

        <FloatButton isExpanded={isExpanded} onToggle={toggleExpanded} />
      </div>
    )
  }
)

export default AskAiBot
