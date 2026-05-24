/**
 * Agent Module - Session Consumer
 *
 * Persistent REPL consumer that mirrors CC's REPL model.
 * Unlike the old do-while loop inside processStream, this consumer runs for the
 * entire lifetime of a V2 session — it never exits between turns.
 *
 * Architecture:
 *   CC subprocess is a REPL: it loops forever, processing messages from any source
 *   (user sends, team agent internal messages, etc.) and producing output.
 *
 *   The consumer mirrors this: a persistent `while` loop that keeps calling
 *   `v2Session.stream()` to consume turn outputs. Each `stream()` call yields
 *   events for one CC turn and completes when CC produces a `result`.
 *   The loop then re-enters `stream()` to wait for the next turn.
 *
 * Turn types:
 *   1. User-initiated: sendMessage() calls v2Session.send() → CC processes → consumer picks up
 *   2. Autonomous: CC gets internal input (team agent message) → consumer picks up
 *   The consumer doesn't distinguish — it processes whatever comes out.
 *
 * Lifecycle:
 *   - Started when V2 session is created (startConsumer)
 *   - Stopped when V2 session is closed/rebuilt (consumer.stop())
 *   - Never exits between turns
 */

import type { V2SDKSession, SessionState } from './types'
import type { StreamResult } from './stream-processor'
import { processStream } from './stream-processor'
import { emitAgentEvent } from './events'
import {
  addMessage,
  updateLastMessage,
  saveSessionId,
  getConversation
} from '../conversation.service'
import { createSessionState, consumePendingRebuild } from './session-manager'

// ============================================
// Types
// ============================================

/**
 * Handle returned by startConsumer.
 * Callers use this to control the consumer lifecycle.
 */
export interface ConsumerHandle {
  /** Stop the consumer (e.g., session close/rebuild). Idempotent. */
  stop(): void
  /** True if the consumer loop is still running */
  readonly isRunning: boolean
  /** Get the current turn's SessionState (for injection, stop, etc.) */
  getActiveSessionState(): SessionState | null
}

/**
 * Internal consumer state — tracks everything the consumer needs across turns.
 */
interface ConsumerState {
  spaceId: string
  conversationId: string
  displayModel: string
  /** AbortController for the consumer loop itself (not per-turn) */
  consumerAbort: AbortController
  /** True when consumer is inside for-await (processing a turn) */
  processingTurn: boolean
  /** Current turn's SessionState (created fresh each turn) */
  currentSessionState: SessionState | null
  /** Running flag */
  running: boolean
}

// ============================================
// Consumer Factory
// ============================================

/**
 * Start a persistent consumer for a V2 session.
 *
 * The consumer runs in the background (fire-and-forget async loop).
 * It processes all turns (user-initiated and autonomous) until stopped.
 *
 * @param v2Session - The V2 SDK session to consume
 * @param spaceId - Space ID for persistence and event routing
 * @param conversationId - Conversation ID for persistence and event routing
 * @param displayModel - Display model name for thought parsing
 * @returns ConsumerHandle for lifecycle control
 */
export function startConsumer(
  v2Session: V2SDKSession,
  spaceId: string,
  conversationId: string,
  displayModel: string
): ConsumerHandle {
  const state: ConsumerState = {
    spaceId,
    conversationId,
    displayModel,
    consumerAbort: new AbortController(),
    processingTurn: false,
    currentSessionState: null,
    running: true,
  }

  // Fire and forget — errors are logged but don't propagate
  consumeLoop(v2Session, state).catch((err) => {
    if (!state.consumerAbort.signal.aborted) {
      console.error(`[Consumer][${conversationId}] Fatal error in consume loop:`, err)
    }
  }).finally(() => {
    state.running = false
    state.currentSessionState = null
    console.log(`[Consumer][${conversationId}] Consumer loop exited`)
  })

  const handle: ConsumerHandle = {
    stop() {
      if (!state.consumerAbort.signal.aborted) {
        state.consumerAbort.abort()
        console.log(`[Consumer][${conversationId}] Stop requested`)
      }
      // Also abort the current turn if one is in progress
      if (state.currentSessionState) {
        state.currentSessionState.abortController.abort()
      }
    },
    get isRunning() {
      return state.running
    },
    getActiveSessionState() {
      return state.currentSessionState
    },
  }

  return handle
}

