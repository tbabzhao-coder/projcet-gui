# Plan Mode 功能实现说明

## 概述

本次更新实现了完整的 Plan Mode（规划模式）功能，允许 AI 在执行任务前先生成实施计划，用户可以审批、修改或拒绝计划。

**Commit ID**: `494d752`
**提交时间**: 2026-04-16
**主要功能**: Plan Mode + 通知渠道基础设施

---

## 一、Plan Mode 核心功能

### 1.1 功能描述

Plan Mode 是一个新的交互模式，让 AI 在执行复杂任务前先生成详细的实施计划，用户可以：
- 查看完整的计划内容（Markdown 格式）
- 批准计划并开始执行
- 提供反馈修改计划
- 直接拒绝计划

### 1.2 用户流程

1. 用户在输入框旁点击"规划模式"按钮启用 Plan Mode
2. 发送需要规划的消息（如"重构项目结构"）
3. AI 生成计划并写入文件 `~/.project4-dev/claude-config/plans/*.md`
4. SDK 调用 `ExitPlanMode` tool，后端拦截并读取 plan 文件
5. 前端显示 `PlanApprovalCard` 组件，展示完整计划内容
6. 用户选择操作：
   - **批准执行**: AI 开始按计划执行
   - **修改方案**: 计划内容作为 assistant 消息显示，用户在下方输入修改意见
   - **拒绝**: 停止当前 turn，保持 plan mode

### 1.3 技术实现

#### 前端修改

**文件**: `src/renderer/components/chat/InputArea.tsx`
- 新增 `planModeEnabled` 状态
- 添加 Plan Mode 切换按钮（ListChecks 图标）
- 将 `planModeEnabled` 传递给 `onSend` 回调

**文件**: `src/renderer/components/tool/PlanApprovalCard.tsx` (新增)
- 显示 plan 内容（Markdown 渲染）
- 三个操作按钮：
  - `handleApprove`: 调用 `approveTool`
  - `handleGiveFeedback`: 调用 `rejectTool` 并传入 plan 内容
  - `handleReject`: 调用 `rejectTool` 并发送 `[INTERRUPT]` 信号

**文件**: `src/renderer/stores/chat.store.ts`
- `SessionState` 新增 `planModeEnabled` 和 `planFeedbackContent` 字段
- `sendMessage`: 传递 `planModeEnabled` 参数到后端
- `handleAgentToolCall`: 只拦截 `requiresApproval: true` 的 ExitPlanMode 事件（修复了之前拦截 streaming 事件导致 plan 内容丢失的问题）
- `rejectTool`: 支持 `planContent` 参数，存储到 `planFeedbackContent`
- `handleAgentComplete`: 从后端重新加载对话后，如果有 `planFeedbackContent`，将其作为临时 assistant 消息注入到对话中

**文件**: `src/renderer/components/tool/ToolCard.tsx`
- 为 `ExitPlanMode` 工具添加特殊渲染逻辑
- 当 `toolCall.name === 'ExitPlanMode'` 且 `status === 'waiting_approval'` 时，渲染 `PlanApprovalCard`

#### 后端修改

**文件**: `src/main/services/agent/permission-handler.ts`
- **核心修复**: 修改 plan 文件搜索路径，使用 `getClaudeConfigDir()` 直接获取正确路径
- 之前的 `path.join(path.dirname(absoluteWorkDir), '.project4-dev', 'claude-config', 'plans')` 路径拼接错误
- 新逻辑：
  ```typescript
  const plansDir = path.join(getClaudeConfigDir(), 'plans')
  ```
- 读取最新的 `.md` 文件（按 mtime 排序）
- 将 plan 内容放入 `description` 字段，通过 `askApproval` 发送到前端
- 支持 `rejectMessage` 参数，包含 `[INTERRUPT]` 标记时会中断当前 turn

**文件**: `src/main/services/agent/send-message.ts`
- 接收 `planModeEnabled` 参数
- 调用 SDK 的 `setPermissionMode(planModeEnabled ? 'plan' : 'acceptEdits')`
- 将 `planModeEnabled` 存储到 `sessionState`

**文件**: `src/main/services/agent/types.ts`
- `AgentRequest` 新增 `planModeEnabled?: boolean`
- `SessionState` 新增 `planModeEnabled?: boolean`

**文件**: `src/main/ipc/agent.ts`
- `agent:send-message` handler 接收 `planModeEnabled` 参数
- `agent:reject-tool` handler 接收 `rejectMessage` 参数

#### IPC 层修改

**文件**: `src/preload/index.ts`
- `sendMessage` 接口新增 `planModeEnabled?: boolean`
- `rejectTool` 接口新增 `rejectMessage?: string` 参数

**文件**: `src/renderer/api/index.ts`
- 同步更新 API 接口定义

#### 国际化

