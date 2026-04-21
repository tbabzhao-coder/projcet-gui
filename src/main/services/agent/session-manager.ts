/**
 * Agent Module - Session Manager
 *
 * Manages V2 Session lifecycle including creation, reuse, cleanup,
 * and invalidation on config changes.
 *
 * V2 Session enables process reuse: subsequent messages in the same conversation
 * reuse the running CC process, avoiding process restart each time (cold start ~3-5s).
 */

import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'
import { getConfig, onApiConfigChange, getClaudeConfigDir, type ConfigChangeInfo } from '../config.service'
import { getConversation } from '../conversation.service'
import type {
  V2SDKSession,
  V2SessionInfo,
  SessionConfig,
  SessionState,
  Thought
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials,
  getEnabledMcpServers,
  syncSkillsToConfigDir,
  calculateSkillsHash,
  calculateCredentialsHash
} from './helpers'
import {
  resolveCredentialsForSdk,
  buildBaseSdkOptions
} from './sdk-config'

// ============================================
// Session Maps
// ============================================

/**
 * Active sessions map: conversationId -> SessionState
 * Tracks in-flight requests with abort controllers and accumulated thoughts
 */
export const activeSessions = new Map<string, SessionState>()

/**
 * V2 Sessions map: conversationId -> V2SessionInfo
 * Persistent sessions that can be reused across multiple messages
 */
export const v2Sessions = new Map<string, V2SessionInfo>()

/**
 * Sessions that should be invalidated after current in-flight request finishes
 * (e.g., model switch during streaming).
 */
const pendingInvalidations = new Set<string>()

// ============================================
// Session Cleanup Helper
// ============================================

/**
 * Clean up a single V2 session: close and remove from map.
 *
 * This is the single source of truth for session cleanup logic.
 * All cleanup paths should use this function to ensure consistency.
 */
function cleanupSession(conversationId: string, reason: string): void {
  const info = v2Sessions.get(conversationId)
  if (!info) return

  console.log(`[Agent][${conversationId}] Cleaning up session: ${reason}`)

  try {
    info.session.close()  // Release FDs (stdin/stdout/stderr pipes)
  } catch (e) {
    // Ignore close errors - session may already be dead
  }

  v2Sessions.delete(conversationId)
}

// ============================================
// Session Health Check
// ============================================

/**
 * Check if a V2 session's underlying process is still alive and ready.
 *
 * This checks the SDK's internal transport state, which is the Single Source of Truth
 * for process health. The transport.ready flag is set to false when:
 * - Process exits (normal or abnormal)
 * - Process is killed (OOM, signal, etc.)
 * - Transport is closed
 *
 * Without this check, we'd try to reuse a dead session and get
 * "ProcessTransport is not ready" errors.
 */
function isSessionTransportReady(session: V2SDKSession): boolean {
  try {
    const query = (session as any).query
    const transport = query?.transport

    if (!transport) return false

    if (typeof transport.isReady === 'function') {
      return transport.isReady()
    }

    if (typeof transport.ready === 'boolean') {
      return transport.ready
    }

    // Can't determine state — assume ready (conservative, avoids unnecessary recreation)
    return true
  } catch (e) {
    console.error(`[Agent] Error checking session transport state:`, e)
    return false
  }
}

// ============================================
// Process Exit Listener
// ============================================

/**
 * Register a listener for process exit events (event-driven cleanup).
 *
 * When the CC subprocess dies (OOM, crash, signal), we get notified immediately
 * and call session.close() to release FDs. This prevents FD leaks without
 * waiting for the next polling cycle.
 *
 * Each session holds 3 FDs (stdin/stdout/stderr pipes) on the parent process side.
 * Accumulated FD leaks can cause "spawn EBADF" errors.
 */
function registerProcessExitListener(session: V2SDKSession, conversationId: string): void {
  try {
    const transport = (session as any).query?.transport

    if (!transport) {
      console.warn(`[Agent][${conversationId}] Cannot register exit listener: no transport`)
      return
    }

    if (typeof transport.onExit === 'function') {
      transport.onExit((error: Error | undefined) => {
        const errorMsg = error ? `: ${error.message}` : ''
        cleanupSession(conversationId, `process exited${errorMsg}`)
        console.log(`[Agent][${conversationId}] Remaining sessions: ${v2Sessions.size}`)
      })
      console.log(`[Agent][${conversationId}] Process exit listener registered`)
    } else {
      console.warn(`[Agent][${conversationId}] SDK transport.onExit not available, relying on polling cleanup`)
    }
  } catch (e) {
    console.error(`[Agent][${conversationId}] Failed to register exit listener:`, e)
    // Not fatal - polling cleanup is the fallback
  }
}

