# AI Browser Module 技术说明

本文档说明项目内 **AI Browser Module** 基于哪些功能与协议实现。

---

## 一、核心依赖

| 层级 | 技术/功能 | 作用 |
|------|-----------|------|
| **运行时** | Electron | 主进程、窗口与 WebContents 管理 |
| **浏览器内核** | Chromium (Electron 内置) | 真实浏览器渲染与网络 |
| **自动化协议** | Chrome DevTools Protocol (CDP) | 与页面交互、获取快照、监控网络/控制台 |
| **工具暴露** | Claude Agent SDK MCP | 将浏览器能力封装为 MCP 工具供 AI 调用 |
| **嵌入视图** | Electron BrowserView | 在应用内嵌入可控制的浏览器页面 |

---

## 二、实现架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI Browser Module                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Claude Agent SDK                                                        │
│  └── createSdkMcpServer('ai-browser', tools)  ← 26 个 browser_* 工具     │
├─────────────────────────────────────────────────────────────────────────┤
│  BrowserContext (context.ts)                                            │
│  └── 管理当前活跃 BrowserView、执行 CDP、维护快照/网络/控制台状态         │
├─────────────────────────────────────────────────────────────────────────┤
│  BrowserView Service (browser-view.service.ts)                           │
│  └── 创建/销毁 BrowserView、导航、状态同步、提供 webContents             │
├─────────────────────────────────────────────────────────────────────────┤
│  Snapshot (snapshot.ts)                                                 │
│  └── 通过 CDP Accessibility 域获取可访问性树，生成带 UID 的页面快照      │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Electron WebContents.debugger  (CDP 1.3)                               │
│  └── attach → sendCommand(method, params)                               │
│      使用域: Accessibility, DOM, Input, Page, Network, Runtime,          │
│             Emulation, Tracing 等                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、基于 CDP 的功能

AI Browser 的页面操控、快照、网络/控制台监听都通过 **Chrome DevTools Protocol (CDP)** 完成。主进程对当前活跃的 BrowserView 的 `webContents` 执行 `debugger.attach('1.3')` 后，用 `debugger.sendCommand(method, params)` 发 CDP 命令。

### 1. 可访问性树（Accessibility）— 快照与元素定位

- **用途**：生成页面“可交互元素树”，供 AI 理解页面结构并用稳定 UID 操作元素。
- **CDP**：
  - `Accessibility.getFullAXTree`：拉取完整可访问性树（AX 节点）。
- **实现位置**：`src/main/services/ai-browser/snapshot.ts`
- **流程**：CDP 返回 AX 节点 → 转为内部 `AccessibilityNode`（含 `uid`、`backendNodeId`、role、name 等）→ 组成 `AccessibilitySnapshot`，可格式化为文本给模型，或按 UID 查节点做点击/填表等。

### 2. 元素操作（DOM + Input）

- **用途**：点击、输入、悬停、拖拽、按键、文件上传、焦点等。
- **CDP**：
  - `DOM.resolveNode`、`DOM.getBoxModel`、`DOM.focus`、`DOM.setFileInputFiles`
  - `Input.dispatchMouseEvent`、`Input.dispatchKeyEvent`、`Input.insertText`
- **实现位置**：`context.ts`（如 `clickElement`、`fillElement`、`pressKey`、`hoverElement`、`dragElement` 等）及 `sdk-mcp-server.ts`（如文件上传）。
- **说明**：先用快照里的 `backendNodeId` 通过 DOM 域解析节点，再用 Input 域发送事件。

### 3. 页面与截图（Page）

- **用途**：截图（整页或区域）、处理弹窗、获取布局信息。
- **CDP**：
  - `Page.captureScreenshot`、`Page.getLayoutMetrics`
  - `Page.handleJavaScriptDialog`（alert/confirm/prompt）
- **实现位置**：`context.ts`（如 `captureScreenshot`、弹窗处理）、监听 `Page.javascriptDialogOpening` 等。

### 4. 网络监控（Network）

- **用途**：查看请求列表、状态、请求/响应头等，供 AI 调试或理解页面行为。
- **CDP**：
  - `Network.enable`（开启网络域）
  - 监听：`Network.requestWillBeSent`、`Network.responseReceived`、`Network.loadingFailed`
- **实现位置**：`context.ts` 中 `enableNetworkMonitoring`、`handleCDPMessage` 对上述事件的解析与存储。

### 5. 控制台监控（Runtime）

- **用途**：收集页面 console 输出（log/warn/error 等），供 AI 排错。
- **CDP**：
  - 监听 `Runtime.consoleAPICalled`
- **实现位置**：`context.ts` 中同一 CDP 消息处理逻辑，解析后写入控制台消息列表。

### 6. 设备与网络模拟（Emulation / Network）

- **用途**：改 viewport、User-Agent、离线、限速、地理位置等。
- **CDP**：
  - `Emulation.setDeviceMetricsOverride`、`Emulation.setGeolocationOverride`、`Emulation.setCPUThrottlingRate`
  - `Network.emulateNetworkConditions`
