/**
 * Agent Module - SDK Configuration Builder
 *
 * Pure functions for building SDK configuration.
 * Centralizes all SDK-related configuration logic to ensure consistency
 * between send-message.ts and session-manager.ts.
 */

import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { getClaudeConfigDir } from '../config.service'
import { ensureOpenAICompatRouter, encodeBackendConfig } from '../../openai-compat-router'
import { buildEnvWithBundledNode, getBundledPlaywrightBrowsersPath } from '../node-runtime.service'
import { buildEnvWithBundledPython } from '../python-runtime.service'
import { buildEnvWithLarkCli } from '../lark-cli-runtime.service'
import type { ApiCredentials } from './types'
import { inferOpenAIWireApi } from './helpers'
import { buildSystemPromptAppend } from './helpers'
import { createCanUseTool } from './permission-handler'

// ============================================
// Types
// ============================================

/**
 * Resolved credentials ready for SDK use.
 * This is the output of credential resolution process.
 */
export interface ResolvedSdkCredentials {
  /** Base URL for Anthropic API (may be OpenAI compat router) */
  anthropicBaseUrl: string
  /** API key for Anthropic API (may be encoded backend config) */
  anthropicApiKey: string
  /** Model to pass to SDK (may be fake Claude model for compat) */
  sdkModel: string
  /** User's actual configured model name (for display) */
  displayModel: string
}

/**
 * Parameters for building SDK environment variables
 */
export interface SdkEnvParams {
  anthropicApiKey: string
  anthropicBaseUrl: string
}

/**
 * Parameters for building base SDK options
 */
export interface BaseSdkOptionsParams {
  /** Resolved SDK credentials */
  credentials: ResolvedSdkCredentials
  /** Working directory for the agent */
  workDir: string
  /** Path to headless Electron binary */
  electronPath: string
  /** Space ID */
  spaceId: string
  /** Conversation ID */
  conversationId: string
  /** Abort controller for cancellation */
  abortController: AbortController
  /** Optional stderr handler (for error accumulation) */
  stderrHandler?: (data: string) => void
  /** Optional MCP servers configuration */
  mcpServers?: Record<string, any> | null
  /** Maximum tool call turns per message (from config, default 50) */
  maxTurns?: number
}

// ============================================
// Sandbox Settings (written to settings.json)
// ============================================

/**
 * Sandbox configuration
 *
 * Sandbox is enabled primarily for performance optimization (skips some runtime checks).
 * Network and filesystem access are intentionally permissive - the goal is not strict
 * security isolation, but rather to enable SDK's internal optimizations.
 *
 * Security note: SDK has built-in filesystem restrictions (e.g., protecting Project4 config files)
 * that are separate from these sandbox settings.
 */
const SANDBOX_CONFIG = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  network: {
    allowedDomains: ['*'],        // Allow all domains
    allowAllUnixSockets: true,    // Allow Docker, databases, etc.
    allowLocalBinding: true       // Allow starting local servers
  }
}

/**
 * Ensure settings.json exists in CLAUDE_CONFIG_DIR with API credentials and sandbox config.
 *
 * By writing sandbox to the settings file, the CLI reads it natively
 * without needing --settings flag. This avoids the CLI writing a temp file
 * to $TMPDIR and chokidar watching the entire tmpdir (which crashes on
 * macOS due to Unix socket files like CloudClient).
 */
let _lastSettingsHash: string | null = null

