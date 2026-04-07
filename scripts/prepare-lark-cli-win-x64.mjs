/**
 * Prepare lark-cli binary for Windows x64 packaging
 * Downloads from GitHub Release (with npmmirror fallback)
 *
 * Usage: node scripts/prepare-lark-cli-win-x64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LARK_CLI_DIR = path.resolve(__dirname, '../resources/lark-cli-win-x64')
const VERSION = '1.0.4'
const NAME = 'lark-cli'
const ARCHIVE_NAME = `${NAME}-${VERSION}-windows-amd64.zip`

const DOWNLOAD_URLS = [
  `https://github.com/larksuite/cli/releases/download/v${VERSION}/${ARCHIVE_NAME}`,
  `https://registry.npmmirror.com/-/binary/lark-cli/v${VERSION}/${ARCHIVE_NAME}`
]

function download(url, destPath) {
  console.log(`Downloading ${url}`)
  execSync(
    `curl --ssl-revoke-best-effort --fail --location --silent --show-error --connect-timeout 10 --max-time 120 --output "${destPath}" "${url}"`,
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
}

async function main() {
  console.log('=== Preparing lark-cli for Windows x64 ===\n')

  if (fs.existsSync(LARK_CLI_DIR)) {
    console.log('Removing existing lark-cli...')
    fs.rmSync(LARK_CLI_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(LARK_CLI_DIR, { recursive: true })

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cli-'))
  const archivePath = path.join(tmpDir, ARCHIVE_NAME)

  try {
    // Download with fallback
    let downloaded = false
    for (const url of DOWNLOAD_URLS) {
      try {
        download(url, archivePath)
        downloaded = true
        console.log('Download successful')
        break
      } catch (err) {
        console.warn(`Failed to download from ${url}: ${err.message}`)
      }
    }
    if (!downloaded) {
      throw new Error('All download URLs failed')
    }

    // Extract zip
    console.log('Extracting...')
    execSync(
      `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpDir}'"`,
      { stdio: 'ignore' }
    )

    // Copy binary to target directory
    const binaryName = `${NAME}.exe`
    const extractedBinary = path.join(tmpDir, binaryName)

    if (!fs.existsSync(extractedBinary)) {
      throw new Error(`Binary not found at ${extractedBinary}`)
    }

    const destBinary = path.join(LARK_CLI_DIR, binaryName)
    fs.copyFileSync(extractedBinary, destBinary)

    // Verify
    console.log(`Binary: ${destBinary}`)
    try {
      const version = execSync(`"${destBinary}" --version`, { encoding: 'utf-8' }).trim()
      console.log(`Version: ${version}`)
    } catch (err) {
      console.warn('Could not verify version:', err.message)
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log('\n✅ Done! lark-cli is ready for packaging')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
