import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ============== Types ==============

interface ChatSuggestionsProps {
  suggestions: string[]
  onSelect: (suggestion: string) => void
}

// ============== Constants ==============

const ROTATE_INTERVAL = 3200
const CHIP_GAP = 5

// ============== Suggestion chip ==============

const SuggestionChip = React.forwardRef<
  HTMLButtonElement,
  { suggestion: string; onClick?: () => void; tabIndex?: number }
>(({ suggestion, onClick, tabIndex }, ref) => (
  <button
    ref={ref}
    type="button"
    tabIndex={tabIndex}
    onClick={onClick}
    style={{
      maxWidth: '100%',
      height: 24,
      padding: '0 9px',
      borderColor: 'transparent',
      background: 'var(--ai-chip-bg)',
      color: 'var(--ai-chip-text)',
      fontSize: 11,
      lineHeight: 1,
      fontWeight: 500,
      boxShadow: 'none',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      border: '1px solid transparent',
      borderRadius: 9999,
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget
      el.style.background = 'var(--ai-control-hover-bg)'
      el.style.color = 'var(--ai-chip-hover-text)'
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget
      el.style.background = 'var(--ai-chip-bg)'
      el.style.color = 'var(--ai-chip-text)'
    }}
  >
    {suggestion}
  </button>
))
SuggestionChip.displayName = 'SuggestionChip'

// ============== Component ==============

export function ChatSuggestions({ suggestions, onSelect }: ChatSuggestionsProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRefs = useRef<(HTMLElement | null)[]>([])
  const [pageRanges, setPageRanges] = useState<Array<{ start: number; end: number }>>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const isHovered = useRef(false)
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const shouldRotate = pageRanges.length > 1

  const currentPageSuggestions = useMemo(() => {
    const range = pageRanges[currentPageIndex]
    if (!range) return suggestions
    return suggestions.slice(range.start, range.end)
  }, [pageRanges, currentPageIndex, suggestions])

  const stopRotation = useCallback(() => {
    if (rotationTimerRef.current) {
      clearInterval(rotationTimerRef.current)
      rotationTimerRef.current = null
    }
  }, [])

  const buildPageRanges = useCallback(() => {
    const viewportWidth = viewportRef.current?.clientWidth ?? 0
    const widths = suggestions.map(
      (_, index) => measureRefs.current[index]?.offsetWidth ?? 0,
    )

    if (!suggestions.length) {
      setPageRanges([])
      setCurrentPageIndex(0)
      stopRotation()
      return
    }

    if (!viewportWidth || widths.some((w) => w === 0)) {
      setPageRanges([{ start: 0, end: suggestions.length }])
      setCurrentPageIndex(0)
      stopRotation()
      return
    }

    const ranges: Array<{ start: number; end: number }> = []
    let start = 0
    let widthSum = 0

    suggestions.forEach((_, index) => {
      const itemWidth = widths[index]
      const nextWidth =
        start === index ? itemWidth : widthSum + CHIP_GAP + itemWidth

      if (start !== index && nextWidth > viewportWidth) {
        ranges.push({ start, end: index })
        start = index
        widthSum = itemWidth
        return
      }

      widthSum = nextWidth
    })

    ranges.push({ start, end: suggestions.length })
    setPageRanges(ranges)
    setCurrentPageIndex((prev) =>
      Math.min(prev, Math.max(ranges.length - 1, 0)),
    )
  }, [suggestions, stopRotation])

  const startRotation = useCallback(() => {
    stopRotation()
    if (pageRanges.length <= 1 || isHovered.current) return
    rotationTimerRef.current = setInterval(() => {
      setCurrentPageIndex((prev) => (prev + 1) % pageRanges.length)
    }, ROTATE_INTERVAL)
  }, [pageRanges, stopRotation])

  // Rebuild pages when suggestions change
  useEffect(() => {
    measureRefs.current = []
    setCurrentPageIndex(0)
    stopRotation()
    // Wait for measure refs to render
    requestAnimationFrame(() => {
      buildPageRanges()
    })
  }, [suggestions, buildPageRanges, stopRotation])

  // Start/stop rotation when pageRanges change
  useEffect(() => {
    if (pageRanges.length > 1 && !isHovered.current) {
      startRotation()
    }
    return () => stopRotation()
  }, [pageRanges, startRotation, stopRotation])

  // ResizeObserver
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setCurrentPageIndex(0)
      requestAnimationFrame(() => buildPageRanges())
    })
    if (viewportRef.current) {
      observer.observe(viewportRef.current)
    }
    resizeObserverRef.current = observer
    return () => observer.disconnect()
  }, [buildPageRanges])

  const handleMouseEnter = useCallback(() => {
    isHovered.current = true
    stopRotation()
  }, [stopRotation])

  const handleMouseLeave = useCallback(() => {
    isHovered.current = false
    startRotation()
  }, [startRotation])

  return (
    <div
      style={{ padding: 0, position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Visible viewport */}
      <div
        ref={viewportRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 24,
          overflow: 'hidden',
        }}
      >
        <div
          key={currentPageIndex}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: CHIP_GAP,
            width: '100%',
            height: 24,
            overflow: 'hidden',
          }}
        >
          {currentPageSuggestions.map((s) => (
            <SuggestionChip
              key={s}
              suggestion={s}
              onClick={() => onSelect(s)}
            />
          ))}
        </div>
      </div>

      {/* Hidden measurement row */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          display: 'flex',
          alignItems: 'center',
          gap: CHIP_GAP,
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          height: 0,
          overflow: 'hidden',
        }}
      >
        {suggestions.map((s, i) => (
          <SuggestionChip
            key={`measure-${s}-${i}`}
            ref={(el) => {
              measureRefs.current[i] = el
            }}
            suggestion={s}
            tabIndex={-1}
          />
        ))}
      </div>
    </div>
  )
}

export default ChatSuggestions
