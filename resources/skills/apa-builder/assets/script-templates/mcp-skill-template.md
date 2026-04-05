---
name: {{SKILL_NAME}}
description: "{{DESCRIPTION}}（MCP 降级模式，在脚本失败时使用）"
---

## 操作步骤

1. 使用 playwright MCP 打开目标网站
2. 截图检查是否需要登录，如需则等待用户手动完成
3. {{STEP_3}}
4. {{STEP_4}}
5. 截图并提取结果

## 参数

- `{{PARAM_NAME}}`: 必填，{{PARAM_DESCRIPTION}}

## 注意事项

- 此 skill 是 {{SKILL_NAME}} 的降级兜底方案
- 当主脚本执行失败时自动触发
- 成功执行后，AI 会更新主脚本以修复问题
