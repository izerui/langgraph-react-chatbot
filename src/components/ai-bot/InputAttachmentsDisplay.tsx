import React from 'react'
import { X } from 'lucide-react'
import { usePromptInputContext } from './contexts/PromptInputContext'
import type { AttachmentFile } from './lib/input-types'

// ============== Styles ==============

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 8,
    background: 'var(--ai-chip-bg, rgba(0,0,0,0.06))',
    fontSize: 11,
    lineHeight: 1.2,
    maxWidth: 180,
    overflow: 'hidden',
  },
  preview: {
    width: 24,
    height: 24,
    borderRadius: 4,
    objectFit: 'cover' as const,
    flexShrink: 0,
  },
  info: {
    maxWidth: 100,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: 11,
    color: 'var(--ai-chip-text, inherit)',
  },
  removeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--ai-chip-text, inherit)',
    opacity: 0.6,
    flexShrink: 0,
    borderRadius: 4,
  },
}

// ============== Helpers ==============

function isImageType(file: AttachmentFile): boolean {
  if (file.type === 'image') return true
  if (file.mediaType?.startsWith('image/')) return true
  return false
}

function getPreviewUrl(file: AttachmentFile): string | null {
  if (!isImageType(file)) return null
  if (file.url) return file.url
  if (file.data && file.mediaType) {
    return `data:${file.mediaType};base64,${file.data}`
  }
  return null
}

// ============== Component ==============

export function InputAttachmentsDisplay() {
  const { files, removeFile } = usePromptInputContext()

  if (files.length === 0) return null

  return (
    <div style={styles.container}>
      {files.map((attachment) => {
        const previewUrl = getPreviewUrl(attachment)

        return (
          <div key={attachment.id} style={styles.pill}>
            {previewUrl && (
              <img
                src={previewUrl}
                alt={attachment.filename || 'attachment'}
                style={styles.preview}
              />
            )}
            <span style={styles.info} title={attachment.filename}>
              {attachment.filename || 'file'}
            </span>
            <button
              type="button"
              style={styles.removeBtn}
              onClick={() => removeFile(attachment.id)}
              aria-label="Remove attachment"
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.6'
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default InputAttachmentsDisplay
