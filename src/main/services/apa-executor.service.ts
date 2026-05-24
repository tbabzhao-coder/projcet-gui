/**
 * APA Executor Service - 脚本执行 + 结构化输出解析 + 验证
 */

import { spawn, ChildProcess } from 'child_process'
import { getBundledNodeExecutable, getBundledPlaywrightBrowsersPath } from './node-runtime.service'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
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
  mode: 'script'
  output: string
  error?: string
  steps?: StepResult[]
  errors?: StepResult[]
}

export interface ValidateOptions {
  skillName: string
  params: Record<string, string>
  screenshotDir?: string
}

export interface StepResult {
  step: number
  description: string
  status: 'ok' | 'error'
  error?: string
}

export interface ValidationResult {
  exitCode: number
  steps: StepResult[]
  result: unknown | null
  errors: StepResult[]
  screenshots: string[]
  rawStdout: string
  rawStderr: string
}

interface ScriptOutput {
  stdout: string
  stderr: string
  exitCode: number
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

/**
 * Get the path to bundled mcp-servers directory for NODE_PATH
 * So that require('playwright') / require('playwright-core') can resolve
 */
function getBundledMcpServersPath(): string | undefined {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
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
 * 构建脚本运行环境变量
 */
function buildScriptEnv(params: Record<string, string>, extraEnv?: Record<string, string>): Record<string, string> {
  const mcpServersPath = getBundledMcpServersPath()
  const browsersPath = getBundledPlaywrightBrowsersPath()
  return {
    ...process.env as Record<string, string>,
    ...params,
    ...(mcpServersPath ? { NODE_PATH: mcpServersPath } : {}),
    ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {}),
    ...extraEnv,
  }
}

/**
 * 解析结构化输出
 * 从 stdout/stderr 中提取 [APA:STEP:N]、[APA:RESULT]、[APA:ERROR:N]
 */
export function parseStructuredOutput(stdout: string, stderr: string): {
  steps: StepResult[]
  result: unknown | null
  errors: StepResult[]
} {
  const steps: StepResult[] = []
  const errors: StepResult[] = []
  let result: unknown | null = null

  // 提取步骤 — 严格行首匹配，避免误匹配 playwright 输出
  const stepRegex = /^\[APA:STEP:(\d+)\]\s*(.*)$/gm
  let match
  while ((match = stepRegex.exec(stdout)) !== null) {
    steps.push({ step: parseInt(match[1]), description: match[2].trim(), status: 'ok' })
  }

  // 提取结果
  const resultRegex = /^\[APA:RESULT\]\s*(.*)$/m
  const resultMatch = resultRegex.exec(stdout)
  if (resultMatch) {
    try {
      result = JSON.parse(resultMatch[1])
    } catch {
      result = resultMatch[1].trim()
    }
  }

  // 提取错误 — 同时检查 stdout 和 stderr
  const combined = stdout + '\n' + stderr
  const errorRegex = /^\[APA:ERROR:(\d+)\]\s*(.*)$/gm
  while ((match = errorRegex.exec(combined)) !== null) {
    const stepNum = parseInt(match[1])
    const errorMsg = match[2].trim()
    errors.push({ step: stepNum, description: '', status: 'error', error: errorMsg })

    // 标记对应步骤为 error
    const existingStep = steps.find(s => s.step === stepNum)
    if (existingStep) {
      existingStep.status = 'error'
      existingStep.error = errorMsg
    }
  }

  return { steps, result, errors }
}

/**
 * 执行脚本，返回 stdout/stderr/exitCode
 */
function runScript(
  scriptPath: string,
  params: Record<string, string>,
  skillName: string,
  extraEnv?: Record<string, string>
): Promise<ScriptOutput> {
  const node = getBundledNodeExecutable() || 'node'
  const env = buildScriptEnv(params, extraEnv)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(node, [scriptPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    activeExecutionProcess = proc

    proc.stdout?.on('data', (data) => {
      const message = data.toString()
      stdout += message
      console.log(`[APA Executor] [${skillName}] stdout:`, message.trim())
      sendToRenderer('apa:execution-log', { skillName, message })
    })

    proc.stderr?.on('data', (data) => {
      const message = data.toString()
      stderr += message
      console.log(`[APA Executor] [${skillName}] stderr:`, message.trim())
      sendToRenderer('apa:execution-log', { skillName, message, isError: true })
    })

    proc.on('close', (code) => {
      activeExecutionProcess = null
      activeSkillName = null
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    proc.on('error', (err) => {
      activeExecutionProcess = null
      activeSkillName = null
      reject(err)
    })
  })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 执行 skill
 */
export async function executeSkill(options: ExecuteOptions): Promise<ExecutionResult> {
  if (activeExecutionProcess) {
    throw new Error('已有执行进程在运行，请先停止当前执行')
  }

  const { skillName, params } = options
  activeSkillName = skillName

  const scriptPath = resolveSkillScript(skillName)

  if (!scriptPath) {
    console.log(`[APA Executor] Script not found for skill: ${skillName}`)
    sendToRenderer('apa:execution-failed', {
      skillName,
      error: `未找到 skill "${skillName}" 的脚本文件`,
    })
    return {
      success: false,
      mode: 'script',
      output: '',
      error: `未找到 skill "${skillName}" 的脚本文件`,
    }
  }

  console.log(`[APA Executor] Executing skill: ${skillName}, script: ${scriptPath}`)
  sendToRenderer('apa:execution-started', { skillName, mode: 'script' })

  try {
    const { stdout, stderr, exitCode } = await runScript(scriptPath, params, skillName)
    const parsed = parseStructuredOutput(stdout, stderr)

    if (exitCode !== 0) {
      sendToRenderer('apa:execution-failed', {
        skillName,
        error: `脚本退出码: ${exitCode}`,
        scriptPath,
      })
      return {
        success: false,
        mode: 'script',
        output: stdout,
        error: `脚本退出码: ${exitCode}\n${stderr}`,
        steps: parsed.steps,
        errors: parsed.errors,
      }
    }

    sendToRenderer('apa:execution-complete', { skillName, mode: 'script', output: stdout })
    return {
      success: true,
      mode: 'script',
      output: stdout,
      steps: parsed.steps,
      errors: parsed.errors,
    }
  } catch (err) {
    const error = err as Error
    console.error(`[APA Executor] Script execution failed:`, error.message)

    sendToRenderer('apa:execution-failed', {
      skillName,
      error: error.message,
      scriptPath,
    })

    return {
      success: false,
      mode: 'script',
      output: '',
      error: error.message,
    }
  }
}

/**
 * 验证 skill — 运行脚本并解析结构化输出 + 收集截图
 */
export async function validateSkill(options: ValidateOptions): Promise<ValidationResult> {
  const { skillName, params } = options

  const scriptPath = resolveSkillScript(skillName)
  if (!scriptPath) {
    throw new Error(`未找到 skill "${skillName}" 的脚本文件`)
  }

  // 截图目录
  const screenshotDir = options.screenshotDir
    || join(homedir(), '.project4', 'skills', skillName, 'validation')
  mkdirSync(screenshotDir, { recursive: true })

  console.log(`[APA Executor] Validating skill: ${skillName}, screenshots: ${screenshotDir}`)

  const { stdout, stderr, exitCode } = await runScript(
    scriptPath,
    params,
    skillName,
    { APA_SCREENSHOT_DIR: screenshotDir }
  )

  const parsed = parseStructuredOutput(stdout, stderr)

  // 收集截图文件
  let screenshots: string[] = []
  try {
    screenshots = readdirSync(screenshotDir)
      .filter(f => /^step-\d+\.png$/i.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        return numA - numB
      })
      .map(f => join(screenshotDir, f))
  } catch {
    // 截图目录读取失败不影响验证结果
  }

  const result: ValidationResult = {
    exitCode,
    steps: parsed.steps,
    result: parsed.result,
    errors: parsed.errors,
    screenshots,
    rawStdout: stdout,
    rawStderr: stderr,
  }

  console.log(`[APA Executor] Validation complete. Exit: ${exitCode}, Steps: ${parsed.steps.length}, Errors: ${parsed.errors.length}, Screenshots: ${screenshots.length}`)
  sendToRenderer('apa:validation-complete', { skillName, result })

  return result
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
 * 更新脚本（验证修复后持久化）
 */
export function updateScript(skillName: string, newScript: string): { success: boolean; path: string } {
  const configDir = join(homedir(), '.project4')
  const skillDir = join(configDir, 'skills', skillName)

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
