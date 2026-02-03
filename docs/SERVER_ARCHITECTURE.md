# Project4 服务端架构全面分析

## 一、架构概览

Project4 是一个基于 Electron 的桌面应用，集成了 Claude AI Agent SDK，提供本地 AI 助手功能。

### 核心技术栈
- **运行时**: Electron + Node.js
- **AI 引擎**: Claude Agent SDK (V2 Session)
- **通信**: IPC (本地) + HTTP/WebSocket (远程)
- **协议转换**: OpenAI 兼容路由器
- **远程访问**: Cloudflare Tunnel + HTTP Server

---

## 二、服务端组件架构

### 2.1 核心服务层 (`src/main/services/`)

```
services/
├── agent/                    # AI Agent 核心
│   ├── send-message.ts      # 消息发送核心逻辑
│   ├── session-manager.ts   # V2 Session 生命周期管理
│   ├── permission-handler.ts # 工具权限处理
│   ├── mcp-manager.ts       # MCP 服务器状态管理
│   ├── message-utils.ts     # 消息解析和构建
│   ├── helpers.ts           # 辅助函数
│   ├── control.ts           # 生成控制 (停止、状态)
│   └── types.ts             # 类型定义
├── conversation.service.ts  # 对话管理
├── space.service.ts         # 工作空间管理
├── config.service.ts        # 配置管理
├── ai-sources/              # AI 源管理
├── ai-browser/              # AI 浏览器工具
├── remote.service.ts        # 远程访问协调
└── tunnel.service.ts        # Cloudflare 隧道
```

### 2.2 HTTP 服务层 (`src/main/http/`)

```
http/
├── server.ts                # Express HTTP 服务器
├── websocket.ts             # WebSocket 实时通信
├── auth.ts                  # 认证和令牌管理
└── routes/
    └── index.ts             # REST API 路由
```

### 2.3 协议转换层 (`src/main/openai-compat-router/`)

```
openai-compat-router/
├── server/                  # 路由服务器
├── converters/              # 请求/响应转换
├── stream/                  # SSE 流处理
├── types/                   # 类型定义
└── utils/                   # 工具函数
```

---

## 三、关键服务详解

### 3.1 Agent Service (AI 核心)

**职责**: 管理 AI 对话、消息流、工具调用和权限

#### V2 Session 管理 (进程复用)

```typescript
// 问题: 每次消息都启动新进程 (冷启动 3-5s)
// 解决: V2 Session 保持进程活跃，复用上下文

const v2Sessions = new Map<string, V2SessionInfo>()
// 每个对话一个持久 Session
// 30 分钟无活动自动清理
```

#### 多会话支持

```typescript
activeSessions: Map<conversationId, SessionState>
// 追踪当前进行中的请求
// 支持并发多个对话
// 每个会话有独立的 AbortController
```

#### 动态参数调整

```typescript
// 运行时可调整 (不需要重启进程):
- Model 切换
- Thinking tokens 开关
- Permission mode 变更

// 需要重建的 (进程级参数):
- API Key/URL 变更
- AI Browser 启用/禁用
- Skills 变更
- MCP 服务器变更
```

### 3.2 Conversation Service (对话管理)

**职责**: 对话持久化、索引管理、消息存储

#### 性能优化策略

```typescript
// 1. Index 文件 (快速列表)
index.json
├─ version: 1
├─ conversations: [
│   { id, title, messageCount, preview, updatedAt }
│ ]
└─ updatedAt

// 2. 单个对话文件 (完整数据)
{conversationId}.json
├─ messages: [...]
├─ thoughts: [...]
├─ tokenUsage: {...}
└─ sessionId: "..."

// 3. 缓存策略
- 首次访问: 全扫描 + 异步重建索引
- 后续访问: 使用索引 (O(1) 查询)
- 修改时: 增量更新索引
```

### 3.3 HTTP Server (远程访问)

**职责**: 提供 REST API + WebSocket 实时通信

#### API 路由

