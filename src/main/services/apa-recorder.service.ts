/**
 * APA Recorder Service - 三重录制服务
 * 使用 playwright codegen 启动带录制的浏览器，同时开启 JS + HAR + 截图录制
 */

import { spawn, ChildProcess } from 'child_process'
import { getBundledNodeExecutable, getBundledPlaywrightBrowsersPath } from './node-runtime.service'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { app } from 'electron'
import { sendToRenderer } from './window.service'

// ============================================================================
// Types
// ============================================================================

export interface RecordingOptions {
  url?: string
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
  screenshots: string[]
  apiCalls: ApiCall[]
  tmpDir: string
}

// ============================================================================
// State
// ============================================================================

let activeRecordingProcess: ChildProcess | null = null
let activeRecordingTmpDir: string | null = null

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
 * 启动三重录制（playwright codegen + HAR + 截图）
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

  // 创建临时目录
  const recordingTmpDir = join(tmpdir(), `apa-recording-${Date.now()}`)
  mkdirSync(recordingTmpDir, { recursive: true })
  activeRecordingTmpDir = recordingTmpDir

  const scriptPath = join(recordingTmpDir, 'recording.js')
  const harPath = join(recordingTmpDir, 'recording.har')

  console.log('[APA Recorder] Starting recording...')
  console.log('[APA Recorder] Node:', node)
  console.log('[APA Recorder] Playwright CLI:', playwrightCli)
  console.log('[APA Recorder] Tmp dir:', recordingTmpDir)

  sendToRenderer('apa:recording-started', { tmpDir: recordingTmpDir })

  // 构建 playwright codegen 参数
  const args = [
    playwrightCli,
    'codegen',
    '--output', scriptPath,
    '--save-har', harPath,
    '--browser', 'chromium',
    '--viewport-size', '1280,720',
  ]

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

  // 监听进程输出
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
      activeRecordingTmpDir = null

      console.log('[APA Recorder] Process exited with code:', code)

      // codegen 正常退出（用户关闭浏览器）code 可能是 0 或 null
      // 只要产物文件存在就算成功
      const scriptExists = existsSync(scriptPath)
      const harExists = existsSync(harPath)

      if (!scriptExists && !harExists) {
        sendToRenderer('apa:recording-stopped', { success: false, error: '录制未产生任何文件' })
        reject(new Error(`录制失败，未生成产物文件 (exit code: ${code})`))
        return
      }

      try {
        // 读取产物
        const script = scriptExists ? readFileSync(scriptPath, 'utf-8') : ''
        const harContent = harExists ? readFileSync(harPath, 'utf-8') : '{"log":{"entries":[]}}'
        const har: HARFile = JSON.parse(harContent)

        // 从 HAR 中提取关键接口调用
        const apiCalls = extractApiCalls(har)

        const result: RecordingResult = {
          script,
          har,
          screenshots: [],
          apiCalls,
          tmpDir: recordingTmpDir,
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
      activeRecordingTmpDir = null
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
    activeRecordingProcess.kill('SIGTERM')
    activeRecordingProcess = null
    activeRecordingTmpDir = null
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
 * 清理录制临时文件
 */
export function cleanupRecordingTmpDir(tmpDir: string): void {
  try {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
      console.log('[APA Recorder] Cleaned up tmp dir:', tmpDir)
    }
  } catch (err) {
    console.warn('[APA Recorder] Failed to cleanup tmp dir:', tmpDir, err)
  }
}

/**
 * 清理所有旧的录制临时文件（启动时调用）
 */
export function cleanupOldRecordingTmpDirs(): void {
  try {
    const tmp = tmpdir()
    const entries = readdirSync(tmp)

    let cleaned = 0
    for (const entry of entries) {
      if (entry.startsWith('apa-recording-')) {
        const fullPath = join(tmp, entry)
        try {
          rmSync(fullPath, { recursive: true, force: true })
          cleaned++
        } catch (err) {
          // Ignore errors for individual dirs (might be in use)
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[APA Recorder] Cleaned up ${cleaned} old recording tmp dirs`)
    }
  } catch (err) {
    console.warn('[APA Recorder] Failed to cleanup old tmp dirs:', err)
  }
}
