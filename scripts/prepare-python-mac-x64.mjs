/**
 * Prepare Python runtime for Mac Intel (x64) packaging
 * Uses python-build-standalone for portable Python runtime
 *
 * Usage: node scripts/prepare-python-mac-x64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_DIR = path.resolve(__dirname, '../resources/python-x64')
const PYTHON_VERSION = '3.12.12'  // 使用稳定版本
const BUILD_VERSION = '20260114'
const ARCH = 'x86_64-apple-darwin'
const DOWNLOAD_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${BUILD_VERSION}/cpython-${PYTHON_VERSION}+${BUILD_VERSION}-${ARCH}-install_only.tar.gz`

function download(url, to) {
  console.log(`Downloading ${url}`)
  const archivePath = to + '.tar.gz'
  
  // Use curl, which automatically reads system proxy environment variables
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' })
  
  // Extract using tar
  try {
    execSync(`tar -xzf "${archivePath}" -C "${path.dirname(to)}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('Error: Failed to extract Python archive')
    throw error
  }
  
  // Clean up archive
  fs.unlinkSync(archivePath)
  
  const extractedDir = path.join(path.dirname(to), 'python')
  if (fs.existsSync(extractedDir)) {
    if (fs.existsSync(to)) {
      execSync(`rm -rf "${to}"`, { stdio: 'inherit' })
    }
    fs.renameSync(extractedDir, to)
  }
  
  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing Python for Mac Intel (x64) ===\n')

  if (!fs.existsSync(path.dirname(PYTHON_DIR))) {
    fs.mkdirSync(path.dirname(PYTHON_DIR), { recursive: true })
  }

  if (fs.existsSync(PYTHON_DIR)) {
    console.log('Removing existing Python...')
    execSync(`rm -rf "${PYTHON_DIR}"`, { stdio: 'inherit' })
  }

  await download(DOWNLOAD_URL, PYTHON_DIR)

  const pythonPath = path.join(PYTHON_DIR, 'bin', 'python3')
  if (fs.existsSync(pythonPath)) {
    fs.chmodSync(pythonPath, 0o755)
    console.log(`Python executable: ${pythonPath}`)
    
    // Install Office MCP server packages
    console.log('\n📦 Installing Office MCP server packages...')
    const packages = [
      'office-powerpoint-mcp-server',
      'office-word-mcp-server',
      'excel-mcp-server',  // Excel MCP server
    ]
    
    for (const pkg of packages) {
      try {
        console.log(`  Installing ${pkg}...`)
        execSync(`${pythonPath} -m pip install --quiet ${pkg}`, { stdio: 'inherit' })
        console.log(`  ✅ ${pkg} installed`)
      } catch (error) {
        console.warn(`  ⚠️  Failed to install ${pkg}:`, error.message)
      }
    }
  }

  console.log('\n✅ Done! Python and Office MCP servers are ready for packaging')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
