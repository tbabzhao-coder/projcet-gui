# Selector 优化策略

## 问题

Playwright codegen 生成的 selector 可能不够稳定：
- 依赖动态 ID（如 `#item-12345`）
- 依赖 nth-child（页面结构变化就失效）
- 过于具体（如 `div > div > div > span.class1.class2.class3`）

## 优化原则

### 1. 优先级顺序

1. **data-testid** 或 **data-*** 属性（最稳定）
2. **语义化属性**：`name`、`aria-label`、`placeholder`
3. **文本内容**：`text=搜索`、`button:has-text("提交")`
4. **稳定的 class**：业务相关的 class（如 `.search-btn`）
5. **最后才用结构**：nth-child、复杂的层级

### 2. 避免动态值

❌ 不好：
```javascript
await page.click('#item-12345')  // ID 是动态生成的
await page.click('div:nth-child(3)')  // 位置可能变化
```

✅ 好：
```javascript
await page.click('[data-testid="search-button"]')
await page.click('button:has-text("搜索")')
await page.click('input[name="keyword"]')
```

### 3. 使用相对定位

当目标元素没有好的属性时，从附近的稳定元素定位：

```javascript
// 找到"公司名称"标签，然后找它后面的 input
await page.locator('label:has-text("公司名称")').locator('..').locator('input').fill('华为')

// 找到表格中"注册资本"那一行的值
await page.locator('tr:has-text("注册资本")').locator('td:nth-child(2)').textContent()
```

## 实现建议

在生成混合脚本时，对 codegen 生成的 selector 进行优化：

```python
def optimize_selector(original_selector, element_context):
    # 1. 检查是否有 data-testid
    if element_context.get('data-testid'):
        return f'[data-testid="{element_context["data-testid"]}"]'

    # 2. 检查是否有 name 属性
    if element_context.get('name'):
        return f'[name="{element_context["name"]}"]'

    # 3. 检查是否有明确的文本内容
    if element_context.get('text'):
        tag = element_context.get('tag', '')
        return f'{tag}:has-text("{element_context["text"]}")'

    # 4. 检查是否有稳定的 class（不包含动态部分）
    if element_context.get('class') and not has_dynamic_class(element_context['class']):
        return f'.{element_context["class"]}'

    # 5. 最后才返回原始 selector
    return original_selector
```

## 修复策略

如果优化后的 selector 在执行时失效：
1. 脚本自动截图保存当前页面状态（`step-N.png`）
2. AI 读取截图，分析页面结构变化
3. 根据截图中可见的文本/属性，生成新的 selector
4. 通过 Write 工具更新脚本中的 selector
5. 重新运行验证
