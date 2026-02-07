#!/usr/bin/env node

/**
 * Migration Helper Script
 * Automates the migration from chokidar to @parcel/watcher
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[!]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`)
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      ...options
    })
  } catch (error) {
    log.error(`Command failed: ${command}`)
    throw error
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, filePath))
}

function backupFile(filePath) {
  const fullPath = path.join(PROJECT_ROOT, filePath)
  const backupPath = `${fullPath}.backup`

  if (fs.existsSync(fullPath)) {
    fs.copyFileSync(fullPath, backupPath)
    log.success(`Backed up: ${filePath}`)
    return true
  }
  return false
}

function restoreFile(filePath) {
  const fullPath = path.join(PROJECT_ROOT, filePath)
  const backupPath = `${fullPath}.backup`

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, fullPath)
    log.success(`Restored: ${filePath}`)
    return true
  }
  return false
}

// ============================================
// Migration Steps
// ============================================

async function step1_backup() {
  log.info('Step 1: Creating backups...')

  const filesToBackup = [
    'projcet-gui/src/main/services/artifact-cache.service.ts',
    'projcet-gui/package.json',
    'projcet-gui/package-lock.json'
  ]

  for (const file of filesToBackup) {
    backupFile(file)
  }

  log.success('Backups created successfully')
}

async function step2_installDeps() {
  log.info('Step 2: Installing new dependencies...')

  const deps = [
    '@parcel/watcher@^2.5.6',
    'ignore@^7.0.5'
  ]

  const optionalDeps = [
    '@parcel/watcher-darwin-x64@^2.5.6',
    '@parcel/watcher-darwin-arm64@^2.5.6',
    '@parcel/watcher-linux-x64-glibc@^2.5.6',
    '@parcel/watcher-win32-x64@^2.5.6'
  ]

  log.info('Installing core dependencies...')
  exec(`npm install ${deps.join(' ')}`)

  log.info('Installing optional platform-specific dependencies...')
  for (const dep of optionalDeps) {
    try {
      exec(`npm install ${dep} --save-optional`, { stdio: 'pipe' })
    } catch (error) {
      log.warn(`Optional dependency ${dep} failed to install (this is OK)`)
    }
  }

  log.success('Dependencies installed')
}

async function step3_uninstallOldDeps() {
  log.info('Step 3: Uninstalling old dependencies...')

  const oldDeps = ['chokidar', '@types/chokidar']

  exec(`npm uninstall ${oldDeps.join(' ')}`)

  log.success('Old dependencies removed')
}

async function step4_verifyFiles() {
  log.info('Step 4: Verifying required files...')

  const requiredFiles = [
    'projcet-gui/src/shared/constants/ignore-patterns.ts',
    'MIGRATION_PLAN.md'
  ]

  let allExist = true
  for (const file of requiredFiles) {
    if (fileExists(file)) {
      log.success(`Found: ${file}`)
    } else {
      log.error(`Missing: ${file}`)
      allExist = false
    }
  }

  if (!allExist) {
    throw new Error('Required files are missing. Please create them first.')
  }

  log.success('All required files exist')
}

async function step5_updatePackageJson() {
  log.info('Step 5: Updating package.json build configuration...')

  const packageJsonPath = path.join(PROJECT_ROOT, 'projcet-gui/package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

  // Update asarUnpack
  if (!packageJson.build) {
    packageJson.build = {}
  }

  if (!packageJson.build.asarUnpack) {
    packageJson.build.asarUnpack = []
  }

  const watcherUnpack = 'node_modules/@parcel/watcher-*/**/*'
  if (!packageJson.build.asarUnpack.includes(watcherUnpack)) {
    packageJson.build.asarUnpack.push(watcherUnpack)
    log.success('Added @parcel/watcher to asarUnpack')
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  log.success('package.json updated')
}

async function step6_runTests() {
  log.info('Step 6: Running tests...')

  try {
    exec('npm run test:unit')
    log.success('Tests passed')
  } catch (error) {
    log.warn('Some tests failed. Please review and fix.')
  }
}

// ============================================
// Rollback
// ============================================

async function rollback() {
  log.warn('Rolling back migration...')

  const filesToRestore = [
    'projcet-gui/src/main/services/artifact-cache.service.ts',
    'projcet-gui/package.json',
    'projcet-gui/package-lock.json'
  ]

  for (const file of filesToRestore) {
    restoreFile(file)
  }

  log.info('Reinstalling old dependencies...')
  exec('npm install chokidar@^5.0.0 @types/chokidar@^1.7.5')

  log.info('Uninstalling new dependencies...')
  exec('npm uninstall @parcel/watcher ignore')

  log.success('Rollback completed')
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  console.log('\n' + colors.blue + '='.repeat(60) + colors.reset)
  console.log(colors.blue + '  Migration Helper: chokidar → @parcel/watcher' + colors.reset)
  console.log(colors.blue + '='.repeat(60) + colors.reset + '\n')

  try {
    if (command === 'rollback') {
      await rollback()
    } else if (command === 'backup') {
      await step1_backup()
    } else if (command === 'install') {
      await step2_installDeps()
    } else if (command === 'uninstall-old') {
      await step3_uninstallOldDeps()
    } else if (command === 'verify') {
      await step4_verifyFiles()
    } else if (command === 'update-config') {
      await step5_updatePackageJson()
    } else if (command === 'test') {
      await step6_runTests()
    } else if (command === 'full' || !command) {
      // Full migration
      await step1_backup()
      await step4_verifyFiles()
      await step2_installDeps()
      await step3_uninstallOldDeps()
      await step5_updatePackageJson()

      log.info('\n' + colors.green + '✓ Migration preparation completed!' + colors.reset)
      log.info('\nNext steps:')
      log.info('1. Review MIGRATION_PLAN.md')
      log.info('2. Rewrite artifact-cache.service.ts (see migration plan)')
      log.info('3. Run: node scripts/migrate-watcher.mjs test')
      log.info('4. If issues occur, run: node scripts/migrate-watcher.mjs rollback')
    } else {
      console.log('Usage: node scripts/migrate-watcher.mjs [command]')
      console.log('\nCommands:')
      console.log('  full (default)  - Run full migration preparation')
      console.log('  backup          - Create backups only')
      console.log('  install         - Install new dependencies')
      console.log('  uninstall-old   - Uninstall old dependencies')
      console.log('  verify          - Verify required files exist')
      console.log('  update-config   - Update package.json')
      console.log('  test            - Run tests')
      console.log('  rollback        - Rollback to previous state')
      process.exit(1)
    }

    console.log('\n' + colors.green + '✓ Done!' + colors.reset + '\n')
  } catch (error) {
    log.error(`Migration failed: ${error.message}`)
    log.warn('You can rollback using: node scripts/migrate-watcher.mjs rollback')
    process.exit(1)
  }
}

main()
