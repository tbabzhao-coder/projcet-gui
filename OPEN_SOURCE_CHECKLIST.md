# 开源准备检查清单

本文档用于确保项目在开源前已完成所有必要的准备工作。

## ✅ 已完成

### 基础文档
- [x] **README.md** - 项目介绍、安装说明、使用指南（中文版）
- [x] **LICENSE** - MIT 许可证
- [x] **CONTRIBUTING.md** - 贡献指南
- [x] **CODE_OF_CONDUCT.md** - 行为准则
- [x] **CHANGELOG.md** - 版本更新日志

### GitHub 配置
- [x] **.github/ISSUE_TEMPLATE/** - Issue 模板（Bug、功能建议、提问）
- [x] **.github/pull_request_template.md** - PR 模板
- [x] **.github/workflows/ci.yml** - CI/CD 自动化
- [x] **.github/FUNDING.yml** - 赞助配置（可选）

### 代码质量
- [x] **.gitignore** - 排除敏感文件和大文件
- [x] **package.json** - 仓库信息、关键词

### 安全检查
- [x] 无 API Key 泄露
- [x] 无敏感配置文件提交
- [x] 大文件（Python、Git Bash）已排除

## ⚠️ 需要手动完成

### 1. 更新 README.md 中的占位符

需要替换以下内容：

```markdown
# 在 README.md 中
- [ ] 将 `https://github.com/yourusername/project4` 替换为实际仓库地址
- [ ] 将 `your-email@example.com` 替换为实际联系邮箱
```

### 2. 更新 CONTRIBUTING.md 中的占位符

```markdown
# 在 CONTRIBUTING.md 中
- [ ] 将 `https://github.com/yourusername/project4` 替换为实际仓库地址
- [ ] 将 `your-email@example.com` 替换为实际联系邮箱
```

### 3. 更新 CODE_OF_CONDUCT.md 中的联系方式

```markdown
# 在 CODE_OF_CONDUCT.md 中
- [ ] 将 `your-email@example.com` 替换为实际联系邮箱
```

### 4. 更新 LICENSE 中的版权信息（可选）

```markdown
# 在 LICENSE 中
- [ ] 将 `Project4 Team` 替换为你的真实姓名或组织名
```

### 5. GitHub 仓库设置

登录 GitHub，在仓库设置中完成：

- [ ] **About** - 添加项目描述和网站链接
- [ ] **Topics** - 添加标签：`ai`, `claude`, `productivity`, `electron`, `mcp`
- [ ] **Features** - 启用 Issues、Discussions、Wiki（可选）
- [ ] **Branches** - 设置 `master` 为默认分支，启用分支保护规则
- [ ] **Releases** - 创建第一个 Release（v1.1.3）

### 6. 添加项目截图/演示

- [ ] 在 `docs/` 目录下添加截图
- [ ] 录制演示视频或 GIF
- [ ] 在 README.md 中引用截图

### 7. 社交媒体预览图

- [ ] 创建 1200x630 的社交媒体预览图
- [ ] 在 GitHub 仓库设置中上传

### 8. 检查 CI/CD 工作流

- [ ] 确保 GitHub Actions 有足够的权限
- [ ] 测试 CI 工作流是否正常运行
- [ ] 检查构建产物是否正确

### 9. 准备首次发布

- [ ] 确认版本号（当前 1.1.3）
- [ ] 准备 Release Notes
- [ ] 构建各平台安装包
- [ ] 创建 GitHub Release

### 10. 宣传推广（可选）

- [ ] 在 Twitter/X 上发布
- [ ] 在 Reddit r/programming 发布
- [ ] 在 Hacker News 发布
- [ ] 在 V2EX 发布
- [ ] 在掘金/思否发布

## 📝 快速替换命令

在项目根目录执行以下命令，一键替换占位符：

```bash
# 替换仓库地址（macOS/Linux）
find . -type f \( -name "*.md" -o -name "*.yml" \) -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' 's|https://github.com/yourusername/project4|https://github.com/tbabzhao-coder/projcet-gui|g' {} +

# 替换邮箱地址（macOS/Linux）
find . -type f \( -name "*.md" -o -name "*.yml" \) -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' 's|your-email@example.com|your-actual-email@example.com|g' {} +
```

**Windows PowerShell:**

```powershell
# 替换仓库地址
Get-ChildItem -Recurse -Include *.md,*.yml | Where-Object { $_.FullName -notmatch 'node_modules|\.git' } | ForEach-Object {
    (Get-Content $_.FullName) -replace 'https://github.com/yourusername/project4', 'https://github.com/tbabzhao-coder/projcet-gui' | Set-Content $_.FullName
}

# 替换邮箱地址
Get-ChildItem -Recurse -Include *.md,*.yml | Where-Object { $_.FullName -notmatch 'node_modules|\.git' } | ForEach-Object {
    (Get-Content $_.FullName) -replace 'your-email@example.com', 'your-actual-email@example.com' | Set-Content $_.FullName
}
```

## 🎉 完成后

所有检查项完成后，你的项目就可以正式开源了！

记得在 GitHub 仓库页面点击 "Make public"（如果当前是私有仓库）。

---

**最后提醒：**

1. 确保没有提交任何敏感信息（API Key、密码、私钥）
2. 检查 `.gitignore` 是否正确配置
3. 运行 `git log` 检查历史提交，确保没有敏感信息
4. 如果有敏感信息，使用 `git filter-branch` 或 BFG Repo-Cleaner 清理

祝你的开源项目成功！🚀
