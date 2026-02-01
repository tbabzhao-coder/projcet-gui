---
name: workorder-system
---

# 工单系统 Skill

## Description

工单系统操作能力：查询待办工单、提取工单详细信息、查看工单状态、按业务类型分组导出工单数据。支持智能登录检测，自动等待用户登录，无需手动确认。支持多种业务类型，自动识别并生成对应格式的 CSV 文件。

## 系统能力

这个 skill 提供工单系统的以下能力：

### 核心功能

1. **查询待办工单** - 获取所有待处理的工单列表
2. **提取工单详情** - 提取每个工单的完整信息
3. **解除敏感信息掩码** - 自动点击小眼睛按钮显示完整数据
4. **按业务类型分组** - 自动识别业务类型并分组
5. **智能导出数据** - 根据业务类型生成不同格式的 CSV 文件
6. **英文文件命名** - 使用英文文件名，便于系统处理

### 支持的工单类型

- **贷款产品取消额度** - 包含产品字段（最多 10 个产品）
- **定期贷款解锁** - 包含借据号字段（最多 10 个借据号）
- **企业贷工单**（含老个贷）
- **新个贷工单**
- **其他业务类型工单**

### 可提取的工单字段

#### 通用字段

- 任务单编号
- 业务类型
- 产品类型
- 企业名称/客户名称
- CCIF（对公客户编号）
- ECIF（个人客户编号）
- 核身通过状态
- 数据类型（企业/个人）

#### 贷款产品取消额度专用字段

- 产品 1 ~ 产品 10（最多 10 个产品）

#### 定期贷款解锁专用字段

- 借据号 1 ~ 借据号 10（最多 10 个借据号）

## Usage

当用户需要从工单系统获取数据时，自动调用此 skill。

## Trigger Phrases

用户可以用以下自然语言触发此 skill：

- "查询工单系统的待办工单"
- "提取工单数据"
- "从工单系统获取所有待办任务"
- "导出工单列表"
- "查看待办工单"
- "获取工单系统数据"
- "帮我提取工单信息"

## Instructions

你是一个工单系统操作助手。当用户请求从工单系统获取数据时，按照以下步骤执行：

**重要提示**：

- 所有文件生成（JSON、CSV、报告）都自动完成，无需询问用户
- 完成后直接向用户展示提取结果汇总即可
- **使用 Playwright MCP 工具时，必须遵循正确的参数格式**（见下方工具使用说明）

## ⚠️ 关键：Playwright MCP 工具正确用法（必读）

### 快速参考

**`browser_run_code` 工具**：
```json
{
  "code": "完整的 JavaScript 代码字符串，使用 \\n 分隔多行"
}
```

**`browser_evaluate` 工具**：
```json
{
  "function": "() => { return document.title; }",
  "args": []  // 可选
}
```

### 常见错误

❌ **错误 1**：直接写代码
```javascript
// 这样会报错：SyntaxError: Unexpected token 'async'
async function checkLogin() {
  const url = page.url();
}
```

✅ **正确**：代码放在字符串中
```json
{
  "code": "const url = page.url();\nconst title = await page.title();\nreturn { url, title };"
}
```

❌ **错误 2**：`browser_evaluate` 参数错误
```json
{
  "function": undefined  // 会报错：expected string, received undefined
}
```

✅ **正确**：
```json
{
  "function": "() => { return document.title; }"
}
```

## Playwright MCP 工具使用说明

### `browser_run_code` 工具

**正确用法**：传递一个字符串参数 `code`，包含完整的 JavaScript 代码

```javascript
// ✅ 正确：使用 code 参数传递字符串
{
  "code": "await page.goto('http://example.com');\nawait page.waitForLoadState('networkidle');"
}

// ❌ 错误：直接写代码（会导致语法错误）
async function checkLoginStatus() { ... }  // 这样会报错
```

**重要规则**：
- 代码必须是**字符串格式**，放在 `code` 参数中
- 代码中可以使用 `page` 对象（Playwright Page 实例）
- 代码中可以使用 `await` 和 `async`，但整个代码块必须是字符串
- 多行代码用 `\n` 分隔

