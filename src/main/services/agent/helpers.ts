/**
 * Agent Module - Helper Functions
 *
 * Utility functions shared across the agent module.
 * Includes working directory management, Electron path handling,
 * API credential resolution, and renderer communication.
 */

import { createHash } from 'crypto'
import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync, cpSync, rmSync, readdirSync, renameSync, writeFileSync, readFileSync } from 'fs'
import { getConfig, getConfigPath, getTempSpacePath } from '../config.service'
import { getSpace } from '../space.service'
import { getAISourceManager } from '../ai-sources'
import { broadcastToAll, broadcastToWebSocket } from '../../http/websocket'
import { onMainWindowChange } from '../window.service'
import type { ApiCredentials, MainWindowRef } from './types'

// ============================================
// Headless Electron Path Management
// ============================================

// Cached path to headless Electron binary (outside .app bundle to prevent Dock icon on macOS)
let headlessElectronPath: string | null = null

/**
 * Get the path to the headless Electron binary.
 *
 * On macOS, when spawning Electron as a child process with ELECTRON_RUN_AS_NODE=1,
 * macOS still shows a Dock icon because it detects the .app bundle structure
 * before Electron checks the environment variable.
 *
 * Solution: Create a symlink to the Electron binary outside the .app bundle.
 * When the symlink is not inside a .app bundle, macOS doesn't register it
 * as a GUI application and no Dock icon appears.
 *
 * Why symlink instead of copy?
 * - The Electron binary depends on Electron Framework.framework via @rpath
 * - Copying just the binary breaks the framework loading
 * - Symlinks preserve the framework resolution because the real binary is still in .app
 *
 * This is a novel solution discovered while building Project4 - most Electron apps
 * that spawn child processes suffer from this Dock icon flashing issue.
 */
export function getHeadlessElectronPath(): string {
  // Return cached path if already set up
  if (headlessElectronPath && existsSync(headlessElectronPath)) {
    return headlessElectronPath
  }

  const electronPath = process.execPath

  // On non-macOS platforms or if not inside .app bundle, use original path
  if (process.platform !== 'darwin' || !electronPath.includes('.app/')) {
    headlessElectronPath = electronPath
    console.log('[Agent] Using original Electron path (not macOS or not .app bundle):', headlessElectronPath)
    return headlessElectronPath
  }

  // macOS: Create symlink to Electron binary outside .app bundle to prevent Dock icon
  try {
    // Use app's userData path for the symlink (persistent across sessions)
    const userDataPath = app.getPath('userData')
    const headlessDir = join(userDataPath, 'headless-electron')
    const headlessSymlinkPath = join(headlessDir, 'electron-node')

    // Create directory if needed
    if (!existsSync(headlessDir)) {
      mkdirSync(headlessDir, { recursive: true })
    }

    // Check if symlink exists and points to correct target
    let needsSymlink = true

    if (existsSync(headlessSymlinkPath)) {
      try {
        const stat = lstatSync(headlessSymlinkPath)
        if (stat.isSymbolicLink()) {
          const currentTarget = readlinkSync(headlessSymlinkPath)
          if (currentTarget === electronPath) {
            needsSymlink = false
          } else {
            // Symlink exists but points to wrong target, remove it
            console.log('[Agent] Symlink target changed, recreating...')
            unlinkSync(headlessSymlinkPath)
          }
        } else {
          // Not a symlink (maybe old copy), remove it
          console.log('[Agent] Removing old non-symlink file...')
          unlinkSync(headlessSymlinkPath)
        }
      } catch {
        // If we can't read it, try to remove and recreate
        try {
          unlinkSync(headlessSymlinkPath)
        } catch { /* ignore */ }
      }
    }

    if (needsSymlink) {
      console.log('[Agent] Creating symlink for headless Electron mode...')
      console.log('[Agent] Target:', electronPath)
      console.log('[Agent] Symlink:', headlessSymlinkPath)

      symlinkSync(electronPath, headlessSymlinkPath)

      console.log('[Agent] Symlink created successfully')
    }

    headlessElectronPath = headlessSymlinkPath
    console.log('[Agent] Using headless Electron symlink:', headlessElectronPath)
    return headlessElectronPath
  } catch (error) {
    // Fallback to original path if symlink fails
    console.error('[Agent] Failed to set up headless Electron symlink, falling back to original:', error)
    headlessElectronPath = electronPath
    return headlessElectronPath
  }
}

// ============================================
// Working Directory Management
// ============================================

/**
 * Get working directory for a space
 */
