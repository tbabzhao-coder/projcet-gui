/**
 * APA Recorder Service
 * 使用 playwright codegen 启动带录制的浏览器，生成 JS 脚本 + HAR + 登录态
 */

import { spawn, ChildProcess } from 'child_process'
import { getBundledNodeExecutable, getBundledPlaywrightBrowsersPath } from './node-runtime.service'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, copyFileSync, rmSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { app } from 'electron'
import { sendToRenderer } from './window.service'

// ============================================================================
// Types
// ============================================================================

export interface RecordingOptions {
  url?: string
  workDir?: string
}

export interface ApiCall {
  method: string
  url: string
  headers: Array<{ name: string; value: string }>
  postData?: { mimeType?: string; text?: string }
  response: {
    status: number
    body?: string
  }
  timestamp: string
}

interface HAREntry {
  request: {
    method: string
    url: string
    headers: Array<{ name: string; value: string }>
    postData?: { mimeType?: string; text?: string }
  }
  response: {
    status: number
    headers: Array<{ name: string; value: string }>
    content: { text?: string; mimeType?: string }
  }
  startedDateTime: string
}

interface HARFile {
  log: {
    entries: HAREntry[]
  }
}

export interface RecordingResult {
  script: string
  har: HARFile
  storageSaved: boolean
  apiCalls: ApiCall[]
  recordingDir: string
  sessionDir: string | null
}

// ============================================================================
// State
// ============================================================================

let activeRecordingProcess: ChildProcess | null = null
let activeRecordingDir: string | null = null

// ============================================================================
// Helpers
// ============================================================================

function getPlaywrightCliPath(): string | null {
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  // Production: derive from @playwright/mcp path (more reliable than hardcoded paths)
  if (!isDev) {
    try {
      const resourcesPath = process.resourcesPath
      const mcpServersPath = join(resourcesPath, 'mcp-servers', '@playwright', 'mcp')

      // Check if @playwright/mcp exists
      const mcpPackageJson = join(mcpServersPath, 'package.json')
      if (existsSync(mcpPackageJson)) {
        // playwright is a dependency of @playwright/mcp, should be in its node_modules
        const playwrightCli = join(mcpServersPath, 'node_modules', 'playwright', 'cli.js')
        if (existsSync(playwrightCli)) {
          console.log('[APA Recorder] Found playwright CLI via @playwright/mcp:', playwrightCli)
          return playwrightCli
        }
      }

      // Fallback: check if playwright-core is bundled separately
      const playwrightCoreCli = join(resourcesPath, 'mcp-servers', 'playwright-core', 'cli.js')
      if (existsSync(playwrightCoreCli)) {
        console.log('[APA Recorder] Found playwright-core CLI:', playwrightCoreCli)
        return playwrightCoreCli
      }
    } catch (e) {
      console.warn('[APA Recorder] Failed to resolve playwright CLI from extraResources:', e)
    }
  }

  // Development: resolve from node_modules
  try {
    // Try to resolve playwright package.json first
    const playwrightPkgPath = require.resolve('playwright/package.json')
    if (existsSync(playwrightPkgPath)) {
      const playwrightDir = join(playwrightPkgPath, '..')
      const cliPath = join(playwrightDir, 'cli.js')
      if (existsSync(cliPath)) {
        console.log('[APA Recorder] Found playwright CLI via require.resolve:', cliPath)
        return cliPath
      }
    }
  } catch (_) {
    // playwright not in node_modules
  }

  // Fallback: try common dev paths relative to __dirname
  const devCandidates = [
    join(__dirname, '../../node_modules/playwright/cli.js'),
    join(__dirname, '../../../node_modules/playwright/cli.js'),
  ]
  for (const p of devCandidates) {
    if (existsSync(p)) {
      console.log('[APA Recorder] Found playwright CLI via fallback path:', p)
      return p
    }
  }

  console.error('[APA Recorder] Could not find playwright CLI in any known location')
  return null
}