**示例**：
```javascript
// 检测登录状态
{
  "code": "const url = page.url();\nconst title = await page.title();\nconst isLoggedIn = !url.includes('/pmbank-um/') && !title.includes('统一登录平台');\nreturn isLoggedIn;"
}
```

### `browser_evaluate` 工具

**正确用法**：传递一个函数字符串到 `function` 参数

```javascript
// ✅ 正确：使用 function 参数传递函数字符串
{
  "function": "() => { return document.title; }"
}

// ✅ 正确：带参数的函数
{
  "function": "(el) => { return el.innerText; }",
  "args": [{"uid": "element-uid-123"}]
}

// ❌ 错误：直接传代码或 undefined
{
  "function": undefined  // 会报错 "expected string, received undefined"
}
```

### 步骤 1：自动检测并等待登录

1. **使用 Playwright MCP 导航到工单系统登录页面**：

   使用 `mcp__playwright__browser_navigate` 工具：
   ```
   URL: http://k.test-adm.weoa.com/pmbank-um/index.html?target=https%3A%2F%2Fk.test-adm.weoa.com%2Fs%2Frcs-ucsportalweb%2F%23%2F%3Fsso_ticket%3Df4cd540a7c30169660eb64c48fbef16346b4fd98ee177462921b183dbafbd265%26
   ```

2. **自动检测登录状态**：

   使用 `mcp__playwright__browser_run_code` 工具，**正确格式**：
   ```javascript
   {
     "code": "const url = page.url();\nconst title = await page.title();\nconst hasLoginForm = (await page.locator('input[type=\"password\"], button:has-text(\"登\")').count()) > 0;\nconst hasMainUI = (await page.locator('text=Welcome!, text=工单系统').count()) > 0;\nconst isLoggedIn = !url.includes('/pmbank-um/') && !title.includes('统一登录平台') && !hasLoginForm && hasMainUI;\nreturn { isLoggedIn, url, title };"
   }
   ```

   - 检查页面 URL 是否包含 `/pmbank-um/` 或 `login`（未登录标志）
   - 检查页面标题是否包含"统一登录平台"（未登录标志）
   - 检查是否存在登录表单：`input[type="password"]` 或 `button:has-text("登")`（未登录标志）
   - 检查是否存在主界面元素：`text=Welcome!` 或 `text=工单系统`（已登录标志）

3. **如果未登录**：

   - 输出提示："⏳ 等待用户登录工单系统..."
   - 输出提示："💡 提示：请在浏览器中完成登录操作"
   - 每隔 3 秒使用 `browser_run_code` 重新检测一次登录状态（使用上面的代码）
   - 最多等待 5 分钟（300 秒）
   - 检测到登录成功后，输出："✅ 检测到用户已登录"
   - **智能等待主界面完全加载**（使用 `browser_run_code`）：
     ```javascript
     {
       "code": "await page.waitForLoadState('networkidle');\nawait page.locator('svg').first().waitFor({ state: 'visible', timeout: 10000 });\nlet stableCount = 0;\nlet lastSize = 0;\nfor (let i = 0; i < 10; i++) {\n  await new Promise(resolve => setTimeout(resolve, 500));\n  const currentSize = (await page.evaluate(() => document.body.innerHTML.length));\n  if (currentSize === lastSize) {\n    stableCount++;\n    if (stableCount >= 3) break;\n  } else {\n    stableCount = 0;\n  }\n  lastSize = currentSize;\n}\nawait new Promise(resolve => setTimeout(resolve, 1000));\nreturn '主界面加载完成';"
     }
     ```
   - 输出："✅ 主界面加载完成"
   - 自动继续执行后续步骤

4. **如果已登录**：
   - 输出："✅ 已登录工单系统"
   - 执行相同的智能等待主界面加载流程（使用上面的 `browser_run_code`）
   - 输出："✅ 主界面加载完成"
   - 直接继续执行后续步骤

### 步骤 2：进入待处理任务页面（带重试机制）

**重要：所有关键点击操作都使用带重试机制的代码，通过 `browser_run_code` 执行**