export function getWorkingDir(spaceId: string): string {
  console.log(`[Agent] getWorkingDir called with spaceId: ${spaceId}`)

  if (spaceId === 'project4-temp') {
    const artifactsDir = join(getTempSpacePath(), 'artifacts')
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true })
    }
    console.log(`[Agent] Using temp space artifacts dir: ${artifactsDir}`)
    return artifactsDir
  }

  const space = getSpace(spaceId)
  console.log(`[Agent] getSpace result:`, space ? { id: space.id, name: space.name, path: space.path } : null)

  if (space) {
    console.log(`[Agent] Using space path: ${space.path}`)
    return space.path
  }

  console.log(`[Agent] WARNING: Space not found, falling back to temp path`)
  return getTempSpacePath()
}

// ============================================
// API Credentials
// ============================================

/**
 * Get API credentials based on current aiSources configuration
 * This is the central place that determines which API to use
 * Now uses AISourceManager for unified access
 */
export async function getApiCredentials(config: ReturnType<typeof getConfig>): Promise<ApiCredentials> {
  const manager = getAISourceManager()
  await manager.ensureInitialized()

  // Debug logging
  console.log('[AgentService] ========== getApiCredentials START ==========')

  // IMPORTANT: Always read fresh config from disk to ensure we use the latest configuration
  // The config parameter might be stale if it was cached before a config change
  const freshConfig = getConfig()
  const aiSources = (freshConfig as any).aiSources
  const currentSource = aiSources?.current || 'custom'

  console.log('[AgentService] currentSource:', currentSource)
  console.log('[AgentService] aiSources structure:', JSON.stringify({
    current: aiSources?.current,
    hasCustom: !!aiSources?.custom,
    customHasApiKey: !!aiSources?.custom?.apiKey,
    customApiUrl: aiSources?.custom?.apiUrl,
    customProvider: aiSources?.custom?.provider
  }, null, 2))

  if (aiSources?.custom?.apiKey) {
    const key = aiSources.custom.apiKey
    console.log('[AgentService] custom.apiKey found:', key.substring(0, 10) + '...' + key.substring(key.length - 10))
  } else {
    console.log('[AgentService] ❌ custom.apiKey is NULL or UNDEFINED')
  }

  // Check if current source is a custom API (starts with 'custom' or is exactly 'custom')
  // Custom sources use API keys, not OAuth tokens
  const isCustomSource = currentSource === 'custom' || currentSource.startsWith('custom_')

  console.log('[AgentService] isCustomSource:', isCustomSource)

  // Check if current source is an OAuth provider (not custom)
  if (!isCustomSource) {
    console.log('[AgentService] Checking OAuth token validity for:', currentSource)
    const tokenResult = await manager.ensureValidToken(currentSource)
    console.log('[AgentService] Token check result:', tokenResult.success)
    if (!tokenResult.success) {
      throw new Error('OAuth token expired or invalid. Please login again.')
    }
  }

  // Get backend config from manager (this also reads fresh config internally)
  console.log('[AgentService] Calling manager.getBackendConfig()')
  const backendConfig = manager.getBackendConfig()

  if (backendConfig) {
    const key = backendConfig.key || ''
    console.log('[AgentService] ✅ backendConfig received:')
    console.log('[AgentService]   - url:', backendConfig.url)
    console.log('[AgentService]   - model:', backendConfig.model)
    console.log('[AgentService]   - key:', key ? key.substring(0, 10) + '...' + key.substring(key.length - 10) : 'NOT SET')
    console.log('[AgentService]   - apiType:', backendConfig.apiType)
  } else {
    console.log('[AgentService] ❌ backendConfig is NULL')
  }

  if (!backendConfig) {
    throw new Error('No AI source configured. Please configure an API key or login.')
  }

  // Determine provider type
  let provider: 'anthropic' | 'openai' | 'oauth'

  if (!isCustomSource) {
    provider = 'oauth'
    console.log(`[AgentService] Using OAuth provider ${currentSource} via AISourceManager`)
  } else {
    // Get current source from AISourceManager (handles both v1 and v2 config formats)
    const currentSourceConfig = manager.getCurrentSourceConfig()
    provider = currentSourceConfig?.provider === 'openai' ? 'openai' : 'anthropic'
    console.log(`[AgentService] Using custom API (${provider}) via AISourceManager`)
    console.log(`[AgentService] Current source provider field: ${currentSourceConfig?.provider}`)
  }

  const credentials = {
    baseUrl: backendConfig.url,
    apiKey: backendConfig.key,
    model: backendConfig.model || 'claude-opus-4-5-20251101',
    provider,
    customHeaders: backendConfig.headers,
    apiType: backendConfig.apiType
  }

  console.log('[AgentService] ✅ Final credentials:')
  console.log('[AgentService]   - baseUrl:', credentials.baseUrl)
  console.log('[AgentService]   - apiKey:', credentials.apiKey.substring(0, 10) + '...' + credentials.apiKey.substring(credentials.apiKey.length - 10))
  console.log('[AgentService]   - model:', credentials.model)
  console.log('[AgentService]   - provider:', credentials.provider)
  // In dev, make it clear that key comes from config file (no fixed/fallback key)
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    console.log('[AgentService]   - key source: config file (decrypted), path:', getConfigPath())
  }
  console.log('[AgentService] ========== getApiCredentials END ==========')

  return credentials
}

