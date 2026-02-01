/**
 * Prepare cloudflared binary for Mac Intel (x64) packaging
 *
 * Usage: node scripts/prepare-cloudflared-mac-x64.mjs
 *
 * This script downloads Mac Intel (x64) version of cloudflared to node_modules/cloudflared/bin/
 * Solves architecture mismatch when building x64 package on ARM machines (M1/M2/M3/M4)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLOUDFLARED_DIR = path.resolve(__dirname, '../node_modules/cloudflared/bin')
const CLOUDFLARED_PATH = path.join(CLOUDFLARED_DIR, 'cloudflared-darwin-x64')
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz'

function download(url, to) {
  console.log(`Downloading ${url}`)
  const tgzPath = to + '.tgz'
  // Use curl, which automatically reads system proxy environment variables
  execSync(`curl -L -o "${tgzPath}" "${url}"`, { stdio: 'inherit' })
  // Extract the binary from tgz
  execSync(`tar -xzf "${tgzPath}" -C "${path.dirname(to)}"`, { stdio: 'inherit' })
  // Rename to our target name
  const extractedPath = path.join(path.dirname(to), 'cloudflared')
  if (fs.existsSync(extractedPath)) {
    fs.renameSync(extractedPath, to)
  }
  // Clean up tgz
  fs.unlinkSync(tgzPath)
  // Make executable
  fs.chmodSync(to, 0o755)
  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing cloudflared for Mac Intel (x64) ===\n')

  // Ensure directory exists
  if (!fs.existsSync(CLOUDFLARED_DIR)) {
    fs.mkdirSync(CLOUDFLARED_DIR, { recursive: true })
  }

  // Remove existing file if any
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    fs.unlinkSync(CLOUDFLARED_PATH)
    console.log('Removed existing cloudflared-darwin-x64')
  }

  // Download
  await download(DOWNLOAD_URL, CLOUDFLARED_PATH)

  console.log('\n✅ Done! You can now run: npm run build:mac-x64')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
