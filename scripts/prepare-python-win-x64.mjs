/**
 * Prepare Python runtime for Windows x64 packaging
 * Uses python-build-standalone for portable Python runtime
 *
 * Usage: node scripts/prepare-python-win-x64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_DIR = path.resolve(__dirname, '../resources/python-win-x64')
const PYTHON_VERSION = '3.12.12'  // 使用稳定版本
const BUILD_VERSION = '20260114'
const ARCH = 'x86_64-pc-windows-msvc-install_only'
const DOWNLOAD_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${BUILD_VERSION}/cpython-${PYTHON_VERSION}+${BUILD_VERSION}-${ARCH}.tar.gz`

function download(url, to) {
  console.log(`Downloading ${url}`)
  const archivePath = to + '.tar.gz'

  // Use curl
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' })

  // Extract archive using tar (works on both macOS and Windows with Git Bash)
  const destDir = path.dirname(to)

  try {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('Error: Failed to extract Python archive')
    throw error
  }

  // Clean up archive
  fs.unlinkSync(archivePath)

  // Find the extracted directory
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
      fs.rmSync(to, { recursive: true, force: true })
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
  console.log('=== Preparing Python for Windows x64 ===\n')

  if (!fs.existsSync(path.dirname(PYTHON_DIR))) {
    fs.mkdirSync(path.dirname(PYTHON_DIR), { recursive: true })
  }

  if (fs.existsSync(PYTHON_DIR)) {
    console.log('Removing existing Python...')
    fs.rmSync(PYTHON_DIR, { recursive: true, force: true })
  }

  await download(DOWNLOAD_URL, PYTHON_DIR)

  const pythonPath = path.join(PYTHON_DIR, 'python.exe')
  if (fs.existsSync(pythonPath)) {
    console.log(`Python executable: ${pythonPath}`)

    // Check if we're on Windows
    const platform = os.platform()
    if (platform !== 'win32') {
      console.log('\n⚠️  Warning: Running on non-Windows platform')
      console.log('   Cannot install Python packages on macOS/Linux')
      console.log('   The Windows Python runtime has been downloaded, but Office MCP packages are NOT installed.')
      console.log('   To install packages, run this script on a Windows machine.')
      console.log('\n✅ Windows Python runtime downloaded (without packages)')
      return
    }

    // Install Office MCP server packages (Windows only)
    console.log('\n📦 Installing Office MCP server packages...')
    const packages = [
      'office-powerpoint-mcp-server',
      'office-word-mcp-server',
      'excel-mcp-server',  // Excel MCP server
    ]

    for (const pkg of packages) {
      try {
        console.log(`  Installing ${pkg}...`)
        execSync(`"${pythonPath}" -m pip install --quiet ${pkg}`, { stdio: 'inherit' })
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
