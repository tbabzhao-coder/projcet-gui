/**
 * lark-cli Service
 * High-level service wrapping lark-cli commands for Settings UI flows.
 * The agent calls lark-cli directly via Bash — this service is only for
 * config init, auth login, status check, and logout from the Settings UI.
 */

import { execFile, spawn } from 'child_process'
import { getBundledLarkCliExecutable } from './lark-cli-runtime.service'
import { getConfig, saveConfig } from './config.service'
import { BrowserWindow } from 'electron'

// ============================================
// Types
// ============================================

export type LarkCliStatus = 'not_configured' | 'configured' | 'auth_valid' | 'auth_expired' | 'error'

export interface LarkCliConfig {
  configured: boolean
  platform?: 'feishu' | 'lark'
  appId?: string
}

export interface LarkCliStatusInfo {
  status: LarkCliStatus
  config?: LarkCliConfig | null
  error?: string
}

// ============================================
// Internal helpers
// ============================================

function getLarkCliBin(): string {
  const bundled = getBundledLarkCliExecutable()
  if (bundled) return bundled
  // Fallback to system lark-cli
  return process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli'
}

/**
 * Execute a lark-cli command and return stdout/stderr/exitCode.
 * Uses execFile (no shell) for safety.
 */
function execLarkCli(args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const bin = getLarkCliBin()
    execFile(bin, args, { timeout: timeoutMs, encoding: 'utf-8' }, (error, stdout, stderr) => {
      if (error && (error as any).killed) {
        reject(new Error(`lark-cli timed out after ${timeoutMs}ms`))
        return
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? (error as any).code || 1 : 0
      })
    })
  })
}

/**
 * Spawn lark-cli and stream stderr to find a URL (for QR code flows).
 * lark-cli outputs QR code and verification URL to stderr (via f.IOStreams.ErrOut).
 * The command blocks until the user scans the QR code, then exits.
 * We extract the URL immediately for rendering in the UI, and listen for
 * process exit to auto-detect scan completion.
 */
function spawnAndExtractUrl(args: string[], timeoutMs = 180000): Promise<{ qrUrl: string | null; process: ReturnType<typeof spawn> }> {
  return new Promise((resolve) => {
    const bin = getLarkCliBin()
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill()
        resolve({ qrUrl: null, process: child })
      }
    }, timeoutMs)

    // lark-cli outputs URL and QR code to stderr
    child.stderr?.on('data', (data: Buffer) => {
      output += data.toString()
      // Look for URL pattern in stderr output
      const urlMatch = output.match(/https?:\/\/[^\s"']+/)
      if (urlMatch && !resolved) {
        resolved = true
        clearTimeout(timer)
        resolve({ qrUrl: urlMatch[0], process: child })
      }
    })

    // Also check stdout as fallback
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
      const urlMatch = output.match(/https?:\/\/[^\s"']+/)
      if (urlMatch && !resolved) {
        resolved = true
        clearTimeout(timer)
        resolve({ qrUrl: urlMatch[0], process: child })
      }
    })

    // When process exits (user scanned QR code), notify status change
    child.on('close', (code) => {
      clearTimeout(timer)
      if (!resolved) {
        resolved = true
        resolve({ qrUrl: null, process: child })
      }
      // Process exited — user likely completed the scan
      if (code === 0) {
        notifyStatusChange('auth_valid')
      }
    })

    child.on('error', () => {
      clearTimeout(timer)
      if (!resolved) {
        resolved = true
        resolve({ qrUrl: null, process: child })
      }
    })
  })
}

// ============================================
// Status change notification
// ============================================

function notifyStatusChange(status: LarkCliStatus): void {
  try {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('lark-cli:status-change', { status })
    }
  } catch {
    // Window may not exist yet
  }
}

// ============================================
// Public API
// ============================================

/**
 * Check lark-cli auth status
 */