```typescript
// 认证
POST /api/remote/login          # 验证令牌
GET  /api/remote/status         # 服务器状态

// Agent 操作
POST /api/agent/message         # 发送消息
POST /api/agent/stop            # 停止生成
POST /api/agent/approve         # 批准工具
POST /api/agent/reject          # 拒绝工具

// 空间和对话
GET  /api/spaces                # 获取空间列表
GET  /api/spaces/:id/conversations  # 获取对话列表
POST /api/spaces/:id/conversations  # 创建对话
DELETE /api/spaces/:id/conversations/:cid  # 删除对话

// WebSocket
/ws                             # 实时事件流
```

#### 认证机制

```typescript
// 令牌生成
generateAccessToken()
  └─ 32 字符随机字符串

// 验证
validateToken(token)
  ├─ 检查长度和格式
  └─ 对比存储的令牌

// 自定义密码
setCustomAccessToken(password)
  └─ 4-32 字母数字字符
```

### 3.4 OpenAI 兼容路由器

**职责**: 协议转换 (Anthropic ↔ OpenAI)

#### 为什么需要?

```
问题: 用户想用 OpenAI API 密钥
  ↓
解决: 本地路由器转换协议
  ├─ OpenAI Chat Completions API
  ├─ OpenAI Responses API
  └─ 转换为 Anthropic Messages API

优势:
  ✓ 支持多个 AI 提供商
  ✓ 用户可用现有 OpenAI 密钥
  ✓ 无需修改 Claude Code CLI
```

#### 转换流程

```
OpenAI 请求
  ↓
[解析 API 类型]
  ├─ /chat/completions → chat_completions
  └─ /responses → responses
  ↓
[转换请求]
  ├─ 转换消息格式
  ├─ 转换工具定义
  └─ 转换参数
  ↓
Anthropic API
  ↓
[转换响应]
  ├─ 转换消息格式
  ├─ 转换工具调用
  └─ 转换流事件
  ↓
OpenAI 响应
```

### 3.5 Remote Service (远程访问协调)

**职责**: 统一管理 HTTP Server + Tunnel

```typescript
interface RemoteAccessStatus {
  enabled: boolean
  server: {
    running: boolean
    port: number
    token: string | null
    localUrl: string | null      // http://192.168.1.x:3847
    lanUrl: string | null        // 局域网 URL
  }
  tunnel: {
    status: 'stopped' | 'starting' | 'running' | 'error'
    url: string | null           // https://xxx.trycloudflare.com
    error: string | null
  }
  clients: number
}
```

### 3.6 Tunnel Service (Cloudflare 隧道)

**职责**: 外网访问

```typescript
// Quick Tunnel (无需账户)
startTunnel(localPort)
  ├─ 启动 cloudflared 进程
  ├─ 监听 stderr 获取 URL
  └─ 返回 https://xxx.trycloudflare.com

// 特点:
✓ 无需 Cloudflare 账户
✓ 自动生成 URL
✓ HTTP/2 协议
✓ 30 分钟自动过期
```

---

## 四、上下文管理机制

### 4.1 对话历史存储

```
~/.project4/
├─ spaces/
│  └─ {spaceId}/
│     └─ .project4/
│        └─ conversations/
│           ├─ index.json              # 快速索引
│           ├─ {conversationId}.json   # 完整对话
│           └─ ...
└─ temp/
   └─ conversations/
      └─ ...
```

### 4.2 Session 恢复机制

```typescript
// 1. 保存 Session ID
saveSessionId(spaceId, conversationId, sessionId)
  └─ 存储在对话文件中

// 2. 恢复对话
getConversation(spaceId, conversationId)
  ├─ 加载对话文件
  ├─ 获取 sessionId
  └─ 返回给 Agent

// 3. Claude Code CLI 恢复
unstable_v2_createSession({
  resume: sessionId  // 从磁盘恢复历史
})
  └─ CC 自动加载历史消息
```

### 4.3 多会话并发

