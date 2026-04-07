import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { ChatMessage, CustomContent } from './lib/message-types'
import type { AiBotTheme } from './lib/theme'
import ToolCall from './ToolCall'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { ArrowDown } from 'lucide-react'
import 'streamdown/styles.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming?: boolean
  theme?: AiBotTheme
  renderCustom?: (customContent: CustomContent) => ReactNode
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessageFrom(type: ChatMessage['type']) {
  if (
    type === 'tool' ||
    type === 'system' ||
    type === 'custom' ||
    type === 'ai'
  ) {
    return 'assistant' as const
  }
  return 'user' as const
}

function getMessageSpacing(messages: ChatMessage[], index: number) {
  if (index === 0) return ''
  const current = messages[index]
  if (current.type === 'human') return 'mt-4'
  return ''
}

// ---------------------------------------------------------------------------
// Styles (loading-dots animation)
// ---------------------------------------------------------------------------

const dotsKeyframes = `
@keyframes chat-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
`

const dotStyle = (delay: string): React.CSSProperties => ({
  width: 6,
  height: 6,
  backgroundColor: 'var(--muted-foreground)',
  borderRadius: '50%',
  animation: `chat-bounce 1.4s infinite ease-in-out both`,
  animationDelay: delay,
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatMessages({
  messages,
  isStreaming = false,
  theme = 'light',
  renderCustom,
}: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // ---- auto-scroll ---------------------------------------------------

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Track whether user has scrolled up
  const handleScroll = useCallback(() => {
    setShowScrollBtn(!isNearBottom())
  }, [isNearBottom])

  // Auto-scroll when messages change or streaming toggles, but only if
  // the user hasn't scrolled away.
  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isStreaming, isNearBottom])

  // ---- render --------------------------------------------------------

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Inject keyframes once */}
      <style>{dotsKeyframes}</style>

      {/* Scrollable conversation area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col gap-0 overflow-y-auto px-4 py-4"
      >
        {messages.map((message, index) => {
          const from = getMessageFrom(message.type)
          const spacing = getMessageSpacing(messages, index)

          return (
            <div
              key={message.key}
              className={`flex ${from === 'user' ? 'justify-end' : 'justify-start'} ${spacing}`}
            >
              <div
                className={
                  from === 'user'
                    ? 'max-w-[80%] rounded-2xl px-4 py-2 bg-[var(--ai-user-bubble-bg)] text-[var(--ai-user-bubble-text)]'
                    : 'max-w-full'
                }
              >
                {/* tool messages */}
                {message.type === 'tool' && (
                  <ToolCall toolCalls={message.toolCalls ?? []} />
                )}

                {/* custom messages */}
                {message.type === 'custom' &&
                  renderCustom &&
                  message.customContent &&
                  renderCustom(message.customContent)}

                {/* ai / system messages - markdown */}
                {(message.type === 'ai' || message.type === 'system') && (
                  <div className="markdown-body">
                    <Streamdown
                      plugins={{ code, mermaid }}
                      animated
                      isAnimating={isStreaming}
                    >
                      {message.content || ''}
                    </Streamdown>
                  </div>
                )}

                {/* human messages - plain text */}
                {message.type === 'human' && <>{message.content}</>}
              </div>
            </div>
          )
        })}

        {/* Loading indicator (bouncing dots) */}
        {isStreaming && (
          <div className="flex justify-start">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 0',
              }}
            >
              <span style={dotStyle('-0.32s')} />
              <span style={dotStyle('-0.16s')} />
              <span style={dotStyle('0s')} />
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ai-layer-bg)] border border-[var(--ai-layer-border)] shadow-md cursor-pointer transition-opacity hover:opacity-80"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4 text-[var(--ai-control-muted)]" />
        </button>
      )}
    </div>
  )
}