// ============================================
// Session Cleanup (Polling Fallback)
// ============================================

// Session cleanup interval (clean up sessions not used for 30 minutes)
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
let cleanupIntervalId: NodeJS.Timeout | null = null

/**
 * Start the session cleanup interval (polling fallback).
 *
 * Primary cleanup is event-driven via registerProcessExitListener().
 * This fallback handles cases where onExit doesn't fire (SDK changes, edge cases).
 */
function startSessionCleanup(): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    for (const [convId, info] of Array.from(v2Sessions.entries())) {
      // Check 1: Clean up sessions with dead processes (killed by OS, crashed, etc.)
      if (!isSessionTransportReady(info.session)) {
        cleanupSession(convId, 'process not ready (polling fallback)')
        continue
      }

      // Check 2: Clean up idle sessions (not used for 30 minutes)
      // Skip sessions with an in-flight request — they are not idle.
      if (activeSessions.has(convId)) {
        info.lastUsedAt = now // keep the clock fresh so timeout resets after task ends
        continue
      }
      if (now - info.lastUsedAt > SESSION_IDLE_TIMEOUT_MS) {
        cleanupSession(convId, 'idle timeout (30 min)')
      }
    }
  }, 60 * 1000) // Check every minute
}

/**
 * Stop the session cleanup interval
 */
export function stopSessionCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

// ============================================
// Session Config Comparison
// ============================================

/**
 * Check if session config requires rebuild
 * Only "process-level" params need rebuild; runtime params use setXxx() methods.
 * When API key or base URL changes, we must rebuild so the child process gets new env/settings.
 */
export function needsSessionRebuild(existing: V2SessionInfo, newConfig: SessionConfig): boolean {
  const aiBrowserChanged = existing.config.aiBrowserEnabled !== newConfig.aiBrowserEnabled
  const skillsChanged = existing.config.skillsHash !== newConfig.skillsHash
  const credentialsChanged = (existing.config.credentialsHash ?? '') !== (newConfig.credentialsHash ?? '')

  if (aiBrowserChanged || skillsChanged || credentialsChanged) {
    console.log(`[Agent] Session rebuild needed: aiBrowser=${aiBrowserChanged}, skills=${skillsChanged}, credentials=${credentialsChanged}`)
    return true
  }

  return false
}

/**
 * Close and remove an existing V2 session (internal helper for rebuild)
 */
function closeV2SessionForRebuild(conversationId: string): void {
  const existing = v2Sessions.get(conversationId)
  if (existing) {
    console.log(`[Agent][${conversationId}] Closing V2 session for rebuild`)
    try {
      existing.session.close()
    } catch (e) {
      console.error(`[Agent][${conversationId}] Error closing session:`, e)
    }
    v2Sessions.delete(conversationId)
  }
}

// ============================================
// Session Creation
// ============================================

/**
 * Get or create V2 Session
 *
 * V2 Session enables process reuse: subsequent messages in the same conversation
 * reuse the running CC process, avoiding process restart each time (cold start ~3-5s).
 *
 * Note: Requires SDK patch for full parameter pass-through.
 * When sessionId is provided, CC restores conversation history from disk.
 *
 * @param spaceId - Space ID
 * @param conversationId - Conversation ID
 * @param sdkOptions - SDK options for session creation
 * @param sessionId - Optional session ID for resumption
 * @param config - Session configuration for rebuild detection
 */
