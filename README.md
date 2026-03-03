# Project4

<div align="center">

![版本](https://img.shields.io/badge/版本-1.1.3-blue.svg)
![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)
![平台](https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

基于 Claude Agent SDK 构建的 AI 生产力助手

[功能特性](#功能特性) • [安装使用](#安装使用) • [开发指南](#开发指南) • [参与贡献](#参与贡献) • [开源协议](#开源协议)

</div>

---

## ✨ 功能特性

- 🤖 **AI 对话** - 基于 Claude 的自然语言交互界面
- 📁 **多工作区** - 支持多个独立的项目工作空间
- 🔌 **MCP 集成** - 通过模型上下文协议扩展功能
- 🐍 **内置 Python** - 嵌入式 Python 运行时，支持自动化脚本
- 📊 **Office 自动化** - 创建和编辑 PowerPoint、Word、Excel 文件
- 🌐 **网页浏览** - 通过 Playwright 实现 AI 控制的浏览器自动化
- 💾 **持久化记忆** - 知识图谱，跨会话保持上下文
- 🛠️ **自定义技能** - 通过自定义 Skill 扩展功能

## 🚀 安装使用

### 系统要求

- **Node.js** 20 或更高版本
- **Anthropic API Key** - 从 [Anthropic 控制台](https://console.anthropic.com/) 获取

### 下载安装

下载适合你平台的最新版本：

- **macOS**: `Project4-1.1.3-arm64.dmg` (Apple Silicon) 或 `Project4-1.1.3-x64.dmg` (Intel)
- **Windows**: `Project4-Setup-1.1.3.exe`
- **Linux**: `Project4-1.1.3.AppImage`

### 首次启动

1. 启动 Project4
2. 在提示时输入你的 Anthropic API Key
3. 选择或创建一个工作区
4. 开始与 Claude 对话！

## 🏗️ 内置 MCP 服务器

Project4 预装了以下 MCP 服务器：

| 服务器 | 说明 | 使用场景 |
|--------|------|----------|
| **Playwright** | 浏览器自动化 | 网页抓取、测试、截图 |
| **Filesystem** | 安全的文件操作 | 读写文件、目录管理 |
| **Memory** | 持久化知识图谱 | 跨会话记忆上下文 |
| **Office Suite** | PowerPoint、Word、Excel | 创建演示文稿、文档、表格 |

## 🛠️ 开发指南

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/yourusername/project4.git
cd project4

# 安装依赖
npm install

# 准备平台特定资源
npm run prepare:mac-arm64  # Apple Silicon Mac
npm run prepare:mac-x64    # Intel Mac
npm run prepare:win-x64    # Windows（包含 Git Bash）
npm run prepare:linux-x64  # Linux
```

### 启动开发服务器

```bash
# 启动开发服务器（支持热重载）
npm run dev
```

应用将以开发模式启动，并自动打开 DevTools。

### 构建打包

```bash
# 构建当前平台
npm run build

# 构建安装包
npm run build:mac     # macOS（通用版本）
npm run build:win     # Windows
npm run build:linux   # Linux
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行端到端测试
npm run test:e2e
```

## 📁 项目结构

```
project4/
├── src/
│   ├── main/           # Electron 主进程
│   ├── renderer/       # React 前端
│   ├── preload/        # 预加载脚本
│   └── shared/         # 共享类型和工具
├── resources/          # 平台特定资源
│   ├── python-*/       # 嵌入式 Python 运行时
│   ├── node-*/         # 嵌入式 Node.js 运行时
│   ├── git-bash-*/     # Windows Git Bash
│   └── skills/         # 内置技能
├── scripts/            # 构建和设置脚本
└── tests/              # 测试套件
```

## 🔧 配置说明

### API 密钥配置

在设置中配置你的 AI 提供商：

- **Anthropic**（推荐）：直接访问 Claude API
- **OpenAI**：通过 OpenAI API 兼容
- **GitHub Copilot**：使用你的 Copilot 订阅

### 自定义 MCP 服务器

在 `~/.project4/config.json` 中添加自定义 MCP 服务器：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

### 自定义技能

在 `~/.project4/claude-config/skills/` 目录下创建自定义技能：

```
my-skill/
├── SKILL.md          # 技能文档
└── skill.json        # 技能元数据
```

详见 [技能创建指南](./docs/skills.md)。

## 🤝 参与贡献

我们欢迎各种形式的贡献！请查看 [贡献指南](./CONTRIBUTING.md) 了解详情。

### 快速开始

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交你的更改：`git commit -m 'Add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📝 开源协议

本项目采用 MIT 协议开源 - 详见 [LICENSE](./LICENSE) 文件。

## 🙏 致谢

- 基于 [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript) 构建
- 由 [Anthropic Claude](https://www.anthropic.com/) 提供支持
- MCP 协议由 [Anthropic](https://modelcontextprotocol.io/) 提供

## 📮 支持与反馈

- **问题反馈**：[GitHub Issues](https://github.com/yourusername/project4/issues)
- **讨论交流**：[GitHub Discussions](https://github.com/yourusername/project4/discussions)
- **邮件联系**：your-email@example.com

---

<div align="center">
用 ❤️ 打造 by Project4 团队
</div>
