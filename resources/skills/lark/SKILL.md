---
name: lark
description: "飞书/Lark 工作台集成：通过 lark-cli 操作飞书全产品线。支持即时通讯、日历、云文档、电子表格、多维表格、云空间、邮件、任务、视频会议、知识库、白板、审批等。当用户需要操作飞书（发消息、查日程、建文档、管理任务等）时触发。"
metadata:
  requires:
    bins: ["lark-cli"]
  cliHelp: "lark-cli --help"
---

# lark-cli 飞书集成

lark-cli 是飞书/Lark 开放平台的命令行工具，支持以下业务域：

| 域 | 命令前缀 | 典型操作 |
|----|---------|---------|
| 即时通讯 | `lark-cli im` | 发消息、搜索聊天记录、管理群聊 |
| 日历 | `lark-cli calendar` | 查日程、创建会议、查忙闲 |
| 云文档 | `lark-cli doc` | 创建/编辑文档 |
| 电子表格 | `lark-cli sheets` | 读写表格数据 |
| 多维表格 | `lark-cli base` | 创建表格、管理字段和记录 |
| 云空间 | `lark-cli drive` | 上传下载文件、管理文件夹 |
| 邮件 | `lark-cli mail` | 发送邮件、管理邮箱 |
| 任务 | `lark-cli task` | 创建/管理任务 |
| 视频会议 | `lark-cli vc` | 管理会议、查看录制 |
| 知识库 | `lark-cli wiki` | 管理知识空间和节点 |
| 白板 | `lark-cli whiteboard` | 创建和管理白板 |
| 审批 | `lark-cli approval` | 查看和管理审批流程 |
| 会议纪要 | `lark-cli minutes` | 查看会议纪要 |
| 通讯录 | `lark-cli contact` | 搜索用户 |

## 使用规则

1. **首次使用前**：必须先读取 [references/lark-shared.md](references/lark-shared.md) 了解配置和认证流程
2. **执行具体操作前**：先用 Read 工具读取对应域的 reference 文档（如 `references/lark-calendar.md`），了解可用的 Shortcuts 和 API
3. **优先使用 Shortcuts**：每个域都提供了高频操作的快捷命令（以 `+` 开头），比直接调用 API 更简洁
4. **身份选择**：`--as user` 访问用户资源，`--as bot` 执行应用级操作。大多数场景用 user
5. **写入操作前确认**：发消息、创建文档、删除等操作前必须确认用户意图
6. **禁止输出密钥**：不要在终端明文输出 appSecret、accessToken

## 快速示例

```bash
# 查看今天日程
lark-cli calendar +agenda

# 发送消息
lark-cli im +messages-send --chat-id oc_xxx --text "Hello"

# 创建文档
lark-cli doc +create --folder-token xxx --title "新文档"

# 搜索用户
lark-cli contact +search --query "张三"
```

## Reference 文档索引

详细命令参考请按需读取 `references/` 目录下的文档：

| 文件 | 内容 |
|------|------|
| `lark-shared.md` | 配置初始化、认证、权限处理、安全规则（必读） |
| `lark-im.md` | 即时通讯：消息收发、群聊管理 |
| `lark-calendar.md` | 日历：日程管理、忙闲查询、时间推荐 |
| `lark-doc.md` | 云文档：文档创建和编辑 |
| `lark-sheets.md` | 电子表格：数据读写 |
| `lark-base.md` | 多维表格：表格、字段、记录管理 |
| `lark-drive.md` | 云空间：文件上传下载、文件夹管理 |
| `lark-mail.md` | 邮件：发送和管理邮件 |
| `lark-task.md` | 任务：任务创建和管理 |
| `lark-vc.md` | 视频会议：会议管理 |
| `lark-wiki.md` | 知识库：知识空间管理 |
| `lark-whiteboard.md` | 白板：白板创建和管理 |
| `lark-approval.md` | 审批：审批流程管理 |
| `lark-minutes.md` | 会议纪要：纪要查看 |
| `lark-contact.md` | 通讯录：用户搜索 |
| `lark-event.md` | 事件管理 |
| `lark-openapi-explorer.md` | OpenAPI 探索工具 |
| `lark-skill-maker.md` | Skill 创建工具 |
| `lark-workflow-meeting-summary.md` | 会议总结工作流 |
| `lark-workflow-standup-report.md` | 站会报告工作流 |