1. **点击顶部 SVG 图标**（最多重试 1 次）：

   使用 `mcp__playwright__browser_run_code` 工具，**正确格式**：
   ```javascript
   {
     "code": "async function clickWithRetry(selector, maxRetries = 1) { for (let i = 0; i <= maxRetries; i++) { try { await page.locator(selector).first().waitFor({ state: 'visible', timeout: 2000 }); await page.locator(selector).first().waitFor({ state: 'attached', timeout: 2000 }); await page.locator(selector).first().click({ timeout: 2000 }); return true; } catch (e) { if (i === maxRetries) throw e; await new Promise(resolve => setTimeout(resolve, 2000)); } } } await clickWithRetry('svg'); await new Promise(resolve => setTimeout(resolve, 1000)); return '点击成功';"
   }
   ```

2. **点击 `.top-header-item`**（最多重试 1 次）：

   使用相同的重试逻辑（上面的代码，将选择器改为 `.top-header-item`）：
   ```javascript
   {
     "code": "async function clickWithRetry(selector, maxRetries = 1) { for (let i = 0; i <= maxRetries; i++) { try { await page.locator(selector).first().waitFor({ state: 'visible', timeout: 2000 }); await page.locator(selector).first().waitFor({ state: 'attached', timeout: 2000 }); await page.locator(selector).first().click({ timeout: 2000 }); return true; } catch (e) { if (i === maxRetries) throw e; await new Promise(resolve => setTimeout(resolve, 2000)); } } } await clickWithRetry('.top-header-item'); await new Promise(resolve => setTimeout(resolve, 1000)); return '点击成功';"
   }
   ```

3. **点击"工单系统（企金）"**（最多重试 1 次）：

   使用相同的重试逻辑，然后等待页面加载：
   ```javascript
   {
     "code": "async function clickWithRetry(selector, maxRetries = 1) { for (let i = 0; i <= maxRetries; i++) { try { await page.locator(selector).first().waitFor({ state: 'visible', timeout: 2000 }); await page.locator(selector).first().waitFor({ state: 'attached', timeout: 2000 }); await page.locator(selector).first().click({ timeout: 2000 }); return true; } catch (e) { if (i === maxRetries) throw e; await new Promise(resolve => setTimeout(resolve, 2000)); } } } await clickWithRetry('text=工单系统（企金）'); await page.waitForLoadState('networkidle'); await new Promise(resolve => setTimeout(resolve, 2000)); return '点击成功，iframe 已加载';"
   }
   ```

4. **在 iframe 中点击"待处理任务"**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); await frame.locator('text=待处理任务').first().click({ timeout: 3000 }); await page.waitForLoadState('networkidle'); await new Promise(resolve => setTimeout(resolve, 1000)); return '已进入待处理任务页面';"
   }
   ```

**关键优化点**：

- ✅ 在关键步骤后使用 `waitForLoadState('networkidle')` 确保页面加载完成

### 步骤 3：获取分页信息

1. **读取分页信息**：
   使用 `mcp__playwright__browser_run_code` 工具：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const paginationText = await frame.locator('.ant-pagination-total-text').textContent(); const match = paginationText.match(/共\\s*(\\d+)\\s*条，共\\s*(\\d+)\\s*页/); const totalPages = match ? parseInt(match[2]) : 1; return { totalPages, paginationText };"
   }
   ```
   - 从"共 X 条，共 Y 页"中提取页数
   - 如果获取失败，假设只有 1 页

### 步骤 4：遍历所有页面和工单(使用`extractAllWorkOrders`函数)

**重要：使用正确的元素定位器和完整的返回列表流程**

#### 4.1 遍历所有页面

对于每一页：

1. **如果不是第一页，跳转到指定页**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); try { await frame.locator(`.ant-pagination-item-${currentPage}`).click(); } catch (e) { await frame.locator('.ant-pagination-next:not(.ant-pagination-disabled)').click(); } await page.waitForLoadState('networkidle'); await new Promise(resolve => setTimeout(resolve, 1000)); return '已跳转到第 ' + currentPage + ' 页';"
   }
   ```
   - 优先使用页码按钮，备选方案：点击"下一页"按钮
   - 等待 `page.waitForLoadState('networkidle')`
   - 额外等待 1 秒

2. **获取当前页的工单数量**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const count = await frame.locator('tr.ant-table-row').count(); return count;"
   }
   ```

#### 4.2 遍历当前页的每个工单

对于每个工单：

