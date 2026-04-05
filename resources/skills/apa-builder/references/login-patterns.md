# 登录节点识别模式

## 目标

在录制的操作流程中，准确识别"登录"这个特殊节点，以便：
1. 在生成的脚本中插入登录检测逻辑
2. 避免在 HAR 分析时泄露登录凭证
3. 提示用户手动完成登录

## 识别规则

### 1. URL 特征

登录页面通常包含：
- `/login`
- `/signin`
- `/auth`
- `/oauth`
- `/sso`

### 2. 页面元素特征

- 包含密码输入框：`input[type="password"]`
- 包含"登录"、"Sign In"、"Log In" 按钮
- 包含"用户名"、"邮箱"、"手机号" 输入框

### 3. HAR 特征

登录相关的接口请求：
- URL 包含 `/login`、`/auth`、`/token`
- Request body 包含 `password`、`username`、`email` 字段
- Response 返回 token、session_id 等

### 4. 时间线特征

- 用户在某个页面停留较长时间（>5s）
- 然后触发一个 POST 请求
- 请求后页面跳转或刷新

## 处理策略

### 在脚本生成时

插入登录检测逻辑：

```javascript
// 导航到目标网站
await page.goto(TARGET)

// 登录检测
if (page.url().includes('login')) {
  console.log('⏸ 请在浏览器中完成登录...')
  await page.waitForURL(url => !url.includes('login'), { timeout: 120000 })
  console.log('✓ 登录完成')
}
```

### 在 HAR 分析时

**过滤登录接口的敏感信息：**

```python
def filter_login_requests(har_entries):
    filtered = []
    for entry in har_entries:
        url = entry['request']['url']

        # 识别登录接口
        if is_login_request(url, entry['request']):
            # 移除 request body（可能包含明文密码）
            entry['request']['postData'] = '[FILTERED]'
            # 只保留 response 的状态码，不保留 body（可能包含 token）
            entry['response']['content']['text'] = '[FILTERED]'

        filtered.append(entry)

    return filtered

def is_login_request(url, request):
    # URL 包含登录关键词
    if any(keyword in url.lower() for keyword in ['login', 'signin', 'auth', 'oauth']):
        return True

    # Request body 包含密码字段
    if request.get('postData'):
        body = request['postData'].get('text', '')
        if any(keyword in body.lower() for keyword in ['password', 'passwd', 'pwd']):
            return True

    return False
```

### 在执行时

检测到需要重新登录：

```javascript
// 执行接口调用
const response = await fetch(url, { headers: { 'Cookie': cookieStr } })

// 检测是否返回 401 或重定向到登录页
if (response.status === 401 || response.url.includes('login')) {
  console.log('⏸ 登录已过期，请在浏览器中重新登录')

  // 打开浏览器让用户登录
  const page = await context.newPage()
  await page.goto(TARGET)
  await page.waitForURL(url => !url.includes('login'), { timeout: 120000 })

  // 更新 Cookie
  const newCookies = await context.cookies()
  cookieStr = newCookies.map(c => `${c.name}=${c.value}`).join('; ')

  // 重试请求
  const retryResponse = await fetch(url, { headers: { 'Cookie': cookieStr } })
  // ...
}
```

## 安全约束

**绝对禁止：**
1. 在生成的脚本中硬编码用户名和密码
2. 在 HAR 分析结果中包含登录接口的 request body
3. 主动询问用户的登录凭证

**正确做法：**
1. 使用 `launchPersistentContext` 持久化 session
2. 登录完全由用户在浏览器中手动完成
3. 脚本只负责检测登录状态，不参与登录过程
