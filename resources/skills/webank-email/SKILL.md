# WeBank Enterprise Email Skill

微众银行企业邮箱收发技能，支持 IMAP 收件和 SMTP 发件。

## 服务器配置（已内置）

| 协议 | 服务器 | 端口 | 加密 |
|------|--------|------|------|
| IMAP | imap.webank.com | 993 | TLS |
| SMTP | smtp.webank.com | 465 | SSL |

## 首次使用：凭证配置

**每次使用邮件功能前，必须先检查凭证状态。**

运行以下命令检查：

```bash
node {{SKILL_PATH}}/scripts/config.js status
```

如果返回 `{"configured": false}`，你需要：

1. 告知用户："首次使用邮件功能，需要配置你的微众邮箱账号。请提供你的邮箱地址和密码。密码将使用 AES-256-GCM 加密存储在本地，不会上传到任何服务器。"
2. 等待用户提供邮箱和密码
3. 运行保存命令（注意密码中可能包含特殊字符，用引号包裹）：

```bash
node {{SKILL_PATH}}/scripts/config.js save --email "用户邮箱" --password "用户密码"
```

4. 保存成功后，继续执行用户的邮件操作

## 可用命令

所有脚本位于 `{{SKILL_PATH}}/scripts/` 目录下。

### 查看收件箱

```bash
# 查看未读邮件（默认最多20封）
node {{SKILL_PATH}}/scripts/imap.js check

# 查看今天的邮件
node {{SKILL_PATH}}/scripts/imap.js check --since today

# 查看指定日期以来的邮件
node {{SKILL_PATH}}/scripts/imap.js check --since 2026-04-01

# 查看指定文件夹、限制数量
node {{SKILL_PATH}}/scripts/imap.js check --folder "Sent Messages" --limit 10
```

### 读取邮件正文

```bash
# 通过 UID 读取邮件详情
node {{SKILL_PATH}}/scripts/imap.js fetch --uid 12345

# 读取其他文件夹中的邮件
node {{SKILL_PATH}}/scripts/imap.js fetch --uid 12345 --folder "Sent Messages"
```

### 搜索邮件

```bash
# 按关键词搜索
node {{SKILL_PATH}}/scripts/imap.js search --keyword "月报"

# 按发件人搜索
node {{SKILL_PATH}}/scripts/imap.js search --from "zhangsan@webank.com"

# 组合条件
node {{SKILL_PATH}}/scripts/imap.js search --from "zhangsan@webank.com" --since 2026-04-01 --keyword "审批"
```

### 下载附件

```bash
# 下载邮件附件到指定目录
node {{SKILL_PATH}}/scripts/imap.js download --uid 12345 --output "/path/to/save"
```

### 标记已读

```bash
node {{SKILL_PATH}}/scripts/imap.js mark-read --uid 12345
```

### 列出文件夹

```bash
node {{SKILL_PATH}}/scripts/imap.js list-folders
```

### 发送邮件

```bash
# 发送纯文本邮件
node {{SKILL_PATH}}/scripts/smtp.js send --to "recipient@webank.com" --subject "邮件标题" --body "邮件正文"

# 发送给多人并抄送
node {{SKILL_PATH}}/scripts/smtp.js send --to "a@webank.com,b@webank.com" --cc "c@webank.com" --subject "标题" --body "正文"

# 发送 HTML 邮件
node {{SKILL_PATH}}/scripts/smtp.js send --to "recipient@webank.com" --subject "标题" --body "<h1>标题</h1><p>正文</p>" --html

# 发送带附件的邮件
node {{SKILL_PATH}}/scripts/smtp.js send --to "recipient@webank.com" --subject "标题" --body "请查收附件" --attachments "/path/file1.xlsx,/path/file2.pdf"
```

### 凭证管理

```bash
# 查看凭证状态
node {{SKILL_PATH}}/scripts/config.js status

# 更新凭证
node {{SKILL_PATH}}/scripts/config.js save --email "new@webank.com" --password "新密码"

# 删除已保存的凭证
node {{SKILL_PATH}}/scripts/config.js delete
```

## 使用规则

1. **安全第一**：绝不在对话中回显用户密码，即使用户主动提供了也不要在回复中重复
2. **凭证检查**：每次对话中首次涉及邮件操作时，先 `config.js status` 检查凭证，未配置则引导用户输入
3. **摘要优先**：查看邮件列表时，先展示摘要信息（发件人、主题、日期），用户要求时才读取正文
4. **确认发送**：发送邮件前，务必向用户确认收件人、主题和正文内容
5. **错误处理**：连接失败时检查网络，认证失败时提示用户更新密码（`config.js save`）
6. **特殊字符**：命令行参数中如有特殊字符，使用双引号包裹
