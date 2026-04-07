# 集成飞书 lark-cli 到 Project4 — 实施方案

## Context

将 lark-cli（Go 单二进制 CLI）作为独立能力接入 Project4，替代现有的飞书机器人集成（WebSocket 方式）。用户在 Settings 中配置飞书应用并扫码授权，Agent 在对话中通过 Bash 直接调用 lark-cli 操作飞书。lark-cli 二进制构建时内置到安装包，用户零安装。

---

## Phase 1：构建基础设施（lark-cli 二进制 + Skill）

### 1.1 下载脚本

创建 4 个平台脚本，遵循 `scripts/prepare-node-win-x64.mjs` 的模式：

| 脚本 | 目标目录 | 二进制名 |
|------|---------|---------|
| `scripts/prepare-lark-cli-win-x64.mjs` | `resources/lark-cli-win-x64/` | `lark-cli.exe` |
| `scripts/prepare-lark-cli-mac-arm64.mjs` | `resources/lark-cli-arm64/` | `lark-cli` |
| `scripts/prepare-lark-cli-mac-x64.mjs` | `resources/lark-cli-x64/` | `lark-cli` |
| `scripts/prepare-lark-cli-linux-x64.mjs` | `resources/lark-cli-linux-x64/` | `lark-cli` |

每个脚本：
- 从 lark-cli GitHub Release 下载对应平台二进制（参考 `prepare-git-bash-win-x64.mjs` 的镜像 fallback 模式）
- 解压（如果是 tar.gz/zip）或直接放置
- 验证可执行文件存在
- 需要先确认 lark-cli 的 GitHub Release URL 格式和版本号

### 1.2 修改 `package.json`

**files 排除**（~line 163，加入）：
```
"!resources/lark-cli-*"
```

**prepare 脚本**（追加到各平台命令末尾）：
- `prepare:win-x64`（line 39）：追加 `&& node scripts/prepare-lark-cli-win-x64.mjs`
- `prepare:mac-arm64`（line 37）：追加 `&& node scripts/prepare-lark-cli-mac-arm64.mjs`
- `prepare:mac-x64`（line 38）：追加 `&& node scripts/prepare-lark-cli-mac-x64.mjs`
- `prepare:linux-x64`（line 40）：追加 `&& node scripts/prepare-lark-cli-linux-x64.mjs`

**extraResources — Windows**（`build.win.extraResources`，~line 342，在 git-bash 后面加）：
```json
{
  "from": "resources/lark-cli-win-x64",
  "to": "lark-cli-win-x64",
  "filter": ["**/*"]
}
```

**extraResources — macOS**（`build.mac.extraResources`，~line 193，在 node-arm64 后面加）：
```json
{
  "from": "resources/lark-cli-arm64",
  "to": "lark-cli-arm64",
  "filter": ["**/*"]
},
{
  "from": "resources/lark-cli-x64",
  "to": "lark-cli-x64",
  "filter": ["**/*"]
}
```

**extraResources — Linux**（`build.linux` 部分，目前无 extraResources，新增）：
```json
"extraResources": [
  {
    "from": "resources/lark-cli-linux-x64",
    "to": "lark-cli-linux-x64",
    "filter": ["**/*"]
  }
]
```

### 1.3 修改 `scripts/afterPack.cjs`

在 Python 清理逻辑后（~line 157），新增 lark-cli 清理段，遵循完全相同的模式：

```javascript
const larkCliDirs = ['lark-cli-arm64', 'lark-cli-x64', 'lark-cli-win-x64', 'lark-cli-linux-x64']
```

平台逻辑：
- darwin + arm64 → 保留 `lark-cli-arm64`，删除其余
- darwin + x64 → 保留 `lark-cli-x64`，删除其余
- darwin + universal → 保留 arm64 和 x64
- win32 → 保留 `lark-cli-win-x64`，删除其余
- linux → 保留 `lark-cli-linux-x64`，删除其余

### 1.4 创建 Skill

**新建 `resources/skills/lark/SKILL.md`**（~3-4KB）：
- frontmatter: name=lark, description 描述飞书操作能力
- 能力索引：列出 lark-cli 支持的模块（msg, doc, sheet, calendar, drive, wiki, base, task, mail 等）
- 常用命令速查
- 使用规则（先检查 auth 状态、复杂操作先 Read reference）
- 指向 `references/` 目录的索引

**新建 `resources/skills/lark/references/`**：
- 放入 lark-cli 官方 20 个 SKILL.md（按模块命名：msg.md, calendar.md, doc.md 等）
- Agent 通过 Read 工具按需加载

Skill 会被 `getBuiltInSkills()` 自动发现（扫描 `resources/skills/` 下的 SKILL.md），无需改动加载逻辑。