// ============================================
// Consumer Loop
// ============================================

/**
 * The persistent consume loop.
 * Runs for the lifetime of the V2 session, processing one turn per iteration.
 */
async function consumeLoop(v2Session: V2SDKSession, state: ConsumerState): Promise<void> {
  const { spaceId, conversationId } = state

  console.log(`[Consumer][${conversationId}] Consumer started`)

  // Track consecutive empty iterations for exponential backoff
  let consecutiveEmptyIterations = 0
  const MAX_EMPTY_ITERATIONS = 5
  const BACKOFF_BASE_MS = 100

  while (!state.consumerAbort.signal.aborted) {
    // Create a fresh per-turn AbortController
    const turnAbort = new AbortController()

    // Link consumer-level abort to per-turn abort
    const onConsumerAbort = () => turnAbort.abort()
    state.consumerAbort.signal.addEventListener('abort', onConsumerAbort, { once: true })

    // Create fresh session state for this turn
    const sessionState = createSessionState(spaceId, conversationId, turnAbort)
    state.currentSessionState = sessionState
    state.processingTurn = true

    const turnStartTime = Date.now()
    let receivedAnyEvent = false
    let agentCompleteEmitted = false

    try {
      // processStream consumes one turn. The onTurnInit callback fires when CC
      // emits system:init — we create the assistant placeholder there, uniformly
      // for both user-initiated and autonomous turns.

      const result = await processStream({
        v2Session,
        sessionState,
        spaceId,
        conversationId,
        displayModel: state.displayModel,
        abortController: turnAbort,
        t0: turnStartTime,
        callbacks: {
          onRawMessage: undefined,
          onTurnInit: () => {
            receivedAnyEvent = true

            // Create assistant placeholder message for this turn
            addMessage(spaceId, conversationId, {
              role: 'assistant',
              content: '',
              toolCalls: [],
            })

            // Notify frontend to transition to generating state
            emitAgentEvent('agent:turn-start', spaceId, conversationId, {
              type: 'turn-start',
            })
          },
        },
      })

      // Turn complete — persist result and notify frontend
      if (receivedAnyEvent) {
        // Reset empty iteration counter on successful turn
        consecutiveEmptyIterations = 0

        persistTurnResult(spaceId, conversationId, result)

        // Emit agent:complete
        emitAgentEvent('agent:complete', spaceId, conversationId, {
          type: 'complete',
          duration: Date.now() - turnStartTime,
          tokenUsage: result.tokenUsage,
        })
        agentCompleteEmitted = true

        console.log(
          `[Consumer][${conversationId}] Turn complete:` +
          ` content=${result.finalContent.length} chars, thoughts=${result.thoughts.length},` +
          ` duration=${Date.now() - turnStartTime}ms`
        )

        // Check if API config changed during this turn.
        // If so, break the loop — the session will be rebuilt with new credentials
        // on the next sendMessage via getOrCreateV2Session.
        if (consumePendingRebuild(conversationId)) {
          console.log(`[Consumer][${conversationId}] Config changed during turn, breaking for rebuild`)
          break
        }
      } else {
        // stream() returned immediately with no events — CC is idle or in bad state.
        // Apply exponential backoff to avoid tight spin.
        consecutiveEmptyIterations++
        const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, consecutiveEmptyIterations - 1), 5000)
        console.log(
          `[Consumer][${conversationId}] stream() returned with no events ` +
          `(${consecutiveEmptyIterations}/${MAX_EMPTY_ITERATIONS}), backoff ${backoffMs}ms`
        )

        if (consecutiveEmptyIterations >= MAX_EMPTY_ITERATIONS) {
          console.warn(
            `[Consumer][${conversationId}] ${MAX_EMPTY_ITERATIONS} consecutive empty iterations, ` +
            `process may be in bad state — exiting consumer`
          )
          break
        }

        await sleep(backoffMs)
      }
    } catch (err) {
      if (state.consumerAbort.signal.aborted) {
        break // Consumer was stopped, exit cleanly
      }

      const error = err as Error
      console.error(`[Consumer][${conversationId}] Turn error:`, error)

      // Emit error to frontend
      emitAgentEvent('agent:error', spaceId, conversationId, {
        type: 'error',
        error: error.message || 'Unknown error. Check logs in Settings > System > Logs.',
      })

      // Persist error to conversation
      if (receivedAnyEvent) {
        updateLastMessage(spaceId, conversationId, {
          content: '',
          error: error.message,
        })
      } else {
        addMessage(spaceId, conversationId, {
          role: 'assistant',
          content: '',
          error: error.message,
          toolCalls: [],
        })
      }

      // Reset empty iteration counter — errors are not empty iterations
      consecutiveEmptyIterations = 0

      // Emit complete so frontend transitions out of generating state
      emitAgentEvent('agent:complete', spaceId, conversationId, {
        type: 'complete',
        duration: Date.now() - turnStartTime,
      })
      agentCompleteEmitted = true

      // If the error is fatal (process died), break the consumer loop
      if (isProcessDeadError(error)) {
        console.log(`[Consumer][${conversationId}] Process appears dead, exiting consumer`)
        break
      }
    } finally {
      // Safety net: guarantee agent:complete is emitted if a turn started
      if (receivedAnyEvent && !agentCompleteEmitted) {
        console.warn(`[Consumer][${conversationId}] Safety net: emitting agent:complete (missed in normal path)`)
        emitAgentEvent('agent:complete', spaceId, conversationId, {
          type: 'complete',
          duration: Date.now() - turnStartTime,
        })
      }

      state.processingTurn = false
      state.currentSessionState = null
      state.consumerAbort.signal.removeEventListener('abort', onConsumerAbort)
    }
  }

  console.log(`[Consumer][${conversationId}] Consumer loop ended`)
}

