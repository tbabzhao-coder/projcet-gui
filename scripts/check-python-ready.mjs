/**
 * Check if Python runtimes are ready for packaging
 * 
 * Usage: node scripts/check-python-ready.mjs [platform]
 * 
 * Platform options:
 *   - mac (checks both arm64 and x64)
 *   - win
 *   - linux
 *   - all (default, checks all platforms)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const checks = {
  'mac-arm64': {
    name: 'macOS M 系列 (arm64)',
    path: path.join(projectRoot, 'resources', 'python-arm64', 'bin', 'python3'),
    required: true
  },
  'mac-x64': {
    name: 'macOS Intel (x64)',
    path: path.join(projectRoot, 'resources', 'python-x64', 'bin', 'python3'),
    required: true
  },
  'win-x64': {
    name: 'Windows x64',
    path: path.join(projectRoot, 'resources', 'python-win-x64', 'python.exe'),
    required: true
  },
  'linux-x64': {
    name: 'Linux x64',
    path: path.join(projectRoot, 'resources', 'python', 'bin', 'python3'),
    required: false // Not implemented yet
  }
}

function checkPython(check) {
  const exists = fs.existsSync(check.path)
  const status = exists ? '✅' : '❌'
  const message = exists ? 'Ready' : 'Not found'
  
  console.log(`${status} ${check.name}: ${message}`)
  if (exists) {
    try {
      const stats = fs.statSync(check.path)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
      console.log(`   Path: ${check.path}`)
      console.log(`   Size: ${sizeMB} MB`)
    } catch (e) {
      // Ignore stat errors
    }
  } else if (check.required) {
    console.log(`   Run: npm run prepare:${check.key || check.name.toLowerCase().replace(/\s+/g, '-')}`)
  }
  
  return exists
}

function main() {
  const targetPlatform = process.argv[2] || 'all'
  
  console.log('='.repeat(60))
  console.log('Python Runtime Status Check')
  console.log('='.repeat(60))
  console.log(`Platform: ${targetPlatform}\n`)
  
  let allReady = true
  let readyCount = 0
  let totalCount = 0
  
  if (targetPlatform === 'all') {
    for (const [key, check] of Object.entries(checks)) {
      if (check.required) {
        totalCount++
        const ready = checkPython({ ...check, key })
        if (ready) readyCount++
        if (!ready && check.required) allReady = false
      }
    }
  } else if (targetPlatform === 'mac') {
    const macChecks = ['mac-arm64', 'mac-x64']
    for (const key of macChecks) {
      const check = checks[key]
      totalCount++
      const ready = checkPython({ ...check, key })
      if (ready) readyCount++
      if (!ready) allReady = false
    }
  } else {
    const key = `${targetPlatform}-x64`
    if (checks[key]) {
      const check = checks[key]
      totalCount++
      const ready = checkPython({ ...check, key })
      if (ready) readyCount++
      if (!ready) allReady = false
    } else {
      console.error(`Unknown platform: ${targetPlatform}`)
      process.exit(1)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log(`Summary: ${readyCount}/${totalCount} platforms ready`)
  
  if (allReady) {
    console.log('\n✅ All required Python runtimes are ready!')
    console.log('You can now run: npm run build:mac (or build:win)')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some Python runtimes are missing.')
    console.log('Run: npm run prepare:all')
    process.exit(1)
  }
}

main()