- **实现位置**：`context.ts` 的 `setEmulation`、`tools/emulation.ts` 等。

### 7. 性能追踪（Tracing）

- **用途**：采集性能数据与 Web Vitals（LCP、FID、CLS 等）。
- **CDP**：
  - `Tracing.start`、`Tracing.end`
  - 以及通过 CDP 获取性能指标（如 `Page.getLayoutMetrics` 等）。
- **实现位置**：`context.ts` 中性能相关方法、`tools/performance.ts`。

---

## 四、Electron 侧能力

### 1. BrowserView（browser-view.service.ts）

- 使用 Electron 的 **BrowserView** 在窗口内嵌入独立浏览器实例（多标签即多个 BrowserView）。
- 每个 view 对应一个 **WebContents**，拥有自己的 URL、导航、加载状态、缩放等。
- 提供：`create`、`destroy`、`navigate`、`goBack`、`goForward`、`reload`、`getState`、以及向主窗口暴露的 `getWebContents`（供 AI Browser 的 context 绑定 CDP）。

### 2. WebContents.debugger（CDP 入口）

- `webContents.debugger.attach('1.3')`：绑定 CDP 1.3。
- `webContents.debugger.sendCommand(method, params)`：执行 CDP 命令。
- `webContents.debugger.on('message', ...)`：接收 CDP 事件（网络、控制台、弹窗等）。
- 所有 AI Browser 的“浏览器自动化”能力都建立在这一层之上。

---

## 五、MCP 与 Claude Agent SDK

- **MCP 服务**：通过 `@anthropic-ai/claude-agent-sdk` 的 `tool()` + `createSdkMcpServer()` 创建**进程内** MCP 服务，名称为 `ai-browser`。
- **工具命名**：所有工具以 `browser_` 为前缀，例如 `browser_new_page`、`browser_snapshot`、`browser_click` 等，在 SDK 侧会带上前缀 `mcp__ai-browser__`。
- **工具数量与分类**（见 `sdk-mcp-server.ts`）：
  - **导航**：browser_list_pages, browser_select_page, browser_new_page, browser_close_page, browser_navigate, browser_wait_for
  - **输入**：browser_click, browser_hover, browser_fill, browser_fill_form, browser_drag, browser_press_key, browser_upload_file, browser_handle_dialog
  - **快照/执行**：browser_snapshot, browser_screenshot, browser_evaluate
  - **网络**：browser_network_requests, browser_network_request
  - **控制台**：browser_console, browser_console_message
  - **模拟**：browser_emulate, browser_resize
  - **性能**：browser_perf_start, browser_perf_stop, browser_perf_insight

每个工具内部最终都会调用 `BrowserContext` 的方法，而 Context 再通过 `getWebContents()` 拿到当前 BrowserView 的 WebContents 并执行 CDP。

---

## 六、数据流小结

1. **用户/Agent** 在对话中开启“AI Browser”，并发送自然语言指令。
2. **Claude Agent SDK** 决定调用哪些 `mcp__ai-browser__browser_*` 工具及参数。
3. **AI Browser MCP Server**（sdk-mcp-server）执行对应 tool handler。
4. **BrowserContext** 根据当前 `activeViewId` 从 **BrowserView Service** 取到该 view 的 **WebContents**。
5. 对 WebContents 的 **debugger** 发 CDP 命令或监听 CDP 事件（如 Accessibility、DOM、Input、Page、Network、Runtime、Emulation、Tracing）。
6. **Snapshot** 使用 `Accessibility.getFullAXTree` 生成带 UID 的可访问性快照；其他操作通过 DOM/Input/Page 等域完成。
7. 结果返回给 SDK，再以模型回复或工具结果的形式回到用户界面。

---

## 七、总结表

| 功能 | 实现基础 |
|------|----------|
| 内嵌网页 | Electron BrowserView + Chromium |
| 页面结构获取与元素定位 | CDP Accessibility 域（AX 树） + 自研 snapshot 与 UID 映射 |
| 点击、输入、按键、拖拽、上传、弹窗 | CDP DOM 域 + Input 域 + Page 域 |
| 截图 | CDP Page.captureScreenshot |
| 网络请求查看 | CDP Network 域 + 事件监听 |
| 控制台日志 | CDP Runtime.consoleAPICalled 监听 |
| 设备/网络模拟 | CDP Emulation / Network.emulateNetworkConditions |
| 性能指标 | CDP Tracing + Page 等域 |
| 工具暴露给 AI | Claude Agent SDK 的 MCP（createSdkMcpServer + tool） |

**一句话**：AI Browser Module 是在 **Electron + Chromium** 上，通过 **Chrome DevTools Protocol (CDP)** 驱动 **BrowserView** 的 WebContents，并把能力封装成 **Claude Agent SDK 的 MCP 工具**，从而让 AI 能够控制真实浏览器进行导航、快照、点击、填表、截图、看网络/控制台与性能等操作。