export async function getOrCreateV2Session(
  spaceId: string,
  conversationId: string,
  sdkOptions: Record<string, any>,
  sessionId?: string,
  config?: SessionConfig
): Promise<V2SessionInfo['session']> {
  // Check if we have an existing session for this conversation
  const existing = v2Sessions.get(conversationId)
  if (existing) {
    // CRITICAL: First check if the underlying process is still alive
    // The CC subprocess may have been killed by OS (OOM, etc.) or crashed,
    // but our v2Sessions Map still holds a reference to the dead session.
    // We must check SDK's transport state (Single Source of Truth) before reusing.
    if (!isSessionTransportReady(existing.session)) {
      console.log(`[Agent][${conversationId}] Session transport not ready (process dead), recreating...`)
      cleanupSession(conversationId, 'process not ready')
      // Fall through to create new session
    } else if (config && needsSessionRebuild(existing, config)) {
      // Check if config changed and requires rebuild
      const credsChanged = (existing.config.credentialsHash ?? '') !== (config.credentialsHash ?? '')
      console.log(`[Agent][${conversationId}] Config changed (credentials=${credsChanged}, aiBrowser/skills may differ), rebuilding session...`)

      // If a request is in flight for this conversation, defer rebuild to avoid
      // killing the active session (same strategy as invalidateAllSessions)
      if (activeSessions.has(conversationId)) {
        console.log(`[Agent][${conversationId}] Config changed but request in flight, deferring rebuild`)
        pendingInvalidations.add(conversationId)
        existing.lastUsedAt = Date.now()
        return existing.session
      }

      cleanupSession(conversationId, 'config changed')
      // Fall through to create new session
    } else {
      console.log(`[Agent][${conversationId}] Reusing existing V2 session`)
      existing.lastUsedAt = Date.now()
      return existing.session
    }
  }

  // Create new session
  // If sessionId exists, pass resume to let CC restore history from disk
  // After first message, the process stays alive and maintains context in memory
  console.log(`[Agent][${conversationId}] Creating new V2 session...`)
  if (sessionId) {
    console.log(`[Agent][${conversationId}] With resume: ${sessionId}`)
  }
  const startTime = Date.now()

  // resume is passed through via SDK patch to ProcessTransport
  if (sessionId) {
    sdkOptions.resume = sessionId
  }
  // SDK patch passes additional options beyond SDKSessionOptions type definition
  // Use 'as any' to bypass type check, actual params handled by patched SDK
  const session = (await unstable_v2_createSession(sdkOptions as any)) as unknown as V2SDKSession

  console.log(`[Agent][${conversationId}] V2 session created in ${Date.now() - startTime}ms`)

  // Store session with config
  v2Sessions.set(conversationId, {
    session,
    spaceId,
    conversationId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    config: config || { aiBrowserEnabled: false }
  })

  // Register process exit listener for immediate cleanup (event-driven, better than polling)
  registerProcessExitListener(session, conversationId)

  // Start cleanup if not already running
  startSessionCleanup()

  return session
}

// ============================================
// Session Warm-up
// ============================================

/**
 * Warm up V2 Session (called when user switches conversations)
 *
 * Pre-initialize or reuse V2 Session to avoid delay when sending messages.
 * Frontend calls this when user clicks a conversation, no need to wait for completion.
 *
 * Flow:
 * 1. User clicks conversation A → frontend immediately calls ensureSessionWarm()
 * 2. V2 Session initializes in background (non-blocking UI)
 * 3. User finishes typing and sends → V2 Session ready, send directly (fast)
 *
 * Important: Parameters must be identical to sendMessage for session reliability
 */
export async function ensureSessionWarm(
  spaceId: string,
  conversationId: string
): Promise<void> {
  const config = getConfig()
  const workDir = getWorkingDir(spaceId)
  const conversation = getConversation(spaceId, conversationId)
  const sessionId = conversation?.sessionId
  const electronPath = getHeadlessElectronPath()

  // Create abortController - consistent with sendMessage
  const abortController = new AbortController()

  // Get API credentials and resolve for SDK use
  const credentials = await getApiCredentials(config)
  console.log(`[Agent] Session warm using: ${credentials.provider}, model: ${credentials.model}`)

  // Resolve credentials for SDK (handles OpenAI compat router for non-Anthropic providers)
  const resolvedCredentials = await resolveCredentialsForSdk(credentials)

  // Get enabled MCP servers
  const enabledMcpServers = getEnabledMcpServers(config.mcpServers || {})

  // Build SDK options using shared configuration
  const sdkOptions = buildBaseSdkOptions({
    credentials: resolvedCredentials,
    workDir,
    electronPath,
    spaceId,
    conversationId,
    abortController,
    stderrHandler: (data: string) => {
      console.error(`[Agent][${conversationId}] CLI stderr (warm):`, data)
    },
    mcpServers: enabledMcpServers,
    maxTurns: config.agent?.maxTurns
  })

  // Session config for rebuild detection (must match sendMessage so reuse/rebuild is consistent)
  const sessionConfig: SessionConfig = {
    aiBrowserEnabled: false,  // Warm doesn't know request-level aiBrowser; sendMessage will rebuild if true
    skillsHash: calculateSkillsHash(config.skills),
    credentialsHash: calculateCredentialsHash(credentials)
  }

  try {
    console.log(`[Agent] Warming up V2 session: ${conversationId}`)
    await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)
    console.log(`[Agent] V2 session warmed up: ${conversationId}`)
  } catch (error) {
    console.error(`[Agent] Failed to warm up session ${conversationId}:`, error)
    // Don't throw on warm-up failure, sendMessage() will reinitialize (just slower)
  }
}