### 1.5 注册 lark skill 到 `config.service.ts`

在 `src/main/services/config.service.ts` 的 `getBuiltInSkills()` 中（~line 215，skill-vetter 之后），添加 lark skill 注册块：

```typescript
const larkPath = join(skillsDir, 'lark')
if (existsSync(larkPath) && existsSync(join(larkPath, 'SKILL.md'))) {
  builtIn['lark'] = {
    name: 'lark',
    path: larkPath,
    type: 'directory',
    description: 'Feishu/Lark integration via lark-cli...',
    disabled: false,
    hasScripts: false,
    __builtIn: true
  }
}
```

### Phase 1 验证
- 运行 `node scripts/prepare-lark-cli-win-x64.mjs`，确认 `resources/lark-cli-win-x64/lark-cli.exe` 存在
- `npm run dev`，控制台看到 lark skill 被加载
- Settings → Skills 列表中出现 lark

---

## Phase 2：服务层 + 授权

### 2.1 新建 `src/main/services/lark-cli-runtime.service.ts`

完全复制 `node-runtime.service.ts` 的模式（224 行），改为 lark-cli：

导出函数：
- `getBundledLarkCliPath(): string | null` — 解析二进制目录路径
  - 平台映射：win32→`lark-cli-win-x64`, darwin+arm64→`lark-cli-arm64`, darwin+x64→`lark-cli-x64`, linux→`lark-cli-linux-x64`
  - dev: `join(__dirname, '../..', 'resources', dirName)`
  - prod: `join(process.resourcesPath, dirName)`
  - 验证可执行文件存在，缓存结果
- `getBundledLarkCliExecutable(): string | null` — 返回完整可执行文件路径
  - win32: `lark-cli.exe`; 其他: `lark-cli`（注意：Go 二进制直接在目录根，不在 bin/ 下）
- `hasBundledLarkCli(): boolean`
- `buildEnvWithLarkCli(existingEnv): NodeJS.ProcessEnv` — 复制 `buildEnvWithBundledNode()` 的模式
  - 获取二进制所在目录
  - `toUnixStylePath()` 转换（Windows Git Bash 兼容）
  - 前置到 PATH 和 ORIGINAL_PATH
  - 单次日志

### 2.2 修改 `src/main/services/agent/sdk-config.ts`

在 `buildSdkEnv()` 函数中（line 247 之后）：

```typescript
import { buildEnvWithLarkCli } from '../lark-cli-runtime.service'
// ...
let baseEnv = buildEnvWithBundledNode(process.env)   // line 246
baseEnv = buildEnvWithBundledPython(baseEnv)          // line 247
baseEnv = buildEnvWithLarkCli(baseEnv)                // 新增
```

### 2.3 新建 `src/main/services/lark-cli.service.ts`

高层服务，封装 lark-cli 命令供 Settings UI 使用：

```typescript
// 类型
export type LarkCliStatus = 'not_configured' | 'configured' | 'auth_valid' | 'auth_expired' | 'error'

export interface LarkCliConfig {
  configured: boolean
  platform?: 'feishu' | 'lark'
  appId?: string
}

// 内部：execLarkCli(args) — 用 child_process.execFile 调用二进制
// 对于 QR 流程用 spawn 流式读取 stdout

// 公开 API
export async function checkLarkCliStatus(): Promise<{ status: LarkCliStatus; details?: any }>
  // 调用 lark-cli auth status --format json

export async function initConfig(options: { newApp: boolean }): Promise<{ qrUrl?: string }>
  // 调用 lark-cli config init --new，解析 stdout 中的 verification URL

export async function authLogin(): Promise<{ qrUrl?: string }>
  // 调用 lark-cli auth login --recommend，解析 URL

export async function logout(): Promise<void>
  // 调用 lark-cli auth logout

export async function manualConfig(platform: string, appId: string, appSecret: string): Promise<void>
  // 调用 lark-cli config init --app-id X --app-secret-stdin --brand Y

export function getLarkCliConfig(): LarkCliConfig | null
  // 从 AppConfig 读取

export function saveLarkCliConfig(config: LarkCliConfig): void
  // 写入 AppConfig
```

注意：lark-cli 自己管理 credentials/tokens，我们只在 AppConfig 中存轻量标记（configured, platform, appId）。

### 2.4 新建 `src/main/ipc/lark-cli.ts`

遵循 `src/main/ipc/feishu.ts` 的模式：

```typescript
export function registerLarkCliHandlers(): void {
  ipcMain.handle('lark-cli:get-status', ...)
  ipcMain.handle('lark-cli:init-config', ...)
  ipcMain.handle('lark-cli:auth-login', ...)
  ipcMain.handle('lark-cli:logout', ...)
  ipcMain.handle('lark-cli:manual-config', ...)
}
```