/**
 * Infer OpenAI wire API type from URL or environment
 */
export function inferOpenAIWireApi(apiUrl: string): 'responses' | 'chat_completions' {
  // 1. Check environment variable override
  const envApiType = process.env.PROJECT4_OPENAI_API_TYPE || process.env.PROJECT4_OPENAI_WIRE_API
  if (envApiType) {
    const v = envApiType.toLowerCase()
    if (v.includes('response')) return 'responses'
    if (v.includes('chat')) return 'chat_completions'
  }
  // 2. Infer from URL
  if (apiUrl) {
    if (apiUrl.includes('/chat/completions') || apiUrl.includes('/chat_completions')) return 'chat_completions'
    if (apiUrl.includes('/responses')) return 'responses'
  }
  // 3. Default to chat_completions (most common for third-party providers)
  return 'chat_completions'
}

// ============================================
// MCP Server Filtering
// ============================================

/**
 * Filter out disabled MCP servers before passing to SDK
 * Also replaces 'node' command with Electron's Node.js to ensure version compatibility
 */
export function getEnabledMcpServers(mcpServers: Record<string, any>): Record<string, any> | null {
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return null
  }

  const enabled: Record<string, any> = {}
  const electronNodePath = process.execPath  // Electron's built-in Node.js
  
  for (const [name, config] of Object.entries(mcpServers)) {
    if (!config.disabled) {
      // Remove the 'disabled' field before passing to SDK (it's a Project4 extension)
      const { disabled, ...sdkConfig } = config as any
      
      // Replace 'node' command with Electron's Node.js path
      // This ensures MCP servers use the same Node.js version as Electron (avoiding version mismatch issues)
      if (sdkConfig.command === 'node' || sdkConfig.command === 'nodejs') {
        console.log(`[Agent] Replacing 'node' with Electron Node.js (${electronNodePath}) for MCP server "${name}"`)
        console.log(`[Agent] MCP server "${name}" original args:`, sdkConfig.args)
        sdkConfig.command = electronNodePath
        // Add --no-warnings flag to suppress Node.js warnings
        sdkConfig.args = [
          '--no-warnings',
          ...(sdkConfig.args || [])
        ]
        console.log(`[Agent] MCP server "${name}" final args:`, sdkConfig.args)
      }
      
      enabled[name] = sdkConfig
    }
  }

  return Object.keys(enabled).length > 0 ? enabled : null
}

// ============================================
// System Prompt
// ============================================

/**
 * Build system prompt append - minimal context, preserve Claude Code's native behavior
 * @param workDir - Current working directory
 * @param modelInfo - The actual model being used (user-configured, may differ from SDK's internal model)
 */
export function buildSystemPromptAppend(workDir: string, modelInfo?: string): string {
  const modelLine = modelInfo ? `You are powered by ${modelInfo}.` : ''
  return `
You are Project4, an AI assistant that helps users accomplish real work.
${modelLine}
All created files will be saved in the user's workspace. Current workspace: ${workDir}.
`
}

// ============================================
// Renderer Communication
// ============================================

// Current main window reference
let currentMainWindow: MainWindowRef = null

// Subscribe to window changes from window.service
// This ensures currentMainWindow is always in sync with the actual window
onMainWindowChange((window) => {
  currentMainWindow = window
  console.log(`[Agent/Helpers] Main window ${window ? 'updated' : 'cleared'}`)
})

/**
 * Set the current main window reference (legacy compatibility)
 * Now uses window.service subscription instead
 * @deprecated Use window.service.setMainWindow() instead
 */
export function setMainWindow(window: MainWindowRef): void {
  // This function is kept for backward compatibility
  // The actual window reference is managed by window.service subscription above
  console.log(`[Agent/Helpers] setMainWindow called (legacy) - window.service subscription is managing the reference`)
}

/**
 * Get the current main window reference
 */
export function getMainWindow(): MainWindowRef {
  return currentMainWindow
}

/**
 * Send event to renderer with session identifiers
 * Also broadcasts to WebSocket for remote clients
 */
export function sendToRenderer(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  // Always include spaceId and conversationId in event data
  const eventData = { ...data, spaceId, conversationId }

  // 1. Send to Electron renderer via IPC
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    currentMainWindow.webContents.send(channel, eventData)
    console.log(`[Agent] Sent to renderer: ${channel}`, JSON.stringify(eventData).substring(0, 200))
  }

  // 2. Broadcast to remote WebSocket clients
  try {
    broadcastToWebSocket(channel, eventData)
  } catch (error) {
    // WebSocket module might not be initialized yet, ignore
  }
}

