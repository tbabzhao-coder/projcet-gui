/**
 * Agent Module - Inject Message
 *
 * Sends a mid-turn user message into an active V2 session's input stream.
 * The message is enqueued by the CC subprocess at the next tool round boundary.
 *
 * Mid-turn injection does NOT produce a separate turn/result — CC absorbs the
 * injected message into the current turn's context and continues to a single result.
 */

import { v2Sessions } from './session-manager'
import { addMessage } from '../conversation.service'

/**
 * Inject a plain-text message into an active V2 session mid-turn.
 *
 * @param conversationId - Target conversation
 * @param message - Plain text message to inject
 * @throws Error if no active V2 session exists for this conversation
 */
export function injectMessage(conversationId: string, message: string): void {
  const v2SessionInfo = v2Sessions.get(conversationId)
  if (!v2SessionInfo) {
    throw new Error(`No active V2 session for conversation: ${conversationId}`)
  }

  // Persist immediately with source:'injection' so it appears in conversation history
  addMessage(v2SessionInfo.spaceId, conversationId, {
    role: 'user',
    content: message,
    source: 'injection',
  })

  // Send to CC — absorbed at next tool boundary within the current turn
  v2SessionInfo.session.send(message)
  console.log(`[Agent][${conversationId}] Mid-turn message injected and persisted (${message.length} chars)`)
}
