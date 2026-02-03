# Claude Agent SDK 未使用功能分析

## 📋 功能增强清单

基于 Claude Agent SDK 的完整 API 分析，项目当前只使用了约 30% 的 SDK 功能。以下是可以实现的功能增强。

---

## 🔥 高价值功能（强烈推荐）

### 1. 动态权限模式切换

**功能描述**:
用户可以在对话过程中临时切换权限模式，无需重启会话。

**使用场景**:
```
用户: "帮我重构这个文件"
Claude: "需要编辑文件，是否允许？"
用户: "允许，并且接下来的所有文件操作都自动允许"
→ 系统切换到 acceptEdits 模式
→ 后续文件操作不再询问
→ 任务完成后，用户可以切回 default 模式
```

**价值分析**:
- ✅ **用户体验提升**: 避免频繁点击"允许"按钮
- ✅ **灵活性**: 临时提升权限，完成后恢复
- ✅ **无需重启**: 不会中断对话流程
- ✅ **实现简单**: SDK 已提供 `setPermissionMode()` API

**实现工作量**: 1-2天
- 后端: 添加 IPC handler
- 前端: 添加权限模式切换按钮
- UI: 在设置或对话界面显示当前权限模式

**技术实现**:
```typescript
// SDK API
interface Query {
  setPermissionMode(mode: PermissionMode): Promise<void>
}

type PermissionMode =
  | 'default'           // 标准行为，危险操作提示
  | 'acceptEdits'       // 自动接受文件编辑
  | 'bypassPermissions' // 绕过所有权限检查
  | 'plan'              // 计划模式，不执行工具
  | 'dontAsk'           // 不提示，未预批准则拒绝
```

---

### 2. 技能列表展示

**功能描述**:
在 UI 中显示当前可用的所有技能（Skills），用户可以点击快速插入命令。

**使用场景**:
```
用户打开"技能面板"，看到:
- /commit - 创建 Git 提交
- /review-pr - 审查 Pull Request
- /pdf - PDF 文档处理
- /docx - Word 文档处理
- /xlsx - Excel 表格处理

用户点击 /commit，自动在输入框插入 "/commit "
```

**价值分析**:
- ✅ **可发现性**: 用户知道有哪些技能可用
- ✅ **降低学习成本**: 不需要记住所有命令
- ✅ **提升效率**: 点击即可插入，无需手动输入
- ✅ **动态更新**: 技能变化时自动刷新列表
- ✅ **实现简单**: SDK 提供 `supportedCommands()` API

**实现工作量**: 2-3天
- 后端: 添加获取技能列表的 API
- 前端: 创建技能面板组件
- UI: 设计技能卡片、搜索、分类

**UI 设计建议**:
```
┌─────────────────────────────┐
│ 可用技能 (8)          [搜索] │
├─────────────────────────────┤
│ 📝 /commit                  │
│    创建 Git 提交             │
│    [插入]                    │
├─────────────────────────────┤
│ 🔍 /review-pr               │
│    审查 Pull Request         │
│    [插入]                    │
├─────────────────────────────┤
│ 📄 /pdf                     │
│    PDF 文档处理              │
│    [插入]                    │
└─────────────────────────────┘
```

**技术实现**:
```typescript
// SDK API
interface Query {
  supportedCommands(): Promise<SlashCommand[]>
}

interface SlashCommand {
  name: string           // 技能名称（不含 /）
  description: string    // 功能描述
  argumentHint: string   // 参数提示（如 "<file>"）
}
```

---

### 3. 动态模型列表

**功能描述**:
从 SDK 动态获取可用模型列表，而不是硬编码。

**当前问题**:
```typescript
// 当前: 硬编码模型列表
const MODELS = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' }
]
// 问题: 新模型发布时需要手动更新代码
```

**改进后**:
```typescript
// 动态获取
const models = await api.getSupportedModels(conversationId)
// [
//   {
//     value: 'claude-opus-4-20250514',
//     displayName: 'Claude Opus 4',
//     description: 'Most capable model for complex tasks'
//   },
//   {
//     value: 'claude-sonnet-4-5-20250929',
//     displayName: 'Claude Sonnet 4.5',
//     description: 'Balanced performance and speed'
//   },
//   {
//     value: 'claude-haiku-4-20250514',  // 新模型自动出现
//     displayName: 'Claude Haiku 4',
//     description: 'Fast and cost-effective'
//   }
// ]
```

