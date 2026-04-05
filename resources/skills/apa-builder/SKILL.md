---
name: apa-builder
description: "创建 AI 驱动的浏览器自动化 skill。当用户想录制、创建或调试浏览器自动化操作时使用。支持录制操作流程、智能分析接口调用、生成可复用 skill、对话式调试、自动降级和自我修复。关键词：录制、自动化、浏览器操作、重复性任务、爬虫、数据采集"
---

# APA Skill Builder

帮助用户通过自然语言对话创建浏览器自动化 skill。

## 触发条件

当用户描述以下需求时使用此 skill：
- 重复性浏览器操作（如"我每天要登录XX，做XX"）
- 明确说要创建/录制自动化流程
- 想修改/调试已有的自动化流程

## 安全约束（登录相关）

**绝对禁止：**
- 主动询问用户的账号、密码或任何登录凭证
- 在生成的脚本中硬编码任何凭证信息
- 在 HAR 分析时包含登录接口的 request body（可能包含明文密码）

**正确做法：**
- 登录完全由用户在浏览器中手动完成
- 录制时遇到登录页，提示"请在浏览器中完成登录"
- 执行时检测到需要登录，提示"登录已过期，请在浏览器中重新登录"
- 使用 `launchPersistentContext` 持久化 session，避免重复登录

## 创建流程

**重要：录制阶段必须使用 Bash 工具执行 `npx playwright codegen` 命令。禁止使用 playwright MCP 工具（如 `mcp__playwright__browser_navigate`）来代替录制，MCP 工具无法生成 JS 脚本和 HAR 文件。**

### 1. 引导录制

如果用户消息中已经包含了目标网站 URL，直接使用。如果没有，**用普通文本消息让用户打字输入 URL。禁止使用 AskUserQuestion 工具弹选择框，禁止提供选项列表，禁止猜测或推荐网站**：

```
AI: "好的，我来帮你创建这个自动化流程。请把目标网站的地址发给我。"
```

**错误示范（绝对不要这样做）：**
- ❌ 弹出选择框让用户选网站
- ❌ 列出"企查查"、"天眼查"等网站让用户选
- ❌ 用 AskUserQuestion 工具询问 URL

### 2. 启动录制

拿到 URL 后，用 Bash 工具执行录制脚本。

**⚠️ 严格要求 — 违反任何一条都会导致录制失败：**

1. **必须使用 `scripts/start-recording.sh` 脚本**，绝对禁止自己拼 `npx playwright codegen` 命令
2. **必须设置 Bash timeout 为 600000**（10 分钟），因为录制是阻塞式的，需要等用户操作完关闭浏览器
3. **必须设置 dangerouslyDisableSandbox 为 true**，因为录制需要创建目录和启动浏览器，沙箱不允许
4. **如果脚本报错，禁止自己重新拼命令重试**，必须把错误信息告诉用户

Bash 工具调用参数：
```json
{
  "command": "bash \"SKILL_DIR/scripts/start-recording.sh\" \"TARGET_URL\" \"WORK_DIR\"",
  "timeout": 600000,
  "dangerouslyDisableSandbox": true
}
```

其中 `SKILL_DIR` 替换为本 skill 所在的目录绝对路径（即包含此 SKILL.md 的目录），`TARGET_URL` 替换为用户提供的目标网址，`WORK_DIR` 替换为当前工作空间的目录路径。录制产物将保存在工作空间的 `.apa-recordings/` 子目录下。

脚本会自动完成：
- 清理上次未正常关闭的浏览器残留锁文件和进程（解决 ProcessSingleton 冲突）
- 从 URL 提取 hostname 用于 session 隔离
- 在工作空间的 `.apa-recordings/` 下创建目录存放录制产物
- 使用 `--channel chrome` + `--user-data-dir` 启动 playwright codegen
- 录制完成后自动保存登录态到 session 目录

**先告诉用户以下内容，然后再执行 Bash 命令：**
```
"好的，我来启动浏览器录制。请在打开的浏览器中操作一遍完整流程，完成后关闭浏览器。"
```

**注意：**
- 这个命令会阻塞直到用户关闭浏览器，这是正常的，不要中断它。
- 如果脚本执行失败，把完整错误信息展示给用户，不要自己尝试修复或重新拼命令。

### 3. 分析录制产物

用户关闭浏览器后，脚本会输出录制产物目录路径（`RECORDING_DIR`）。登录态已由脚本自动保存。

录制产物在 `$RECORDING_DIR/` 下：
- `recording.js`：Playwright codegen 生成的 DOM 操作代码
- `recording.har`：所有网络请求的完整记录
- `storage.json`：登录态（cookie、localStorage 等）

用 Read 工具读取 `recording.js` 和 `recording.har`，然后逐步骤分析：
1. **JS 分析**：识别 DOM 操作步骤、参数、登录节点
2. **HAR 分析**：识别关键 API 调用，逐步骤判断是否有对应的可调用接口
3. **时间线对齐**：将用户操作与接口调用对应

**某一步可走接口**，需同时满足：
- 用户操作后 500ms 内有明确对应的接口调用
- 接口 URL 路径与操作语义相关（如点击"搜索" → `/api/search`）
- 接口不依赖前端动态 token（CSRF、动态 form token 等）
- 接口参数可以参数化（能识别变量和固定值）

**某一步必须走 Playwright**：
- 页面导航、登录、点击、填写等浏览器交互
- 接口依赖前端状态或动态 token
- 操作本身是浏览器行为（截图、下载等）

### 4. 自然语言反馈 + 模式选择

**不展示代码**，用自然语言描述分析结果，并让用户选择生成模式。