/**
 * Broadcast event to all clients (global event, not conversation-scoped)
 */
export function broadcastToAllClients(channel: string, data: Record<string, unknown>): void {
  // 1. Send to Electron renderer via IPC (global event)
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    currentMainWindow.webContents.send(channel, data)
  }

  // 2. Broadcast to remote WebSocket clients
  try {
    broadcastToAll(channel, data)
  } catch (error) {
    // WebSocket module might not be initialized yet, ignore
  }
}

// ============================================
// Skills Management
// ============================================

/**
 * Sync all enabled skills to the isolated claude-config/skills/ directory.
 * CLI discovers skills from CLAUDE_CONFIG_DIR/skills/ when settingSources includes 'user'.
 *
 * Unlike the old syncSkillsToWorkDir(), this syncs ALL enabled skills (built-in + user-imported),
 * not just __builtIn ones. User-imported skills are copied here so the CLI can discover them
 * without relying on the original import path.
 *
 * IMPORTANT: SDK requires skill file to be named SKILL.md (uppercase)
 */
export function syncSkillsToConfigDir(skills: Record<string, any>): void {
  const { getClaudeConfigDir } = require('../config.service')
  const configSkillsDir = join(getClaudeConfigDir(), 'skills')

  // Create skills directory if it doesn't exist
  if (!existsSync(configSkillsDir)) {
    mkdirSync(configSkillsDir, { recursive: true })
  }

  // Get all enabled skills (both built-in and user-imported)
  const enabledSkills = Object.entries(skills).filter(([_, config]: [string, any]) =>
    !config.disabled && config.path && existsSync(config.path)
  )

  if (enabledSkills.length === 0) {
    return
  }

  console.log(`[Agent] ========================================`)
  console.log(`[Agent] Syncing ${enabledSkills.length} skills to claude-config directory`)
  console.log(`[Agent] Target: ${configSkillsDir}`)
  console.log(`[Agent] Skills:`, enabledSkills.map(([name]) => name).join(', '))

  for (const [name, config] of enabledSkills) {
    const sourcePath = config.path
    const targetPath = join(configSkillsDir, name)

    try {
      // For built-in skills, skip if already synced (they don't change unless app is updated)
      if (config.__builtIn && existsSync(targetPath)) {
        console.log(`[Agent] ✓ Built-in skill "${name}" already exists, skipping`)
        continue
      }

      // Remove existing skill if present (user-imported skills may have changed)
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true, force: true })
      }

      if (config.type === 'directory') {
        // Copy entire directory
        cpSync(sourcePath, targetPath, { recursive: true })

        // CRITICAL: Ensure skill file is named SKILL.md (uppercase)
        const files = readdirSync(targetPath)
        for (const file of files) {
          const lower = file.toLowerCase()
          if (lower === 'skill.md' || lower === '.skill.md' || lower.endsWith('.skill.md')) {
            const oldPath = join(targetPath, file)
            const newPath = join(targetPath, 'SKILL.md')
            if (file !== 'SKILL.md') {
              renameSync(oldPath, newPath)
              console.log(`[Agent] Renamed ${file} -> SKILL.md in skill "${name}"`)
            }
            break
          }
        }
      } else {
        // For single file, create directory and copy file as SKILL.md
        mkdirSync(targetPath, { recursive: true })
        const targetFile = join(targetPath, 'SKILL.md')
        cpSync(sourcePath, targetFile)
      }

      console.log(`[Agent] ✓ Synced skill "${name}" to claude-config directory`)
    } catch (error) {
      console.error(`[Agent] ✗ Failed to sync skill ${name}:`, error)
    }
  }

  console.log(`[Agent] Skills sync complete. CLI will load from: ${configSkillsDir}`)
  console.log(`[Agent] ========================================`)
}

/**
 * Calculate hash of enabled skills for rebuild detection
 */
export function calculateSkillsHash(skills: Record<string, any> | undefined): string {
  if (!skills || Object.keys(skills).length === 0) {
    return 'no-skills'
  }
  
  // Create hash from enabled skill names and paths
  const enabledSkills = Object.entries(skills)
    .filter(([_, config]: [string, any]) => !config.disabled)
    .map(([name, config]: [string, any]) => `${name}:${config.path}`)
    .sort()
    .join('|')
  
  return enabledSkills || 'no-enabled-skills'
}

/**
 * Calculate hash of API credentials for session rebuild detection.
 * When user changes API key or base URL, we must rebuild the V2 session
 * so the child process gets the new env/settings (old session keeps old key).
 */
export function calculateCredentialsHash(credentials: { baseUrl: string; apiKey: string }): string {
  return createHash('sha256')
    .update(credentials.baseUrl + '\0' + credentials.apiKey)
    .digest('hex')
    .slice(0, 16)
}
