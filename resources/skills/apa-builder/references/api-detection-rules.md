# API 接口识别规则

## 识别条件

某个网络请求被识别为"可直接调用的 API"需满足：

### 1. URL 特征

- 包含 `/api/`、`/v1/`、`/v2/` 等 API 路径标识
- 或者是 XHR/Fetch 请求（非页面导航）
- 排除静态资源：`.js`、`.css`、`.png`、`.jpg`、`.gif`、`.svg`、`.woff`、`.ttf`

### 2. 时间线对齐

- 用户操作后 500ms 内触发
- URL 路径与操作语义相关
  - 点击"搜索" → `/search`、`/query`
  - 点击"导出" → `/export`、`/download`
  - 提交表单 → `/submit`、`/save`

### 3. 独立性检查

**不依赖前端动态 token：**
- 无 CSRF token（检查 request headers 和 body）
- 无动态 form token（如 `__RequestVerificationToken`）
- 无前端生成的签名（如 `sign=xxx`，除非签名算法可逆向）

**可参数化：**
- 能识别哪些是变量（如公司名称、日期范围）
- 哪些是固定值（如 API key、固定的 filter 参数）

### 4. 响应检查

- 返回 JSON 格式（`Content-Type: application/json`）
- 状态码 200-299
- 响应体包含有效数据（非错误信息）

## 排除规则

以下情况**不走接口模式**，改用 Playwright：

1. **登录相关接口**
   - `/login`、`/auth`、`/oauth`
   - 可能包含明文密码，安全风险高

2. **依赖前端状态的接口**
   - 需要先执行 JS 生成 token
   - 需要先触发某个事件才能调用

3. **复杂的多步骤流程**
   - 需要先调 A 接口获取 token，再调 B 接口
   - 除非整个流程都能用接口完成

4. **需要浏览器环境的操作**
   - 文件下载（需要触发浏览器下载）
   - 截图、打印
   - 需要渲染的内容

## 示例

### ✅ 可走接口模式

```
用户操作：在搜索框输入"华为"，点击搜索
HAR 记录：
  POST /api/search
  Request: { "keyword": "华为", "page": 1 }
  Response: { "data": [...], "total": 100 }

判断：
  ✓ 时间线对齐（点击后 200ms 触发）
  ✓ URL 语义相关（/search）
  ✓ 无动态 token
  ✓ 参数可提取（keyword 是变量）
  → 走接口模式
```

### ❌ 不可走接口模式

```
用户操作：点击"导出 Excel"
HAR 记录：
  POST /api/export
  Request: { "token": "abc123xyz", "data": [...] }

判断：
  ✗ token 是前端 JS 生成的，无法直接获取
  → 走 Playwright 模式
```

## 实现建议

在分析 HAR 时，使用以下伪代码：

```python
def is_api_callable(entry, user_action):
    url = entry['request']['url']

    # 1. URL 特征检查
    if not is_api_url(url):
        return False

    # 2. 时间线对齐
    if not is_triggered_by_action(entry, user_action):
        return False

    # 3. 独立性检查
    if has_dynamic_token(entry['request']):
        return False

    # 4. 响应检查
    if not is_valid_json_response(entry['response']):
        return False

    return True
```