```typescript
// 并发处理多个对话
activeSessions: Map<conversationId, SessionState>

// 每个会话独立:
├─ AbortController (停止控制)
├─ Thoughts 累积 (推理过程)
├─ Permission 处理 (工具批准)
└─ Token 统计 (成本追踪)

// 示例:
用户在对话 A 中输入消息
  ↓ (同时)
用户在对话 B 中输入消息
  ↓
两个 V2 Session 并行运行
  ├─ 各自独立的 Claude Code 进程
  ├─ 各自的消息流
  └─ 各自的工具权限处理
```

---

## 五、完整消息流程

```
1. 用户发送消息
   ↓
2. Renderer/Remote Client
   POST /api/agent/message
   ↓
3. Agent Controller
   验证参数 → agentSendMessage()
   ↓
4. Agent Service
   ├─ 获取 API 凭证
   ├─ 路由决策 (Anthropic/OpenAI)
   ├─ 获取或创建 V2 Session
   ├─ 构建消息内容
   └─ 发送到 V2 Session
   ↓
5. Claude Code CLI (子进程)
   ├─ 恢复对话历史
   ├─ 加载 MCP 服务器
   ├─ 生成响应
   └─ 流式输出
   ↓
6. 流式处理 (Token 级)
   ├─ stream_event (token 级更新)
   ├─ assistant (完整块)
   ├─ user (工具结果)
   ├─ system (初始化/MCP 状态)
   └─ result (最终结果)
   ↓
7. 消息解析和转发
   ├─ 转换为 Thought 对象
   ├─ 累积到 sessionState.thoughts
   └─ 发送到 Renderer/Remote
   ↓
8. 工具权限处理 (如需)
   ├─ 检查权限设置
   ├─ 发送权限请求
   └─ 等待用户批准
   ↓
9. 保存到对话历史
   ├─ 更新消息内容
   ├─ 保存 thoughts
   ├─ 保存 tokenUsage
   └─ 更新索引
   ↓
10. 完成事件
    ├─ 发送到 Renderer (IPC)
    └─ 发送到 Remote (WebSocket)
```

---

## 六、缺失的能力和改进建议

### 6.1 当前缺失的功能

| 功能 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **对话搜索** | 部分 | 高 | 只有基础搜索，无全文索引 |
| **对话导出** | 无 | 中 | 无法导出为 Markdown/PDF |
| **批量操作** | 无 | 中 | 无法批量删除/导出对话 |
| **对话分享** | 无 | 低 | 无法生成分享链接 |
| **版本控制** | 无 | 低 | 无对话版本历史 |
| **离线模式** | 无 | 中 | 必须连接 API |
| **本地模型** | 无 | 低 | 不支持本地 LLM |
| **插件系统** | 部分 | 中 | 有 Skills，但无动态加载 |
| **性能监控** | 部分 | 低 | 有基础监控，无详细分析 |
| **错误恢复** | 部分 | 高 | 网络错误时无自动重试 |

### 6.2 高优先级改进建议

#### 1. 对话搜索优化

**当前问题**: 线性扫描所有对话，性能差

**改进方案**:
```typescript
interface ConversationIndex {
  version: number
  conversations: ConversationMeta[]

  // 新增: 全文索引
  fullTextIndex: {
    [keyword: string]: string[]  // conversationIds
  }

  // 新增: 标签索引
  tags: {
    [tag: string]: string[]
  }
}

// 搜索性能: O(n) → O(1)
```

#### 2. 错误恢复和重试

**当前问题**: 网络错误直接失败，用户体验差

**改进方案**:
```typescript
interface RetryPolicy {
  maxRetries: number
  backoffMs: number
  backoffMultiplier: number
  retryableErrors: string[]
}

// 智能重试:
// 1. 第一次失败 → 等待 1s 重试
// 2. 第二次失败 → 等待 2s 重试
// 3. 第三次失败 → 等待 4s 重试
// 4. 全部失败 → 返回错误
```

