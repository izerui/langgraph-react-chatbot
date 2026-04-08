import { Maximize2, Minimize2, X } from 'lucide-react'
import './ChatHeader.css'

interface ChatHeaderProps {
  title: string
  isMaximized: boolean
  showHeaderActions?: boolean
  onClose: () => void
  onToggleMaximize: () => void
}

export function ChatHeader({
  title,
  isMaximized,
  showHeaderActions = true,
  onClose,
  onToggleMaximize,
}: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="chat-title">
        <span className="title-text">{title}</span>
      </div>
      {showHeaderActions && (
        <div className="header-actions">
          <button
            className="action-btn"
            onClick={onToggleMaximize}
            type="button"
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
          <button
            className="action-btn"
            onClick={onClose}
            type="button"
            title="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
