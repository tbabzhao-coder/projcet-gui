# Plan Mode 功能设计与实现文档

## 1. 背景与目标

项目基于 Claude Code (claude-agent-sdk)，已有 Deep Thinking 模式切换功能。Plan Mode 的目标是让 Agent 在执行前只输出计划方案，不执行任何写操作（不创建/修改文件、不执行命令）。

底层原理：SDK 提供了 `v2Session.setPermissionMode('plan')` 方法，设置后 Agent 进入"规划模式"，只做分析和规划，不执行实际操作。

## 2. 设计原则

- **与 Deep Thinking 完全对称**：数据流、UI 交互、状态管理方式完全复用 Deep Thinking 的模式
- **Per-message toggle**：每条消息独立控制是否启用 Plan Mode，不是全局设置
- **非互斥**：Plan Mode 和 Deep Thinking 可以同时开启
- **最小侵入**：只在已有数据链路上增加一个 `planModeEnabled` 布尔参数，不引入新的状态管理机制

## 3. 数据流设计

完整的数据流路径（从 UI 到 SDK 调用）：

```
InputArea (planModeEnabled state)
  → onSend(content, images, thinkingEnabled, planModeEnabled)
    → ChatView.handleSend(content, images, thinkingEnabled, planModeEnabled)
      → chat.store.sendMessage(content, images, aiBrowserEnabled, thinkingEnabled, planModeEnabled)
        → api.sendMessage({ ...payload, planModeEnabled })
          → preload IPC (window.project4.sendMessage)
            → ipcMain.handle('agent:send-message')
              → sendMessage(mainWindow, request)  // request 包含 planModeEnabled
                → v2Session.setPermissionMode(planModeEnabled ? 'plan' : 'acceptEdits')
```

每一层只做透传，最终在 `send-message.ts` 的动态参数调整块中调用 SDK 方法。

## 4. 修改的文件清单

共 9 个文件，52 行新增，11 行修改：

### 4.1 Renderer 层（UI + 状态）

#### `src/renderer/components/chat/InputArea.tsx`

这是改动最大的文件，负责 UI 展示和用户交互。

**新增状态：**
```tsx
const [planModeEnabled, setPlanModeEnabled] = useState(false)
```

**新增图标导入：**
```tsx
import { ..., ListChecks } from 'lucide-react'
```

**修改 `onSend` 签名，增加 `planModeEnabled` 参数：**
```tsx
// Before
onSend: (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean) => void

// After
onSend: (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean, planModeEnabled?: boolean) => void
```

**修改 `handleSend` 调用，传入 `planModeEnabled`：**
```tsx
onSend(textToSend, images.length > 0 ? images : undefined, thinkingEnabled, planModeEnabled)
```

**`InputToolbar` 组件新增 props：**
```tsx
interface InputToolbarProps {
  // ...existing props
  planModeEnabled: boolean
  onPlanModeToggle: () => void
}
```

**新增 Plan Mode 按钮（在 Deep Thinking 按钮之后）：**
```tsx
{!isGenerating && !isOnboarding && (
  <button
    onClick={onPlanModeToggle}
    className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg
      transition-colors duration-200
      ${planModeEnabled
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
      }
    `}
    title={planModeEnabled ? t('Disable Plan Mode') : t('Enable Plan Mode')}
  >
    <ListChecks size={15} />
    <span className="text-xs">{t('Plan Mode')}</span>
  </button>
)}
```

**修改发送按钮 title，反映 Plan Mode 状态：**
```tsx
// Before
title={thinkingEnabled ? t('Send (Deep Thinking)') : t('Send')}

// After
title={planModeEnabled ? t('Send (Plan Mode)') : thinkingEnabled ? t('Send (Deep Thinking)') : t('Send')}
```

#### `src/renderer/components/chat/ChatView.tsx`

**修改 `handleSend` 签名和调用：**
```tsx
// Before
const handleSend = async (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean) => {
  await sendMessage(content, images, aiBrowserEnabled, thinkingEnabled)
}

// After
const handleSend = async (content: string, images?: ImageAttachment[], thinkingEnabled?: boolean, planModeEnabled?: boolean) => {
  await sendMessage(content, images, aiBrowserEnabled, thinkingEnabled, planModeEnabled)
}
```

ChatView 只做透传，不持有 planModeEnabled 状态（状态在 InputArea 中管理）。

#### `src/renderer/stores/chat.store.ts`

**修改 `sendMessage` 类型签名：**
```tsx
// Before
sendMessage: (content: string, images?: ImageAttachment[], aiBrowserEnabled?: boolean, thinkingEnabled?: boolean) => Promise<void>