#### 3. 对话导出功能

**当前问题**: 无法导出对话，不便于分享和备份

**改进方案**:
```typescript
export async function exportConversation(
  spaceId: string,
  conversationId: string,
  format: 'markdown' | 'pdf' | 'json'
): Promise<Buffer>

// 支持:
// - Markdown: 保留格式，包含思考过程
// - PDF: 美化排版，包含图片
// - JSON: 完整数据，用于备份
```

#### 4. 增量同步机制

**当前问题**: 远程客户端每次都拉取完整对话

**改进方案**:
```typescript
interface SyncState {
  lastSyncTime: number
  changedConversations: Set<string>
  deletedConversations: Set<string>
}

// 远程客户端只接收变更
// 减少网络传输 50-80%
```

#### 5. 性能监控增强

**当前问题**: 缺少详细的性能分析

**改进方案**:
```typescript
interface PerformanceMetrics {
  // 消息处理
  messageLatency: {
    firstToken: number      // 首个 token 延迟
    totalTime: number       // 总耗时
    tokensPerSecond: number // 生成速度
  }

  // 资源使用
  resources: {
    memoryUsage: number     // MB
    cpuUsage: number        // %
    processCount: number    // 子进程数
  }

  // 网络
  network: {
    requestCount: number
    totalBytes: number
    averageLatency: number
  }

  // 缓存
  cache: {
    hitRate: number         // %
    evictionCount: number
  }
}
```

### 6.3 中优先级改进建议

#### 6. 批量操作支持

```typescript
// 批量删除
POST /api/spaces/:id/conversations/batch-delete
{
  conversationIds: string[]
}

// 批量导出
POST /api/spaces/:id/conversations/batch-export
{
  conversationIds: string[],
  format: 'markdown' | 'pdf' | 'json'
}
```

#### 7. 对话标签系统

```typescript
interface Conversation {
  // ... 现有字段
  tags: string[]
  category: string
  starred: boolean
}

// 支持:
// - 按标签筛选
// - 按分类浏览
// - 收藏对话
```

#### 8. 多 AI 提供商增强

```typescript
interface AIProviderConfig {
  name: string
  type: 'anthropic' | 'openai' | 'custom'
  endpoint: string
  models: ModelConfig[]
  features: FeatureFlags
  rateLimit: RateLimitConfig
}

// 允许用户添加自定义提供商
```

---

## 七、架构优势

### 7.1 已实现的优秀设计

1. **V2 Session 进程复用**
   - 避免每次消息都冷启动 (3-5s)
   - 保持上下文，提升响应速度

2. **模块化架构**
   - Agent 模块独立，易于维护
   - 服务层清晰分离

3. **多会话并发**
   - 支持同时多个对话
   - 独立的 AbortController

4. **协议转换层**
   - 支持多个 AI 提供商
   - 无需修改核心代码

5. **远程访问**
   - HTTP + WebSocket 双通道
   - Cloudflare Tunnel 外网访问

### 7.2 性能优化

1. **索引机制**
   - 快速列表加载
   - 按需加载完整对话

2. **流式处理**
   - Token 级实时更新
   - 降低首字延迟

3. **会话清理**
   - 30 分钟自动清理
   - 避免内存泄漏

---

## 八、总结

Project4 的服务端架构设计合理，核心功能完善。主要优势在于：

✅ **V2 Session 管理** - 进程复用，性能优秀
✅ **多会话支持** - 并发处理，用户体验好
✅ **协议转换** - 支持多提供商，灵活性高
✅ **远程访问** - 本地 + 远程双模式

主要改进方向：

🔧 **搜索优化** - 全文索引，提升搜索性能
🔧 **错误恢复** - 智能重试，提升稳定性
🔧 **导出功能** - 支持多格式导出
🔧 **性能监控** - 详细的性能分析
🔧 **批量操作** - 提升操作效率

总体来说，这是一个设计良好、功能完善的 AI 助手应用架构。
