#!/usr/bin/env node

/**
 * Check Migration Status
 * 检查迁移状态和进度
 */

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
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`)
}

function checkFile(filePath, description) {
  const fullPath = path.join(PROJECT_ROOT, filePath)
  const exists = fs.existsSync(fullPath)
  
  if (exists) {
    log(`✓ ${description}`, colors.green)
    return true
  } else {
    log(`✗ ${description}`, colors.red)
    return false
  }
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join(PROJECT_ROOT, filePath)
  
  if (!fs.existsSync(fullPath)) {
    log(`✗ ${description} (文件不存在)`, colors.red)
    return false
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8')
  const found = content.includes(searchString)
  
  if (found) {
    log(`✓ ${description}`, colors.green)
    return true
  } else {
    log(`✗ ${description}`, colors.yellow)
    return false
  }
}

function checkPackageJson() {
  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json')
  
  if (!fs.existsSync(packageJsonPath)) {
    return { hasParcelWatcher: false, hasChokidar: true }
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  
  return {
    hasParcelWatcher: '@parcel/watcher' in deps,
    hasChokidar: 'chokidar' in deps,
    hasIgnore: 'ignore' in deps
  }
}

async function main() {
  console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset)
  console.log(colors.cyan + '  迁移状态检查' + colors.reset)
  console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n')

  // 1. 检查文档文件
  log('\n📚 文档文件:', colors.blue)
  const docs = [
    ['../START_HERE.md', 'START_HERE.md - 入口文档'],
    ['../README_MIGRATION.md', 'README_MIGRATION.md - 完整总结'],
    ['../QUICK_START_MIGRATION.md', 'QUICK_START_MIGRATION.md - 快速指南'],
    ['../MIGRATION_PLAN.md', 'MIGRATION_PLAN.md - 详细计划'],
    ['../DELIVERY_CHECKLIST.md', 'DELIVERY_CHECKLIST.md - 检查清单']
  ]
  
  let docsOk = true
  for (const [file, desc] of docs) {
    if (!checkFile(file, desc)) docsOk = false
  }

  // 2. 检查代码文件
  log('\n💻 代码文件:', colors.blue)
  const codeFiles = [
    ['src/shared/constants/ignore-patterns.ts', 'ignore-patterns.ts - 过滤规则常量']
  ]
  
  let codeOk = true
  for (const [file, desc] of codeFiles) {
    if (!checkFile(file, desc)) codeOk = false
  }

  // 3. 检查脚本文件
  log('\n🔧 脚本文件:', colors.blue)
  const scripts = [
    ['scripts/migrate-watcher.mjs', 'migrate-watcher.mjs - 迁移辅助脚本'],
    ['scripts/benchmark-watcher.mjs', 'benchmark-watcher.mjs - 性能测试脚本'],
    ['scripts/migrate-interactive.sh', 'migrate-interactive.sh - 交互式脚本']
  ]
  
  let scriptsOk = true
  for (const [file, desc] of scripts) {
    if (!checkFile(file, desc)) scriptsOk = false
  }

  // 4. 检查依赖
  log('\n📦 依赖检查:', colors.blue)
  const deps = checkPackageJson()
  
  let depsOk = true
  if (deps.hasParcelWatcher) {
    log('✓ @parcel/watcher 已安装', colors.green)
  } else {
    log('✗ @parcel/watcher 未安装', colors.red)
    depsOk = false
  }
  
  if (deps.hasIgnore) {
    log('✓ ignore 已安装', colors.green)
  } else {
    log('✗ ignore 未安装', colors.red)
    depsOk = false
  }
  
  if (!deps.hasChokidar) {
    log('✓ chokidar 已卸载', colors.green)
  } else {
    log('⚠ chokidar 仍然存在（应该卸载）', colors.yellow)
  }

  // 5. 检查代码修改
  log('\n✏️  代码修改检查:', colors.blue)
  const codeChecks = [
    ['src/main/services/artifact-cache.service.ts', '@parcel/watcher', '导入 @parcel/watcher'],
    ['src/main/services/artifact-cache.service.ts', 'from \'ignore\'', '导入 ignore'],
    ['src/main/services/artifact-cache.service.ts', 'AsyncSubscription', '使用 AsyncSubscription'],
    ['src/main/services/artifact-cache.service.ts', 'loadIgnoreRules', '添加 loadIgnoreRules 函数'],
    ['src/main/services/artifact-cache.service.ts', 'watcher.subscribe', '使用 watcher.subscribe']
  ]
  
  let codeModOk = true
  for (const [file, search, desc] of codeChecks) {
    if (!checkFileContent(file, search, desc)) codeModOk = false
  }

  // 6. 检查备份文件
  log('\n💾 备份文件:', colors.blue)
  const backupFile = 'src/main/services/artifact-cache.service.ts.backup'
  if (checkFile(backupFile, '备份文件存在')) {
    log('  提示：迁移完成后可以删除备份文件', colors.yellow)
  }

  // 7. 总结
  log('\n' + colors.cyan + '='.repeat(70) + colors.reset)
  log('📊 总结:', colors.blue)
  
  const allOk = docsOk && codeOk && scriptsOk && depsOk && codeModOk
  
  if (allOk) {
    log('\n✅ 所有检查通过！迁移准备就绪。', colors.green)
    log('\n下一步：', colors.blue)
    log('  1. 运行编译：npm run build', colors.reset)
    log('  2. 运行测试：npm run test:unit', colors.reset)
    log('  3. 手动测试：npm run dev', colors.reset)
    log('  4. 性能测试：node scripts/benchmark-watcher.mjs', colors.reset)
  } else {
    log('\n⚠️  部分检查未通过，请完成以下步骤：', colors.yellow)
    
    if (!docsOk) log('  - 确保所有文档文件存在', colors.reset)
    if (!codeOk) log('  - 创建 ignore-patterns.ts 文件', colors.reset)
    if (!scriptsOk) log('  - 确保所有脚本文件存在', colors.reset)
    if (!depsOk) log('  - 运行：node scripts/migrate-watcher.mjs install', colors.reset)
    if (!codeModOk) log('  - 按照 QUICK_START_MIGRATION.md 修改代码', colors.reset)
  }
  
  console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset + '\n')
}

main().catch(console.error)