1. **点击工单编号链接**：
   使用 `mcp__playwright__browser_run_code` 工具：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const links = frame.locator('a.case-link'); const linkCount = await links.count(); if (i >= linkCount) throw new Error('工单索引超出范围'); await links.nth(i).click(); await new Promise(resolve => setTimeout(resolve, 1000)); await page.waitForLoadState('networkidle'); return '已点击工单链接';"
   }
   ```
   - **关键**：每次循环重新获取元素引用，避免元素引用失效
   - 等待 1 秒 + `waitForLoadState('networkidle')`

2. **获取任务单编号**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const taskId = await frame.locator('.fes-tabs-tab').filter({ hasText: /^E/ }).first().textContent(); return taskId.trim();"
   }
   ```
   - 从标签页标题获取，而不是从链接文本获取

3. **等待处理记录加载**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "await new Promise(resolve => setTimeout(resolve, 1500)); return '等待完成';"
   }
   ```

4. **点击"查看"按钮**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const viewButtons = frame.getByRole('button', { name: '查看', exact: true }); const count = await viewButtons.count(); if (count === 0) { return { found: false, error: '未找到查看按钮' }; } await viewButtons.nth(count - 1).click(); return { found: true };"
   }
   ```
   - **点击最后一个"查看"按钮**（页面可能有多个查看按钮）
   - 如果未找到查看按钮：
     - 记录为需要人工确认的工单
     - **关闭标签页**：使用 `browser_run_code` 执行关闭操作
     - 点击"待处理任务"返回列表
     - 跳过后续处理，继续下一个工单

5. **点击小眼睛按钮显示敏感信息**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const modal = frame.locator('.fes-modal-wrapper').filter({ hasText: '查看贷款信息记录' }).first(); const eyeButton = modal.locator('.fes-grid').first().locator('.fes-grid-item').nth(1).locator('button.fes-btn-type-link').first(); await eyeButton.click(); return '已点击小眼睛按钮';"
   }
   ```

6. **提取弹窗数据**：
   - 使用 `mcp__playwright__browser_evaluate` 工具提取数据，**正确格式**：
     ```javascript
     {
       "function": "(el) => { function cleanText(text) { if (!text) return text; text = text.replace(/^\\\"(.*)\\\"$/, '$1'); text = text.replace(/\\\"\\\"/g, '\\\"'); text = text.replace(/[\\t\\n\\r]/g, ''); text = text.trim(); text = text.replace(/^[\\\"'\\s]+|[\\\"'\\s]+$/g, ''); return text; } const labels = el.querySelectorAll('.fes-form-item-label'); const values = el.querySelectorAll('.fes-form-item-content'); const data = { taskId: '', businessType: '', productType: '', companyName: '', customerName: '', ccif: '', ecif: '', authPassed: '', products: [], loanNumbers: [], dataType: '' }; for (let i = 0; i < labels.length; i++) { const label = labels[i].textContent.trim().replace('：', '').replace(':', ''); const value = values[i].textContent.trim(); if (label.includes('业务类型')) data.businessType = value; else if (label.includes('产品类型')) data.productType = value; else if (label.includes('企业名称')) data.companyName = cleanText(value); else if (label.includes('客户名称') || label.includes('姓名')) data.customerName = cleanText(value); else if (label.includes('CCIF')) data.ccif = value; else if (label.includes('ECIF')) data.ecif = value; else if (label.includes('核身通过')) data.authPassed = value; else if (label.match(/产品\\d+/)) data.products.push(value); else if (label.match(/借据号\\d+/)) data.loanNumbers.push(value); } if (data.ccif) data.dataType = '企业'; else if (data.ecif) data.dataType = '个人'; return data; }",
       "args": [{"uid": "modal-element-uid"}]
     }
     ```
   - 提取：业务类型、产品类型、企业名称、客户名称（或姓名）、CCIF、ECIF、核身通过、产品 1-10、借据号 1-10
   - **重要**：客户名称字段可能是"客户名称"或"姓名"，需要同时尝试提取
   - **重要**：提取后立即清理企业名称和客户名称中的特殊字符（制表符、换行符、多余引号）

7. **关闭弹窗**：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); const modal = frame.locator('.fes-modal-wrapper').filter({ hasText: '查看贷款信息记录' }).first(); await modal.locator('.fes-modal-close').click(); await new Promise(resolve => setTimeout(resolve, 300)); return '弹窗已关闭';"
   }
   ```

