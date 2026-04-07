import { BotMessageSquare, X } from 'lucide-react'
import './FloatButton.css'

interface FloatButtonProps {
  isExpanded: boolean
  onToggle: () => void
}

export function FloatButton({ isExpanded, onToggle }: FloatButtonProps) {
  return (
    <button
      className={`float-button${isExpanded ? ' expanded' : ''}`}
      onClick={onToggle}
      type="button"
    >
      <span className="icon-wrapper">
        <BotMessageSquare className="icon-svg" />
        <X size={16} strokeWidth={2} absoluteStrokeWidth className="icon-svg" />
      </span>
    </button>
  )
}
