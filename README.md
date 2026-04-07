# langgraph-react-chatbot

基于 React + TypeScript 的 LangGraph 聊天机器人组件库，从 [langgraph-vue3-chatbot](https://github.com/izerui/langgraph-vue3-chatbot) 重构而来。

支持流式响应、工具调用可视化、待办计划展示、多主题切换、附件上传等功能，可作为 npm 库嵌入到任意 React 项目中，也可作为浮动聊天机器人使用。

## 功能特性

- 🔄 **流式响应** — 实时渲染 AI 输出，支持 Markdown + 代码高亮 + Mermaid 图表
- 🛠️ **工具调用可视化** — 展示工具调用生命周期（启动/运行/完成/错误）
- 📋 **待办计划** — 自动解析 `write_todos` 工具事件，展示可折叠的执行计划
- 📎 **附件支持** — 本地文件/图片上传、粘贴上传、远程 URL 附件
- 🤖 **模型切换** — 动态获取模型列表，支持切换
- 🎨 **多主题** — 内置 5 套主题：`light`、`dark`、`hailan`、`dianshanglv`、`gaojizi`
- 📦 **双模式** — 内嵌面板 (`ChatBot`) + 浮动按钮 (`AskAiBot`)
- 🔌 **可扩展** — 支持自定义空状态、自定义消息渲染、自定义附件触发器

## 安装依赖

```bash
npm install
```

## 配置环境变量

复制 `.env.example` 为 `.env.development` 并填写 LangGraph 后端地址：

```bash
cp .env.example .env.development
```

```env
VITE_LANGGRAPH_API_URL=http://localhost:2024
VITE_LANGGRAPH_API_KEY=
```

## 运行

```bash
# 启动开发服务器
npm run dev

# 构建应用
npm run build

# 预览构建结果
npm run preview

# 构建 npm 库（输出到 dist-lib/）
npm run build:lib
```

## 作为库使用

### 安装

```bash
npm install langgraph-react-chatbot
```

### 引入样式

```tsx
import 'langgraph-react-chatbot/dist-lib/index.css'
```

### 内嵌面板

```tsx
import { ChatBot } from 'langgraph-react-chatbot'

function App() {
  return (
    <div style={{ height: '600px' }}>
      <ChatBot
        apiUrl="http://localhost:2024"
        assistantId="research"
        assistantName="我的助手"
        theme="light"
      />
    </div>
  )
}
```

### 浮动按钮

```tsx
import { AskAiBot } from 'langgraph-react-chatbot'

function App() {
  return (
    <>
      {/* 页面其他内容 */}
      <AskAiBot
        apiUrl="http://localhost:2024"
        assistantId="research"
        theme="dark"
      />
    </>
  )
}
```

### 命令式 API

```tsx
import { useRef } from 'react'
import { AskAiBot } from 'langgraph-react-chatbot'
import type { AskAiBotPublicApi } from 'langgraph-react-chatbot'

function App() {
  const botRef = useRef<AskAiBotPublicApi>(null)

  return (
    <>
      <button onClick={() => botRef.current?.open()}>打开助手</button>
      <button onClick={() => {
        botRef.current?.setTextInput('帮我分析这份文档')
        botRef.current?.sendMessage()
      }}>发送消息</button>
      <AskAiBot ref={botRef} apiUrl="http://localhost:2024" />
    </>
  )
}
```

## Props

### ChatBot / AskAiBot 通用 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiUrl` | `string` | `'http://localhost:2024'` | LangGraph API 地址 |
| `apiKey` | `string` | — | API 密钥（可选） |
| `assistantId` | `string` | `'research'` | LangGraph Assistant ID |
| `assistantName` | `string` | `'Chat'` | 显示在标题栏的名称 |
| `systemPrompt` | `string` | — | 系统提示词 |
| `threadId` | `string` | — | 恢复已有会话的线程 ID |
| `userId` | `string` | `'user001'` | 用户 ID |
| `suggestions` | `string[]` | `[]` | 建议问题列表 |
| `theme` | `AiBotTheme` | `'light'` | 主题 |
| `allowModelSwitch` | `boolean` | `true` | 是否显示模型切换器 |

### AskAiBot 专属 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultExpanded` | `boolean` | `false` | 默认展开 |
| `width` | `number \| string` | `400` | 面板宽度 |
| `height` | `number \| string` | `'calc(100vh - 90px)'` | 面板高度 |

## 主题

```tsx
<ChatBot theme="dark" />      // 深色
<ChatBot theme="hailan" />    // 海蓝
<ChatBot theme="dianshanglv" /> // 电商绿
<ChatBot theme="gaojizi" />   // 高级紫
```

## 技术栈

| 依赖 | 说明 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型系统 |
| Vite 8 | 构建工具 |
| Tailwind CSS v4 | 样式 |
| @langchain/langgraph-sdk | LangGraph 客户端 |
| streamdown | 流式 Markdown 渲染 |
| Radix UI | 无头 UI 组件 |
| lucide-react | 图标 |