export async function checkLarkCliStatus(): Promise<LarkCliStatusInfo> {
  const config = getLarkCliConfig()

  // If not configured at all, return early
  if (!config?.configured) {
    return { status: 'not_configured', config }
  }

  try {
    // Note: lark-cli auth status outputs JSON to stdout by default (no --format flag)
    const result = await execLarkCli(['auth', 'status'])

    if (result.exitCode === 0 && result.stdout) {
      try {
        const data = JSON.parse(result.stdout)
        // Check if user identity is logged in (not just bot)
        // When only bot is available, identity is "bot" and note mentions "No user logged in"
        if (data.identity === 'user' || data.identity === 'both' || data.logged_in || data.valid || data.authenticated) {
          return { status: 'auth_valid', config }
        }
        // Bot-only: app is configured but user hasn't logged in yet
        if (data.identity === 'bot' || data.note?.includes('No user logged in')) {
          return { status: 'auth_expired', config, error: '需要完成用户授权登录（扫码第二步）' }
        }
        return { status: 'auth_expired', config }
      } catch {
        // JSON parse failed, check stdout for hints
        if (result.stdout.includes('logged in') || result.stdout.includes('valid')) {
          return { status: 'auth_valid', config }
        }
        return { status: 'auth_expired', config }
      }
    }

    // Non-zero exit but configured
    return { status: 'auth_expired', config }
  } catch (error) {
    return {
      status: 'error',
      config,
      error: (error as Error).message
    }
  }
}

/**
 * Initialize lark-cli config (create new app via QR code)
 */
export async function initConfig(options: { newApp: boolean }): Promise<{ qrUrl?: string }> {
  const args = ['config', 'init']
  if (options.newApp) {
    args.push('--new')
  }

  const { qrUrl } = await spawnAndExtractUrl(args, 180000)

  if (qrUrl) {
    // Mark as configured (app created, pending auth)
    saveLarkCliConfig({ configured: true })
    notifyStatusChange('configured')
  }

  return { qrUrl: qrUrl || undefined }
}

/**
 * Start auth login flow (returns QR URL for scanning)
 */
export async function authLogin(options?: { scope?: string; domain?: string }): Promise<{ qrUrl?: string }> {
  const args = ['auth', 'login']
  if (options?.scope) {
    args.push('--scope', options.scope)
  } else if (options?.domain) {
    args.push('--domain', options.domain)
  } else {
    args.push('--recommend')
  }

  const { qrUrl } = await spawnAndExtractUrl(args, 180000)

  if (qrUrl) {
    notifyStatusChange('configured')
  }

  return { qrUrl: qrUrl || undefined }
}

/**
 * Logout from lark-cli
 */
export async function logout(): Promise<void> {
  await execLarkCli(['auth', 'logout'])
  saveLarkCliConfig({ configured: false })
  notifyStatusChange('not_configured')
}

/**
 * Manual config: set appId/appSecret/platform directly
 */
export async function manualConfig(configPlatform: string, appId: string, appSecret: string): Promise<void> {
  const brand = configPlatform === 'lark' ? 'lark' : 'feishu'

  // Use spawn to pipe appSecret via stdin
  await new Promise<void>((resolve, reject) => {
    const bin = getLarkCliBin()
    const child = spawn(bin, [
      'config', 'init',
      '--app-id', appId,
      '--app-secret-stdin',
      '--brand', brand
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    child.stdin?.write(appSecret)
    child.stdin?.end()

    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('close', (code) => {
      if (code === 0) {
        saveLarkCliConfig({
          configured: true,
          platform: configPlatform as 'feishu' | 'lark',
          appId
        })
        notifyStatusChange('configured')
        resolve()
      } else {
        reject(new Error(`lark-cli config init failed: ${stderr}`))
      }
    })

    child.on('error', reject)
  })
}

/**
 * Get lark-cli config from AppConfig
 */
export function getLarkCliConfig(): LarkCliConfig | null {
  try {
    const config = getConfig()
    return (config as any)?.larkCli || null
  } catch {
    return null
  }
}

/**
 * Save lark-cli config to AppConfig
 */
export function saveLarkCliConfig(larkCliConfig: LarkCliConfig): void {
  try {
    saveConfig({ larkCli: larkCliConfig } as any)
  } catch (error) {
    console.error('[LarkCliService] Failed to save config:', error)
  }
}
