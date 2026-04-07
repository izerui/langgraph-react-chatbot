import { Loader2 } from 'lucide-react'
import { cn } from './lib/utils'

interface LoaderProps {
  size?: number
  className?: string
}

export function Loader({ size = 20, className }: LoaderProps) {
  return <Loader2 size={size} className={cn('animate-spin text-muted-foreground', className)} />
}