/**
 * 从 HAR 中提取可能的 API 调用
 */
function extractApiCalls(har: HARFile): ApiCall[] {
  return har.log.entries
    .filter((entry) => {
      const url = entry.request.url
      // 过滤掉静态资源
      if (/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|map)$/i.test(url)) {
        return false
      }
      // 只保留 API 请求
      return url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || entry.request.method !== 'GET'
    })
    .filter((entry) => {
      // 过滤登录接口（安全考虑）
      const url = entry.request.url.toLowerCase()
      return !['login', 'signin', 'auth', 'oauth', 'sso'].some((kw) => url.includes(kw))
    })
    .map((entry) => ({
      method: entry.request.method,
      url: entry.request.url,
      headers: entry.request.headers,
      postData: entry.request.postData,
      response: {
        status: entry.response.status,
        body: entry.response.content.text,
      },
      timestamp: entry.startedDateTime,
    }))
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 从 URL 中提取 hostname，用于 session 隔离
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * 启动录制（playwright codegen + HAR + 登录态持久化）
 */
export async function startRecording(options: RecordingOptions): Promise<RecordingResult> {
  if (activeRecordingProcess) {
    throw new Error('已有录制进程在运行，请先停止当前录制')
  }

  const node = getBundledNodeExecutable() || 'node'
  const playwrightCli = getPlaywrightCliPath()

  if (!playwrightCli) {
    throw new Error('未找到 Playwright CLI，请确保已安装 playwright')
  }

  // 录制产物保存在工作目录的 .apa-recordings/ 下，无 workDir 时统一放 ~/.project4/ 下
  const baseDir = options.workDir || join(homedir(), '.project4')
  const recordingDir = join(baseDir, '.apa-recordings', `recording-${Date.now()}`)
  mkdirSync(recordingDir, { recursive: true })
  activeRecordingDir = recordingDir

  const scriptPath = join(recordingDir, 'recording.js')
  const harPath = join(recordingDir, 'recording.har')
  const storagePath = join(recordingDir, 'storage.json')

  // Session 隔离：按 hostname 分目录
  const hostname = options.url ? extractHostname(options.url) : null
  const sessionDir = hostname ? getSessionDir(hostname) : null
  const existingStoragePath = sessionDir ? join(sessionDir, 'storage.json') : null

  console.log('[APA Recorder] Starting recording...')
  console.log('[APA Recorder] Node:', node)
  console.log('[APA Recorder] Playwright CLI:', playwrightCli)
  console.log('[APA Recorder] Recording dir:', recordingDir)
  if (sessionDir) {
    console.log('[APA Recorder] Session dir:', sessionDir)
  }

  sendToRenderer('apa:recording-started', { recordingDir, sessionDir })

  const args = [
    playwrightCli,
    'codegen',
    '--output', scriptPath,
    '--save-har', harPath,
    '--save-storage', storagePath,
    '--viewport-size', '1280,720',
  ]

  // 如果有已保存的登录态，自动加载（避免重复登录）
  if (existingStoragePath && existsSync(existingStoragePath)) {
    args.push('--load-storage', existingStoragePath)
    console.log('[APA Recorder] Loading existing session:', existingStoragePath)
  }

  if (options.url) {
    args.push(options.url)
  }

  const browsersPath = getBundledPlaywrightBrowsersPath()
  const proc = spawn(node, args, {
    env: {
      ...process.env,
      ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {})
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  activeRecordingProcess = proc

  proc.stdout?.on('data', (data) => {
    const message = data.toString()
    console.log('[APA Recorder] stdout:', message)
    sendToRenderer('apa:recording-log', { message })
  })

  proc.stderr?.on('data', (data) => {
    const message = data.toString()
    console.log('[APA Recorder] stderr:', message)
    sendToRenderer('apa:recording-log', { message })
  })

  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      activeRecordingProcess = null
      activeRecordingDir = null

      console.log('[APA Recorder] Process exited with code:', code)

      const scriptExists = existsSync(scriptPath)
      const harExists = existsSync(harPath)

      if (!scriptExists && !harExists) {
        sendToRenderer('apa:recording-stopped', { success: false, error: '录制未产生任何文件' })
        reject(new Error(`录制失败，未生成产物文件 (exit code: ${code})`))
        return
      }

      try {
        const script = scriptExists ? readFileSync(scriptPath, 'utf-8') : ''
        const harContent = harExists ? readFileSync(harPath, 'utf-8') : '{"log":{"entries":[]}}'
        const har: HARFile = JSON.parse(harContent)
        const apiCalls = extractApiCalls(har)

        // 录制完成后将 storage.json 复制到 session 目录（持久化登录态）
        let storageSaved = false
        if (existsSync(storagePath)) {
          if (sessionDir) {
            try {
              copyFileSync(storagePath, join(sessionDir, 'storage.json'))
              storageSaved = true
              console.log('[APA Recorder] Session saved to:', sessionDir)
            } catch (copyErr) {
              console.warn('[APA Recorder] Failed to save session:', copyErr)
            }
          }
        }

        const result: RecordingResult = {
          script,
          har,
          storageSaved,
          apiCalls,
          recordingDir,
          sessionDir,
        }

        console.log('[APA Recorder] Recording complete. Script length:', script.length, 'API calls:', apiCalls.length)
        sendToRenderer('apa:recording-stopped', { success: true, result })
        resolve(result)
      } catch (err) {
        const error = err as Error
        console.error('[APA Recorder] Failed to parse recording results:', error)
        sendToRenderer('apa:recording-stopped', { success: false, error: error.message })
        reject(error)
      }
    })

    proc.on('error', (err) => {
      activeRecordingProcess = null
      activeRecordingDir = null
      console.error('[APA Recorder] Process error:', err)
      sendToRenderer('apa:recording-stopped', { success: false, error: err.message })
      reject(err)
    })
  })
}