// ============================================
// Turn Handling Helpers
// ============================================

/**
 * Persist a completed turn's result to the conversation.
 */
function persistTurnResult(
  spaceId: string,
  conversationId: string,
  result: StreamResult,
): void {
  const { finalContent, thoughts, tokenUsage, capturedSessionId, hasErrorThought, errorThought } = result

  // Save session ID for future resumption
  if (capturedSessionId) {
    saveSessionId(spaceId, conversationId, capturedSessionId)
  }

  if (finalContent || hasErrorThought) {
    updateLastMessage(spaceId, conversationId, {
      content: finalContent,
      thoughts: thoughts.length > 0 ? [...thoughts] : undefined,
      tokenUsage: tokenUsage || undefined,
      error: errorThought?.content,
    })
  } else {
    // No text content — handle tool-only completion
    const hasThoughts = thoughts.length > 0
    const PLACEHOLDER_TOOLS_ONLY = 'Task completed using tools.'
    const contentToSave = hasThoughts ? PLACEHOLDER_TOOLS_ONLY : ''

    if (contentToSave || hasThoughts) {
      updateLastMessage(spaceId, conversationId, {
        content: contentToSave,
        thoughts: hasThoughts ? [...thoughts] : undefined,
        tokenUsage: tokenUsage || undefined,
        timestamp: new Date().toISOString(),
      })
    }
  }
}

/**
 * Check if an error indicates the CC process is dead (not recoverable).
 */
function isProcessDeadError(error: Error): boolean {
  const msg = error.message || ''
  return (
    msg.includes('ProcessTransport is not ready') ||
    msg.includes('exited with code') ||
    msg.includes('process exited') ||
    msg.includes('EPIPE') ||
    msg.includes('spawn ENOENT')
  )
}

/**
 * Promise-based sleep for backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
