# 验证规则参考

APA Builder 验证循环的参考文档。生成脚本后、验证阶段时加载。

## 1. 结构化输出格式

脚本通过 stdout/stderr 输出结构化标记，便于自动解析：

```
[APA:STEP:N] 步骤描述        — 标记第 N 步开始执行
[APA:RESULT] {"key":"value"}  — 最终结果（JSON 格式）
[APA:ERROR:N] 错误描述        — 第 N 步出错（输出到 stderr）
```

规则：
- 每个标记必须在行首，独占一行
- `[APA:ERROR:N]` 会设置 `process.exitCode = 1`，但脚本继续执行后续步骤（收集更多诊断信息）
- 关键步骤（登录、导航）失败时应 `process.exit(1)` 提前退出，因为后续步骤依赖它
- 截图保存到 `APA_SCREENSHOT_DIR` 环境变量指定的目录，文件名 `step-N.png`

## 2. 验收契约

在生成脚本前与用户确认的可测试标准。保存到 `~/.project4/skills/[name]/contract.json`。

格式：

```json
{
  "criteria": [
    {
      "id": 1,
      "description": "成功登录或复用登录态",
      "verifyMethod": "screenshot",
      "stepNum": 2
    },
    {
      "id": 2,
      "description": "搜索返回结果列表",
      "verifyMethod": "screenshot",
      "stepNum": 3
    },
    {
      "id": 3,
      "description": "提取到至少 1 条数据",
      "verifyMethod": "output",
      "stepNum": 4
    }
  ]
}
```

verifyMethod 说明：
- `screenshot` — 用 Read 工具读取 `step-N.png` 截图，视觉判断页面状态
- `output` — 检查 `[APA:RESULT]` 输出是否包含预期数据
- `exitCode` — 检查脚本退出码是否为 0

## 3. 截图验证指南

脚本在每个关键步骤自动截图（成功和失败都截），保存到 `APA_SCREENSHOT_DIR/step-N.png`。

验证时用 Read 工具读取截图文件，检查：

1. **页面是否正确加载** — 不是空白页、不是错误页、不是 404
2. **是否在预期页面** — URL 和页面内容与步骤描述匹配
3. **操作是否生效** — 搜索结果出现、表单提交成功、数据显示正确
4. **无异常弹窗** — 没有验证码、没有错误提示、没有登录弹窗

对每条验收标准打 PASS 或 FAIL，附具体原因。

## 4. 常见失败模式

### Selector 过期
- 症状：`[APA:ERROR:N] Element not found` + 截图显示页面正常但元素位置/属性变了
- 诊断：读截图，对比预期的元素位置
- 修复：根据截图中可见的文本/属性生成新 selector（优先用 `text=`、`[data-testid=]`、`[name=]`）

### Session 失效
- 症状：`[APA:ERROR:1]` 或 `[APA:ERROR:2]` + 截图显示登录页
- 诊断：storage.json 过期或被清除
- 修复：不是脚本 bug，提示用户重新录制登录态

### 接口变更
- 症状：接口返回 404/500 或响应结构变化
- 诊断：检查 `[APA:ERROR]` 中的 HTTP 状态码和响应内容
- 修复：更新接口 URL 或参数格式

### 反爬/验证码
- 症状：截图显示验证码页面或 403 错误
- 诊断：目标网站检测到自动化访问
- 修复：无法自动修复，告知用户。建议切换到页面模式或降低访问频率

### 动态 Token
- 症状：接口返回 401/403，请求中缺少有效 token
- 诊断：token 由前端 JS 动态生成，接口模式无法获取
- 修复：将该步骤从接口模式改为 Playwright 页面操作

### 页面加载超时
- 症状：`[APA:ERROR:N] Timeout` + 截图显示页面未完全加载
- 诊断：网络慢或页面有大量异步内容
- 修复：增加 timeout 值，或添加 `waitForLoadState('networkidle')`

## 5. 修复循环协议

最多 3 轮修复，每轮：

1. **收集证据**：所有 FAIL 项 + `[APA:ERROR]` 输出 + 对应截图
2. **分析原因**：对照上面的失败模式表，确定根因
3. **生成修复**：只修改失败的步骤，不重写整个脚本
4. **更新脚本**：用 Write 工具直接修改脚本文件
5. **重新验证**：用 Bash 重新运行脚本，重复 Phase 1 + Phase 2

3 轮后仍有失败：
- 报告哪些步骤通过、哪些失败
- 给出具体的失败原因和建议
- **不降级到 MCP 执行**