// After
sendMessage: (content: string, images?: ImageAttachment[], aiBrowserEnabled?: boolean, thinkingEnabled?: boolean, planModeEnabled?: boolean) => Promise<void>
```

**修改实现签名：**
```tsx
sendMessage: async (content, images, aiBrowserEnabled, thinkingEnabled, planModeEnabled) => {
```

**修改 `api.sendMessage` 调用，传入 `planModeEnabled`：**
```tsx
await api.sendMessage({
  // ...existing fields
  planModeEnabled,  // Pass plan mode to API
})
```

#### `src/renderer/api/index.ts`

**在 `sendMessage` 的 request 类型中新增字段：**
```tsx
planModeEnabled?: boolean  // Enable plan mode
```

API 层只做类型声明，实际透传由 preload 的 IPC 调用完成。

### 4.2 Transport 层（IPC 桥接）

#### `src/preload/index.ts`

**在 `sendMessage` 的 request 类型中新增字段：**
```tsx
planModeEnabled?: boolean  // Enable plan mode
```

preload 的 `sendMessage` 实现是 `(request) => ipcRenderer.invoke('agent:send-message', request)`，整个 request 对象透传，无需修改实现代码。

#### `src/main/ipc/agent.ts`

**在 IPC handler 的 request 类型中新增字段：**
```tsx
planModeEnabled?: boolean  // Enable plan mode
```

IPC handler 将整个 request 透传给 `sendMessage(mainWindow, request)`，无需修改实现代码。

### 4.3 Agent 服务层（核心逻辑）

#### `src/main/services/agent/types.ts`

**在 `AgentRequest` interface 中新增字段：**
```tsx
export interface AgentRequest {
  // ...existing fields
  planModeEnabled?: boolean   // Enable plan mode (setPermissionMode('plan'))
}
```

#### `src/main/services/agent/send-message.ts`

这是 Plan Mode 的核心实现文件。

**解构 request 时新增 `planModeEnabled`：**
```tsx
const {
  spaceId, conversationId, message, resumeSessionId,
  images, aiBrowserEnabled, thinkingEnabled,
  planModeEnabled,  // 新增
  canvasContext
} = request
```

**日志中记录 plan mode 状态：**
```tsx
console.log(`[Agent] sendMessage: conv=${conversationId}...${planModeEnabled ? ', plan=ON' : ''}...`)
```

**在动态参数调整块中，调用 SDK 的 `setPermissionMode`（在 `setMaxThinkingTokens` 之后）：**
```tsx
// Set permission mode dynamically (plan mode toggle)
if (v2Session.setPermissionMode) {
  await v2Session.setPermissionMode(planModeEnabled ? 'plan' : 'acceptEdits')
  console.log(`[Agent][${conversationId}] Permission mode: ${planModeEnabled ? 'plan' : 'acceptEdits'}`)
}
```

关键设计点：
- `setPermissionMode` 是 SDK 通过 patch 暴露的动态方法，可能不存在，所以用 `if` 守卫
- Plan Mode 开启时设为 `'plan'`，关闭时设为 `'acceptEdits'`（默认的正常执行模式）
- 这个调用和 `setMaxThinkingTokens` 一样，是每次发消息时动态设置的，不需要重建 session

### 4.4 i18n 国际化

#### `src/renderer/i18n/locales/zh-CN.json`

新增 4 个翻译 key：

```json
"Disable Plan Mode": "禁用规划模式",
"Enable Plan Mode": "启用规划模式",
"Plan Mode": "规划模式",
"Send (Plan Mode)": "发送(规划模式)"
```

## 5. UI 设计

输入框底部工具栏布局：

```
[⚛ 深度思考] [☑ 规划模式]                    [发送]
```

- 图标：`ListChecks`（来自 lucide-react，表示清单/计划）
- 未激活：灰色文字 `text-muted-foreground/50` + 透明背景
- 激活：主题色背景 `bg-primary/10` + 主题色文字 `text-primary`
- 与 Deep Thinking 按钮样式完全一致
- 生成中或 onboarding 时隐藏

## 6. SDK 层原理

`v2Session.setPermissionMode` 是 claude-agent-sdk 通过 patch 暴露的方法，支持以下模式：

| 模式 | 说明 |
|------|------|
| `'default'` | 默认模式，需要用户确认危险操作 |
| `'acceptEdits'` | 自动接受编辑操作（本项目的正常模式） |
| `'plan'` | 规划模式，Agent 只输出计划，不执行写操作 |
| `'bypassPermissions'` | 跳过所有权限检查（危险，未使用） |

类型定义在 `src/main/services/agent/types.ts` 的 `V2SDKSession` 中：

```tsx
export type V2SDKSession = {
  // ...other methods
  setPermissionMode?: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => Promise<void>
}
```

## 7. 验证方式

1. 启动 dev 模式 (`npm run dev`)
2. 在聊天界面确认 Plan Mode 按钮显示正常（Deep Thinking 按钮右侧）
3. 点击切换，确认视觉状态变化（灰色 ↔ 主题色）
4. 开启 Plan Mode 发送消息，确认：
   - 日志显示 `plan=ON` 和 `Permission mode: plan`
   - Agent 只输出计划方案，不执行文件写入或命令
5. 关闭 Plan Mode 发送消息，确认：
   - 日志显示 `Permission mode: acceptEdits`
   - Agent 正常执行操作
6. 同时开启 Plan Mode + Deep Thinking，确认两者不冲突

实际验证日志（2026-04-13）：

```
[Agent] sendMessage: conv=f5e6523b..., plan=ON
[Agent][f5e6523b...] Permission mode: plan

[Agent] sendMessage: conv=f064ebb8...
[Agent][f064ebb8...] Permission mode: acceptEdits

[Agent] sendMessage: conv=9a79cf21..., plan=ON
[Agent][9a79cf21...] Permission mode: plan
```
