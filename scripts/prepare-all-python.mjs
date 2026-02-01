/**
 * Prepare Python runtime for ALL platforms and architectures
 * Downloads and installs Python + Office MCP packages for all supported platforms
 *
 * Usage: node scripts/prepare-all-python.mjs
 *
 * This script prepares Python for:
 * - macOS arm64 (M series)
 * - macOS x64 (Intel)
 * - Windows x64
 * - Linux x64 (if needed)
 *
 * Run this BEFORE packaging to ensure all Python runtimes are ready.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Import individual prepare scripts
const prepareScripts = {
  'mac-arm64': '../scripts/prepare-python-mac-arm64.mjs',
  'mac-x64': '../scripts/prepare-python-mac-x64.mjs',
  'win-x64': '../scripts/prepare-python-win-x64.mjs',
  // 'linux-x64': '../scripts/prepare-python-linux-x64.mjs', // Uncomment when implemented
}

async function runScript(scriptName, scriptPath) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Preparing: ${scriptName}`)
  console.log('='.repeat(60))
  
  try {
    const fullPath = path.resolve(__dirname, scriptPath)
    execSync(`node "${fullPath}"`, { stdio: 'inherit', cwd: path.dirname(fullPath) })
    console.log(`✅ ${scriptName} completed successfully`)
    return true
  } catch (error) {
    console.error(`❌ ${scriptName} failed:`, error.message)
    return false
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Preparing Python Runtime for ALL Platforms')
  console.log('='.repeat(60))
  console.log('\nThis will download and install:')
  console.log('  - Python 3.13.1 for each platform/architecture')
  console.log('  - Office MCP server packages')
  console.log('\nThis may take several minutes depending on your internet speed.')
  console.log('All files will be saved to resources/ directory.\n')

  const results = {}
  let successCount = 0
  let failCount = 0

  for (const [name, scriptPath] of Object.entries(prepareScripts)) {
    const success = await runScript(name, scriptPath)
    results[name] = success
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  
  for (const [name, success] of Object.entries(results)) {
    console.log(`${success ? '✅' : '❌'} ${name}: ${success ? 'Ready' : 'Failed'}`)
  }
  
  console.log(`\nTotal: ${successCount} succeeded, ${failCount} failed`)
  
  if (failCount === 0) {
    console.log('\n🎉 All Python runtimes are ready for packaging!')
    console.log('You can now run: npm run build:mac (or build:win, build:linux)')
  } else {
    console.log('\n⚠️  Some platforms failed to prepare.')
    console.log('Please check the errors above and try again.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message)
  process.exit(1)
})
