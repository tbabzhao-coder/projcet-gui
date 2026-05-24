/**
 * Agent Module - Event Declarations
 *
 * Declares all events emitted by the agent service layer.
 * Consumers (IPC layer, HTTP routes) subscribe to these events
 * to forward them to Electron renderer and WebSocket clients.
 *
 * This decouples the agent service from BrowserWindow and any
 * specific transport mechanism.
 */

import { Emitter, type Event } from '../../platform/event'

// ============================================
// Event Types
// ============================================

/**
 * A conversation-scoped agent event.
 * Delivered to a specific conversation's listeners.
 */
export interface AgentEvent {
  /** IPC channel name (e.g. 'agent:message', 'agent:thought') */
  channel: string
  /** Space ID for routing */
  spaceId: string
  /** Conversation ID for routing */
  conversationId: string
  /** Event payload */
  data: Record<string, unknown>
}

/**
 * A global agent broadcast event.
 * Delivered to all connected clients regardless of conversation.
 */
export interface AgentBroadcastEvent {
  /** IPC channel name (e.g. 'agent:mcp-status') */
  channel: string
  /** Event payload */
  data: Record<string, unknown>
}

// ============================================
// Emitters (module-private write side)
// ============================================

const _onAgentEvent = new Emitter<AgentEvent>({
  leakWarningThreshold: 0  // High-throughput emitter, disable threshold
})

const _onAgentBroadcast = new Emitter<AgentBroadcastEvent>()

// ============================================
// Public API (read-only subscriptions)
// ============================================

/**
 * Fires for every conversation-scoped agent event.
 * IPC/WebSocket layer subscribes to forward to renderer.
 */
export const onAgentEvent: Event<AgentEvent> = _onAgentEvent.event

/**
 * Fires for global agent broadcast events (not conversation-scoped).
 * IPC/WebSocket layer subscribes to forward to all clients.
 */
export const onAgentBroadcast: Event<AgentBroadcastEvent> = _onAgentBroadcast.event

// ============================================
// Fire Functions (for agent service internals)
// ============================================

/**
 * Emit a conversation-scoped event.
 * Agent service layer calls this without knowing about BrowserWindow or WebSocket.
 */
export function emitAgentEvent(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  _onAgentEvent.fire({ channel, spaceId, conversationId, data })
}

/**
 * Emit a global broadcast event (not conversation-scoped).
 */
export function emitAgentBroadcast(
  channel: string,
  data: Record<string, unknown>
): void {
  _onAgentBroadcast.fire({ channel, data })
}
