# 更新日志

本文档记录 Project4 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增
- 待添加的新功能

### 修复
- 待修复的问题

### 变更
- 待变更的内容

## [1.1.3] - 2026-03-03

### 修复
- **Windows**: 修复 Git Bash 路径未传递给 CLI 子进程的问题
  - `CLAUDE_CODE_GIT_BASH_PATH` 环境变量被 `CLAUDE_` 前缀过滤器误删除
  - 导致 Windows 用户无法与 AI 对话
- **启动**: 将 Git Bash IPC handlers 注册提前到 essential services
  - 避免 renderer 初始化时的潜在竞态问题

## [1.1.2] - 2026-03-01

### 新增
- 支持自定义 MCP 服务器配置
- 添加飞书集成支持

### 优化
- 改进消息流式传输性能
- 优化思考过程显示逻辑

### 修复
- 修复 macOS 上的代码签名问题
- 修复多工作区切换时的状态丢失

## [1.1.1] - 2026-02-25

### 新增
- 添加 Office 文档自动化支持（PowerPoint、Word、Excel）
- 内置 Python 运行时

### 优化
- 改进 AI Browser 稳定性
- 优化内存使用

### 修复
- 修复 Windows 平台的路径问题
- 修复消息搜索功能

## [1.1.0] - 2026-02-20

### 新增
- 🎉 首个公开版本
- AI 对话界面
- 多工作区支持
- MCP 服务器集成
- Playwright 浏览器自动化
- 持久化记忆功能

### 技术栈
- Electron 32.3.3
- React 18
- TypeScript 5
- Claude Agent SDK

---

## 版本说明

### 版本号格式：主版本号.次版本号.修订号

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型

- **新增**：新功能
- **修复**：Bug 修复
- **变更**：现有功能的变更
- **优化**：性能或体验优化
- **废弃**：即将移除的功能
- **移除**：已移除的功能
- **安全**：安全相关的修复

[未发布]: https://github.com/tbabzhao-coder/projcet-gui/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/tbabzhao-coder/projcet-gui/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/tbabzhao-coder/projcet-gui/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/tbabzhao-coder/projcet-gui/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/tbabzhao-coder/projcet-gui/releases/tag/v1.1.0
