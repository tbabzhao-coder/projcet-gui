/**
 * Agent Module - Generation Control
 *
 * Functions for controlling agent generation including:
 * - Stop/abort generation
 * - Check if generating
 * - Get active sessions
 * - Get session state for recovery
 */

import { activeSessions, v2Sessions } from './session-manager'
import type { Thought } from './types'

// ============================================
// Stop Generation
// ============================================

/**
 * Stop generation for a specific conversation or all conversations
 *
 * @param conversationId - Optional conversation ID. If not provided, stops all.
 */
export async function stopGeneration(conversationId?: string): Promise<void> {
  if (conversationId) {
    // Stop specific session
    const session = activeSessions.get(conversationId)
    if (session) {
      session.abortController.abort()
      activeSessions.delete(conversationId)

      // Interrupt V2 Session and drain stale messages
      const v2Session = v2Sessions.get(conversationId)
      if (v2Session) {
        try {
          await (v2Session.session as any).interrupt()
          console.log(`[Agent] V2 session interrupted, draining stale messages...`)

          // Drain stale messages until we hit the result
          for await (const msg of v2Session.session.stream()) {
            console.log(`[Agent] Drained: ${msg.type}`)
            if (msg.type === 'result') break
          }
          console.log(`[Agent] Drain complete for: ${conversationId}`)
        } catch (e) {
          console.error(`[Agent] Failed to interrupt/drain V2 session:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${conversationId}`)
    }
  } else {
    // Stop all sessions (backward compatibility)
    for (const [convId, session] of Array.from(activeSessions)) {
      session.abortController.abort()

      // Interrupt V2 Session
      const v2Session = v2Sessions.get(convId)
      if (v2Session) {
        try {
          await (v2Session.session as any).interrupt()
        } catch (e) {
          console.error(`[Agent] Failed to interrupt V2 session ${convId}:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${convId}`)
    }
    activeSessions.clear()
    console.log('[Agent] All generations stopped')
  }
}

// ============================================
// Generation Status
// ============================================

/**
 * Check if a conversation has an active generation
 */
export function isGenerating(conversationId: string): boolean {
  return activeSessions.has(conversationId)
}

/**
 * Get all active session conversation IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys())
}

// ============================================
// Session State Recovery
// ============================================

/**
 * Get current session state for a conversation (for recovery after refresh)
 *
 * This is used by remote clients to recover the current state when they
 * reconnect or refresh the page during an active generation.
 */
export function getSessionState(conversationId: string): {
  isActive: boolean
  thoughts: Thought[]
  spaceId?: string
} {
  const session = activeSessions.get(conversationId)
  if (!session) {
    return { isActive: false, thoughts: [] }
  }
  return {
    isActive: true,
    thoughts: [...session.thoughts],
    spaceId: session.spaceId
  }
}
