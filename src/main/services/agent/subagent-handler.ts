/**
 * Agent Module - Sub-Agent Message Handler
 *
 * Processes SDK messages from sub-agents (those with parent_tool_use_id != null).
 * These messages contain the sub-agent's individual tool_use and tool_result blocks,
 * streamed in real-time by the SDK's queryHelpers.ts agent_progress mechanism.
 *
 * Unlike the main agent path (which uses stream_event for token-level streaming),
 * sub-agent messages arrive as complete assistant/user SDK messages. This module
 * parses them into Thought objects with parentToolUseId set, enabling the frontend
 * to render them nested under the parent Task thought.
 *
 * Also handles task lifecycle events (task_started, task_progress, task_notification)
 * which provide agent-level metadata for the Task thought's progress display.
 */

import type { Thought, TaskProgress, SessionState } from './types'
import { emitAgentEvent } from './events'

// ============================================
// Types
// ============================================

/** Context passed from stream-processor for routing sub-agent events */
export interface SubAgentContext {
  spaceId: string
  conversationId: string
  sessionState: SessionState
  /** Maps SDK tool_use_id → Thought.id for merging tool_result into tool_use */
  toolIdToThoughtId: Map<string, string>
}

// ============================================
// Team Task Detection
// ============================================

/**
 * Check if any Agent Team tasks are still running.
 *
 * Detection logic: a thought is a team agent if it's a tool_use for the Agent tool
 * with a team_name in its input. It's "active" if it has no taskProgress yet
 * or taskProgress.status is 'running'.
 *
 * Exit conditions:
 * 1. A successful TeamDelete tool call is present → team is disbanded.
 * 2. All Agent tool_use thoughts have taskProgress.status !== 'running'.
 */
export function hasActiveTeamTasks(thoughts: Thought[]): boolean {
  const hasTeamAgents = thoughts.some(
    t => t.type === 'tool_use'
      && t.toolName === 'Agent'
      && (t.toolInput as Record<string, unknown>)?.team_name
  )
  if (!hasTeamAgents) return false

  // Team exists — only done when TeamDelete succeeded.
  const teamDisbanded = thoughts.some(t => {
    if (t.type !== 'tool_use' || t.toolName !== 'TeamDelete' || !t.toolResult) return false
    try {
      const parsed = JSON.parse(t.toolResult.output)
      if (parsed?.success === true) return true
      if (Array.isArray(parsed)) {
        for (const block of parsed) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            try {
              if (JSON.parse(block.text)?.success === true) return true
            } catch { /* inner parse failure */ }
          }
        }
      }
      return false
    } catch { return false }
  })

  return !teamDisbanded
}

// ============================================
// Sub-Agent Message Processing
// ============================================

