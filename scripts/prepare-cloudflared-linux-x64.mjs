/**
 * Prepare cloudflared binary for Linux x64 packaging
 *
 * Usage: node scripts/prepare-cloudflared-linux-x64.mjs
 *
 * This script downloads Linux x64 version of cloudflared to node_modules/cloudflared/bin/
 * Solves architecture mismatch when building Linux package on Mac machines
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLOUDFLARED_DIR = path.resolve(__dirname, '../node_modules/cloudflared/bin')
const CLOUDFLARED_PATH = path.join(CLOUDFLARED_DIR, 'cloudflared-linux-x64')
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'

function download(url, to) {
  console.log(`Downloading ${url}`)
  // Use curl, which automatically reads system proxy environment variables
  execSync(`curl -L -o "${to}" "${url}"`, { stdio: 'inherit' })
  // Make executable
  fs.chmodSync(to, 0o755)
  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing cloudflared for Linux x64 ===\n')

  // Ensure directory exists
  if (!fs.existsSync(CLOUDFLARED_DIR)) {
    fs.mkdirSync(CLOUDFLARED_DIR, { recursive: true })
  }

  // Remove existing file if any
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    fs.unlinkSync(CLOUDFLARED_PATH)
    console.log('Removed existing cloudflared-linux-x64')
  }

  // Download
  await download(DOWNLOAD_URL, CLOUDFLARED_PATH)

  console.log('\n✅ Done! You can now run: npm run build:linux')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
