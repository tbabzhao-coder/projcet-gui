/**
 * Prepare Python runtime for Mac Universal (both arm64 and x64) packaging
 * Uses python-build-standalone for portable Python runtime
 *
 * Usage: node scripts/prepare-python-mac-universal.mjs
 *
 * This script prepares Python for both architectures by creating separate directories
 * and downloading the appropriate version for each architecture.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_VERSION = '3.12.12'  // 使用稳定版本
const BUILD_VERSION = '20260114'

const ARCHITECTURES = [
  {
    name: 'arm64',
    arch: 'aarch64-apple-darwin',
    dir: path.resolve(__dirname, '../resources/python-arm64')
  },
  {
    name: 'x64',
    arch: 'x86_64-apple-darwin',
    dir: path.resolve(__dirname, '../resources/python-x64')
  }
]

function download(url, to) {
  console.log(`Downloading ${url}`)
  const archivePath = to + '.tar.gz'
  
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' })
  
  try {
    execSync(`tar -xzf "${archivePath}" -C "${path.dirname(to)}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('Error: Failed to extract Python archive')
    throw error
  }
  
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

async function prepareArchitecture(archInfo) {
  console.log(`\n=== Preparing Python for Mac ${archInfo.name} (${archInfo.arch}) ===\n`)

  if (!fs.existsSync(path.dirname(archInfo.dir))) {
    fs.mkdirSync(path.dirname(archInfo.dir), { recursive: true })
  }

  if (fs.existsSync(archInfo.dir)) {
    console.log(`Removing existing Python for ${archInfo.name}...`)
    execSync(`rm -rf "${archInfo.dir}"`, { stdio: 'inherit' })
  }

  const downloadUrl = `https://github.com/astral-sh/python-build-standalone/releases/download/${BUILD_VERSION}/cpython-${PYTHON_VERSION}+${BUILD_VERSION}-${archInfo.arch}-install_only.tar.gz`
  await download(downloadUrl, archInfo.dir)

  const pythonPath = path.join(archInfo.dir, 'bin', 'python3')
  if (fs.existsSync(pythonPath)) {
    fs.chmodSync(pythonPath, 0o755)
    console.log(`Python executable: ${pythonPath}`)
    
    // Install Office MCP server packages
    console.log(`\n📦 Installing Office MCP server packages for ${archInfo.name}...`)
    const packages = [
      'office-powerpoint-mcp-server',
      'office-word-mcp-server',
      'excel-mcp-server',
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

  console.log(`\n✅ Done! Python for ${archInfo.name} is ready`)
}

async function main() {
  console.log('=== Preparing Python for Mac Universal (arm64 + x64) ===\n')
  console.log(`Python Version: ${PYTHON_VERSION}`)
  console.log(`Build Version: ${BUILD_VERSION}\n`)

  for (const archInfo of ARCHITECTURES) {
    await prepareArchitecture(archInfo)
  }

  console.log('\n✅ Done! Python for both architectures is ready for packaging')
  console.log('   Note: Electron Builder will automatically select the correct architecture during build')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