**价值分析**:
- ✅ **自动更新**: 新模型发布时自动显示
- ✅ **显示描述**: 帮助用户选择合适的模型
- ✅ **减少维护**: 无需手动更新代码
- ✅ **实现简单**: SDK 提供 `supportedModels()` API

**实现工作量**: 1天
- 后端: 添加获取模型列表的 API
- 前端: 修改模型选择器，使用动态数据

**技术实现**:
```typescript
// SDK API
interface Query {
  supportedModels(): Promise<ModelInfo[]>
}

interface ModelInfo {
  value: string         // 模型标识符
  displayName: string   // 显示名称
  description: string   // 功能描述
}
```

---

### 4. 文件回退功能（时光机）

**功能描述**:
启用文件检查点，允许用户回退文件到任意历史消息时的状态。

**使用场景**:
```
用户: "重构这个文件，使用更现代的语法"
Claude: [执行重构，修改了 50 行代码]
用户: "嗯，这个重构有点激进，回退到之前的版本"
→ 点击"回退到此版本"按钮
→ 文件自动恢复到重构前的状态
```

**价值分析**:
- ✅ **安全感**: 用户敢于尝试大胆的重构
- ✅ **实验性**: 可以尝试不同方案，不满意就回退
- ✅ **无需 Git**: 不需要手动 commit/revert
- ✅ **精确回退**: 可以回退到任意历史点
- ✅ **用户信心**: 知道可以随时撤销

**实现工作量**: 3-4天
- 后端: 启用 `enableFileCheckpointing` 选项
- 后端: 添加 `rewindFiles()` API
- 前端: 在消息历史中添加"回退"按钮
- UI: 显示文件变更预览

**UI 设计建议**:
```
┌─────────────────────────────────────┐
│ Claude (2分钟前)                     │
│ 我已经重构了 user.service.ts:       │
│ - 使用 async/await 替代 Promise      │
│ - 添加错误处理                       │
│ - 优化性能                           │
│                                     │
│ [查看变更] [回退到此版本] ⏪          │
└─────────────────────────────────────┘
```

**技术实现**:
```typescript
// SDK API
interface Options {
  enableFileCheckpointing?: boolean  // 启用文件检查点
}

interface Query {
  rewindFiles(userMessageId: string): Promise<void>
}

// 使用示例
const query = claudeQuery({
  prompt: 'Refactor this code',
  options: {
    enableFileCheckpointing: true  // 启用检查点
  }
})

// 回退到指定消息
await query.rewindFiles(previousMessageId)
```

---

### 5. 对话搜索优化（全文索引）

**功能描述**:
构建全文索引，支持快速搜索对话内容。

**当前问题**:
```typescript
// 当前: 线性扫描所有对话
function searchConversations(keyword: string) {
  const allConversations = loadAllConversations()  // 加载所有对话
  return allConversations.filter(conv =>
    conv.messages.some(msg => msg.content.includes(keyword))
  )
}
// 问题: 对话多时非常慢 (O(n))
```

**改进后**:
```typescript
// 构建倒排索引
interface ConversationIndex {
  version: number
  conversations: ConversationMeta[]

  // 全文索引
  fullTextIndex: {
    'react': ['conv-1', 'conv-5', 'conv-12'],
    'typescript': ['conv-1', 'conv-3', 'conv-8'],
    'bug': ['conv-2', 'conv-7']
  }

  // 标签索引
  tags: {
    'frontend': ['conv-1', 'conv-5'],
    'backend': ['conv-3', 'conv-8']
  }
}

// 搜索: O(1)
function searchConversations(keyword: string) {
  return index.fullTextIndex[keyword] || []
}
```

**价值分析**:
- ✅ **性能提升**: 搜索速度从 O(n) 提升到 O(1)
- ✅ **用户体验**: 即时搜索结果
- ✅ **支持高级搜索**: 可以支持多关键词、模糊搜索
- ✅ **可扩展**: 可以添加标签、分类等索引

