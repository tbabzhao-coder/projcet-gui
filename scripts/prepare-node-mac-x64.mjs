/**
 * Prepare Node.js runtime for Mac x64 packaging
 * Downloads official Node.js macOS binary distribution
 *
 * Usage: node scripts/prepare-node-mac-x64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NODE_DIR = path.resolve(__dirname, '../resources/node-x64')
const NODE_VERSION = 'v20.18.2'  // LTS version
const DOWNLOAD_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-x64.tar.gz`

function download(url, to) {
  console.log(`Downloading ${url}`)
  const archivePath = to + '.tar.gz'

  // Use curl to download
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' })

  // Extract archive using tar
  const destDir = path.dirname(to)

  try {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('Error: Failed to extract Node.js archive')
    throw error
  }

  // Clean up archive
  fs.unlinkSync(archivePath)

  // Find the extracted directory (node-vX.X.X-darwin-x64)
  const parentDir = path.dirname(to)
  const entries = fs.readdirSync(parentDir)

  let extractedDir = null
  for (const entry of entries) {
    const fullPath = path.join(parentDir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory() && entry.startsWith('node-')) {
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
    throw new Error('Could not find extracted Node.js directory')
  }

  console.log(`Downloaded to ${to}`)
  return to
}

async function main() {
  console.log('=== Preparing Node.js for Mac x64 ===\n')

  if (!fs.existsSync(path.dirname(NODE_DIR))) {
    fs.mkdirSync(path.dirname(NODE_DIR), { recursive: true })
  }

  if (fs.existsSync(NODE_DIR)) {
    console.log('Removing existing Node.js...')
    fs.rmSync(NODE_DIR, { recursive: true, force: true })
  }

  await download(DOWNLOAD_URL, NODE_DIR)

  const nodePath = path.join(NODE_DIR, 'bin', 'node')
  if (fs.existsSync(nodePath)) {
    console.log(`Node.js executable: ${nodePath}`)

    // Verify Node.js version
    try {
      const version = execSync(`"${nodePath}" --version`, { encoding: 'utf-8' }).trim()
      console.log(`Node.js version: ${version}`)
    } catch (error) {
      console.warn('Could not verify Node.js version:', error.message)
    }
  }

  console.log('\n✅ Done! Node.js is ready for packaging')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
