/**
 * APA Executor Service - 混合模式脚本执行 + MCP 降级 + 自我修复
 */

import { spawn, ChildProcess } from 'child_process'
import { getBundledNodeExecutable, getBundledPlaywrightBrowsersPath } from './node-runtime.service'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { app } from 'electron'
import { sendToRenderer } from './window.service'

// ============================================================================
// Types
// ============================================================================

export interface ExecuteOptions {
  skillName: string
  params: Record<string, string>
}

export interface ExecutionResult {
  success: boolean
  mode: 'script' | 'mcp'
  output: string
  error?: string
}

// ============================================================================
// State
// ============================================================================

let activeExecutionProcess: ChildProcess | null = null
let activeSkillName: string | null = null

// ============================================================================
// Helpers
// ============================================================================

/**
 * 查找 skill 对应的脚本路径
 */
function resolveSkillScript(skillName: string): string | null {
  const configDir = join(homedir(), '.project4')

  // 查找顺序：
  // 1. ~/.project4/skills/{skillName}/{skillName}.js
  // 2. ~/.project4/skills/{skillName}/index.js
  // 3. ~/.project4/skills/{skillName}.js
  const candidates = [
    join(configDir, 'skills', skillName, `${skillName}.js`),
    join(configDir, 'skills', skillName, 'index.js'),
    join(configDir, 'skills', `${skillName}.js`),
  ]

  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }

  return null
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 执行 skill（主路径：脚本执行，降级：MCP 模式）
 */
export async function executeSkill(options: ExecuteOptions): Promise<ExecutionResult> {
  if (activeExecutionProcess) {
    throw new Error('已有执行进程在运行，请先停止当前执行')
  }

  const { skillName, params } = options
  activeSkillName = skillName

  const scriptPath = resolveSkillScript(skillName)

  if (!scriptPath) {
    // 没有找到脚本，直接走 MCP 降级
    console.log(`[APA Executor] Script not found for skill: ${skillName}, falling back to MCP`)
    sendToRenderer('apa:execution-failed', {
      skillName,
      error: `未找到 skill "${skillName}" 的脚本文件`,
      fallbackToMcp: true,
    })
    return {
      success: false,
      mode: 'mcp',
      output: '',
      error: `未找到 skill "${skillName}" 的脚本文件`,
    }
  }

  console.log(`[APA Executor] Executing skill: ${skillName}, script: ${scriptPath}`)
  sendToRenderer('apa:execution-started', { skillName, mode: 'script' })

  try {
    const result = await runScript(scriptPath, params, skillName)
    sendToRenderer('apa:execution-complete', { skillName, mode: 'script', output: result })
    return { success: true, mode: 'script', output: result }
  } catch (err) {
    const error = err as Error
    console.error(`[APA Executor] Script execution failed:`, error.message)

    // 降级路径：通知前端用 MCP 模式重新执行
    sendToRenderer('apa:execution-failed', {
      skillName,
      error: error.message,
      fallbackToMcp: true,
      scriptPath,
    })

    return {
      success: false,
      mode: 'mcp',
      output: '',
      error: error.message,
    }
  }
}

/**
 * Get the path to bundled mcp-servers directory for NODE_PATH
 * So that require('playwright') / require('playwright-core') can resolve
 */
function getBundledMcpServersPath(): string | undefined {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    // Dev mode: node_modules handles resolution naturally
    return undefined
  }

  try {
    const resourcesPath = process.resourcesPath || (app as any).getPath('resources')
    const mcpServersPath = join(resourcesPath, 'mcp-servers')
    if (existsSync(mcpServersPath)) {
      return mcpServersPath
    }
  } catch (error) {
    console.warn('[APA Executor] Error getting mcp-servers path:', error)
  }

  return undefined
}

/**
 * 执行脚本
 */
function runScript(scriptPath: string, params: Record<string, string>, skillName: string): Promise<string> {
  const node = getBundledNodeExecutable() || 'node'

  // Build env with bundled module paths so scripts can require('playwright') etc.
  const mcpServersPath = getBundledMcpServersPath()
  const browsersPath = getBundledPlaywrightBrowsersPath()
  const env = {
    ...process.env,
    ...params,
    ...(mcpServersPath ? { NODE_PATH: mcpServersPath } : {}),
    ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {})
  }

  return new Promise((resolve, reject) => {
    let output = ''

    const proc = spawn(node, [scriptPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    activeExecutionProcess = proc

    proc.stdout?.on('data', (data) => {
      const message = data.toString()
      output += message
      console.log(`[APA Executor] [${skillName}] stdout:`, message.trim())
      sendToRenderer('apa:execution-log', { skillName, message })
    })

    proc.stderr?.on('data', (data) => {
      const message = data.toString()
      console.log(`[APA Executor] [${skillName}] stderr:`, message.trim())
      sendToRenderer('apa:execution-log', { skillName, message, isError: true })
    })

    proc.on('close', (code) => {
      activeExecutionProcess = null
      activeSkillName = null

      if (code === 0) {
        resolve(output)
      } else {
        reject(new Error(`脚本退出码: ${code}\n输出: ${output}`))
      }
    })

    proc.on('error', (err) => {
      activeExecutionProcess = null
      activeSkillName = null
      reject(err)
    })
  })
}

/**
 * 停止当前执行
 */
export function stopExecution(): void {
  if (activeExecutionProcess) {
    const skillName = activeSkillName
    console.log(`[APA Executor] Stopping execution of: ${skillName}`)
    if (process.platform === 'win32') {
      const pid = activeExecutionProcess.pid
      if (pid) {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      }
    } else {
      activeExecutionProcess.kill('SIGTERM')
    }
    activeExecutionProcess = null
    activeSkillName = null
    sendToRenderer('apa:execution-stopped', { skillName })
  }
}

/**
 * MCP 兜底成功后更新脚本
 */
export function updateScript(skillName: string, newScript: string): { success: boolean; path: string } {
  const configDir = join(homedir(), '.project4')
  const skillDir = join(configDir, 'skills', skillName)

  // 确保目录存在
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true })
  }

  const scriptPath = join(skillDir, `${skillName}.js`)

  // 备份旧脚本
  if (existsSync(scriptPath)) {
    const backupPath = join(skillDir, `${skillName}.backup.${Date.now()}.js`)
    const oldContent = readFileSync(scriptPath, 'utf-8')
    writeFileSync(backupPath, oldContent, 'utf-8')
    console.log(`[APA Executor] Backed up old script to: ${backupPath}`)
  }

  writeFileSync(scriptPath, newScript, 'utf-8')
  console.log(`[APA Executor] Updated script: ${scriptPath}`)

  return { success: true, path: scriptPath }
}

/**
 * 检查是否有活跃的执行
 */
export function isExecuting(): boolean {
  return activeExecutionProcess !== null
}

/**
 * 获取当前执行的 skill 名称
 */
export function getActiveSkillName(): string | null {
  return activeSkillName
}