8. **关闭标签页并返回列表**（关键步骤）：
   使用 `browser_run_code`：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); await frame.locator('div:nth-child(3) > .fes-tabs-tab-close').click(); await new Promise(resolve => setTimeout(resolve, 300)); await frame.locator('div').filter({ hasText: /^待处理任务$/ }).first().click(); await page.waitForLoadState('networkidle'); await new Promise(resolve => setTimeout(resolve, 500)); return '已返回列表';"
   }
   ```

#### 4.3 错误处理

如果处理工单时出错：

1. 记录错误信息和工单索引
2. **不递增 globalIndex**（避免索引跳跃）
3. **尝试返回列表**：
   使用 `browser_run_code`，包含错误处理：
   ```javascript
   {
     "code": "const frame = page.frameLocator('iframe'); try { await frame.locator('div:nth-child(3) > .fes-tabs-tab-close').click().catch(() => {}); } catch (e) {} try { await frame.locator('div').filter({ hasText: /^待处理任务$/ }).first().click(); await page.waitForLoadState('networkidle'); } catch (e) {} return '已尝试返回列表';"
   }
   ```
4. 继续处理下一个工单

### 步骤 5：按业务类型分组

自动识别业务类型并分组：

- 读取每个工单的"业务类型"字段
- 将相同业务类型的工单归为一组
- 支持的业务类型：
  - 贷款产品取消额度 → `workorders_cancel_credit_limit.csv`
  - 定期贷款解锁 → `workorders_unlock_term_loan.csv`
  - 其他类型 → `workorders_<type>.csv`

### 步骤 6：生成 CSV 文件

**重要：使用 `generate-csv.js` 脚本生成 CSV 文件**

根据业务类型生成不同格式的 CSV 文件，**列数根据实际数据动态生成**：

#### 使用方法

```bash
node .claude/skills/workorder-system/generate-csv.js workorders_raw.json [输出目录]
```

#### 功能特性

1. **动态列数生成**：

   - 自动检测实际数据中的最大产品数/借据号数
   - 只生成需要的列，避免空列
   - 例如：如果最多有 3 个借据号，只生成 3 列借据号

2. **数据清理**：

   - 自动清理企业名称中的特殊字符（制表符、换行符、多余引号等）
   - 去除前后空格
   - 确保数据格式统一

3. **文件命名**：
   - 贷款产品取消额度 → `workorders_cancel_credit_limit.csv`
   - 定期贷款解锁 → `workorders_unlock_term_loan.csv`

#### 贷款产品取消额度（动态列数）

基础列（9 列）+ 产品列（动态）+ 数据类型（1 列）

```csv
任务单编号,业务类型,产品类型,企业名称,客户名称,CCIF,ECIF,核身通过,产品1,[产品2,产品3,...],数据类型
```

**示例**：如果实际最多有 1 个产品，则生成 10 列

#### 定期贷款解锁（动态列数）

基础列（9 列）+ 借据号列（动态）+ 数据类型（1 列）

```csv
任务单编号,业务类型,产品类型,企业名称,客户名称,CCIF,ECIF,核身通过,借据号1,[借据号2,借据号3,...],数据类型
```

**示例**：如果实际最多有 3 个借据号，则生成 12 列

### 步骤 7：输出结果

**自动生成报告和文件，无需询问用户**

1. 自动保存原始 JSON 数据到 `workorders_raw.json`
2. 自动生成 CSV 文件（按业务类型分组）
3. 自动生成工单提取报告 `工单提取报告.txt`，包含：
   - 总工单数
   - 各业务类型的工单数量
   - 生成的 CSV 文件列表（文件名、记录数、文件路径）
   - 需要人工确认的工单列表（如有）
   - 优化效果验证信息

## Configuration

```javascript
const config = {
  loginUrl:
    "http://k.test-adm.weoa.com/pmbank-um/index.html?target=https%3A%2F%2Fk.test-adm.weoa.com%2Fs%2Frcs-ucsportalweb%2F%23%2F%3Fsso_ticket%3Df4cd540a7c30169660eb64c48fbef16346b4fd98ee177462921b183dbafbd265%26",
  systemName: "工单系统（企金）",
  outputPath: "/Users/tbab/Desktop/develop/project4/orderSystem/",
  loginCheckInterval: 3000, // 登录检测间隔（毫秒）
  maxLoginWaitTime: 300000, // 最大等待登录时间（5分钟）
  pageTimeout: 10000, // 页面操作超时时间（毫秒）
  clickRetryCount: 3, // 点击操作最大重试次数
  postLoginWaitTime: 3000, // 登录后额外等待时间（毫秒）
  iframeLoadWaitTime: 2000, // iframe 加载等待时间（毫秒）
};
```

## Error Handling

- 如果登录超时，提示用户并继续尝试
- **如果某个工单提取失败**：
  - 记录错误信息和工单索引
  - **不递增 globalIndex**（避免索引跳跃）
  - **尝试关闭标签页**：使用 `.catch(() => {})` 忽略错误
  - 点击"待处理任务"返回工单列表
  - 等待 `page.waitForLoadState('networkidle')`
  - 继续处理下一个工单
- 如果页面跳转失败，尝试重新导航
- **如果关键点击操作失败**（顶部菜单、工单系统入口等）：
  - 自动重试最多 1 次
  - 每次重试前等待 2 秒
  - 如果达到最大重试次数，抛出错误并终止执行
- 所有错误都要记录到日志中

### 已知问题

1. **工单提取遗漏问题**：
   - 某些工单在提取时可能因为页面加载问题或元素定位失败而被跳过
   - 脚本已优化索引管理：只有成功提取数据后才递增索引
   - 建议：提取完成后对比预期数量和实际数量，如有遗漏需重新提取

## Output Format

输出 CSV 文件，包含所有提取的工单数据，格式如下：

```csv
任务单编号,业务类型,产品类型,企业名称,客户名称,CCIF,ECIF,核身通过,产品1,产品2,产品3,产品4,数据类型
E1234567890,贷款产品取消额度,企业贷（含老个贷）,测试公司,,9999960003313291,,是,企业贷,,,,企业
```

## Technical Implementation

- 使用 Playwright MCP 的 `browser_run_code` 工具执行复杂的自动化逻辑
- 在 iframe 中操作时，使用 `page.frameLocator('iframe')`
- 小眼睛按钮的定位：`.fes-modal-wrapper .fes-grid .fes-grid-item:nth-child(2) button.fes-btn-type-link`
- 弹窗关闭按钮：`.fes-modal-wrapper .fes-modal-close`
- 返回列表：点击"待处理任务"标签

### Playwright MCP 工具正确用法

#### 1. `browser_run_code` 工具

**参数格式**：
```json
{
  "code": "完整的 JavaScript 代码字符串"
}
```

**重要规则**：
- ✅ `code` 参数必须是**字符串类型**
- ✅ 代码中可以使用 `page` 对象（Playwright Page 实例）
- ✅ 代码中可以使用 `await`、`async`、`const`、`let` 等
- ✅ 多行代码用 `\n` 分隔
- ✅ 字符串中的引号需要转义：`\"` 或使用单引号 `'`
- ❌ **不要**直接写代码，必须放在字符串中