**实现工作量**: 4-5天
- 后端: 构建倒排索引
- 后端: 增量更新索引
- 前端: 优化搜索 UI
- 性能: 测试大量对话的性能

---

## 💡 中等价值功能（值得考虑）

### 6. 对话导出功能

**功能描述**:
支持将对话导出为 Markdown、PDF、JSON 格式。

**使用场景**:
```
用户: "这次对话很有价值，我想保存下来"
→ 点击"导出对话"
→ 选择格式: Markdown / PDF / JSON
→ 下载文件

Markdown 格式:
# 对话: 如何优化 React 性能
**用户** (2025-02-03 10:30)
我的 React 应用很慢，怎么优化？

**Claude** (2025-02-03 10:31)
我来帮你分析性能瓶颈...
[思考过程]
- 检查组件渲染次数
- 分析 bundle 大小
...
```

**价值分析**:
- ✅ **知识沉淀**: 保存有价值的对话
- ✅ **分享**: 可以分享给团队成员
- ✅ **备份**: 防止数据丢失
- ✅ **文档化**: 可以作为项目文档

**实现工作量**: 3-4天
- 后端: 实现 Markdown/JSON 导出
- 后端: 实现 PDF 导出（需要 PDF 库）
- 前端: 添加导出按钮和格式选择
- UI: 导出进度提示

---

### 7. 批量操作

**功能描述**:
支持批量删除、导出对话。

**使用场景**:
```
用户选中多个对话:
☑ 对话 1: React 性能优化
☑ 对话 2: TypeScript 类型问题
☑ 对话 3: Git 工作流

操作:
[批量删除] [批量导出] [添加标签]
```

**价值分析**:
- ✅ **效率提升**: 一次操作多个对话
- ✅ **整理对话**: 快速清理无用对话
- ✅ **批量导出**: 导出多个相关对话

**实现工作量**: 2-3天
- 后端: 添加批量操作 API
- 前端: 添加多选功能
- UI: 批量操作工具栏

---

### 8. 对话标签和分类

**功能描述**:
为对话添加标签和分类，方便组织和查找。

**使用场景**:
```
对话: "React 性能优化"
标签: #react #performance #frontend
分类: 技术问题

筛选:
- 按标签: 显示所有 #react 对话
- 按分类: 显示所有"技术问题"对话
- 收藏: 显示收藏的对话
```

**价值分析**:
- ✅ **组织对话**: 更好地管理大量对话
- ✅ **快速查找**: 按标签筛选
- ✅ **知识管理**: 构建个人知识库

**实现工作量**: 4-5天
- 后端: 扩展对话数据结构
- 后端: 添加标签索引
- 前端: 标签编辑器
- UI: 标签筛选、分类浏览

---

### 9. 动态 MCP 服务器管理

**功能描述**:
运行时添加/删除 MCP 服务器，无需重启会话。

**当前问题**:
```
用户: "启用 GitHub MCP 服务器"
→ 修改配置
→ 触发 Session 重建 (3-5s 延迟)
→ 对话历史需要重新加载
```

**改进后**:
```
用户: "启用 GitHub MCP 服务器"
→ 调用 setMcpServers()
→ 立即生效 (无延迟)
→ 对话继续，无需重建
```

**价值分析**:
- ✅ **无缝体验**: 无需重启会话
- ✅ **按需加载**: 需要时才启动服务器
- ✅ **节省资源**: 不用的服务器不启动
- ✅ **实现中等**: SDK 提供 API

**实现工作量**: 3-4天
- 后端: 实现动态 MCP 管理
- 前端: 添加 MCP 管理界面
- UI: 显示服务器状态

**技术实现**:
```typescript
// SDK API
interface Query {
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>
}

interface McpSetServersResult {
  added: string[]                    // 新增的服务器
  removed: string[]                  // 移除的服务器
  errors: Record<string, string>     // 连接失败的服务器
}
```

---

## 🚀 高级功能（长期规划）

### 10. 自定义 Agents（子代理）

**功能描述**:
用户可以创建专门的子代理，用于特定任务。

