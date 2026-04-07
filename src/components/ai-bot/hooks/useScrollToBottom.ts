import { useRef, useEffect, useCallback } from 'react'

export function useScrollToBottom(deps: any[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)
  const shouldAutoScroll = useRef(true)

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom()
    }
  }, deps)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    isAtBottom.current = atBottom
    shouldAutoScroll.current = atBottom
  }, [])

  return {
    containerRef,
    scrollToBottom,
    handleScroll,
    isAtBottom: isAtBottom.current,
  }
}