**正确示例**：
```javascript
// ✅ 正确：检测登录状态
{
  "code": "const url = page.url();\nconst title = await page.title();\nconst isLoggedIn = !url.includes('/pmbank-um/') && !title.includes('统一登录平台');\nreturn { isLoggedIn, url, title };"
}

// ✅ 正确：等待页面加载
{
  "code": "await page.waitForLoadState('networkidle');\nawait new Promise(resolve => setTimeout(resolve, 1000));\nreturn '页面加载完成';"
}

// ✅ 正确：点击元素（带重试）
{
  "code": "async function clickWithRetry(selector, maxRetries = 1) {\n  for (let i = 0; i <= maxRetries; i++) {\n    try {\n      await page.locator(selector).waitFor({ state: 'visible', timeout: 2000 });\n      await page.locator(selector).waitFor({ state: 'attached', timeout: 2000 });\n      await page.locator(selector).click({ timeout: 2000 });\n      return true;\n    } catch (e) {\n      if (i === maxRetries) throw e;\n      await new Promise(resolve => setTimeout(resolve, 2000));\n    }\n  }\n}\nawait clickWithRetry('svg').first();\nreturn '点击成功';"
}
```

**错误示例**（会导致语法错误）：
```javascript
// ❌ 错误：直接写代码
async function checkLoginStatus() {
  const url = page.url();
  return url;
}

// ❌ 错误：没有 code 参数
{
  "function": "async () => { ... }"
}
```