**使用场景**:
```
用户创建"代码审查代理":
- 名称: code-reviewer
- 描述: 审查代码的安全性和性能
- 系统提示: "你是一个专业的代码审查员..."
- 允许工具: Read, Grep, Glob (只读)
- 模型: Opus (更强的推理能力)

使用:
用户: "审查这个 PR"
→ Claude 自动调用 code-reviewer 子代理
→ 使用 Opus 模型进行深度分析
→ 只能读取代码，不能修改
```

**价值分析**:
- ✅ **专业化**: 不同任务用不同代理
- ✅ **成本优化**: 简单任务用 Haiku，复杂任务用 Opus
- ✅ **安全性**: 限制工具访问权限
- ✅ **可定制**: 用户自定义代理行为

**实现工作量**: 1-2周
- 后端: 实现 Agent 管理
- 前端: Agent 编辑器
- UI: Agent 列表、配置界面

**技术实现**:
```typescript
// SDK API
interface Options {
  agents?: Record<string, AgentDefinition>
}

interface AgentDefinition {
  description: string                    // 何时使用此代理
  tools?: string[]                       // 允许的工具
  disallowedTools?: string[]             // 禁止的工具
  prompt: string                         // 系统提示
  model?: 'sonnet' | 'opus' | 'haiku'   // 使用的模型
}
```

---

### 11. Hooks 系统（审计和扩展）

**功能描述**:
在关键事件点注入自定义逻辑。

**使用场景**:

**场景 1: 审计日志**
```typescript
// 记录所有工具调用
hooks: {
  PreToolUse: [async (input) => {
    await logToDatabase({
      tool: input.tool_name,
      input: input.tool_input,
      timestamp: Date.now()
    })
    return { continue: true }
  }]
}
```

**场景 2: 自动注入上下文**
```typescript
// 每次用户提交消息时，自动添加项目信息
hooks: {
  UserPromptSubmit: [async (input) => {
    const projectInfo = await getProjectInfo()
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `当前项目: ${projectInfo.name}\n技术栈: ${projectInfo.stack}`
      }
    }
  }]
}
```

**场景 3: 成本追踪**
```typescript
// 会话结束时记录成本
hooks: {
  SessionEnd: [async (input) => {
    const transcript = await readTranscript(input.transcript_path)
    await saveCostMetrics({
      sessionId: input.session_id,
      totalCost: transcript.total_cost_usd,
      tokens: transcript.usage
    })
    return { continue: true }
  }]
}
```

**价值分析**:
- ✅ **可扩展性**: 无需修改核心代码
- ✅ **审计**: 记录所有操作
- ✅ **自动化**: 自动注入上下文
- ✅ **企业需求**: 成本追踪、合规性

**实现工作量**: 2-3周
- 后端: 实现 Hook 管理
- 前端: Hook 配置界面
- 文档: Hook 开发指南

**技术实现**:
```typescript
// SDK API
interface Options {
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>
}

type HookEvent =
  | 'PreToolUse'           // 工具执行前
  | 'PostToolUse'          // 工具执行后
  | 'PostToolUseFailure'   // 工具执行失败
  | 'UserPromptSubmit'     // 用户提交消息
  | 'SessionStart'         // 会话开始
  | 'SessionEnd'           // 会话结束
  | 'PermissionRequest'    // 权限请求
  // ... 更多事件
```

---

### 12. 结构化输出

**功能描述**:
强制 Claude 返回指定格式的 JSON 数据。

**使用场景**:
```
用户: "分析这个代码库"
→ 配置输出格式:
{
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      languages: { type: 'array' },
      fileCount: { type: 'number' },
      complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
      issues: { type: 'array' }
    }
  }
}

→ Claude 返回:
{
  languages: ['TypeScript', 'JavaScript'],
  fileCount: 150,
  complexity: 'medium',
  issues: [
    { severity: 'high', message: 'SQL injection risk', file: 'db.ts' }
  ]
}
```

**价值分析**:
- ✅ **可靠性**: 保证输出格式
- ✅ **类型安全**: 可以直接使用数据
- ✅ **易于集成**: 无需解析自然语言

**实现工作量**: 1-2周
- 后端: 实现输出格式配置
- 前端: Schema 编辑器
- UI: 结构化数据展示

**技术实现**:
```typescript
// SDK API
interface Options {
  outputFormat?: OutputFormat
}

type OutputFormat = {
  type: 'json_schema'
  schema: Record<string, unknown>
}
```

