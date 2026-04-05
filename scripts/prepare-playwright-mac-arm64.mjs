/**
 * Prepare Playwright Chromium browser for Mac ARM64 packaging
 * Downloads Chromium to resources/playwright-browsers/ for bundling
 *
 * Usage: node scripts/prepare-playwright-mac-arm64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const TARGET_DIR = path.resolve(ROOT_DIR, 'resources', 'playwright-browsers')
const BROWSERS_JSON = path.resolve(ROOT_DIR, 'node_modules', 'playwright-core', 'browsers.json')

async function main() {
  console.log('=== Preparing Playwright Chromium for Mac ARM64 ===\n')

  // Read browsers.json to get chromium revision
  if (!fs.existsSync(BROWSERS_JSON)) {
    throw new Error('playwright-core/browsers.json not found. Run npm install first.')
  }

  const config = JSON.parse(fs.readFileSync(BROWSERS_JSON, 'utf-8'))
  const chromium = config.browsers.find(b => b.name === 'chromium')
  if (!chromium) {
    throw new Error('chromium not found in browsers.json')
  }

  const revision = chromium.revision
  console.log(`Chromium revision: ${revision}`)
  console.log(`Browser version: ${chromium.browserVersion}`)
  console.log(`Target directory: ${TARGET_DIR}\n`)

  // Create target directory
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true })
  }

  // Check if already downloaded
  const chromiumDir = path.join(TARGET_DIR, `chromium-${revision}`)
  if (fs.existsSync(chromiumDir)) {
    console.log(`Chromium ${revision} already exists, skipping download`)
    console.log('\n✅ Done! Chromium is ready for packaging')
    return
  }

  // Download chromium using playwright install
  console.log('Downloading Chromium (this may take a few minutes)...')
  execSync('npx playwright install chromium', {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: TARGET_DIR
    },
    stdio: 'inherit'
  })

  // Verify
  if (!fs.existsSync(chromiumDir)) {
    throw new Error(`Download succeeded but ${chromiumDir} not found`)
  }

  // Clean up unnecessary components (headless shell, ffmpeg) to save ~190MB
  for (const entry of fs.readdirSync(TARGET_DIR)) {
    const fullPath = path.join(TARGET_DIR, entry)
    if (entry.startsWith('chromium_headless_shell') || entry.startsWith('ffmpeg')) {
      fs.rmSync(fullPath, { recursive: true, force: true })
      console.log(`Removed unnecessary: ${entry}`)
    }
  }

  console.log(`\nChromium downloaded to: ${chromiumDir}`)
  console.log('\n✅ Done! Chromium is ready for packaging')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