#### 2. `browser_evaluate` 工具

**参数格式**：
```json
{
  "function": "() => { return document.title; }",
  "args": []  // 可选
}
```

**重要规则**：
- ✅ `function` 参数必须是**字符串类型**，包含函数定义
- ✅ 函数可以是箭头函数或普通函数
- ✅ 可以使用 `args` 参数传递元素 UID 等参数
- ❌ **不要**传递 `undefined` 或直接传代码

**正确示例**：
```javascript
// ✅ 正确：提取弹窗数据
{
  "function": "(el) => { const labels = el.querySelectorAll('.fes-form-item-label'); const values = el.querySelectorAll('.fes-form-item-content'); const data = {}; for (let i = 0; i < labels.length; i++) { const label = labels[i].textContent.trim(); const value = values[i].textContent.trim(); if (label.includes('业务类型')) data.businessType = value; } return data; }",
  "args": [{"uid": "modal-element-uid"}]
}

// ✅ 正确：简单提取
{
  "function": "() => { return document.title; }"
}
```

**错误示例**：
```javascript
// ❌ 错误：function 参数为 undefined
{
  "function": undefined
}

// ❌ 错误：直接传代码
{
  "code": "const url = window.location.href;"
}
```

#### 3. 常见错误和解决方案

**错误 1**：`SyntaxError: Unexpected token 'async'`
- **原因**：直接写代码，没有放在字符串中
- **解决**：将代码放在 `code` 参数的字符串中

**错误 2**：`SyntaxError: Unexpected token 'const'`
- **原因**：同上
- **解决**：将代码放在 `code` 参数的字符串中

**错误 3**：`Invalid input: expected string, received undefined`
- **原因**：`browser_evaluate` 的 `function` 参数为 `undefined`
- **解决**：确保 `function` 参数是字符串

**错误 4**：代码中的引号问题
- **原因**：字符串中的引号没有正确转义
- **解决**：使用 `\"` 转义双引号，或使用单引号 `'`

### 关键优化点

1. **智能等待主界面加载策略** (`waitForMainPageReady` 函数)：

   - 检测到登录成功后，执行 `page.waitForLoadState('networkidle')`
   - 等待关键元素（顶部菜单 SVG）可见，超时 10 秒
   - **智能检测页面稳定性**：
     - 每 500ms 检查一次页面 DOM 大小
     - 连续 3 次检查无变化则认为页面已稳定
     - 最多检查 10 次（5 秒）
   - 最后等待 1 秒确保完全稳定
   - 避免在页面未完全加载时点击菜单导致卡顿或失败

2. **带重试机制的点击函数** (`clickWithRetry`)：

   - 最多重试 1 次
   - 每次点击前等待元素可见和可点击
   - 失败后等待 2 秒再重试
   - 详细的日志输出便于调试

3. **关键操作的超时设置**：

   - 元素可见性检查：2 秒超时
   - 元素可点击检查：2 秒超时
   - 点击操作：2 秒超时
   - "待处理任务"点击：3 秒超时

4. **页面加载等待**：
   - 点击"工单系统（企金）"后等待 `networkidle` + 2 秒（确保 iframe 加载）
   - 点击"待处理任务"后等待 `networkidle` + 1 秒

## 参考实现

完整的实现代码参见：`.claude/skills/workorder-system/extract-workorders-script.js`

### 数据提取代码示例

