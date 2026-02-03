/**
 * Agent Module - Permission Handler
 *
 * Handles tool permission checks and approval flows.
 * Includes file access restrictions and command execution permissions.
 */

import path from 'path'
import { getConfig } from '../config.service'
import { isAIBrowserTool } from '../ai-browser'
import { activeSessions } from './session-manager'
import { sendToRenderer } from './helpers'
import type { ToolCall } from './types'

// ============================================
// Tool Permission Types
// ============================================

export type ToolPermissionResult = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  message?: string
}

export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
) => Promise<ToolPermissionResult>

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

  console.log(`[Agent] Creating canUseTool with workDir: ${absoluteWorkDir}`)

  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: { signal: AbortSignal }
  ): Promise<ToolPermissionResult> => {
    console.log(`[Agent] canUseTool called - Tool: ${toolName}, Input:`, JSON.stringify(input).substring(0, 200))

    // Check file path tools - restrict to working directory
    const fileTools = ['Read', 'Write', 'Edit', 'Grep', 'Glob']
    if (fileTools.includes(toolName)) {
      const pathParam = (input.file_path || input.path) as string | undefined

      if (pathParam) {
        const absolutePath = path.resolve(pathParam)
        const isWithinWorkDir =
          absolutePath.startsWith(absoluteWorkDir + path.sep) || absolutePath === absoluteWorkDir

        if (!isWithinWorkDir) {
          console.log(`[Agent] Security: Blocked access to: ${pathParam}`)
          return {
            behavior: 'deny' as const,
            message: `Can only access files within the current space: ${workDir}`
          }
        }
      }
    }

    // Check Bash commands based on permission settings
    if (toolName === 'Bash') {
      const permission = config.permissions.commandExecution

      if (permission === 'deny') {
        return {
          behavior: 'deny' as const,
          message: 'Command execution is disabled'
        }
      }

      if (permission === 'ask' && !config.permissions.trustMode) {
        // Send permission request to renderer with session IDs
        const toolCall: ToolCall = {
          id: `tool-${Date.now()}`,
          name: toolName,
          status: 'waiting_approval',
          input,
          requiresApproval: true,
          description: `Execute command: ${input.command}`
        }

        sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)

        // Wait for user response using session-specific resolver
        const session = activeSessions.get(conversationId)
        if (!session) {
          return { behavior: 'deny' as const, message: 'Session not found' }
        }

        return new Promise((resolve) => {
          session.pendingPermissionResolve = (approved: boolean) => {
            if (approved) {
              resolve({ behavior: 'allow' as const })
            } else {
              resolve({
                behavior: 'deny' as const,
                message: 'User rejected command execution'
              })
            }
          }
        })
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

      sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall as unknown as Record<string, unknown>)

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
      return { behavior: 'allow' as const }
    }

    // Default: allow
    return { behavior: 'allow' as const }
  }
}

// ============================================
// Tool Approval Handling
// ============================================

/**
 * Handle tool approval from renderer for a specific conversation
 */
export function handleToolApproval(conversationId: string, approved: boolean): void {
  const session = activeSessions.get(conversationId)
  if (session?.pendingPermissionResolve) {
    session.pendingPermissionResolve(approved)
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
