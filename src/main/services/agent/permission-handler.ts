/**
 * Agent Module - Permission Handler
 *
 * Handles tool permission checks and approval flows.
 * Includes file access restrictions and command execution permissions.
 */

import path from 'path'
import fs from 'fs'
import { getConfig, getClaudeConfigDir } from '../config.service'
import { isAIBrowserTool } from '../ai-browser'
import { activeSessions } from './session-manager'
import { emitAgentEvent } from './events'
import type { ToolCall } from './types'

// ============================================
// Tool Permission Types
// ============================================

export type ToolPermissionResult = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  message?: string
  interrupt?: boolean  // When true, SDK aborts the current turn immediately
}

export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
) => Promise<ToolPermissionResult>

// ============================================
// Dangerous Bash command patterns
// ============================================

const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/,
  /\brmdir\b/,
  /\bmv\b/,
  /\bchmod\b/,
  /\bchown\b/
]

function isDangerousBashCommand(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command))
}

// ============================================
// Permission Handler Factory
// ============================================

/**
 * Create tool permission handler for a specific session
 *
 * This function creates a permission checker that:
 * 1. Restricts file tools to the working directory
 * 2. Handles Bash command permissions based on config
 * 3. Allows AI Browser tools (sandboxed)
 * 4. Defaults to allow for other tools
 */
