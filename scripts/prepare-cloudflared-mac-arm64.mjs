/**
 * Prepare cloudflared binary for Mac Apple Silicon (arm64) packaging
 *
 * Usage: node scripts/prepare-cloudflared-mac-arm64.mjs
 *
 * This script downloads Mac Apple Silicon (arm64) version of cloudflared to node_modules/cloudflared/bin/
 * Normally this is done by npm install postinstall, but this script can be used to re-download if needed
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLOUDFLARED_DIR = path.resolve(__dirname, '../node_modules/cloudflared/bin')
const CLOUDFLARED_PATH = path.join(CLOUDFLARED_DIR, 'cloudflared')
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'

function download(url, to) {
  console.log(`Downloading ${url}`)
  const tgzPath = to + '.tgz'
  // Use curl, which automatically reads system proxy environment variables
  execSync(`curl -L -o "${tgzPath}" "${url}"`, { stdio: 'inherit' })
  // Extract the binary from tgz
  execSync(`tar -xzf "${tgzPath}" -C "${path.dirname(to)}"`, { stdio: 'inherit' })
  // The extracted file is named 'cloudflared' already
  // Clean up tgz
  fs.unlinkSync(tgzPath)
  // Make executable
  fs.chmodSync(to, 0o755)
  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing cloudflared for Mac Apple Silicon (arm64) ===\n')

  // Ensure directory exists
  if (!fs.existsSync(CLOUDFLARED_DIR)) {
    fs.mkdirSync(CLOUDFLARED_DIR, { recursive: true })
  }

  // Remove existing file if any
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    fs.unlinkSync(CLOUDFLARED_PATH)
    console.log('Removed existing cloudflared')
  }

  // Download
  await download(DOWNLOAD_URL, CLOUDFLARED_PATH)

  console.log('\n✅ Done! You can now run: npm run build:mac')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
