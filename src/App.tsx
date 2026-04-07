import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { AskAiBot, ChatBot, GeneratedFiles } from './components/ai-bot'
import type { AiBotTheme, PromptInputAttachment, CustomContent } from './components/ai-bot'
import { GENERAL_TOOL_PROMPT } from './prompts'
import './App.css'

const apiUrl = import.meta.env.VITE_LANGGRAPH_API_URL || 'http://localhost:2024'
const apiKey = import.meta.env.VITE_LANGGRAPH_API_KEY

interface ThemeOption {
  value: AiBotTheme
  label: string
  description: string
}

const themeOptions: ThemeOption[] = [
  { value: 'light', label: '浅色', description: '默认主题' },
  { value: 'dark', label: '深色', description: '暗黑主题' },
  { value: 'hailan', label: '海蓝', description: '海蓝主题' },
  { value: 'dianshanglv', label: '电商绿', description: '电商感绿色主题' },
  { value: 'gaojizi', label: '高级紫', description: '低饱和紫色主题' },
]

const demoAttachment: PromptInputAttachment = {
  type: 'file_url',
  url: 'https://example.com/files/tool-operation-manual.pdf',
  filename: '工具操作手册.pdf',
  mediaType: 'application/pdf',
}

function formatCustomContent(content: unknown): string {
  if (content == null) {
    return '无内容'
  }

  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

export default function App() {
  const [currentTheme, setCurrentTheme] = useState<AiBotTheme>('light')
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false)
  const [pendingAddAttachments, setPendingAddAttachments] = useState<
    ((attachments: PromptInputAttachment[]) => void) | null
  >(null)

  const openAttachmentDialog = useCallback(
    (addAttachments: (attachments: PromptInputAttachment[]) => void) => {
      setPendingAddAttachments(() => addAttachments)
      setAttachmentDialogOpen(true)
    },
    [],
  )

  const closeAttachmentDialog = useCallback(() => {
    setAttachmentDialogOpen(false)
    setPendingAddAttachments(null)
  }, [])

  const confirmAttachmentSelection = useCallback(() => {
    if (!pendingAddAttachments) {
      closeAttachmentDialog()
      return
    }

    pendingAddAttachments([demoAttachment])
    closeAttachmentDialog()
  }, [pendingAddAttachments, closeAttachmentDialog])

  const renderAttachmentTrigger = useCallback(
    ({ addAttachments }: { addAttachments: (attachments: PromptInputAttachment[]) => void }) => (
      <button
        type="button"
        className="custom-attachment-trigger"
        title="通过对话框添加附件"
        onClick={() => openAttachmentDialog(addAttachments)}
      >
        <Plus className="size-4" />
      </button>
    ),
    [openAttachmentDialog],
  )

  const renderEmpty = useCallback(
    ({ sendMessage }: { sendMessage: (message: string) => void }) => (
      <div className="welcome-card">
        <div className="ai-logo">AI</div>
        <h2 className="welcome-title">您好，我是AI工具助手</h2>
        <hr className="welcome-divider" />
        <p className="welcome-desc">
          可以帮助您处理各种任务、生成内容和执行工具操作。请切换左侧主题，观察整体视觉、输入框和消息区域表现。
        </p>
        <div className="demo-buttons">
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('帮我分析这个文档并提取关键信息')}
          >
            分析文档
          </button>
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('生成一份项目总结报告')}
          >
            生成报告
          </button>
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('帮我整理这些数据的格式')}
          >
            数据处理
          </button>
        </div>
      </div>
    ),
    [],
  )

  const renderAskAiBotEmpty = useCallback(
    ({ sendMessage }: { sendMessage: (message: string) => void }) => (
      <div className="welcome-card">
        <div className="ai-logo">AI</div>
        <h2 className="welcome-title">您好，我是AI工具助手</h2>
        <hr className="welcome-divider" />
        <p className="welcome-desc">
          可以帮助您处理各种任务、生成内容和执行工具操作。请切换左侧主题，观察浮动按钮、展开面板与浮层是否同步。
        </p>
        <div className="demo-buttons">
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('帮我分析这个文档并提取关键信息')}
          >
            分析文档
          </button>
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('生成一份项目总结报告')}
          >
            生成报告
          </button>
          <button
            type="button"
            className="demo-button"
            onClick={() => sendMessage('帮我整理这些数据的格式')}
          >
            数据处理
          </button>
        </div>
      </div>
    ),
    [],
  )

  const renderCustom = useCallback(
    ({ customContent, threadId }: { customContent: CustomContent; threadId: string | null }) => {
      if (customContent?.type === 'generated_files') {
        return (
          <GeneratedFiles
            customContent={customContent}
            apiUrl={apiUrl}
            threadId={threadId}
          />
        )
      }

      return (
        <div className="custom-message">
          <div className="custom-type-badge">{customContent?.type || 'custom'}</div>
          {threadId && <div className="custom-thread-id">thread: {threadId}</div>}
          <pre className="custom-content">{formatCustomContent(customContent?.content)}</pre>
        </div>
      )
    },
    [],
  )

  return (
    <div className="app-container">
      <header>
        <h1>AI ChatBot</h1>
        <p>
          React + LangGraph 聊天组件示例，支持浅色 / 深色 / 海蓝主题切换、流式响应、工具调用与推理过程展示
        </p>
      </header>

      <main>
        <div className="layout-shell">
          <aside className="theme-sidebar">
            <div className="theme-toolbar__content">
              <div>
                <h2>风格</h2>
              </div>

              <div className="theme-switcher" role="tablist" aria-label="切换主题">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    className={`theme-switcher__item${currentTheme === theme.value ? ' is-active' : ''}`}
                    onClick={() => setCurrentTheme(theme.value)}
                  >
                    <span className="theme-switcher__label">{theme.label}</span>
                    <span className="theme-switcher__desc">{theme.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="content-panel">
            <div className="divider">
              <span className="divider-text">组件示例</span>
            </div>

            <div className="demo-container">
              <ChatBot
                theme={currentTheme}
                apiUrl={apiUrl}
                apiKey={apiKey}
                assistantId="research"
                assistantName="我的助手"
                systemPrompt={GENERAL_TOOL_PROMPT}
                showHeaderActions={false}
                renderAttachmentTrigger={renderAttachmentTrigger}
                renderEmpty={renderEmpty}
                renderCustom={renderCustom}
              />
            </div>
          </section>
        </div>
      </main>

      <AskAiBot
        theme={currentTheme}
        apiUrl={apiUrl}
        apiKey={apiKey}
        assistantId="research"
        threadId="9f31354d-b2f8-4472-8ab7-fd49cd52e559"
        assistantName="我的助手"
        systemPrompt={GENERAL_TOOL_PROMPT}
        height="calc(100vh - 220px)"
        renderAttachmentTrigger={renderAttachmentTrigger}
        renderEmpty={renderAskAiBotEmpty}
        renderCustom={renderCustom}
      />

      {attachmentDialogOpen && (
        <div className="dialog-mask" onClick={(e) => e.target === e.currentTarget && closeAttachmentDialog()}>
          <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="attachment-dialog-title">
            <div className="dialog-header">
              <h3 id="attachment-dialog-title">添加 URL 附件</h3>
              <p>
                这是最小化的 file_url 示例。点击确认后，会把一个远程 PDF
                链接通过 addAttachments 回填到当前聊天输入框。
              </p>
            </div>

            <div className="dialog-options">
              <div className="dialog-option selected">
                <span className="dialog-option-title">工具操作手册.pdf</span>
                <span className="dialog-option-desc">
                  https://example.com/files/tool-operation-manual.pdf
                </span>
              </div>
            </div>

            <div className="dialog-actions">
              <button type="button" className="dialog-secondary-btn" onClick={closeAttachmentDialog}>
                取消
              </button>
              <button type="button" className="dialog-primary-btn" onClick={confirmAttachmentSelection}>
                添加到输入框
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