先展示分析发现（哪些步骤有对应接口、哪些必须走页面），然后给出三种模式的建议：

```
"录制完成！我分析了你的操作：
  1. 登录目标网站（页面操作）
  2. 搜索 → 发现对应接口 /api/search（可走接口）
  3. 进入详情页 → 发现对应接口 /api/detail（可走接口）

  你希望用哪种模式生成自动化脚本？

  1. 接口模式 — 尽量走接口，不打开浏览器，速度最快。登录等必须走浏览器的步骤仍用 Playwright。适合纯数据操作，但如果接口有反爬或动态 token 可能失败。
  2. 页面模式 — 全部用浏览器操作，兼容性最好但速度较慢。
  3. 混合模式（推荐）— 能走接口的走接口，其余走浏览器。兼顾速度和稳定性。

  [识别出的变量参数] 是每次都不同的参数，对吗？"
```

等待用户选择模式并确认参数。

### 5. 生成产物

根据用户选择的模式，用 Write 工具在 `~/.project4/skills/[skill-name]/` 下生成：

**主脚本**：`[name].js`
- **接口模式**：尽量生成 fetch 调用，登录等必须走浏览器的步骤仍生成 Playwright 操作
- **页面模式**：所有步骤都生成 Playwright 操作
- **混合模式**：逐步骤决策，能走接口的生成 fetch 调用，其余生成 Playwright 操作
- 使用 `launchPersistentContext` 持久化 session（含 Playwright 步骤时）
- 参数通过环境变量注入

**降级 skill（MCP 模式）**：`SKILL.md`
- 脚本执行失败时的兜底方案
- 使用 playwright MCP 工具操作浏览器

**注意：** 录制产物保留在 `RECORDING_DIR`（工作空间的 `.apa-recordings/` 子目录下），方便后续调试查看。不再需要时可由用户手动删除。

### 6. 自然语言确认

```
"已创建自动化流程「[流程名称]」。
 下次你直接告诉我需要处理的内容就行。"
```

## 执行流程（AI 意图识别 + 推荐确认）

### 1. 意图识别

用户说：`"帮我处理一下XX和YY"`

AI 遍历所有已创建的 skill，根据 description 语义匹配，找到最相关的 skill。

### 2. 参数提取

从用户输入中提取参数：`参数名 = [XX, YY]`

### 3. 推荐确认

```
"你是想用之前创建的「[流程名称]」吗？
 参数：参数名 = XX、YY"
```

等待用户确认。

### 4. 执行

用户确认后，用 Bash 执行脚本。生成的脚本内部已经使用 `launchPersistentContext` 指向 `~/.project4/apa-sessions/[hostname]/`，所以会复用录制时保存的登录状态：

```bash
PARAM_NAME='参数值' node ~/.project4/skills/[skill-name]/[skill-name].js
```

参数通过环境变量注入。如果脚本执行失败，自动切换到 MCP 降级模式（使用 playwright MCP 工具操作浏览器）。

如需登录（session 过期），提示用户：`"登录已过期，请在浏览器中重新登录"`

## 调试支持

用户说：`"修改XX自动化流程"` 或 `"加上XX步骤"`

AI 触发增量录制：
1. 用 Bash 启动 `npx playwright codegen` 打开浏览器
2. 用户操作新增步骤
3. 分析差异，更新 skill

## 脚本生成要点（录制完成后参考）

生成混合模式脚本时记住这几点即可，不需要提前读模板文件：
- 用 `chromium.launch({ channel: 'chrome' })` 启动系统 Chrome，失败则回退到默认 Chromium
- 用 `browser.newContext({ storageState })` 加载录制时保存的登录态
- 登录态文件：`~/.project4/apa-sessions/[hostname]/storage.json`
- 登录检测：`if (page.url().includes('login'))`，登录成功后用 `context.storageState({ path })` 保存
- 接口调用：从 context 提取 Cookie
- 参数注入：通过环境变量 `process.env.PARAM_NAME`
- 执行完成后更新 storage（刷新 cookie 有效期）
- 降级：脚本执行失败时自动生成 MCP skill 兜底

详细模板见 `assets/script-templates/`，**仅在生成脚本时按需加载**。

## 辅助工具

以下资源仅在**分析录制产物时**才需要加载，**不要在录制开始前读取**：

- `references/api-detection-rules.md`：接口识别规则（生成脚本时参考）
- `references/selector-strategies.md`：selector 优化策略（生成脚本时参考）
- `references/login-patterns.md`：登录节点识别模式（生成脚本时参考）
- `assets/script-templates/mixed-mode-template.js`：混合模式脚本模板（生成脚本时参考）
- `assets/script-templates/mcp-skill-template.md`：MCP 降级模板（生成降级 skill 时参考）

**重要：收到用户录制请求后，立即启动录制，不要先读这些文件。等录制完成拿到产物后再按需加载。**

## 注意事项

1. **禁止用 AskUserQuestion 询问 URL**：需要用户提供 URL 时，直接用文本消息问，不要弹选择框
2. **录制必须用 Bash**：录制阶段只能用 Bash 执行 `npx playwright codegen`，禁止用 playwright MCP 工具代替。MCP 工具不会生成 JS 脚本和 HAR 文件
3. **立即行动**：拿到 URL 后直接用 Bash 启动录制，不要先读 references 或 templates
4. **全程自然语言**：用户无需了解任何技术概念
5. **推荐确认，不自动执行**：匹配到 skill 后推荐给用户确认
6. **安全第一**：绝不询问、收集、存储用户凭证
7. **降级兜底**：脚本失败自动切换到 MCP 模式
8. **自我修复**：MCP 模式成功后，更新脚本文件