**文件**: `src/renderer/i18n/locales/zh-CN.json`
- 新增翻译：
  - "Plan Mode": "规划模式"
  - "Enable Plan Mode": "启用规划模式"
  - "Disable Plan Mode": "禁用规划模式"
  - "Send (Plan Mode)": "发送(规划模式)"
  - "Approve": "批准执行"
  - "Give Feedback": "修改方案"
  - "Please describe what you want to change in the plan above, then send your message.": "请在下方输入你想修改的内容，然后发送消息。"
  - "AI has completed planning. Approve to start execution, or reject to stay in plan mode.": "AI 已完成规划。批准后开始执行，拒绝则保持规划模式。"

---

## 二、通知渠道基础设施（附带功能）

### 2.1 功能描述

实现了外部通知渠道系统，支持通过邮件、企业微信、钉钉、飞书、Webhook 发送通知。

### 2.2 支持的渠道

1. **Email (SMTP)**: 使用 nodemailer，支持 QQ 邮箱、163、Gmail 等
2. **企业微信 (WeCom)**: 企业微信群机器人 Webhook
3. **钉钉 (DingTalk)**: 钉钉群机器人 Webhook
4. **飞书 (Feishu)**: 飞书群机器人 Webhook
5. **自定义 Webhook**: 通用 HTTP POST 接口

### 2.3 新增文件

**后端服务**:
- `src/main/services/notification.service.ts`: 通知服务主入口
- `src/main/services/notify-channels/index.ts`: 渠道管理器
- `src/main/services/notify-channels/email.ts`: 邮件渠道
- `src/main/services/notify-channels/wecom.ts`: 企业微信渠道
- `src/main/services/notify-channels/dingtalk.ts`: 钉钉渠道
- `src/main/services/notify-channels/feishu.ts`: 飞书渠道
- `src/main/services/notify-channels/webhook.ts`: 自定义 Webhook
- `src/main/services/notify-channels/token-manager.ts`: Token 缓存管理
- `src/main/services/proxy-fetch.ts`: 代理感知的 fetch 封装
- `src/main/ipc/notification-channels.ts`: IPC 处理器

**前端组件**:
- `src/renderer/components/settings/NotificationChannelsSection.tsx`: 设置页面 UI
- `src/renderer/components/notification/NotificationToast.tsx`: 应用内 Toast 通知
- `src/renderer/stores/notification.store.ts`: 通知状态管理

**类型定义**:
- `src/shared/types/notification-channels.ts`: 通知渠道类型定义

### 2.4 依赖包

**新增依赖**:
```json
{
  "nodemailer": "^8.0.5",
  "proxy-agent": "^8.0.1"
}
```

**新增 devDependencies**:
```json
{
  "@types/nodemailer": "^8.0.0"
}
```

---

## 三、其他改进

### 3.1 UI 组件优化

**文件**: `src/renderer/components/ui/ConfirmDialog.tsx` (新增)
- 通用确认对话框组件
- 支持 danger/warning/default 三种样式

**文件**: `src/renderer/components/ui/ContextMenu.tsx` (新增)
- 通用右键菜单组件
- 支持图标、分隔线、隐藏项

**文件**: `src/renderer/hooks/useConfirmDialog.tsx` (新增)
- 确认对话框 Hook，提供 Promise-based API

**文件**: `src/renderer/components/chat/ConversationList.tsx`
- 重构右键菜单，使用新的 `ContextMenu` 组件
- 移除了内联的右键菜单实现

**文件**: `src/renderer/pages/SettingsPage.tsx`
- 删除配置时使用 `useConfirmDialog` 替代 `window.confirm`

### 3.2 Bug 修复

**文件**: `src/main/index.ts`
- 修复 EPIPE 错误导致的无限循环
- 移除了 `console.warn` 调用（因为 console 被 electron-log 替换，写入 stdout 会触发新的 EPIPE）

**文件**: `src/main/services/lark-cli.service.ts`
- 改进 `auth status` 判断逻辑
- 区分 bot-only 和 user+bot 两种登录状态
- 当只有 bot 登录时，提示用户完成扫码授权

### 3.3 网络配置优化

**文件**: `src/main/services/agent/sdk-config.ts`
- `NO_PROXY` 环境变量新增飞书/Lark 域名：
  ```
  *.feishu.cn,*.larksuite.com,*.larkoffice.com
  ```
- 新增 `LARK_CLI_NO_PROXY=1` 环境变量，告诉 lark-cli 跳过代理检测

**文件**: `src/main/services/agent/mcp-manager.ts`
- 同步更新 MCP 测试连接时的 `NO_PROXY` 配置

### 3.4 OpenAI 兼容路由器增强

**文件**: `src/main/openai-compat-router/interceptors/` (新增目录)
- `index.ts`: 拦截器管道
- `types.ts`: 拦截器类型定义
- `warmup.ts`: 会话预热拦截器
- `preflight.ts`: 预检请求拦截器
- `image-budget.ts`: 图片预算管理拦截器

**文件**: `src/main/openai-compat-router/server/request-handler.ts`
- 集成拦截器管道，在请求转发前执行

---

## 四、文件清单