/**
 * 停止当前录制
 */
export function stopRecording(): void {
  if (activeRecordingProcess) {
    console.log('[APA Recorder] Stopping recording...')
    if (process.platform === 'win32') {
      // Windows 不支持 SIGTERM，用 taskkill 终止进程树
      const pid = activeRecordingProcess.pid
      if (pid) {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      }
    } else {
      activeRecordingProcess.kill('SIGTERM')
    }
    activeRecordingProcess = null
    activeRecordingDir = null
  }
}

/**
 * 获取 APA session 目录
 */
export function getSessionDir(hostname: string): string {
  const sessionDir = join(homedir(), '.project4', 'apa-sessions', hostname)
  mkdirSync(sessionDir, { recursive: true })
  return sessionDir
}

/**
 * 检查是否有活跃的录制
 */
export function isRecording(): boolean {
  return activeRecordingProcess !== null
}

/**
 * 清理旧版残留在 tmpdir 下的录制目录（向后兼容，启动时调用）
 * 新版录制产物保存在 workDir/.apa-recordings/ 下，由用户管理。
 */
export function cleanupLegacyRecordingDirs(): void {
  try {
    const { tmpdir } = require('os')
    const tmp = tmpdir()
    const entries = readdirSync(tmp)

    let cleaned = 0
    for (const entry of entries) {
      if (entry.startsWith('apa-recording-')) {
        const fullPath = join(tmp, entry)
        try {
          rmSync(fullPath, { recursive: true, force: true })
          cleaned++
        } catch (_) {
          // Ignore — might be in use by another process
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[APA Recorder] Cleaned up ${cleaned} legacy recording dirs from tmpdir`)
    }
  } catch (err) {
    console.warn('[APA Recorder] Failed to cleanup legacy dirs:', err)
  }
}
