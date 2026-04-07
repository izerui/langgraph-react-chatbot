import type { ReactNode, ElementType } from 'react'
import { cn } from './lib/utils'

interface ShimmerProps {
  children: ReactNode
  className?: string
  as?: ElementType
}

export function Shimmer({ children, className, as: Component = 'span' }: ShimmerProps) {
  return (
    <Component className={cn('inline-block animate-pulse', className)}>
      {children}
    </Component>
  )
}