export function ensureClaudeConfigSettings(apiKey: string, baseUrl: string): void {
  const configDir = getClaudeConfigDir()

  // Create claude-config directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Skip write if nothing changed
  const currentHash = `${apiKey}|${baseUrl}`
  if (_lastSettingsHash === currentHash && existsSync(join(configDir, 'settings.json'))) {
    return
  }

  const settingsFile = join(configDir, 'settings.json')

  // Read existing settings if any
  let settings: Record<string, any> = {}
  if (existsSync(settingsFile)) {
    try {
      const content = readFileSync(settingsFile, 'utf-8')
      settings = JSON.parse(content)
    } catch (e) {
      console.warn(`[SDK Config] Failed to read existing settings.json: ${e}`)
    }
  }

  // Override API key and base URL
  settings.anthropicApiKey = apiKey
  settings.anthropicBaseUrl = baseUrl

  // Add sandbox configuration (performance optimization + avoid tmpdir temp files)
  // This prevents CLI from creating temp files in $TMPDIR which can cause chokidar
  // to watch the entire tmpdir and crash on macOS (Unix socket files like CloudClient)
  settings.sandbox = SANDBOX_CONFIG

  writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  _lastSettingsHash = currentHash
  console.log(`[SDK Config] ========================================`)
  console.log(`[SDK Config] Claude config settings.json updated:`)
  console.log(`[SDK Config]   File: ${settingsFile}`)
  console.log(`[SDK Config]   API Key (first 10 chars): ${apiKey.substring(0, 10)}...`)
  console.log(`[SDK Config]   Base URL: ${baseUrl}`)
  console.log(`[SDK Config]   Sandbox: enabled (performance + avoid tmpdir)`)
  console.log(`[SDK Config]   CLAUDE_CONFIG_DIR isolation active`)
  console.log(`[SDK Config] ========================================`)
}

// ============================================
// Credential Resolution
// ============================================

/**
 * Resolve API credentials for SDK use.
 *
 * This function handles the complexity of different providers:
 * - Anthropic: Direct connection to Anthropic API
 * - OpenAI/OAuth: Route through OpenAI compat router with encoded config
 *
 * Important: The model is encoded into the apiKey (ANTHROPIC_API_KEY env var)
 * at session creation time. Model changes require session rebuild — they cannot
 * be switched dynamically via setModel().
 *
 * @param credentials - Raw API credentials from getApiCredentials()
 * @returns Resolved credentials ready for SDK
 */
export async function resolveCredentialsForSdk(
  credentials: ApiCredentials
): Promise<ResolvedSdkCredentials> {
  // Start with direct values
  let anthropicBaseUrl = credentials.baseUrl
  let anthropicApiKey = credentials.apiKey
  let sdkModel = credentials.model || 'claude-opus-4-5-20251101'
  const displayModel = credentials.model

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

    console.log(`[SDK Config] ${credentials.provider} provider: routing via ${anthropicBaseUrl}, apiType=${apiType}`)
  } else {
    console.log(`[SDK Config] Anthropic provider: direct connection to ${anthropicBaseUrl}`)
  }

  return {
    anthropicBaseUrl,
    anthropicApiKey,
    sdkModel,
    displayModel
  }
}

// ============================================
// Environment Variables
// ============================================

/**
 * Prefixes to strip from inherited env before spawning CC subprocess.
 * Prevents leaked vars (ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY, CLAUDE_CODE_SSE_PORT, etc.)
 * from overriding Project4's explicit configuration.
 */
const AI_SDK_ENV_PREFIXES = ['ANTHROPIC_', 'OPENAI_', 'CLAUDE_']

/**
 * Copy of process.env with all AI SDK variables removed.
 */
export function getCleanUserEnv(): Record<string, string | undefined> {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (AI_SDK_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) {
      delete env[key]
    }
  }
  return env
}

/**
 * Build env for CC subprocess.
 * Inherits user env (PATH, HOME, SSH, proxy, etc.) for toolchain compat,
 * strips AI SDK vars, then sets exactly what CC needs.
 */
