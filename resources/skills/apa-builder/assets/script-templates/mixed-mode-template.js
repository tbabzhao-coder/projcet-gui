// 由 apa-builder 生成 - {{SKILL_NAME}}（混合模式）
// 步骤 1-2: Playwright（登录 + 导航）
// 步骤 3+: 接口模式或 Playwright（根据分析结果）

const { chromium } = require('playwright')
const fetch = require('node-fetch')
const path = require('path')
const os = require('os')
const fs = require('fs')

const TARGET = '{{TARGET_URL}}'
const HOSTNAME = new URL(TARGET).hostname
const SESSION_DIR = path.join(os.homedir(), '.project4', 'apa-sessions', HOSTNAME)
const STORAGE_FILE = path.join(SESSION_DIR, 'storage.json')

async function run() {
  // 优先用 --channel chrome 启动系统 Chrome
  // 如果系统没装 Chrome，回退到 Playwright 自带的 Chromium
  let browser
  let context
  let usedChannel = false

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false })
    usedChannel = true
  } catch (_) {
    browser = await chromium.launch({ headless: false })
  }

  // 加载录制时保存的登录态（storage.json）
  const storageState = fs.existsSync(STORAGE_FILE) ? STORAGE_FILE : undefined
  context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 720 }
  })

  const page = await context.newPage()

  // === 步骤 1: 导航 ===
  await page.goto(TARGET)

  // === 步骤 2: 登录检测 ===
  if (page.url().includes('login')) {
    console.log('⏸ 请在浏览器中完成登录...')
    await page.waitForURL(url => !url.includes('login'), { timeout: 120000 })
    console.log('✓ 登录完成')

    // 登录成功后保存 storage，下次复用
    await context.storageState({ path: STORAGE_FILE })
    console.log('✓ 登录状态已保存')
  }

  // 从 context 提取 Cookie，供接口步骤使用
  const cookies = await context.cookies()
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  // === 步骤 3+: 根据录制分析结果生成 ===
  // 示例：接口模式
  // const param = process.env.PARAM_NAME || '默认值'
  // const response = await fetch(`${TARGET}/api/endpoint?param=${encodeURIComponent(param)}`, {
  //   headers: { 'Cookie': cookieStr }
  // })
  // const data = await response.json()
  // console.log('✓ 结果:', data)

  // 示例：Playwright 模式
  // await page.click('selector')
  // await page.fill('input', 'value')

  // 执行完成后更新 storage（刷新 cookie 有效期）
  await context.storageState({ path: STORAGE_FILE })

  await context.close()
  await browser.close()
}

run().catch(console.error)
