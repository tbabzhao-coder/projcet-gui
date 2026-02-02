#!/usr/bin/env node

/**
 * Prepare Portable Git for Windows x64 packaging
 * Downloads and extracts Portable Git to resources/git-bash-win-x64
 *
 * Usage: node scripts/prepare-git-bash-win-x64.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GIT_BASH_DIR = path.resolve(__dirname, '../resources/git-bash-win-x64')
const PORTABLE_GIT_VERSION = '2.47.1'
const ARCH = '64'
const FILENAME = `PortableGit-${PORTABLE_GIT_VERSION}-${ARCH}-bit.7z.exe`
const VERSION = `v${PORTABLE_GIT_VERSION}.windows.1`

// 使用国内镜像优先，GitHub作为备选
const DOWNLOAD_URLS = [
  `https://registry.npmmirror.com/-/binary/git-for-windows/${VERSION}/${FILENAME}`,
  `https://mirrors.huaweicloud.com/git-for-windows/${VERSION}/${FILENAME}`,
  `https://github.com/git-for-windows/git/releases/download/${VERSION}/${FILENAME}`
]

function download(url, to) {
  console.log(`Downloading from: ${url}`)
  try {
    execSync(`curl -L -o "${to}" "${url}"`, { stdio: 'inherit' })
    console.log(`Downloaded to ${to}`)
    return to
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`)
  }
}

async function main() {
  console.log('=== Preparing Portable Git for Windows x64 ===\n')

  // 确保 resources 目录存在
  const resourcesDir = path.dirname(GIT_BASH_DIR)
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true })
  }

  // 如果已存在，询问是否重新下载
  if (fs.existsSync(GIT_BASH_DIR)) {
    const bashExe = path.join(GIT_BASH_DIR, 'bin', 'bash.exe')
    if (fs.existsSync(bashExe)) {
      console.log('✅ Portable Git already exists at:', GIT_BASH_DIR)
      console.log('   To re-download, delete the directory first.')
      return
    } else {
      console.log('⚠️  Directory exists but incomplete, removing...')
      fs.rmSync(GIT_BASH_DIR, { recursive: true, force: true })
    }
  }

  // 下载到临时目录
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-bash-'))
  const tempFile = path.join(tempDir, FILENAME)

  console.log('Downloading Portable Git (~62MB)...')
  console.log('This may take a few minutes...\n')

  let downloaded = false
  let lastError = ''

  // 尝试所有下载源
  for (let i = 0; i < DOWNLOAD_URLS.length; i++) {
    const url = DOWNLOAD_URLS[i]
    try {
      console.log(`[${i + 1}/${DOWNLOAD_URLS.length}] Trying: ${url}`)
      await download(url, tempFile)

      // 验证文件大小（应该大于50MB）
      const stats = fs.statSync(tempFile)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
      console.log(`   File size: ${sizeMB} MB`)

      if (stats.size < 50 * 1024 * 1024) {
        throw new Error(`File too small (${sizeMB} MB), download may be incomplete`)
      }

      downloaded = true
      console.log('   ✅ Download successful\n')
      break
    } catch (error) {
      lastError = error.message
      console.log(`   ❌ Failed: ${lastError}\n`)
      // 清理失败的下载
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    }
  }

  if (!downloaded) {
    console.error('❌ All download sources failed!')
    console.error('Last error:', lastError)
    fs.rmSync(tempDir, { recursive: true, force: true })
    process.exit(1)
  }

  // 解压
  console.log('Extracting Portable Git...')
  console.log('Target directory:', GIT_BASH_DIR)

  // 创建目标目录
  fs.mkdirSync(GIT_BASH_DIR, { recursive: true })

  try {
    // PortableGit-*.7z.exe 是自解压文件
    // 使用 -y (auto confirm) 和 -o (output directory)
    const platform = os.platform()

    if (platform === 'win32') {
      // Windows: 直接运行自解压
      console.log('Running self-extractor...')
      execSync(`"${tempFile}" -y -o"${GIT_BASH_DIR}"`, {
        stdio: 'inherit',
        timeout: 180000  // 3分钟超时
      })
    } else {
      // macOS/Linux: 使用 7z 命令解压
      console.log('Using 7z to extract (non-Windows platform)...')

      // 检查是否安装了 7z
      try {
        execSync('which 7z', { stdio: 'pipe' })
      } catch {
        console.error('❌ 7z command not found!')
        console.error('   On macOS: brew install p7zip')
        console.error('   On Linux: sudo apt-get install p7zip-full')
        throw new Error('7z not installed')
      }

      execSync(`7z x "${tempFile}" -o"${GIT_BASH_DIR}" -y`, {
        stdio: 'inherit',
        timeout: 180000
      })
    }

    console.log('✅ Extraction complete\n')

    // 验证解压结果
    const bashExe = path.join(GIT_BASH_DIR, 'bin', 'bash.exe')
    if (!fs.existsSync(bashExe)) {
      throw new Error('Extraction completed but bash.exe not found')
    }

    const bashSize = (fs.statSync(bashExe).size / 1024).toFixed(0)
    console.log(`✅ bash.exe found (${bashSize} KB)`)

    // 显示目录大小
    const dirSize = getDirSize(GIT_BASH_DIR)
    console.log(`📦 Total size: ${(dirSize / 1024 / 1024).toFixed(1)} MB`)

  } catch (error) {
    console.error('❌ Extraction failed:', error.message)
    // 清理失败的解压
    if (fs.existsSync(GIT_BASH_DIR)) {
      fs.rmSync(GIT_BASH_DIR, { recursive: true, force: true })
    }
    throw error
  } finally {
    // 清理临时文件
    console.log('\nCleaning up temporary files...')
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log('\n✅ Done! Portable Git is ready for packaging.')
  console.log(`   Location: ${GIT_BASH_DIR}`)
  console.log('\n💡 Next steps:')
  console.log('   1. Update package.json to include this in extraResources')
  console.log('   2. Update git-bash.service.ts to check bundled path first')
  console.log('   3. Run: npm run build:win')
}

/**
 * 计算目录大小（递归）
 */
function getDirSize(dirPath) {
  let size = 0

  try {
    const items = fs.readdirSync(dirPath)

    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stats = fs.statSync(itemPath)

      if (stats.isDirectory()) {
        size += getDirSize(itemPath)
      } else {
        size += stats.size
      }
    }
  } catch (error) {
    // 忽略权限错误等
  }

  return size
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
