/**
 * Prepare Python runtime for Mac Apple Silicon (arm64) packaging
 * Uses python-build-standalone for portable Python runtime
 *
 * Usage: node scripts/prepare-python-mac-arm64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_DIR = path.resolve(__dirname, '../resources/python-arm64')
const PYTHON_VERSION = '3.12.12'  // 使用稳定版本
const BUILD_VERSION = '20260114'
const ARCH = 'aarch64-apple-darwin'
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
  
  // Find the extracted directory
  // python-build-standalone extracts to a directory named "python" or "cpython-..."
  const parentDir = path.dirname(to)
  const entries = fs.readdirSync(parentDir)
  
  // Look for extracted directory (usually starts with "python" or "cpython")
  let extractedDir = null
  for (const entry of entries) {
    const fullPath = path.join(parentDir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory() && (entry.startsWith('python') || entry.startsWith('cpython'))) {
      extractedDir = fullPath
      break
    }
  }
  
  if (extractedDir && extractedDir !== to) {
    // Move contents to target directory
    if (fs.existsSync(to)) {
      execSync(`rm -rf "${to}"`, { stdio: 'inherit' })
    }
    fs.renameSync(extractedDir, to)
    console.log(`Renamed ${extractedDir} to ${to}`)
  } else if (!extractedDir) {
    throw new Error('Could not find extracted Python directory')
  }
  
  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing Python for Mac Apple Silicon (arm64) ===\n')

  // Ensure directory exists
  if (!fs.existsSync(path.dirname(PYTHON_DIR))) {
    fs.mkdirSync(path.dirname(PYTHON_DIR), { recursive: true })
  }

  // Remove existing if any
  if (fs.existsSync(PYTHON_DIR)) {
    console.log('Removing existing Python...')
    execSync(`rm -rf "${PYTHON_DIR}"`, { stdio: 'inherit' })
  }

  // Download
  await download(DOWNLOAD_URL, PYTHON_DIR)

  // Make python executable
  const pythonPath = path.join(PYTHON_DIR, 'bin', 'python3')
  if (fs.existsSync(pythonPath)) {
    fs.chmodSync(pythonPath, 0o755)
    console.log(`Python executable: ${pythonPath}`)
    
    // Install Office MCP server packages
    console.log('\n📦 Installing Office MCP server packages...')
    const packages = [
      'office-powerpoint-mcp-server',
      'office-word-mcp-server',
      'excel-mcp-server',  // Excel MCP server (most popular option)
    ]
    
    for (const pkg of packages) {
      try {
        console.log(`  Installing ${pkg}...`)
        execSync(`${pythonPath} -m pip install --quiet ${pkg}`, { stdio: 'inherit' })
        console.log(`  ✅ ${pkg} installed`)
      } catch (error) {
        console.warn(`  ⚠️  Failed to install ${pkg}:`, error.message)
        console.warn(`  You may need to install it manually later`)
      }
    }
  }

  console.log('\n✅ Done! Python and Office MCP servers are ready for packaging')
  console.log('   Next: Add Python to package.json extraResources')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