export function buildSdkEnv(params: SdkEnvParams): Record<string, string | number> {
  // IMPORTANT: Build env with bundled Node.js and Python paths
  // This sets both PATH and ORIGINAL_PATH to ensure Git Bash uses our bundled runtimes
  // Git Bash's /etc/profile rebuilds PATH using ORIGINAL_PATH, so we must set both
  let baseEnv = buildEnvWithBundledNode(process.env)
  baseEnv = buildEnvWithBundledPython(baseEnv)
  baseEnv = buildEnvWithLarkCli(baseEnv)

  // Clean inherited ANTHROPIC_* and CLAUDE_* variables to prevent leakage
  // from the parent process into the CLI subprocess
  const cleanedEnv: Record<string, any> = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (AI_SDK_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) continue
    cleanedEnv[key] = value
  }

  const env: Record<string, string | number | undefined> = {
    ...cleanedEnv,

    // Electron: run as Node.js process
    ELECTRON_RUN_AS_NODE: 1,
    ELECTRON_NO_ATTACH_CONSOLE: 1,

    // API credentials
    ANTHROPIC_API_KEY: params.anthropicApiKey,
    ANTHROPIC_BASE_URL: params.anthropicBaseUrl,

    // Project4's own config dir (avoid conflicts with CC's ~/.claude)
    CLAUDE_CONFIG_DIR: getClaudeConfigDir(),

    // Windows: Git Bash path for CLI subprocess (stripped by CLAUDE_ prefix filter above, must re-add explicitly)
    ...(process.env.CLAUDE_CODE_GIT_BASH_PATH
      ? { CLAUDE_CODE_GIT_BASH_PATH: process.env.CLAUDE_CODE_GIT_BASH_PATH }
      : {}),

    // Localhost bypasses proxy (for OpenAI compat router)
    NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1',

    // Disable non-essential traffic
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_COST_WARNINGS: '1',

    // Playwright: use bundled browsers if available
    ...(getBundledPlaywrightBrowsersPath()
      ? { PLAYWRIGHT_BROWSERS_PATH: getBundledPlaywrightBrowsersPath() }
      : {})
  }

  return env as Record<string, string | number>
}

// ============================================
// SDK Options Builder
// ============================================

/**
 * Build base SDK options.
 *
 * This constructs the common SDK options used by both sendMessage and ensureSessionWarm.
 * Does NOT include dynamic configurations like AI Browser or Thinking mode.
 *
 * @param params - SDK options parameters
 * @returns Base SDK options object
 */
export function buildBaseSdkOptions(params: BaseSdkOptionsParams): Record<string, any> {
  const {
    credentials,
    workDir,
    electronPath,
    spaceId,
    conversationId,
    abortController,
    stderrHandler,
    mcpServers,
    maxTurns
  } = params

  console.log(`[SDK Config] buildBaseSdkOptions: workDir="${workDir}", spaceId="${spaceId}"`)

  // Ensure settings.json is written before creating session
  ensureClaudeConfigSettings(credentials.anthropicApiKey, credentials.anthropicBaseUrl)

  // Build environment variables
  const env = buildSdkEnv({
    anthropicApiKey: credentials.anthropicApiKey,
    anthropicBaseUrl: credentials.anthropicBaseUrl
  })

  // Build base options
  const sdkOptions: Record<string, any> = {
    model: credentials.sdkModel,
    cwd: workDir,
    abortController,
    env,
    extraArgs: {
      'dangerously-skip-permissions': null
    },
    stderr: stderrHandler || ((data: string) => {
      console.error(`[Agent][${conversationId}] CLI stderr:`, data)
    }),
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: buildSystemPromptAppend(workDir, credentials.displayModel)
    },
    maxTurns: maxTurns ?? 50,
    allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Skill', 'AskUserQuestion'],
    // Disable WebSearch and WebFetch tools
    disallowedTools: ['WebSearch', 'WebFetch'],
    // Enable Skills loading from $CLAUDE_CONFIG_DIR/skills/ and <workspace>/.claude/skills/
    settingSources: ['user', 'project'],
    permissionMode: 'acceptEdits' as const,
    canUseTool: createCanUseTool(workDir, spaceId, conversationId),
    // Requires SDK patch: enable token-level streaming (stream_event)
    includePartialMessages: true,
    executable: electronPath,
    executableArgs: [
      '--no-warnings',
      '--max-old-space-size=4096'  // Increase heap size to 4GB to prevent OOM on low-memory Windows machines
    ]
  }

  // Add MCP servers if provided
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    sdkOptions.mcpServers = mcpServers
  }

  return sdkOptions
}
