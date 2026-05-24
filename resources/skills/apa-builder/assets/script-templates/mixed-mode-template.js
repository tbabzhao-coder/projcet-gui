// 由 apa-builder 生成 - {{SKILL_NAME}}（混合模式）
// 结构化输出 + 截图验证 + try-catch 包裹

const { chromium } = require('playwright')
const fetch = require('node-fetch')
const path = require('path')
const os = require('os')
const fs = require('fs')

const TARGET = '{{TARGET_URL}}'
const HOSTNAME = new URL(TARGET).hostname
const SESSION_DIR = path.join(os.homedir(), '.project4', 'apa-sessions', HOSTNAME)
const STORAGE_FILE = path.join(SESSION_DIR, 'storage.json')
const SCREENSHOT_DIR = process.env.APA_SCREENSHOT_DIR
  || path.join(os.homedir(), '.project4', 'skills', '{{SKILL_NAME}}', 'validation')

// ============================================================================
// 结构化输出辅助函数
// ============================================================================

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

function logStep(n, desc) {
  console.log(`[APA:STEP:${n}] ${desc}`)
}

function logResult(data) {
  console.log(`[APA:RESULT] ${JSON.stringify(data)}`)
}

function logError(n, err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[APA:ERROR:${n}] ${msg}`)
  process.exitCode = 1
}

async function screenshot(page, stepNum) {
  try {
    const filePath = path.join(SCREENSHOT_DIR, `step-${stepNum}.png`)
    await page.screenshot({ path: filePath, fullPage: false })
  } catch (_) { /* 截图失败不影响执行 */ }
}

// ============================================================================
// 主流程
// ============================================================================

async function run() {
  // 优先用 --channel chrome 启动系统 Chrome
  // 如果系统没装 Chrome，回退到 Playwright 自带的 Chromium
  let browser
  let usedChannel = false

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false })
    usedChannel = true
  } catch (_) {
    browser = await chromium.launch({ headless: false })
  }

  // 加载录制时保存的登录态（storage.json）
  const storageState = fs.existsSync(STORAGE_FILE) ? STORAGE_FILE : undefined
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 720 }
  })

  const page = await context.newPage()

  // === 步骤 1: 导航（关键步骤） ===
  logStep(1, '导航到目标网站')
  try {
    await page.goto(TARGET)
    await screenshot(page, 1)
  } catch (err) {
    logError(1, err)
    await screenshot(page, 1)
    await context.close(); await browser.close()
    process.exit(1)
  }

  // === 步骤 2: 登录检测（关键步骤） ===
  logStep(2, '登录检测')
  try {
    if (page.url().includes('login')) {
      console.log('⏸ 请在浏览器中完成登录...')
      await page.waitForURL(url => !url.includes('login'), { timeout: 120000 })
      console.log('✓ 登录完成')

      // 登录成功后保存 storage，下次复用
      if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
      await context.storageState({ path: STORAGE_FILE })
      console.log('✓ 登录状态已保存')
    }
    await screenshot(page, 2)
  } catch (err) {
    logError(2, err)
    await screenshot(page, 2)
    await context.close(); await browser.close()
    process.exit(1)
  }

  // 从 context 提取 Cookie，供接口步骤使用
  const cookies = await context.cookies()
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  // === 步骤 3+: 根据录制分析结果生成 ===
  // 示例：接口模式
  // logStep(3, '搜索接口调用')
  // try {
  //   const param = process.env.PARAM_NAME || '默认值'
  //   const response = await fetch(`${TARGET}/api/endpoint?param=${encodeURIComponent(param)}`, {
  //     headers: { 'Cookie': cookieStr }
  //   })
  //   const data = await response.json()
  //   console.log('✓ 结果:', JSON.stringify(data).slice(0, 200))
  //   await screenshot(page, 3)
  // } catch (err) {
  //   logError(3, err)
  //   await screenshot(page, 3)
  // }

  // 示例：Playwright 模式
  // logStep(3, '页面操作')
  // try {
  //   await page.click('selector')
  //   await page.fill('input', 'value')
  //   await screenshot(page, 3)
  // } catch (err) {
  //   logError(3, err)
  //   await screenshot(page, 3)
  // }

  // === 最终结果 ===
  logResult({ status: 'complete', stepsExecuted: 2 })

  // 执行完成后更新 storage（刷新 cookie 有效期）
  await context.storageState({ path: STORAGE_FILE })

  await context.close()
  await browser.close()
}

run().catch((err) => {
  console.error(`[APA:ERROR:0] ${err.message || err}`)
  process.exitCode = 1
})