export function createCanUseTool(
  workDir: string,
  spaceId: string,
  conversationId: string
): CanUseToolFn {
  const config = getConfig()
  const absoluteWorkDir = path.resolve(workDir)

  // Helper: send approval request and wait for user response
  function askApproval(toolCall: ToolCall, toolInput: Record<string, unknown>): Promise<ToolPermissionResult> {
    emitAgentEvent('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)
    const session = activeSessions.get(conversationId)
    if (!session) {
      return Promise.resolve({ behavior: 'deny' as const, message: 'Session not found' })
    }
    return new Promise((resolve) => {
      session.pendingPermissionResolve = (approved: boolean, rejectMessage?: string) => {
        // Check if this is a "give feedback" rejection (interrupt to stop the turn)
        const isInterrupt = rejectMessage?.includes('[INTERRUPT]')
        const cleanMessage = rejectMessage?.replace('[INTERRUPT]', '').trim()
        resolve(
          approved
            ? { behavior: 'allow' as const, updatedInput: toolInput }
            : {
                behavior: 'deny' as const,
                message: cleanMessage || 'User rejected the operation',
                ...(isInterrupt ? { interrupt: true } : {})
              }
        )
      }
    })
  }

  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: { signal: AbortSignal }
  ): Promise<ToolPermissionResult> => {
    // ExitPlanMode requires user approval with plan content
    // Note: Plan mode detection removed - ExitPlanMode always requires approval
    if (toolName === 'ExitPlanMode') {
      console.log(`[Agent] ExitPlanMode requires user approval`)

      // Read plan file content to show in approval UI
      let planContent = ''
      const planFilePath = input.planFilePath as string | undefined
      if (planFilePath) {
        try {
          planContent = fs.readFileSync(planFilePath, 'utf-8')
        } catch (e) {
          console.log(`[Agent] Could not read plan file: ${planFilePath}`)
        }
      }
      // Fallback: search for the most recent plan file in Project4's claude-config/plans directory
      if (!planContent) {
        try {
          const plansDir = path.join(getClaudeConfigDir(), 'plans')
          if (fs.existsSync(plansDir)) {
            const files = fs.readdirSync(plansDir)
              .filter(f => f.endsWith('.md'))
              .map(f => ({ name: f, mtime: fs.statSync(path.join(plansDir, f)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime)
            if (files.length > 0) {
              planContent = fs.readFileSync(path.join(plansDir, files[0].name), 'utf-8')
              console.log(`[Agent] Loaded plan from ${files[0].name}`)
            }
          }
        } catch (e) {
          console.log(`[Agent] Could not find plan files:`, e)
        }
      }

      const description = planContent
        ? `📋 AI 已完成规划，是否批准并开始执行？\n\n${planContent}`
        : 'AI 已完成规划，是否批准并开始执行？'

      return askApproval({
        id: `tool-${Date.now()}`,
        name: toolName,
        status: 'waiting_approval',
        input,
        requiresApproval: true,
        description
      }, input)
    }

    if (toolName === 'Read' && typeof input.pages === 'string' && input.pages.trim() === '') {
      const { pages, ...sanitizedInput } = input
      console.log('[Agent] Sanitized Read input by removing empty pages field')
      return {
        behavior: 'allow' as const,
        updatedInput: sanitizedInput
      }
    }

    // Check file path tools - restrict to working directory
    const fileTools = ['Read', 'Write', 'Edit', 'Grep', 'Glob']
    if (fileTools.includes(toolName)) {
      const pathParam = (input.file_path || input.path) as string | undefined

      if (pathParam) {
        const absolutePath = path.resolve(pathParam)
        const isWithinWorkDir =
          absolutePath.startsWith(absoluteWorkDir + path.sep) || absolutePath === absoluteWorkDir

        if (!isWithinWorkDir) {
          return {
            behavior: 'deny' as const,
            message: `Can only access files within the current space: ${workDir}`
          }
        }

        // Write/Edit: ask approval when overwriting an existing file
        if ((toolName === 'Write' || toolName === 'Edit') && fs.existsSync(absolutePath)) {
          return askApproval({
            id: `tool-${Date.now()}`,
            name: toolName,
            status: 'waiting_approval',
            input,
            requiresApproval: true,
            description: `Overwrite existing file: ${pathParam}`
          }, input)
        }
      }
    }

    // Check Bash commands based on permission settings
    if (toolName === 'Bash') {
      const permission = config.permissions.commandExecution
      const command = (input.command as string) || ''

      if (permission === 'deny') {
        return { behavior: 'deny' as const, message: 'Command execution is disabled' }
      }

      // Always ask for dangerous commands regardless of permission mode (unless trustMode)
      if (!config.permissions.trustMode && isDangerousBashCommand(command)) {
        return askApproval({
          id: `tool-${Date.now()}`,
          name: toolName,
          status: 'waiting_approval',
          input,
          requiresApproval: true,
          description: `Dangerous command: ${command}`
        }, input)
      }

      if (permission === 'ask' && !config.permissions.trustMode) {
        return askApproval({
          id: `tool-${Date.now()}`,
          name: toolName,
          status: 'waiting_approval',
          input,
          requiresApproval: true,
          description: `Execute command: ${command}`
        }, input)
      }
    }

    // Handle AskUserQuestion - interactive user prompts
    if (toolName === 'AskUserQuestion') {
      const questions = input.questions as Array<{
        question: string
        header: string
        options: Array<{ label: string; description: string }>
        multiSelect: boolean
      }>

      // Create tool call object for UI display
      const toolCall: ToolCall = {
        id: `question-${Date.now()}`,
        name: toolName,
        status: 'waiting_approval',
        input,
        requiresApproval: true,
        description: questions?.[0]?.question || 'Waiting for user response'
      }

      emitAgentEvent('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)

      // Wait for user answers using session-specific resolver
      const session = activeSessions.get(conversationId)
      if (!session) {
        return { behavior: 'deny' as const, message: 'Session not found' }
      }

      return new Promise((resolve) => {
        session.pendingQuestionResolve = (answers: Record<string, string>) => {
          // Inject answers into tool input
          resolve({
            behavior: 'allow' as const,
            updatedInput: { ...input, answers }
          })
        }
      })
    }

    // AI Browser tools are always allowed (they run in sandboxed browser context)
    if (isAIBrowserTool(toolName)) {
      console.log(`[Agent] AI Browser tool allowed: ${toolName}`)
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // Default: allow
    return { behavior: 'allow' as const, updatedInput: input }
  }
}

// ============================================
// Tool Approval Handling
// ============================================

/**
 * Handle tool approval from renderer for a specific conversation
 */
export function handleToolApproval(conversationId: string, approved: boolean, rejectMessage?: string): void {
  const session = activeSessions.get(conversationId)
  if (session?.pendingPermissionResolve) {
    session.pendingPermissionResolve(approved, rejectMessage)
    session.pendingPermissionResolve = null
  }
}

/**
 * Handle question answer from renderer for a specific conversation
 */
export function handleQuestionAnswer(conversationId: string, answers: Record<string, string>): void {
  const session = activeSessions.get(conversationId)
  if (session?.pendingQuestionResolve) {
    session.pendingQuestionResolve(answers)
    session.pendingQuestionResolve = null
  }
}