每个 handler 返回 `{ success: true, data }` 或 `{ success: false, error }`。

### 2.5 修改 `src/main/bootstrap/extended.ts`

- 注释掉 feishu 相关 import（line 33, 35）和调用（line 91-94, 130-131）
- 新增：
```typescript
import { registerLarkCliHandlers } from '../ipc/lark-cli'
// 在 initializeExtendedServices() 中：
registerLarkCliHandlers()
```

### 2.6 修改 `src/preload/index.ts`

- 注释掉 feishu 类型声明（~line 284-291）和实现（~line 542-545）
- 新增 lark-cli 类型声明和实现：
```typescript
// 类型
larkCliGetStatus: () => Promise<IpcResponse>
larkCliInitConfig: (options: { newApp: boolean }) => Promise<IpcResponse>
larkCliAuthLogin: () => Promise<IpcResponse>
larkCliLogout: () => Promise<IpcResponse>
larkCliManualConfig: (config: { platform: string; appId: string; appSecret: string }) => Promise<IpcResponse>
onLarkCliStatusChange: (callback: (data: unknown) => void) => () => void

// 实现
larkCliGetStatus: () => ipcRenderer.invoke('lark-cli:get-status'),
larkCliInitConfig: (options) => ipcRenderer.invoke('lark-cli:init-config', options),
larkCliAuthLogin: () => ipcRenderer.invoke('lark-cli:auth-login'),
larkCliLogout: () => ipcRenderer.invoke('lark-cli:logout'),
larkCliManualConfig: (config) => ipcRenderer.invoke('lark-cli:manual-config', config),
onLarkCliStatusChange: (callback) => createEventListener('lark-cli:status-change', callback),
```

### 2.7 修改 `src/renderer/api/index.ts`

- 注释掉 feishu 方法（~line 1186-1216）
- 新增 lark-cli 方法，每个都包含 `isElectron()` 检查，委托给 `window.project4.larkCliXxx()`

### 2.8 修改 `src/renderer/types/index.ts`

新增类型（保留旧 FeishuConfig 不删，只新增）：
```typescript
export type LarkCliStatus = 'not_configured' | 'configured' | 'auth_valid' | 'auth_expired' | 'error'
export interface LarkCliConfig {
  configured: boolean
  platform?: 'feishu' | 'lark'
  appId?: string
}
export interface LarkCliStatusInfo {
  status: LarkCliStatus
  config?: LarkCliConfig | null
  error?: string
}
```

在 AppConfig 接口中新增可选字段：`larkCli?: LarkCliConfig`

### Phase 2 验证
- `npm run dev`，DevTools 中 `window.project4.larkCliGetStatus()` 返回 `{ success: true, data: { status: 'not_configured' } }`
- 旧飞书功能不报错（注释掉而非删除）
- 对话中 `lark-cli --version` 能在 PATH 中找到

---

## Phase 3：Settings UI

### 3.1 添加依赖

`package.json` dependencies 新增 `qrcode`（用于从 URL 生成 QR 码 DataURL）。

### 3.2 新建 `src/renderer/components/settings/LarkCliSettings.tsx`

状态机组件，6 个状态：

| 状态 | UI | 操作 |
|------|-----|------|
| `idle` + not_configured | "开始配置" + "手动配置" 按钮 | 点击触发 initConfig / 切换到手动表单 |
| `creating_app` | QR 码 + "第1步：创建飞书应用" | 等待扫码，成功后自动进入 auth_login |
| `auth_login` | QR 码 + "第2步：授权登录" | 等待扫码，成功后进入 ready |
| `ready` (auth_valid) | 绿色状态 + "重新授权"/"断开连接" | 操作按钮 |
| `expired` (auth_expired) | 橙色状态 + "重新授权" | 触发 authLogin |
| `manual_config` | 平台选择 + appId/appSecret 表单 | 保存后进入 auth_login |

QR 码生成：
```typescript
import QRCode from 'qrcode'
const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 })
```

视觉设计：
- 容器：`bg-card rounded-xl border border-border p-6`（和其他 Settings section 一致）
- 状态灯：灰色（未配置）/ spinner（配置中）/ 绿色+pulse（已就绪）/ 橙色（已过期）
- QR 码：白色背景 + 圆角边框 + 轻阴影，居中
- 按钮/输入框：复用现有样式

### 3.3 修改 `src/renderer/pages/SettingsPage.tsx`

- 注释掉 `import { FeishuSettings }` (~line 32)
- 新增 `import { LarkCliSettings }`
- 替换 FeishuSettings 渲染为 LarkCliSettings

### 3.4 修改 `src/renderer/pages/HomePage.tsx`

- 注释掉 feishuSpace 相关的解构和渲染