```javascript
// 提取弹窗数据（包含数据清理）
const workOrderData = await modal.evaluate((el) => {
  // 清理文本函数
  function cleanText(text) {
    if (!text) return text;
    text = text.replace(/^"(.*)"$/, '$1'); // 去除外层引号
    text = text.replace(/""/g, '"'); // 去除转义引号
    text = text.replace(/[\t\n\r]/g, ''); // 去除制表符和换行符
    text = text.trim(); // 去除前后空格
    text = text.replace(/^["'\s]+|["'\s]+$/g, ''); // 再次清理引号和空格
    return text;
  }

  const data = {
    taskId: '',
    businessType: '',
    productType: '',
    companyName: '',
    customerName: '',
    ccif: '',
    ecif: '',
    authPassed: '',
    products: [],
    loanNumbers: [],
    dataType: ''
  };

  // 提取所有字段
  const labels = el.querySelectorAll('.fes-form-item-label');
  const values = el.querySelectorAll('.fes-form-item-content');

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].textContent.trim().replace('：', '').replace(':', '');
    const value = values[i].textContent.trim();

    if (label.includes('业务类型')) data.businessType = value;
    else if (label.includes('产品类型')) data.productType = value;
    else if (label.includes('企业名称')) data.companyName = cleanText(value);
    else if (label.includes('客户名称') || label.includes('姓名')) data.customerName = cleanText(value);
    else if (label.includes('CCIF')) data.ccif = value;
    else if (label.includes('ECIF')) data.ecif = value;
    else if (label.includes('核身通过')) data.authPassed = value;
    else if (label.match(/产品\d+/)) data.products.push(value);
    else if (label.match(/借据号\d+/)) data.loanNumbers.push(value);
  }

  // 判断数据类型
  if (data.ccif) {
    data.dataType = '企业';
  } else if (data.ecif) {
    data.dataType = '个人';
  }

  return data;
});

workOrderData.taskId = taskId.trim();
allWorkOrders.push(workOrderData);
```

**关键改进点**：
1. 在 `evaluate()` 内部定义 `cleanText()` 函数，直接在提取时清理数据
2. 同时尝试提取"客户名称"和"姓名"字段（使用 `||` 运算符）
3. 对企业名称和客户名称都应用 `cleanText()` 清理

### 辅助脚本

**CSV 生成脚本**：`.claude/skills/workorder-system/generate-csv.js`

功能：

- 从 JSON 数据生成 CSV 文件
- 动态计算列数（根据实际数据）
- 自动清理特殊字符
- 按业务类型分组导出

使用方法：

```bash
node .claude/skills/workorder-system/generate-csv.js workorders_raw.json [输出目录]
```

导出的函数：

- `cleanText(text)` - 清理文本中的特殊字符
- `getMaxFieldCount(tickets, fieldPrefix)` - 计算最大字段数
- `generateCSV(inputFile, outputDir)` - 生成 CSV 文件

## Example Usage

**场景 1：单独提取工单**

```
用户: "帮我提取工单系统的所有待办工单"
Claude: [调用 workorder-system skill]
输出: workorders.csv
```

**场景 2：作为流程的一部分**

```
用户: "处理取消额度工单"
Claude: [自动组合多个 skills，首先调用 workorder-system]
```

## Notes

- 此 skill 专注于工单系统的数据提取能力
- 不包含数据分析或报告生成功能（由其他 skills 负责）
- 输出的 CSV 文件可以被其他 skills 读取和处理
- 支持与其他系统 skills 灵活组合使用

## 数据清理

提取的数据可能包含特殊字符，需要进行清理：

### 常见问题

- 企业名称可能出现：`""\t 测广州市良根斧胁沿披衔俞股份有限公司""`
- 清理后应该是：`测广州市良根斧胁沿披衔俞股份有限公司`

### 清理方法

**推荐使用 `generate-csv.js` 脚本自动清理**，该脚本包含 `cleanText()` 函数：

```javascript
function cleanText(text) {
  if (!text) return text;
  text = text.replace(/^"(.*)"$/, "$1"); // 去除外层引号
  text = text.replace(/""/g, '"'); // 去除转义引号
  text = text.replace(/[\t\n\r]/g, ""); // 去除制表符和换行符
  text = text.trim(); // 去除前后空格
  text = text.replace(/^["'\s]+|["'\s]+$/g, ""); // 再次清理引号和空格
  return text;
}
```

### 清理时机

- **推荐**：使用 `generate-csv.js` 脚本生成 CSV 时自动清理
- 或者在提取数据时立即清理（在 `extract-workorders-script.js` 中）
