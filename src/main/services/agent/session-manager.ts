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
import { getConfig, onApiConfigChange } from '../config.service'
import { getConversation } from '../conversation.service'
import { ensureOpenAICompatRouter, encodeBackendConfig } from '../../openai-compat-router'
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
  buildSystemPromptAppend,
  inferOpenAIWireApi,
  ensureWorkspaceSettings,
  syncSkillsToWorkDir,
  calculateSkillsHash,
  calculateCredentialsHash
} from './helpers'
import { buildEnvWithBundledNode } from '../node-runtime.service'
import { buildEnvWithBundledPython } from '../python-runtime.service'
import { createCanUseTool } from './permission-handler'

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
// Session Cleanup
// ============================================

// Session cleanup interval (clean up sessions not used for 30 minutes)
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
let cleanupIntervalId: NodeJS.Timeout | null = null

/**
 * Start the session cleanup interval
 */
function startSessionCleanup(): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    // Avoid TS downlevelIteration requirement (main process tsconfig doesn't force target=es2015)
    for (const [convId, info] of Array.from(v2Sessions.entries())) {
      if (now - info.lastUsedAt > SESSION_IDLE_TIMEOUT_MS) {
        console.log(`[Agent] Cleaning up idle V2 session: ${convId}`)
        try {
          info.session.close()
        } catch (e) {
          console.error(`[Agent] Error closing session ${convId}:`, e)
        }
        v2Sessions.delete(convId)
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
    // Check if config changed and requires rebuild (e.g. API key/URL changed → must rebuild so subprocess gets new env)
    if (config && needsSessionRebuild(existing, config)) {
      const credsChanged = (existing.config.credentialsHash ?? '') !== (config.credentialsHash ?? '')
      console.log(`[Agent][${conversationId}] Config changed (credentials=${credsChanged}, aiBrowser/skills may differ), rebuilding session...`)
      closeV2SessionForRebuild(conversationId)
      // Fall through to create new session
    } else {
      console.log(`[Agent][${conversationId}] Reusing existing V2 session (credentialsHash unchanged)`)
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

  // Requires SDK patch: resume parameter lets CC restore history from disk
  // Native SDK V2 Session doesn't support resume parameter
  if (sessionId) {
    sdkOptions.resume = sessionId
  }
  // Requires SDK patch: native SDK ignores most sdkOptions parameters
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

  // Get API credentials based on current aiSources configuration
  const credentials = await getApiCredentials(config)
  console.log(`[Agent] Session warm using: ${credentials.provider}, model: ${credentials.model}`)

  // Route through OpenAI compat router for non-Anthropic providers
  let anthropicBaseUrl = credentials.baseUrl
  let anthropicApiKey = credentials.apiKey
  let sdkModel = credentials.model || 'claude-opus-4-5-20251101'

  // For non-Anthropic providers (openai or OAuth), use the OpenAI compat router
  if (credentials.provider !== 'anthropic') {
    const router = await ensureOpenAICompatRouter({ debug: false })
    anthropicBaseUrl = router.baseUrl

    // Use apiType from credentials (set by provider), fallback to inference
    const apiType = credentials.apiType
      || (credentials.provider === 'oauth' ? 'chat_completions' : inferOpenAIWireApi(credentials.baseUrl))

    anthropicApiKey = encodeBackendConfig({
      url: credentials.baseUrl,
      key: credentials.apiKey,
      model: credentials.model,
      headers: credentials.customHeaders,
      apiType
    })
    // Pass a fake Claude model to CC for normal request handling
    sdkModel = 'claude-sonnet-4-20250514'
    console.log(`[Agent] ${credentials.provider} provider enabled (warm): routing via ${anthropicBaseUrl}, apiType=${apiType}`)
  }

  // Ensure workspace settings.json overrides user's global settings
  // This prevents SDK from using API key from ~/.claude/settings.json
  ensureWorkspaceSettings(workDir, anthropicApiKey, anthropicBaseUrl)

  const sdkOptions: Record<string, any> = {
    model: sdkModel,
    cwd: workDir,
    abortController,  // Consistent with sendMessage
    env: (() => {
      // IMPORTANT: Build env with bundled Node.js and Python paths
      // This sets both PATH and ORIGINAL_PATH to ensure Git Bash uses our bundled runtimes
      // Git Bash's /etc/profile rebuilds PATH using ORIGINAL_PATH, so we must set both
      let baseEnv = buildEnvWithBundledNode(process.env)
      baseEnv = buildEnvWithBundledPython(baseEnv)

      return {
        ...baseEnv,
        // Then override with our critical values (highest priority)
        ELECTRON_RUN_AS_NODE: 1,
        ELECTRON_NO_ATTACH_CONSOLE: 1,
        ANTHROPIC_API_KEY: anthropicApiKey,  // Our configured API key (overrides system)
        ANTHROPIC_BASE_URL: anthropicBaseUrl,
        // Ensure localhost bypasses proxy
        NO_PROXY: 'localhost,127.0.0.1',
        no_proxy: 'localhost,127.0.0.1',
        // Disable unnecessary API requests
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        DISABLE_TELEMETRY: '1',
        DISABLE_COST_WARNINGS: '1'
      }
    })(),
    extraArgs: {
      'dangerously-skip-permissions': null
    },
    stderr: (data: string) => {  // Consistent with sendMessage
      console.error(`[Agent][${conversationId}] CLI stderr (warm):`, data)
    },
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: buildSystemPromptAppend(workDir, credentials.model)
    },
    maxTurns: 50,
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Skill'],
    // Disable WebSearch and WebFetch tools
    disallowedTools: ['WebSearch', 'WebFetch'],
    // Load both user and project settings
    // - 'user': Load global skills from ~/.claude/skills/ (no need to copy to each workspace)
    // - 'project': Load workspace settings and skills from <workspace>/.claude/
    // Project settings take precedence, so our API key in workspace settings.json will override
    // any global API key in ~/.claude/settings.json
    settingSources: ['user', 'project'],
    permissionMode: 'acceptEdits' as const,
    canUseTool: createCanUseTool(workDir, spaceId, conversationId),  // Consistent with sendMessage
    includePartialMessages: true,
    executable: electronPath,
    executableArgs: [
      '--no-warnings',
      '--max-old-space-size=4096'  // Increase heap size to 4GB to prevent OOM on low-memory Windows machines
    ],
    // MCP servers configuration - pass through enabled servers only
    ...((() => {
      const enabledMcp = getEnabledMcpServers(config.mcpServers || {})
      return enabledMcp ? { mcpServers: enabledMcp } : {}
    })())
  }

  // Sync skills to .claude/skills/ directory before creating session
  if (config.skills && Object.keys(config.skills).length > 0) {
    console.log(`[Agent][${conversationId}] Skills configured (warm):`, Object.keys(config.skills).join(', '))
    // Import at the top of the file instead of dynamic require
    syncSkillsToWorkDir(spaceId, config.skills)
  } else {
    console.log(`[Agent][${conversationId}] No skills configured (warm)`)
  }

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
  const info = v2Sessions.get(conversationId)
  if (info) {
    console.log(`[Agent][${conversationId}] Closing V2 session`)
    try {
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session:`, e)
    }
    v2Sessions.delete(conversationId)
  }
}

/**
 * Close all V2 sessions (for app shutdown)
 */
export function closeAllV2Sessions(): void {
  console.log(`[Agent] Closing all ${v2Sessions.size} V2 sessions`)
  // Avoid TS downlevelIteration requirement
  for (const [convId, info] of Array.from(v2Sessions.entries())) {
    try {
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session ${convId}:`, e)
    }
  }
  v2Sessions.clear()

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

  for (const [convId, info] of Array.from(v2Sessions.entries())) {
    // If a request is in flight, defer closing until it finishes
    if (activeSessions.has(convId)) {
      pendingInvalidations.add(convId)
      console.log(`[Agent] Deferring session close until idle: ${convId}`)
      continue
    }

    try {
      console.log(`[Agent] Closing session: ${convId}`)
      info.session.close()
    } catch (e) {
      console.error(`[Agent] Error closing session ${convId}:`, e)
    }
  }

  // Remove only sessions that were closed immediately
  for (const convId of Array.from(v2Sessions.keys())) {
    if (!activeSessions.has(convId)) {
      v2Sessions.delete(convId)
    }
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
onApiConfigChange(() => {
  invalidateAllSessions()
})
