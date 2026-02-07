# 一次发送为何可能产生多次模型请求

## 现象

配置 Claude 类型 SDK 后，用户「发送一次」对话，在 API 侧可能看到**多条**模型请求（例如 3 条）。

## 可能来源

### 1. 会话预热（ensureSessionWarm）

- **触发时机**：用户**选中某条对话**时（`selectConversation`），前端会调用 `api.ensureSessionWarm(spaceId, conversationId)`，在后台创建或复用 V2 Session。
- **是否产生请求**：取决于 Claude Agent SDK / Claude Code 子进程在 **Session 创建**时是否向 API 发起请求（例如初始化、MCP 探测等）。若 SDK 在 `unstable_v2_createSession` 或子进程启动时有此类逻辑，这里会对应 **1 次**请求。

### 2. 用户发送消息（sendMessage）

- **触发时机**：用户点击发送，前端只调用**一次** `api.sendMessage(...)`，主进程里也只会**一次** `getOrCreateV2Session` + `v2Session.send(message)`。
- **为何仍可能有多条请求**：  
  `v2Session.send(message)` 会由 **Claude Code 子进程**与 API 通信。在一次「发送」中，子进程可能按 agent 流程发起**多次** API 调用，例如：
  - 与 MCP 相关的探测或初始化；
  - 主轮对话（含 thinking 时可能拆成多次调用）；
  - 工具调用或后续轮次。  

  因此，**1 次用户发送**在 API 侧可能对应 **2～3 次**模型请求，属于 SDK/Claude Code 的预期行为。

### 3. 其他入口（通常不会在「发一条消息」时触发）

- **设置页**：打开设置页会调用 `refreshAISourcesConfig()`，对 Custom API 不会发模型请求，仅刷新配置。
- **MCP 测试**：仅在用户点击「测试 MCP 连接」时调用 `testMcpConnections()`，会发 1 次 `claudeQuery('hi')`，与正常发消息无关。
- **连接验证**：仅在用户主动「验证连接」时调用 `validateApiConnection`，会发 1 次验证请求。

## 如何确认每条请求来自哪里

1. **看时间顺序**：  
   若 3 条请求时间接近「选中对话」和「点击发送」，则可能包含：1 条来自会话预热（若有），2 条来自同一次 `send` 的 agent 流程。
2. **看请求体**：  
   在 API 网关或服务端日志中查看 `message` 内容或 `metadata`：  
   - 验证/探测类（如短句 "Hi"、空或系统消息）→ 可能来自预热或 MCP 测试；  
   - 包含用户输入内容的 → 来自本次 `sendMessage` 的 agent 多轮/多步调用。

## 如需减少请求次数

- **会话预热**：若确认 SDK 在 Session 创建时会发请求，可考虑改为「仅在用户首次在该对话中输入或点击发送前」再调用 `ensureSessionWarm`，避免在仅切换对话时就产生 1 次请求。代价是首次发送可能略慢。
- **agent 多轮/thinking**：一次发送对应的多轮模型调用由 Claude Code/SDK 的 agent 逻辑决定，应用层无法合并为 1 次请求；若需省成本，可在模型侧或产品上限制 thinking 长度、工具调用次数等。

## 相关代码位置

| 行为           | 前端/入口              | 主进程                          |
|----------------|------------------------|---------------------------------|
| 选中对话预热   | `chat.store` selectConversation | `ensureSessionWarm` → session-manager `getOrCreateV2Session` |
| 发送一条消息   | `chat.store` sendMessage → `api.sendMessage` | `sendMessage` → `getOrCreateV2Session` + `v2Session.send()` |
| MCP 测试       | 设置页「测试 MCP 连接」 | `testMcpConnections` → mcp-manager `claudeQuery('hi')` |
| 验证连接       | 设置页验证 API         | `validateApiConnection`         |