// ============================================
// Session Lifecycle
// ============================================

/**
 * Close V2 session for a conversation
 */
export function closeV2Session(conversationId: string): void {
  cleanupSession(conversationId, 'explicit close')
}

/**
 * Close all V2 sessions (for app shutdown)
 */
export function closeAllV2Sessions(): void {
  const count = v2Sessions.size
  console.log(`[Agent] Closing all ${count} V2 sessions`)
  for (const convId of Array.from(v2Sessions.keys())) {
    cleanupSession(convId, 'app shutdown')
  }
  stopSessionCleanup()
}

/**
 * Invalidate all V2 sessions due to API config change.
 * Called by config.service via callback when API config changes.
 *
 * Sessions are closed immediately, but users are not interrupted.
 * New sessions will be created with updated config on next message.
 */
export function invalidateAllSessions(): void {
  const count = v2Sessions.size
  if (count === 0) {
    console.log('[Agent] No active sessions to invalidate')
    return
  }

  console.log(`[Agent] Invalidating ${count} sessions due to API config change`)

  for (const convId of Array.from(v2Sessions.keys())) {
    // If a request is in flight, defer closing until it finishes
    if (activeSessions.has(convId)) {
      pendingInvalidations.add(convId)
      console.log(`[Agent] Deferring session close until idle: ${convId}`)
      continue
    }
    cleanupSession(convId, 'API config change')
  }

  console.log('[Agent] All sessions invalidated, will use new config on next message')
}

// ============================================
// Active Session State
// ============================================

/**
 * Create a new active session state
 */
export function createSessionState(
  spaceId: string,
  conversationId: string,
  abortController: AbortController
): SessionState {
  return {
    abortController,
    spaceId,
    conversationId,
    pendingPermissionResolve: null,
    pendingQuestionResolve: null,
    thoughts: []
  }
}

/**
 * Register an active session
 */
export function registerActiveSession(conversationId: string, state: SessionState): void {
  activeSessions.set(conversationId, state)
}

/**
 * Unregister an active session
 */
export function unregisterActiveSession(conversationId: string): void {
  activeSessions.delete(conversationId)

  if (pendingInvalidations.has(conversationId)) {
    pendingInvalidations.delete(conversationId)
    closeV2Session(conversationId)
  }
}

// ============================================
// Pending Rebuild (for Consumer pattern)
// ============================================

/** Conversations that need session rebuild after current turn completes */
const pendingRebuilds = new Set<string>()

/**
 * Mark a conversation for session rebuild after the current consumer turn completes.
 * Called by config change handler when credentials change during an active turn.
 */
export function markPendingRebuild(conversationId: string): void {
  pendingRebuilds.add(conversationId)
}

/**
 * Check and consume a pending rebuild flag.
 * Called by session-consumer after each turn to decide whether to break the loop.
 * Returns true if a rebuild was pending (and clears the flag).
 */
export function consumePendingRebuild(conversationId: string): boolean {
  if (pendingRebuilds.has(conversationId)) {
    pendingRebuilds.delete(conversationId)
    return true
  }
  return false
}

/**
 * Get an active session by conversation ID
 */
export function getActiveSession(conversationId: string): SessionState | undefined {
  return activeSessions.get(conversationId)
}

// ============================================
// Config Change Handler Registration
// ============================================

// Register for API config change notifications
// This is called once when the module loads
onApiConfigChange((info: ConfigChangeInfo) => {
  invalidateAllSessions()
  // Only re-sync skills when skills config actually changed
  if (info.skillsChanged) {
    const config = getConfig()
    if (config.skills && Object.keys(config.skills).length > 0) {
      syncSkillsToConfigDir(config.skills)
    }
  }
})

// Sync skills once on module load (app startup)
// This ensures skills are available before the first warm-up or send
;(() => {
  const config = getConfig()
  if (config.skills && Object.keys(config.skills).length > 0) {
    syncSkillsToConfigDir(config.skills)
  }
})()
