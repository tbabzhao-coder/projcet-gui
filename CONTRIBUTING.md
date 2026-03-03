# 贡献指南

感谢你考虑为 Project4 做出贡献！我们欢迎各种形式的贡献，包括但不限于：

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复或新功能
- 🌍 翻译文档

## 行为准则

参与本项目即表示你同意遵守我们的行为准则：

- 尊重所有贡献者
- 使用友好和包容的语言
- 接受建设性的批评
- 关注对社区最有利的事情

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请通过 [GitHub Issues](https://github.com/yourusername/project4/issues) 提交，并包含以下信息：

- **Bug 描述**：清晰简洁地描述问题
- **复现步骤**：详细的复现步骤
- **预期行为**：你期望发生什么
- **实际行为**：实际发生了什么
- **环境信息**：
  - 操作系统（macOS/Windows/Linux）
  - Project4 版本
  - Node.js 版本
- **截图/日志**：如果可能，提供截图或错误日志

**Bug 报告模板：**

```markdown
**描述**
简要描述 Bug

**复现步骤**
1. 打开 '...'
2. 点击 '...'
3. 滚动到 '...'
4. 看到错误

**预期行为**
应该发生什么

**截图**
如果适用，添加截图

**环境**
- OS: [例如 macOS 14.0]
- Project4 版本: [例如 1.1.3]
- Node.js 版本: [例如 20.10.0]
```

### 提出功能建议

我们欢迎新功能建议！请通过 [GitHub Issues](https://github.com/yourusername/project4/issues) 提交，并包含：

- **功能描述**：清晰描述你想要的功能
- **使用场景**：为什么需要这个功能？它解决什么问题？
- **替代方案**：你考虑过哪些替代方案？
- **附加信息**：任何其他相关信息

### 提交代码

#### 开发流程

1. **Fork 仓库**
   ```bash
   # 在 GitHub 上点击 Fork 按钮
   ```

2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/your-username/project4.git
   cd project4
   ```

3. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

4. **安装依赖**
   ```bash
   npm install
   npm run prepare:mac-arm64  # 或其他平台
   ```

5. **进行修改**
   - 遵循代码风格指南（见下文）
   - 添加必要的测试
   - 确保所有测试通过

6. **提交更改**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

7. **推送到你的 Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **创建 Pull Request**
   - 在 GitHub 上打开 Pull Request
   - 填写 PR 模板
   - 等待代码审查

#### Commit 规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>(<范围>): <描述>

[可选的正文]

[可选的脚注]
```

**类型：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新功能也不是 Bug 修复）
- `perf`: 性能优化
- `test`: 添加或修改测试
- `chore`: 构建过程或辅助工具的变动

**示例：**
```bash
feat(chat): 添加消息搜索功能
fix(windows): 修复 Git Bash 路径问题
docs(readme): 更新安装说明
refactor(agent): 优化 SDK 配置逻辑
```

#### 代码风格

- **TypeScript**: 使用 TypeScript 编写所有代码
- **格式化**: 代码会自动通过 ESLint 和 Prettier 格式化
- **命名规范**:
  - 文件名：`kebab-case.ts`
  - 组件：`PascalCase.tsx`
  - 函数/变量：`camelCase`
  - 常量：`UPPER_SNAKE_CASE`
  - 类型/接口：`PascalCase`

**示例：**
```typescript
// ✅ 好的
export interface UserConfig {
  apiKey: string
  baseUrl: string
}

export function getUserConfig(): UserConfig {
  // ...
}

// ❌ 不好的
export interface user_config {
  api_key: string
  base_url: string
}

export function get_user_config(): user_config {
  // ...
}
```

#### 测试要求

- 新功能必须包含测试
- Bug 修复应该包含回归测试
- 确保所有测试通过：
  ```bash
  npm test
  ```

#### Pull Request 检查清单

在提交 PR 之前，请确保：

- [ ] 代码遵循项目的代码风格
- [ ] 已添加必要的测试
- [ ] 所有测试通过
- [ ] 已更新相关文档
- [ ] Commit 信息遵循规范
- [ ] PR 描述清晰，说明了改动内容和原因

### 改进文档

文档改进同样重要！你可以：

- 修正拼写或语法错误
- 改进现有文档的清晰度
- 添加缺失的文档
- 翻译文档到其他语言

文档位于：
- `README.md` - 项目主文档
- `docs/` - 详细文档
- 代码注释

## 开发环境设置

### 必需工具

- Node.js 20+
- Git
- 代码编辑器（推荐 VS Code）

### 推荐的 VS Code 扩展

- ESLint
- Prettier
- TypeScript and JavaScript Language Features

### 项目结构

```
project4/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── bootstrap/  # 启动逻辑
│   │   ├── ipc/        # IPC 处理器
│   │   └── services/   # 业务服务
│   ├── renderer/       # React 前端
│   │   ├── components/ # UI 组件
│   │   ├── stores/     # Zustand 状态管理
│   │   └── api/        # API 调用
│   ├── preload/        # 预加载脚本
│   └── shared/         # 共享代码
├── resources/          # 平台资源
├── scripts/            # 构建脚本
└── tests/              # 测试文件
```

### 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建应用

# 测试
npm test                 # 运行所有测试
npm run test:unit        # 单元测试
npm run test:e2e         # E2E 测试

# 代码质量
npm run lint             # 运行 ESLint
npm run format           # 格式化代码

# 国际化
npm run i18n:extract     # 提取翻译文本
npm run i18n:translate   # 翻译文本
```

## 发布流程

发布由维护者负责，流程如下：

1. 更新版本号（`package.json`）
2. 更新 `CHANGELOG.md`
3. 创建 Git tag
4. 推送到 GitHub
5. GitHub Actions 自动构建和发布

## 获得帮助

如果你有任何问题：

- 查看 [文档](./docs/)
- 搜索 [已有 Issues](https://github.com/yourusername/project4/issues)
- 在 [Discussions](https://github.com/yourusername/project4/discussions) 提问
- 发送邮件到 your-email@example.com

## 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。

---

再次感谢你的贡献！🎉
