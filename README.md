# langgraph-react-chatbot

[![npm version](https://img.shields.io/npm/v/langgraph-react-chatbot)](https://www.npmjs.com/package/langgraph-react-chatbot)
[![npm downloads](https://img.shields.io/npm/dw/langgraph-react-chatbot)](https://www.npmjs.com/package/langgraph-react-chatbot)
[![npm types](https://img.shields.io/npm/types/langgraph-react-chatbot)](https://www.npmjs.com/package/langgraph-react-chatbot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/izerui/langgraph-react-chatbot?style=social)](https://github.com/izerui/langgraph-react-chatbot)
[![GitHub last commit](https://img.shields.io/github/last-commit/izerui/langgraph-react-chatbot)](https://github.com/izerui/langgraph-react-chatbot/commits/main)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/izerui/langgraph-react-chatbot/pulls)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-SDK-blue)](https://www.npmjs.com/package/@langchain/langgraph-sdk)

一个面向 React 的 AI 聊天组件库，基于 `@langchain/langgraph-sdk` 实现与 LangGraph 后端的流式通信。从 [langgraph-vue3-chatbot](https://github.com/izerui/langgraph-vue3-chatbot) 重构而来。

当前提供两个核心组件：

- `AskAiBot`：悬浮按钮 + 展开聊天窗，适合挂在页面右下角快速唤起
- `ChatBot`：可直接嵌入页面的聊天面板，适合详情页、工作台、后台系统等场景

组件内部已集成：流式消息渲染、工具调用展示、附件能力、建议问题、模型选择、多主题切换等常见 AI 聊天能力。

## 特性

- 开箱即用的 React AI 聊天组件
- 基于 LangGraph 的流式消息通信
- 同时支持嵌入式面板和悬浮聊天窗
- 内置工具调用展示
- 支持附件上传入口自定义渲染
- 支持建议问题、空状态、自定义消息内容渲染
- 自动引入组件样式，接入成本低
- 使用 TypeScript 编写，提供类型声明

## 安装

宿主项目需自行提供 `react` 和 `react-dom`，其余运行时依赖会随 `langgraph-react-chatbot` 自动安装。

```bash
pnpm add langgraph-react-chatbot
```

## 快速开始

### 1. 准备 LangGraph 服务

组件默认通过以下参数连接 LangGraph 后端：

- `apiUrl`：LangGraph 服务地址
- `apiKey`：LangGraph 服务访问凭证（可选）
- `assistantId`：目标 assistant 标识

### 2. 使用 `AskAiBot`

适合在现有页面中增加一个可随时唤起的 AI 助手入口。

```tsx
import { AskAiBot } from 'langgraph-react-chatbot'

function App() {
  return (
    <>
      {/* 页面其他内容 */}
      <AskAiBot
        assistantId="research"
        assistantName="AI 助手"
        apiUrl="http://localhost:2024"
        theme="light"
        width={400}
        height="calc(100vh - 120px)"
        allowModelSwitch={false}
      />
    </>
  )
}
```

### 3. 使用 `ChatBot`

适合直接嵌入业务页面，作为主要聊天区域。

```tsx
import { ChatBot } from 'langgraph-react-chatbot'

function App() {
  return (
    <div style={{ height: '600px' }}>
      <ChatBot
        assistantId="research"
        assistantName="AI 助手"
        apiUrl="http://localhost:2024"
        theme="dark"
        showHeaderActions={false}
        allowModelSwitch={false}
      />
    </div>
  )
}
```

## 推荐接入方式

如果你希望接入方式更贴近本仓库 demo，可以结合环境变量来传入配置：

```tsx
import { ChatBot, AskAiBot } from 'langgraph-react-chatbot'
import type { AiBotTheme } from 'langgraph-react-chatbot'

const apiUrl = import.meta.env.VITE_LANGGRAPH_API_URL || 'http://localhost:2024'
const assistantId = import.meta.env.VITE_LANGGRAPH_ASSISTANT_ID || 'demo-assistant'
const assistantName = import.meta.env.VITE_LANGGRAPH_ASSISTANT_NAME || 'AI 助手'
const chatbotTheme: AiBotTheme = 'light'
const askAiBotTheme: AiBotTheme = 'dark'

const suggestions = [
  '这个 demo 怎么接入真实服务？',
  'ChatBot 和 AskAiBot 分别适合什么场景？',
]

function App() {
  return (
    <>
      <ChatBot
        apiUrl={apiUrl}
        assistantId={assistantId}
        assistantName={assistantName}
        theme={chatbotTheme}
      />

      <AskAiBot
        apiUrl={apiUrl}
        assistantId={assistantId}
        assistantName={assistantName}
        suggestions={suggestions}
        theme={askAiBotTheme}
      />
    </>
  )
}
```

## Props

### AskAiBot

| Prop | 用途 | 默认值 |
| --- | --- | --- |
| `assistantId` | 指定 LangGraph 侧的 assistant 标识 | `'research'` |
| `assistantName` | 设置组件头部展示的助手名称 | `'Chat'` |
| `defaultExpanded` | 控制悬浮聊天窗首次渲染时是否默认展开 | `false` |
| `systemPrompt` | 设置发送给模型的系统提示词 | `'用中文回答'` |
| `threadId` | 指定已有会话线程 id；不传时由组件内部创建线程。传固定值时可复用历史，并在刷新后自动尝试加入该线程最近的活跃对话流 | `undefined` |
| `userId` | 标识当前用户，用于请求上下文区分 | `'user001'` |
| `suggestions` | 配置输入区上方的建议问题列表 | `[]` |
| `apiUrl` | 指定 LangGraph 服务地址 | `'http://localhost:2024'` |
| `apiKey` | 指定 LangGraph 服务访问凭证 | `undefined` |
| `theme` | 设置组件主题，可选 `light` / `dark` / `hailan` / `dianshanglv` / `gaojizi` | `'light'` |
| `width` | 设置悬浮聊天窗打开后的宽度，支持 `number` 或 CSS 尺寸字符串 | `400` |
| `height` | 设置悬浮聊天窗打开后的高度，支持 `number` 或 CSS 尺寸字符串 | `'calc(100vh - 90px)'` |
| `allowModelSwitch` | 控制是否显示输入区右下角的模型选择器 | `true` |

### ChatBot

| Prop | 用途 | 默认值 |
| --- | --- | --- |
| `assistantId` | 指定 LangGraph 侧的 assistant 标识 | `'research'` |
| `assistantName` | 设置聊天面板头部展示的助手名称 | `'Chat'` |
| `systemPrompt` | 设置发送给模型的系统提示词 | `'你是一个有用的助手，帮用户解决各种问题。'` |
| `threadId` | 指定已有会话线程 id；不传时由组件内部创建线程。传固定值时可复用历史，并在刷新后自动尝试加入该线程最近的活跃对话流 | `undefined` |
| `userId` | 标识当前用户，用于请求上下文区分 | `'user001'` |
| `showHeaderActions` | 控制是否显示聊天面板头部右侧操作按钮，例如关闭、最大化等 | `true` |
| `suggestions` | 配置输入区上方的建议问题列表 | `[]` |
| `apiUrl` | 指定 LangGraph 服务地址 | `'http://localhost:2024'` |
| `apiKey` | 指定 LangGraph 服务访问凭证 | `undefined` |
| `theme` | 设置组件主题，可选 `light` / `dark` / `hailan` / `dianshanglv` / `gaojizi` | `'light'` |
| `allowModelSwitch` | 控制是否显示输入区右下角的模型选择器 | `true` |

## 组件实例 API

`ChatBot` 和 `AskAiBot` 都支持通过 `ref` 调用少量公开实例方法。

公共能力：

- `setTextInput(text: string)`：设置输入框文本
- `addAttachments(attachments: PromptInputAttachment[])`：添加附件，支持 `file`、`data + mediaType`、`file_url` 三种模式
- `sendMessage()`：触发现有发送流程

其中：

- `ChatBot` 会直接调用内部输入区现有逻辑
- `AskAiBot` 在折叠状态下调用 `sendMessage()` 时，会先自动展开再发送

`AskAiBot` 额外支持：

- `open()`：打开悬浮聊天窗
- `close()`：关闭悬浮聊天窗；如果当前处于最大化状态，会一并退出最大化

### `ChatBot` 示例

`PromptInputAttachment` 推荐按以下三种模式传入：

#### 1. 本地文件

```ts
{ type: 'file' | 'image', file: File, filename?: string, mediaType?: string }
```

- `file`：浏览器原生 `File` 对象
- `filename` / `mediaType`：可选覆盖默认文件名和 MIME 类型

#### 2. 内联内容

```ts
{ type: 'file' | 'image', filename: string, mediaType: string, data: string }
```

- `data`：纯 base64 内容
- `data` 不要带 `data:image/png;base64,` 这类前缀
- `mediaType`：文件 MIME 类型，例如 `image/png`、`application/pdf`

#### 3. 远程地址

```ts
{ type: 'file_url', url: string, filename?: string, mediaType?: string }
```

- `url`：远程文件地址
- `filename` / `mediaType`：可选补充展示信息

```tsx
import { useRef } from 'react'
import { ChatBot } from 'langgraph-react-chatbot'
import type { AiBotPublicApi, PromptInputAttachment } from 'langgraph-react-chatbot'

function App() {
  const chatBotRef = useRef<AiBotPublicApi>(null)

  function askWithAttachment() {
    chatBotRef.current?.setTextInput('请帮我分析这些附件')

    const attachments: PromptInputAttachment[] = [
      {
        type: 'file_url',
        url: 'https://example.com/report.pdf',
        filename: 'report.pdf',
        mediaType: 'application/pdf'
      },
      {
        type: 'image',
        filename: 'architecture.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=='
      }
    ]

    chatBotRef.current?.addAttachments(attachments)
    chatBotRef.current?.sendMessage()
  }

  return (
    <>
      <button onClick={askWithAttachment}>发送预设问题</button>
      <div style={{ height: '600px', marginTop: 12 }}>
        <ChatBot
          ref={chatBotRef}
          assistantId="research"
          assistantName="AI 助手"
          apiUrl="http://localhost:2024"
        />
      </div>
    </>
  )
}
```

### `AskAiBot` 示例

```tsx
import { useRef } from 'react'
import { AskAiBot } from 'langgraph-react-chatbot'
import type { AskAiBotPublicApi } from 'langgraph-react-chatbot'

function App() {
  const askAiBotRef = useRef<AskAiBotPublicApi>(null)

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => askAiBotRef.current?.open()}>打开助手</button>
        <button onClick={() => askAiBotRef.current?.close()}>关闭助手</button>
        <button onClick={() => {
          askAiBotRef.current?.setTextInput('帮我总结今天的待办')
          askAiBotRef.current?.sendMessage()
        }}>唤起并发送</button>
      </div>

      <AskAiBot
        ref={askAiBotRef}
        assistantId="research"
        assistantName="AI 助手"
        apiUrl="http://localhost:2024"
      />
    </>
  )
}
```

## Render Props

React 版本使用 render props 替代 Vue 的 slots：

### AskAiBot / ChatBot 通用

| Render Prop | 用途 | 参数 |
| --- | --- | --- |
| `renderEmpty` | 自定义空状态内容 | `{ sendMessage }` |
| `renderCustom` | 自定义 custom 消息渲染 | `{ customContent, threadId }` |
| `renderAttachmentTrigger` | 自定义附件触发器 | `{ addAttachments }` |

## 样式说明

- 组件通过主入口导出
- 主入口会自动带出组件样式
- 使用时无需额外单独引入样式文件
- 当前内置五套主题：`light`（浅色，默认）、`dark`（深色）、`hailan`（海蓝）、`dianshanglv`（电商绿）、`gaojizi`（高级紫）
- `AskAiBot` 的 `theme` 会同时作用于外层悬浮按钮、内部 `ChatBot` 与 portal 浮层
- 内部 markdown 渲染基于 [streamdown](https://github.com/vercel/streamdown)，支持代码高亮和 Mermaid 图表

## 使用建议

- 页面内主聊天区域优先使用 `ChatBot`
- 作为全局 AI 助手入口优先使用 `AskAiBot`
- 如果你已经有 thread id，可通过 `threadId` 复用已有会话
- 当传入固定 `threadId` 时，组件会先恢复线程历史；如果该线程存在 `pending` / `running` 的最近 run，会在页面刷新后自动重新加入流式对话
- 如果需要区分用户上下文，可传入 `userId`

## 本地开发

```bash
pnpm install
pnpm dev
```

构建生产版本：

```bash
pnpm build
```

预览构建结果：

```bash
pnpm preview
```

## 本地编译与发布

如果你是在维护这个组件库本身，常用命令如下。

### 本地编译组件库

```bash
pnpm install
pnpm build:lib
```

`pnpm build:lib` 会输出 npm 发布所需的库产物和类型声明到 `dist-lib` 目录。

### 发布到 npm

首次发布前先登录 npm：

```bash
npm login
```

然后执行：

```bash
pnpm publish --access public
```

说明：

- 当前包名是 `langgraph-react-chatbot`，发布时使用根目录 `package.json`
- `prepublishOnly` 会在发布前自动执行 `npm version patch --no-git-tag-version`，并运行 `pnpm check:lib`
- 如果只是想先手动验证构建结果，可以先执行 `pnpm build:lib`

## 技术栈

| 依赖 | 说明 |
|------|------|
| React 19 | UI 框架 |
| TypeScript 6 | 类型系统 |
| Vite 8 | 构建工具 |
| Tailwind CSS v4 | 样式 |
| @langchain/langgraph-sdk | LangGraph 客户端 |
| streamdown | 流式 Markdown 渲染 |
| Radix UI | 无头 UI 组件 |
| lucide-react | 图标 |

## 相关链接

- npm: https://www.npmjs.com/package/langgraph-react-chatbot
- Repository: https://github.com/izerui/langgraph-react-chatbot
- Vue 3 版本: https://github.com/izerui/langgraph-vue3-chatbot

## License

MIT