function generateThoughtId(): string {
  return `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Process a sub-agent SDK message (assistant or user with parent_tool_use_id).
 */
export function handleSubAgentMessage(
  sdkMessage: any,
  parentToolUseId: string,
  ctx: SubAgentContext
): void {
  const { spaceId, conversationId, sessionState, toolIdToThoughtId } = ctx
  const timestamp = new Date().toISOString()

  const resolvedParentId = toolIdToThoughtId.get(parentToolUseId) ?? parentToolUseId

  if (sdkMessage.type === 'assistant') {
    const content = sdkMessage.message?.content
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'tool_use') {
        const thoughtId = generateThoughtId()
        const toolId = block.id || thoughtId
        const toolName = block.name || 'Unknown'

        let toolInput: Record<string, unknown> = {}
        try {
          if (typeof block.input === 'object' && block.input !== null) {
            toolInput = block.input
          } else if (typeof block.input === 'string') {
            toolInput = JSON.parse(block.input)
          }
        } catch {
          // Input parse failure is non-fatal
        }

        toolIdToThoughtId.set(toolId, thoughtId)

        const thought: Thought = {
          id: thoughtId,
          type: 'tool_use',
          content: '',
          timestamp,
          toolName,
          toolInput,
          isStreaming: false,
          isReady: true,
          parentToolUseId: resolvedParentId,
        }

        sessionState.thoughts.push(thought)
        emitAgentEvent('agent:thought', spaceId, conversationId, { thought })

        console.log(`[SubAgent][${conversationId}] tool_use: ${toolName} (parent=${resolvedParentId})`)
      }
    }
  } else if (sdkMessage.type === 'user') {
    const content = sdkMessage.message?.content
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'tool_result') {
        const toolId = block.tool_use_id
        const isError = block.is_error || false
        const resultContent = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content)

        const toolUseThoughtId = toolId ? toolIdToThoughtId.get(toolId) : undefined
        if (toolUseThoughtId) {
          const toolResult = {
            output: resultContent,
            isError,
            timestamp,
          }

          const toolUseThought = sessionState.thoughts.find(t => t.id === toolUseThoughtId)
          if (toolUseThought) {
            toolUseThought.toolResult = toolResult
          }

          emitAgentEvent('agent:thought-delta', spaceId, conversationId, {
            thoughtId: toolUseThoughtId,
            toolResult,
            isToolResult: true,
          })

          console.log(`[SubAgent][${conversationId}] tool_result merged into ${toolUseThoughtId}`)
        } else {
          const thought: Thought = {
            id: toolId || generateThoughtId(),
            type: 'tool_result',
            content: isError ? 'Tool execution failed' : 'Tool execution succeeded',
            timestamp,
            toolOutput: resultContent,
            isError,
            parentToolUseId: resolvedParentId,
          }
          sessionState.thoughts.push(thought)
          emitAgentEvent('agent:thought', spaceId, conversationId, { thought })
          console.log(`[SubAgent][${conversationId}] tool_result orphaned (parent=${parentToolUseId})`)
        }
      }
    }
  }
}

// ============================================
// Task Lifecycle Events
// ============================================

const taskStartedAt = new Map<string, number>()

export function handleTaskStarted(
  msg: Record<string, unknown>,
  ctx: SubAgentContext
): void {
  const { spaceId, conversationId, sessionState } = ctx
  const taskId = msg.task_id as string
  const toolUseId = msg.tool_use_id as string | undefined

  taskStartedAt.set(taskId, Date.now())
  console.log(`[SubAgent][${conversationId}] task_started: taskId=${taskId} toolUseId=${toolUseId ?? 'none'}`)

  if (!toolUseId) return

  const thoughtId = ctx.toolIdToThoughtId.get(toolUseId)
  const taskThought = thoughtId
    ? sessionState.thoughts.find(t => t.id === thoughtId)
    : undefined

  if (taskThought) {
    taskThought.taskProgress = {
      taskId,
      status: 'running',
      toolCount: 0,
      durationMs: 0,
    }

    emitAgentEvent('agent:thought-delta', spaceId, conversationId, {
      thoughtId: taskThought.id,
      taskProgress: taskThought.taskProgress,
    })

    console.log(`[SubAgent][${conversationId}] task_started: ${taskId} → thought ${taskThought.id}`)
  }
}

export function handleTaskProgress(
  msg: Record<string, unknown>,
  ctx: SubAgentContext
): void {
  const { spaceId, conversationId, sessionState } = ctx
  const taskId = msg.task_id as string
  const usage = msg.usage as { total_tokens: number; tool_uses: number; duration_ms: number } | undefined

  const taskThought = sessionState.thoughts.find(
    t => t.taskProgress?.taskId === taskId
  )

  if (taskThought && taskThought.taskProgress) {
    taskThought.taskProgress.lastToolName = (msg.last_tool_name as string) ?? taskThought.taskProgress.lastToolName
    taskThought.taskProgress.toolCount = usage?.tool_uses ?? taskThought.taskProgress.toolCount
    taskThought.taskProgress.durationMs = usage?.duration_ms ?? taskThought.taskProgress.durationMs
    taskThought.taskProgress.totalTokens = usage?.total_tokens ?? taskThought.taskProgress.totalTokens
    if (msg.summary) {
      taskThought.taskProgress.summary = msg.summary as string
    }

    emitAgentEvent('agent:thought-delta', spaceId, conversationId, {
      thoughtId: taskThought.id,
      taskProgress: { ...taskThought.taskProgress },
    })
  }
}

export function handleTaskNotification(
  msg: Record<string, unknown>,
  ctx: SubAgentContext
): void {
  const { spaceId, conversationId, sessionState } = ctx
  const taskId = msg.task_id as string
  const status = (msg.status as string) ?? 'completed'
  const usage = msg.usage as { total_tokens: number; tool_uses: number; duration_ms: number } | undefined

  taskStartedAt.delete(taskId)

  const taskThought = sessionState.thoughts.find(
    t => t.taskProgress?.taskId === taskId
  )

  if (taskThought && taskThought.taskProgress) {
    taskThought.taskProgress.status = status as TaskProgress['status']
    taskThought.taskProgress.summary = (msg.summary as string) ?? taskThought.taskProgress.summary
    taskThought.taskProgress.toolCount = usage?.tool_uses ?? taskThought.taskProgress.toolCount
    taskThought.taskProgress.durationMs = usage?.duration_ms ?? taskThought.taskProgress.durationMs
    taskThought.taskProgress.totalTokens = usage?.total_tokens ?? taskThought.taskProgress.totalTokens

    emitAgentEvent('agent:thought-delta', spaceId, conversationId, {
      thoughtId: taskThought.id,
      taskProgress: { ...taskThought.taskProgress },
    })

    console.log(`[SubAgent][${conversationId}] task_notification: ${taskId} status=${status}`)
  }
}
