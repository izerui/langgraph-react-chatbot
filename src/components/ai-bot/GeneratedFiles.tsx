import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { CustomContent } from './lib/message-types'

// ============== Types ==============

interface GeneratedFilesProps {
  customContent: CustomContent
  apiUrl: string
  threadId: string | null
}

// ============== Styles ==============

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  fileItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 13,
    color: 'var(--ai-file-pill-text)',
    background: 'var(--ai-file-pill-bg)',
    borderRadius: 9999,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileIcon: {
    width: 14,
    height: 14,
    flexShrink: 0,
  },
}

// ============== Component ==============

export function GeneratedFiles({
  customContent,
  apiUrl,
  threadId,
}: GeneratedFilesProps) {
  const files =
    customContent?.type === 'generated_files' ? customContent.content : null

  if (!files || !Array.isArray(files)) return null

  return (
    <div style={styles.container}>
      {files.map((file: string, index: number) => (
        <a
          key={index}
          style={styles.fileItem}
          href={`${apiUrl}/webapp/download/${threadId}?path=${encodeURIComponent(file)}`}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLAnchorElement).style.background =
              'var(--ai-file-pill-hover-bg)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLAnchorElement).style.background =
              'var(--ai-file-pill-bg)'
          }}
        >
          <span>{file}</span>
          <ArrowUpRight style={styles.fileIcon} />
        </a>
      ))}
    </div>
  )
}

export default GeneratedFiles