### Phase 3 验证
- Settings 页面显示"飞书"区域，状态为"未配置"
- 点击"手动配置"展开表单，平台选择/appId/appSecret 正常
- 点击"开始配置"调用 IPC，DevTools 可见请求
- 无 TypeScript 编译错误

---

## Phase 4：Agent 集成

### 4.1 修改 `src/main/services/agent/helpers.ts`

- 注释掉 feishu import（line 18）：`// import { onAgentEvent as onFeishuAgentEvent } from '../feishu.service'`
- 注释掉 `sendToRenderer()` 中的 feishu 转发逻辑（~line 422-427）
- 在 `buildSystemPromptAppend()` 中条件追加 lark-cli 提示：

```typescript
import { getLarkCliConfig } from '../lark-cli.service'

// 在函数体中：
const larkConfig = getLarkCliConfig()
const larkInstructions = larkConfig?.configured ? `
<lark_cli>
lark-cli is available in PATH. When the user asks to interact with Feishu/Lark, use the lark skill.
If unsure about a command, read the reference docs in the lark skill's references/ directory first.
If lark-cli is not configured, tell the user to go to Settings to set up Feishu.
</lark_cli>
` : ''
```

### Phase 4 验证
- 配置 lark-cli 后，新对话中 Agent 知道 lark-cli 可用
- 问"帮我看今天日程"→ Agent 调用 `lark-cli calendar +agenda`
- 复杂操作 → Agent 先 Read reference 再操作
- 未配置时 → Agent 提示去设置页

---

## 屏蔽清单（注释而非删除）

| 文件 | 操作 |
|------|------|
| `src/main/bootstrap/extended.ts` | 注释 feishu imports + init + cleanup |
| `src/main/services/agent/helpers.ts` | 注释 onFeishuAgentEvent import + 转发 |
| `src/renderer/pages/SettingsPage.tsx` | 注释 FeishuSettings import + 渲染 |
| `src/renderer/pages/HomePage.tsx` | 注释 feishuSpace 显示 |
| `src/preload/index.ts` | 注释 feishu IPC 方法 |
| `src/renderer/api/index.ts` | 注释 feishu API 方法 |

不删除：`feishu.service.ts`、`ipc/feishu.ts`、`FeishuSettings.tsx`、types 中的 FeishuConfig — 保留代码以备回退。

---

## 关键文件清单

### 新建文件
| 文件 | 说明 |
|------|------|
| `scripts/prepare-lark-cli-win-x64.mjs` | Windows 下载脚本 |
| `scripts/prepare-lark-cli-mac-arm64.mjs` | macOS arm64 下载脚本 |
| `scripts/prepare-lark-cli-mac-x64.mjs` | macOS x64 下载脚本 |
| `scripts/prepare-lark-cli-linux-x64.mjs` | Linux 下载脚本 |
| `resources/skills/lark/SKILL.md` | 入口 Skill（~3-4KB） |
| `resources/skills/lark/references/*.md` | 官方 20 个 skill reference |
| `src/main/services/lark-cli-runtime.service.ts` | 二进制路径解析 + PATH 注入 |
| `src/main/services/lark-cli.service.ts` | 高层服务（exec, auth, config） |
| `src/main/ipc/lark-cli.ts` | IPC handlers |
| `src/renderer/components/settings/LarkCliSettings.tsx` | Settings UI 组件 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `package.json` | files 排除、prepare 脚本、extraResources、qrcode 依赖 |
| `scripts/afterPack.cjs` | lark-cli 平台清理 |
| `src/main/services/config.service.ts` | getBuiltInSkills() 注册 lark skill |
| `src/main/services/agent/sdk-config.ts` | buildSdkEnv() 加 buildEnvWithLarkCli() |
| `src/main/services/agent/helpers.ts` | 注释 feishu + 加 lark-cli system prompt |
| `src/main/bootstrap/extended.ts` | 注释 feishu + 注册 lark-cli handlers |
| `src/preload/index.ts` | 注释 feishu + 加 lark-cli IPC |
| `src/renderer/api/index.ts` | 注释 feishu + 加 lark-cli API |
| `src/renderer/types/index.ts` | 新增 LarkCli 类型 + AppConfig.larkCli |
| `src/renderer/pages/SettingsPage.tsx` | 替换 FeishuSettings → LarkCliSettings |
| `src/renderer/pages/HomePage.tsx` | 注释 feishuSpace |

---

## 实施顺序

1. **Phase 1** → 构建跑通，Skill 可见
2. **Phase 2** → 服务层 + IPC 链路通，同时屏蔽旧飞书
3. **Phase 3** → Settings UI 可交互
4. **Phase 4** → Agent 对话中可用

每个 Phase 完成后验证再进入下一个。