---

## 📊 优先级矩阵

| 功能 | 价值 | 实现难度 | 工作量 | 优先级 |
|------|------|---------|--------|--------|
| 1. 动态权限模式 | ⭐⭐⭐⭐⭐ | 简单 | 1-2天 | 🔥 极高 |
| 2. 技能列表 | ⭐⭐⭐⭐⭐ | 简单 | 2-3天 | 🔥 极高 |
| 3. 动态模型列表 | ⭐⭐⭐⭐ | 简单 | 1天 | 🔥 极高 |
| 4. 文件回退 | ⭐⭐⭐⭐⭐ | 中等 | 3-4天 | 🔥 极高 |
| 5. 搜索优化 | ⭐⭐⭐⭐ | 中等 | 4-5天 | 🔥 高 |
| 6. 对话导出 | ⭐⭐⭐ | 中等 | 3-4天 | 💡 中 |
| 7. 批量操作 | ⭐⭐⭐ | 简单 | 2-3天 | 💡 中 |
| 8. 标签分类 | ⭐⭐⭐⭐ | 中等 | 4-5天 | 💡 中 |
| 9. 动态 MCP | ⭐⭐⭐⭐ | 中等 | 3-4天 | 💡 中 |
| 10. 自定义 Agents | ⭐⭐⭐⭐⭐ | 复杂 | 1-2周 | 🚀 长期 |
| 11. Hooks 系统 | ⭐⭐⭐⭐ | 复杂 | 2-3周 | 🚀 长期 |
| 12. 结构化输出 | ⭐⭐⭐ | 中等 | 1-2周 | 🚀 长期 |

---

## 🎯 推荐实施路线

### 第一阶段（1-2周）- 快速提升用户体验
1. ✅ 动态权限模式切换
2. ✅ 技能列表展示
3. ✅ 动态模型列表
4. ✅ 文件回退功能

**预期效果**: 显著提升用户体验，增强用户信心

### 第二阶段（2-3周）- 增强功能性
5. ✅ 对话搜索优化
6. ✅ 对话导出功能
7. ✅ 批量操作
8. ✅ 标签和分类

**预期效果**: 更好的对话管理，提升效率

### 第三阶段（1-2月）- 高级功能
9. ✅ 动态 MCP 管理
10. ✅ 自定义 Agents
11. ✅ Hooks 系统
12. ✅ 结构化输出

**预期效果**: 可扩展性、企业级功能

---

## 📈 当前 SDK 使用率

### 已使用的 SDK 功能 (~30%)

```typescript
// V2 Session API
- unstable_v2_createSession()
- session.send()
- session.stream()
- session.close()

// 配置选项
- canUseTool (权限处理)
- mcpServers (MCP 服务器配置)
- includePartialMessages (Token 级流式)
- maxThinkingTokens (思考 token 限制)
- permissionMode (权限模式)
- allowedTools/disallowedTools (工具白名单/黑名单)
```

### 未使用的高价值 SDK 功能 (~70%)

```typescript
// Query 控制方法
- setPermissionMode() ❌
- supportedCommands() ❌
- supportedModels() ❌
- accountInfo() ❌
- rewindFiles() ❌
- setMcpServers() ❌

// 高级配置
- agents (自定义子代理) ❌
- hooks (事件钩子) ❌
- outputFormat (结构化输出) ❌
- enableFileCheckpointing (文件检查点) ❌
- sandbox (沙箱配置) ❌
- plugins (插件系统) ❌
- betas (Beta 功能) ❌
- maxBudgetUsd (预算控制) ❌
```

---

## 💡 总结

### 立即实现（本周）
- 动态权限模式切换 - 实现简单，价值极高
- 技能列表展示 - 提升可发现性
- 动态模型列表 - 减少维护成本

### 近期规划（本月）
- 文件回退功能 - 提升用户信心
- 对话搜索优化 - 解决性能问题

### 中期规划（下月）
- 对话管理功能（导出、批量、标签）

### 长期规划（季度）
- 高级功能（Agents、Hooks、结构化输出）

通过实现这些功能，可以显著提升 Project4 的功能性、可扩展性和用户体验。