### 4.1 Plan Mode 核心文件（本次修复重点）

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/main/services/agent/permission-handler.ts` | 修改 | **核心修复**: 修正 plan 文件搜索路径 |
| `src/renderer/stores/chat.store.ts` | 修改 | **核心修复**: 修正事件拦截逻辑，实现 plan 内容注入 |
| `src/renderer/components/tool/PlanApprovalCard.tsx` | 新增 | Plan 审批卡片 UI |
| `src/renderer/components/chat/InputArea.tsx` | 修改 | 添加 Plan Mode 切换按钮 |
| `src/renderer/components/tool/ToolCard.tsx` | 修改 | 集成 PlanApprovalCard |
| `src/main/services/agent/send-message.ts` | 修改 | 传递 planModeEnabled 到 SDK |
| `src/main/services/agent/types.ts` | 修改 | 新增 planModeEnabled 类型 |
| `src/main/ipc/agent.ts` | 修改 | 支持 rejectMessage 参数 |
| `src/preload/index.ts` | 修改 | 更新 IPC 接口 |
| `src/renderer/api/index.ts` | 修改 | 更新 API 接口 |
| `src/renderer/i18n/locales/zh-CN.json` | 修改 | 新增翻译 |

### 4.2 通知渠道文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/main/services/notification.service.ts` | 新增 | 通知服务主入口 |
| `src/main/services/notify-channels/*.ts` | 新增 | 各渠道实现 |
| `src/main/services/proxy-fetch.ts` | 新增 | 代理感知 fetch |
| `src/main/ipc/notification-channels.ts` | 新增 | IPC 处理器 |
| `src/renderer/components/settings/NotificationChannelsSection.tsx` | 新增 | 设置 UI |
| `src/renderer/components/notification/NotificationToast.tsx` | 新增 | Toast 组件 |
| `src/renderer/stores/notification.store.ts` | 新增 | 状态管理 |
| `src/shared/types/notification-channels.ts` | 新增 | 类型定义 |

### 4.3 UI 组件文件

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/renderer/components/ui/ConfirmDialog.tsx` | 新增 | 确认对话框 |
| `src/renderer/components/ui/ContextMenu.tsx` | 新增 | 右键菜单 |
| `src/renderer/hooks/useConfirmDialog.tsx` | 新增 | 对话框 Hook |
| `src/renderer/components/chat/ConversationList.tsx` | 修改 | 使用 ContextMenu |

### 4.4 其他修改

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/main/index.ts` | 修改 | 修复 EPIPE 无限循环 |
| `src/main/services/lark-cli.service.ts` | 修改 | 改进 auth status 判断 |
| `src/main/services/agent/sdk-config.ts` | 修改 | NO_PROXY 配置 |
| `src/main/openai-compat-router/interceptors/*.ts` | 新增 | 拦截器实现 |
| `package.json` | 修改 | 新增依赖 |

---

## 五、测试步骤

### 5.1 Plan Mode 功能测试

1. 启动应用 `npm run dev`
2. 打开一个对话
3. 点击输入框旁的"规划模式"按钮（ListChecks 图标），确认按钮高亮
4. 发送消息："帮我重构这个项目的目录结构"
5. 等待 AI 生成 plan，应该弹出 `PlanApprovalCard` 显示完整 plan 内容
6. 测试三个按钮：
   - **批准执行**: AI 开始执行，plan 消失
   - **修改方案**: plan 内容作为 assistant 消息显示在对话中，可以在下方输入反馈
   - **拒绝**: plan 消失，对话停止

### 5.2 通知渠道测试

1. 进入设置页面 → 通知渠道
2. 配置任意渠道（如邮件）
3. 点击"测试连接"按钮
4. 确认收到测试通知

### 5.3 回归测试

- 普通对话（非 plan mode）功能正常
- 对话列表右键菜单正常
- 设置页面删除配置时弹出确认对话框

---

## 六、已知问题与限制

1. **Plan 文件持久化**: 当前 plan 内容通过临时 assistant 消息显示，用户刷新页面后会丢失。如需持久化，需要后端支持保存这条消息到数据库。

2. **Plan Mode 状态**: Plan Mode 是 per-message 的，每次发送消息时需要重新启用。如需全局启用，需要在 Space 或 Conversation 级别存储状态。

3. **通知渠道**: 当前仅实现了基础设施，实际的通知触发逻辑（如任务完成通知）需要在业务代码中集成。

---

## 七、后续优化建议

1. **Plan 内容持久化**: 将"修改方案"后的 plan 消息保存到数据库
2. **Plan Mode 全局开关**: 在 Space 设置中添加"默认启用 Plan Mode"选项
3. **Plan 历史记录**: 在 UI 中显示历史 plan 版本，支持对比和回滚
4. **通知集成**: 在任务完成、错误发生时自动发送通知
5. **Plan 模板**: 支持用户自定义 plan 模板和格式

---

## 八、联系方式

如有问题，请联系：
- 开发者: Claude Opus 4.6
- Commit: 494d752
- 日期: 2026-04-16
