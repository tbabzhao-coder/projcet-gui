/**
 * Config Service - Manages application configuration
 */

import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { getPythonExecutable, getBundledPythonPath } from './python-runtime.service'
import { getBundledNodeExecutable } from './node-runtime.service'

// Import analytics config type
import type { AnalyticsConfig } from './analytics/types'
import type { AISourcesConfig, CustomSourceConfig } from '../../shared/types'

// Import skill types
interface SkillConfig {
  name: string
  path: string
  type: 'directory' | 'file'
  description?: string
  disabled?: boolean
  importedAt?: string
  hasScripts?: boolean
  __builtIn?: boolean  // Flag to indicate this is a built-in skill
}

type SkillsConfig = Record<string, SkillConfig>

// ============================================================================
// Built-in Skills Detection
// ============================================================================

/**
 * Get built-in skills bundled with the application
 * These skills are automatically available to all users without manual import
 */
function getBuiltInSkills(): SkillsConfig {
  const builtIn: SkillsConfig = {}

  try {
    // Get the resources path
    const isDev = !app.isPackaged
    let resourcesPath: string

    if (isDev) {
      // Development: project root/resources
      resourcesPath = join(app.getAppPath(), 'resources')
    } else {
      // Production: try multiple locations
      // 1. extraResources: /Applications/Project4.app/Contents/Resources/skills
      // 2. asar: /Applications/Project4.app/Contents/Resources/app.asar/resources/skills

      const extraResourcesPath = process.resourcesPath
      const asarResourcesPath = join(app.getAppPath(), 'resources')

      // Check extraResources first (preferred)
      if (existsSync(join(extraResourcesPath, 'skills'))) {
        resourcesPath = extraResourcesPath
        console.log('[Config] Using skills from extraResources:', extraResourcesPath)
      } else if (existsSync(join(asarResourcesPath, 'skills'))) {
        resourcesPath = asarResourcesPath
        console.log('[Config] Using skills from asar:', asarResourcesPath)
      } else {
        resourcesPath = extraResourcesPath  // Default
        console.log('[Config] Skills directory not found, using default:', extraResourcesPath)
      }
    }

    const skillsDir = join(resourcesPath, 'skills')

    // Check if skills directory exists
    if (!existsSync(skillsDir)) {
      console.log('[Config] Built-in skills directory not found:', skillsDir)
      return builtIn
    }

    // skill-creator skill
    const skillCreatorPath = join(skillsDir, 'skill-creator')
    if (existsSync(skillCreatorPath)) {
      const skillMdPath = join(skillCreatorPath, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        builtIn['skill-creator'] = {
          name: 'skill-creator',
          path: skillCreatorPath,
          type: 'directory',
          description: 'Guide for creating effective skills. Use when users want to create a new skill or update an existing skill.',
          disabled: false,
          hasScripts: true,
          __builtIn: true
        }
        console.log('[Config] Built-in skill-creator configured:')
        console.log('  Path:', skillCreatorPath)
      }
    }

    // docx skill - Word document processing
    const docxPath = join(skillsDir, 'docx')
    if (existsSync(docxPath)) {
      const skillMdPath = join(docxPath, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        builtIn['docx'] = {
          name: 'docx',
          path: docxPath,
          type: 'directory',
          description: 'Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks',
          disabled: false,
          hasScripts: true,
          __builtIn: true
        }
        console.log('[Config] Built-in docx skill configured:')
        console.log('  Path:', docxPath)
      }
    }

    // pptx skill - PowerPoint presentation processing
    const pptxPath = join(skillsDir, 'pptx')
    if (existsSync(pptxPath)) {
      const skillMdPath = join(pptxPath, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        builtIn['pptx'] = {
          name: 'pptx',
          path: pptxPath,
          type: 'directory',
          description: 'Presentation creation, editing, and analysis. When Claude needs to work with presentations (.pptx files) for: (1) Creating new presentations, (2) Modifying or editing content, (3) Working with layouts, (4) Adding comments or speaker notes, or any other presentation tasks',
          disabled: false,
          hasScripts: true,
          __builtIn: true
        }
        console.log('[Config] Built-in pptx skill configured:')
        console.log('  Path:', pptxPath)
      }
    }

    // xlsx skill - Excel spreadsheet processing
    const xlsxPath = join(skillsDir, 'xlsx')
    if (existsSync(xlsxPath)) {
      const skillMdPath = join(xlsxPath, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        builtIn['xlsx'] = {
          name: 'xlsx',
          path: xlsxPath,
          type: 'directory',
          description: 'Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization. When Claude needs to work with spreadsheets (.xlsx, .xlsm, .csv, .tsv, etc) for: (1) Creating new spreadsheets with formulas and formatting, (2) Reading or analyzing data, (3) Modify existing spreadsheets while preserving formulas, (4) Data analysis and visualization in spreadsheets, or (5) Recalculating formulas',
          disabled: false,
          hasScripts: true,
          __builtIn: true
        }
        console.log('[Config] Built-in xlsx skill configured:')
        console.log('  Path:', xlsxPath)
      }
    }

    // pdf skill - PDF document processing
    const pdfPath = join(skillsDir, 'pdf')
    if (existsSync(pdfPath)) {
      const skillMdPath = join(pdfPath, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        builtIn['pdf'] = {
          name: 'pdf',
          path: pdfPath,
          type: 'directory',
          description: 'Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.',
          disabled: false,
          hasScripts: true,
          __builtIn: true
        }
        console.log('[Config] Built-in pdf skill configured:')
        console.log('  Path:', pdfPath)
      }
    }

    // Add more built-in skills here in the future

  } catch (error) {
    console.warn('[Config] Failed to configure built-in skills:', error)
  }

  return builtIn
}

// ============================================================================
// Built-in MCP Servers Detection
// ============================================================================

// Check if a built-in MCP server package is available
function getBuiltInMcpServerPath(packageName: string): string | null {
  try {
    // Try to resolve the package directly (works for packages with 'main' or 'exports' field)
    const packagePath = require.resolve(packageName)
    if (existsSync(packagePath)) {
      return packagePath
    }
  } catch (e) {
    // Package not found via direct resolve, try alternative methods
  }

  // For packages without 'main' field (like @modelcontextprotocol/server-*),
  // try to resolve the package directory and construct the path
  try {
    // Try to resolve package.json to get the package directory
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    if (existsSync(packageJsonPath)) {
      // Return the package directory path (remove /package.json)
      const packageDir = packageJsonPath.replace(/[\\\/]package\.json$/, '')
      // Return a marker path that indicates the package exists
      return join(packageDir, 'dist', 'index.js')
    }
  } catch (e) {
    // Package not found
  }

  return null
}

// Get all built-in MCP servers configuration
// This function returns runtime-resolved paths that work across different environments:
// - Development: uses project node_modules
// - Production: uses app.asar packaged modules
// - Cross-platform: automatically finds node in PATH
function getBuiltInMcpServers(): Record<string, any> {
  const builtIn: Record<string, any> = {}
  
  // Playwright MCP
  // Note: @playwright/mcp uses cli.js as the entry point (defined in package.json bin field)
  const playwrightBasePath = getBuiltInMcpServerPath('@playwright/mcp')
  if (playwrightBasePath) {
    // Use cli.js instead of index.js (bin entry point)
    const playwrightCliPath = playwrightBasePath.replace('index.js', 'cli.js')
    
    // IMPORTANT: Use bundled Node.js if available, fallback to PATH
    // This ensures the config works across different environments:
    // - Development: bundled node if available, otherwise user's node
    // - Production: bundled node from extraResources
    // - Cross-platform: Windows/Mac/Linux compatibility
    const bundledNode = getBundledNodeExecutable()
    const nodeCommand = bundledNode || 'node'

    if (bundledNode) {
      console.log('[Config] Using bundled Node.js for Playwright MCP:', bundledNode)
    } else {
      console.log('[Config] Bundled Node.js not found, using system node from PATH')
    }

    // Build args array: [cli.js, ...browser-args if configured]
    const args: string[] = [playwrightCliPath]

    // Check if user has configured browserArgs in the saved config
    // We'll merge user's browserArgs with the default config later in getConfig()
    // For now, just set up the base configuration

    builtIn['playwright'] = {
      command: nodeCommand,  // Use bundled Node.js or fallback to PATH
      args,  // Will be enhanced with browserArgs if user configured them
      disabled: false,
      __builtIn: true
    }
    console.log('[Config] Built-in Playwright MCP server configured:')
    console.log('  Command:', nodeCommand)
    console.log('  Script:', playwrightCliPath)
  }
  
  // Office MCP Servers (PowerPoint, Word, Excel)
  // These use Python runtime, so we need to check if Python is available
  try {
    const bundledPython = getBundledPythonPath()

    // Only configure Office MCP servers if bundled Python is available
    if (bundledPython) {
      const pythonCommand = bundledPython
      console.log('[Config] Found bundled Python for Office MCP servers:', pythonCommand)

      // Office PowerPoint MCP Server
      // Module name: ppt_mcp_server (not office_powerpoint_mcp_server)
      builtIn['office-powerpoint'] = {
        command: pythonCommand,
        args: ['-m', 'ppt_mcp_server'],
        disabled: false,
        __builtIn: true
      }
      console.log('[Config] Built-in Office PowerPoint MCP server configured:')
      console.log('  Command:', pythonCommand)
      console.log('  Module: ppt_mcp_server')

      // Office Word MCP Server
      // Module name: word_document_server.main (version 1.1.x)
      const wordModule = 'word_document_server.main'
      builtIn['office-word'] = {
        command: pythonCommand,
        args: ['-m', wordModule],
        disabled: false,
        __builtIn: true
      }
      console.log('[Config] Built-in Office Word MCP server configured:')
      console.log('  Command:', pythonCommand)
      console.log('  Module:', wordModule)

      // Office Excel MCP Server
      // Using excel-mcp-server package, module name: excel_mcp
      // Requires 'stdio' command argument (uses typer CLI)
      builtIn['office-excel'] = {
        command: pythonCommand,
        args: ['-m', 'excel_mcp', 'stdio'],
        disabled: false,
        __builtIn: true
      }
      console.log('[Config] Built-in Office Excel MCP server configured:')
      console.log('  Command:', pythonCommand)
      console.log('  Module: excel_mcp stdio')
    } else {
      console.warn('[Config] Bundled Python not found, Office MCP servers will not be available')
      console.warn('[Config] To use Office MCP servers, ensure Python runtime is bundled in resources/')
    }
  } catch (error) {
    console.warn('[Config] Failed to configure Office MCP servers:', error)
    console.warn('[Config] Office MCP servers will not be available')
  }
  
  // ============================================================================
  // Node.js-based MCP Servers (Filesystem, Memory)
  // These are bundled as npm dependencies and run via node
  // ============================================================================

  // Filesystem MCP Server - Secure file operations
  const filesystemBasePath = getBuiltInMcpServerPath('@modelcontextprotocol/server-filesystem')
  if (filesystemBasePath) {
    // Get the bin entry point from package.json
    const filesystemBinPath = filesystemBasePath.replace(/[\\\/]dist[\\\/]index\.js$/, '/dist/index.js')
    const bundledNode = getBundledNodeExecutable()
    const nodeCommand = bundledNode || 'node'
    const defaultAllowedPath = homedir()

    builtIn['filesystem'] = {
      command: nodeCommand,
      args: [filesystemBinPath, defaultAllowedPath],
      disabled: false,
      __builtIn: true
    }
    console.log('[Config] Built-in Filesystem MCP server configured:')
    console.log('  Command:', nodeCommand)
    console.log('  Script:', filesystemBinPath)
    console.log('  Allowed path:', defaultAllowedPath)
  } else {
    console.warn('[Config] @modelcontextprotocol/server-filesystem not found, filesystem MCP will not be available')
  }

  // Memory MCP Server - Knowledge graph-based persistent memory
  const memoryBasePath = getBuiltInMcpServerPath('@modelcontextprotocol/server-memory')
  if (memoryBasePath) {
    // Get the bin entry point from package.json
    const memoryBinPath = memoryBasePath.replace(/[\\\/]dist[\\\/]index\.js$/, '/dist/index.js')
    const bundledNode = getBundledNodeExecutable()
    const nodeCommand = bundledNode || 'node'

    builtIn['memory'] = {
      command: nodeCommand,
      args: [memoryBinPath],
      disabled: false,
      __builtIn: true
    }
    console.log('[Config] Built-in Memory MCP server configured:')
    console.log('  Command:', nodeCommand)
    console.log('  Script:', memoryBinPath)
  } else {
    console.warn('[Config] @modelcontextprotocol/server-memory not found, memory MCP will not be available')
  }

  // QuickChart MCP - Chart generation via QuickChart.io (bar, line, pie, radar, etc.)
  // Bundled as dependency; run via node with resolved path (same pattern as filesystem/memory).
  const quickChartBasePath = getBuiltInMcpServerPath('quick-chart-mcp')
  if (quickChartBasePath) {
    const bundledNode = getBundledNodeExecutable()
    const nodeCommand = bundledNode || 'node'
    builtIn['quick-chart'] = {
      command: nodeCommand,
      args: [quickChartBasePath],
      disabled: false,
      __builtIn: true
    }
    console.log('[Config] Built-in QuickChart MCP server configured:')
    console.log('  Command:', nodeCommand)
    console.log('  Script:', quickChartBasePath)
  } else {
    console.warn('[Config] quick-chart-mcp not found, QuickChart MCP will not be available')
  }

  return builtIn
}

// Enhance Playwright MCP server args with browserArgs if configured
// NOTE: Playwright MCP CLI does not support --browser-args parameter directly
// Browser launch arguments need to be passed via other means (e.g., config file or environment variables)
// For now, we just clean up any invalid --browser-args that might have been added
function enhancePlaywrightMcpArgs(mcpConfig: any): any {
  if (!mcpConfig || !('command' in mcpConfig)) {
    return mcpConfig
  }
  
  // Check if this is playwright MCP (by checking if args contains cli.js or @playwright/mcp)
  const args = mcpConfig.args || []
  const isPlaywright = args.some((arg: string) => 
    (typeof arg === 'string' && arg.includes('@playwright/mcp') && arg.includes('cli.js'))
  )
  
  if (!isPlaywright) {
    return mcpConfig
  }
  
  // Remove any existing --browser-args from args (this parameter is not supported by Playwright MCP CLI)
  // TODO: Implement browser args support via config file or environment variables if needed
  const browserArgsIndex = args.findIndex((arg: string) => arg === '--browser-args')
  let filteredArgs = args
  
  if (browserArgsIndex >= 0) {
    // Remove --browser-args flag and its value (the next argument)
    filteredArgs = args.filter((arg: string, index: number) => {
      return index !== browserArgsIndex && index !== browserArgsIndex + 1
    })
    console.log('[Config] Removed unsupported --browser-args parameter from Playwright MCP')
  }
  
  // Check if browserArgs are configured (for future implementation)
  const browserArgs = mcpConfig.browserArgs
  if (browserArgs && Array.isArray(browserArgs) && browserArgs.length > 0) {
    const validBrowserArgs = browserArgs.filter((arg: string) => arg && arg.trim().length > 0)
    if (validBrowserArgs.length > 0) {
      console.warn('[Config] Playwright MCP browser args configured but not yet supported:', validBrowserArgs)
      console.warn('[Config] Browser launch arguments need to be passed via config file or environment variables')
    }
  }
  
  // Return config with cleaned args (no --browser-args)
  return {
    ...mcpConfig,
    args: filteredArgs
  }
}

// ============================================================================
// API Config Change Notification (Callback Pattern)
// ============================================================================
// When API config changes (provider/apiKey/apiUrl), subscribers are notified.
// This allows agent.service to invalidate sessions without circular dependency.
// agent.service imports onApiConfigChange (agent → config, existing direction)
// config.service calls registered callbacks (no import from agent)
// ============================================================================

type ApiConfigChangeHandler = () => void
const apiConfigChangeHandlers: ApiConfigChangeHandler[] = []

/**
 * Register a callback to be notified when API config changes.
 * Used by agent.service to invalidate sessions on config change.
 *
 * @returns Unsubscribe function
 */
export function onApiConfigChange(handler: ApiConfigChangeHandler): () => void {
  apiConfigChangeHandlers.push(handler)
  return () => {
    const idx = apiConfigChangeHandlers.indexOf(handler)
    if (idx >= 0) apiConfigChangeHandlers.splice(idx, 1)
  }
}

// Types (shared with renderer)
interface AppConfig {
  api: {
    provider: 'anthropic' | 'openai' | 'custom'
    apiKey: string
    apiUrl: string
    model: string
  }
  // Multi-source AI configuration (OAuth + Custom API)
  aiSources?: AISourcesConfig
  permissions: {
    fileAccess: 'allow' | 'ask' | 'deny'
    commandExecution: 'allow' | 'ask' | 'deny'
    networkAccess: 'allow' | 'ask' | 'deny'
    trustMode: boolean
  }
  appearance: {
    theme: 'light' | 'dark' | 'system'
  }
  system: {
    autoLaunch: boolean
  }
  remoteAccess: {
    enabled: boolean
    port: number
  }
  onboarding: {
    completed: boolean
  }
  // MCP servers configuration (compatible with Cursor / Claude Desktop format)
  mcpServers: Record<string, McpServerConfig>
  // Skills configuration (compatible with Claude Code CLI format)
  skills?: Record<string, SkillConfig>
  isFirstLaunch: boolean
  // Analytics configuration (auto-generated on first launch)
  analytics?: AnalyticsConfig
  // Git Bash configuration (Windows only)
  gitBash?: {
    installed: boolean
    path: string | null
    skipped: boolean
  }
}

// MCP server configuration types
type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig

interface McpStdioServerConfig {
  type?: 'stdio'  // Optional, defaults to stdio
  command: string
  args?: string[]
  env?: Record<string, string>
  timeout?: number
  disabled?: boolean  // Project4 extension: temporarily disable this server
}

interface McpHttpServerConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
  disabled?: boolean  // Project4 extension: temporarily disable this server
}

interface McpSseServerConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
  disabled?: boolean  // Project4 extension: temporarily disable this server
}

// Skill configuration types (compatible with Claude Code CLI format)
interface SkillConfig {
  name: string                    // Skill name (derived from directory/file name)
  path: string                    // Absolute path to skill directory or .skill.md file
  type: 'directory' | 'file'      // Whether it's a directory with multiple files or single .skill.md
  description?: string            // Optional description (parsed from .skill.md)
  disabled?: boolean              // Project4 extension: temporarily disable
  importedAt?: string             // ISO timestamp of import
  hasScripts?: boolean            // Whether the skill directory contains script files
}

// Paths
// Use os.homedir() instead of app.getPath('home') to respect HOME environment variable
// This is essential for E2E tests to run in isolated test directories
export function getProject4Dir(): string {
  // 1. Support custom data directory via environment variable
  //    Useful for development to avoid conflicts with production data
  if (process.env.PROJECT4_DATA_DIR) {
    let dir = process.env.PROJECT4_DATA_DIR
    // Expand ~ to home directory (shell doesn't expand in env vars)
    if (dir.startsWith('~')) {
      dir = join(homedir(), dir.slice(1))
    }
    return dir
  }

  // 2. Auto-detect development mode: use separate directory
  //    app.isPackaged is false when running via electron-vite dev
  if (!app.isPackaged) {
    return join(homedir(), '.project4-dev')
  }

  // 3. Production: use default directory
  return join(homedir(), '.project4')
}

export function getConfigPath(): string {
  return join(getProject4Dir(), 'config.json')
}

export function getTempSpacePath(): string {
  return join(getProject4Dir(), 'temp')
}

export function getSpacesDir(): string {
  return join(getProject4Dir(), 'spaces')
}

// Default model
const DEFAULT_MODEL = ''

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
  api: {
    provider: 'anthropic',
    apiKey: '',
    apiUrl: 'https://code.ppchat.vip/',
    model: DEFAULT_MODEL
  },
  aiSources: {
    current: 'custom'
  },
  permissions: {
    fileAccess: 'allow',
    commandExecution: 'ask',
    networkAccess: 'allow',
    trustMode: true
  },
  appearance: {
    theme: 'light'
  },
  system: {
    autoLaunch: false
  },
  remoteAccess: {
    enabled: false,
    port: 3456
  },
  onboarding: {
    completed: false
  },
  mcpServers: {},  // Empty by default - built-in servers will be auto-added at runtime
  skills: {},  // Empty by default
  isFirstLaunch: true
}

function normalizeAiSources(parsed: Record<string, any>): AISourcesConfig {
  const raw = parsed?.aiSources

  // If aiSources already exists, use it directly (no auto-rebuild from legacy api)
  if (raw && typeof raw === 'object') {
    const aiSources: AISourcesConfig = { ...raw }
    if (!aiSources.current) {
      aiSources.current = 'custom'
    }
    return aiSources
  }

  // First-time migration only: create aiSources from legacy api config
  const aiSources: AISourcesConfig = { current: 'custom' }
  const legacyApi = parsed?.api
  const hasLegacyApi = typeof legacyApi?.apiKey === 'string' && legacyApi.apiKey.length > 0

  if (hasLegacyApi) {
    const provider = legacyApi?.provider === 'openai' ? 'openai' : 'anthropic'
    aiSources.custom = {
      provider,
      apiKey: legacyApi.apiKey,
      apiUrl: legacyApi?.apiUrl || (provider === 'openai' ? 'https://api.openai.com' : 'https://code.ppchat.vip/'),
      model: legacyApi?.model || DEFAULT_MODEL
    } as CustomSourceConfig
  }

  return aiSources
}

function getAiSourcesSignature(aiSources?: AISourcesConfig): string {
  if (!aiSources) return ''
  const current = aiSources.current || 'custom'

  // Note: model is excluded from signature because V2 Session supports dynamic model switching
  // (via setModel method). Only changes to credentials/provider should invalidate sessions.

  // Handle custom API sources (both 'custom' and 'custom_xxx' formats)
  if (current === 'custom' || current.startsWith('custom_')) {
    const customConfig = aiSources[current] as Record<string, any> | undefined
    return [
      'custom',
      current, // Include the specific custom key to detect switching between custom sources
      customConfig?.provider || '',
      customConfig?.apiUrl || '',
      customConfig?.apiKey || ''
      // model excluded: dynamic switching supported
    ].join('|')
  }

  // Handle OAuth sources
  const currentConfig = aiSources[current] as Record<string, any> | undefined
  if (currentConfig && typeof currentConfig === 'object') {
    return [
      'oauth',
      current,
      currentConfig.accessToken || '',
      currentConfig.refreshToken || '',
      currentConfig.tokenExpires || ''
      // model excluded: dynamic switching supported
    ].join('|')
  }

  return current
}

// Initialize app directories
export async function initializeApp(): Promise<void> {
  const project4Dir = getProject4Dir()
  const tempDir = getTempSpacePath()
  const spacesDir = getSpacesDir()
  const tempArtifactsDir = join(tempDir, 'artifacts')
  const tempConversationsDir = join(tempDir, 'conversations')

  // Create directories if they don't exist
  const dirs = [project4Dir, tempDir, spacesDir, tempArtifactsDir, tempConversationsDir]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  // Create default config if it doesn't exist
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
  }
}

// Get configuration
export function getConfig(): AppConfig {
  const configPath = getConfigPath()
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  console.log('[Config] getConfig called, configPath:', configPath)
  if (isDev) {
    console.log('[Config] Development mode: API key is read from this file only (no hardcoded key). PROJECT4_DATA_DIR:', process.env.PROJECT4_DATA_DIR || '(auto: .project4-dev)')
  }

  if (!existsSync(configPath)) {
    console.log('[Config] Config file does not exist, returning DEFAULT_CONFIG')
    return DEFAULT_CONFIG
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content)

    // Log API key info (masked for security)
    if (parsed.aiSources?.custom?.apiKey) {
      const key = parsed.aiSources.custom.apiKey
      console.log('[Config] Found custom API key in config:', key.substring(0, 10) + '...' + key.substring(key.length - 10))
      console.log('[Config] Custom API URL:', parsed.aiSources.custom.apiUrl)
      console.log('[Config] Custom provider:', parsed.aiSources.custom.provider)
    }
    if (parsed.api?.apiKey) {
      const key = parsed.api.apiKey
      console.log('[Config] Found legacy API key in config:', key.substring(0, 10) + '...' + key.substring(key.length - 10))
    }

    const aiSources = normalizeAiSources(parsed)
    console.log('[Config] Normalized aiSources.current:', aiSources.current)
    console.log('[Config] Normalized aiSources.custom exists:', !!aiSources.custom)
    // Deep merge to ensure all nested defaults are applied
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      api: { ...DEFAULT_CONFIG.api, ...parsed.api },
      aiSources,
      permissions: { ...DEFAULT_CONFIG.permissions, ...parsed.permissions },
      appearance: { ...DEFAULT_CONFIG.appearance, ...parsed.appearance },
      system: { ...DEFAULT_CONFIG.system, ...parsed.system },
      onboarding: { ...DEFAULT_CONFIG.onboarding, ...parsed.onboarding },
      // mcpServers: merge built-in servers with user config (user config overrides)
      // IMPORTANT: Preserve user's browserArgs if they configured it
      mcpServers: (() => {
        const builtInMcp = getBuiltInMcpServers()
        let mcpServers: Record<string, any> = {}
        
        // First, add built-in servers
        for (const [name, builtInConfig] of Object.entries(builtInMcp)) {
          mcpServers[name] = { ...builtInConfig }
        }
        
        // Then, merge user config (preserves browserArgs and other custom fields)
        const userMcpServers = parsed.mcpServers || DEFAULT_CONFIG.mcpServers
        for (const [name, userConfig] of Object.entries(userMcpServers)) {
          if (mcpServers[name] && (mcpServers[name] as any).__builtIn) {
            // Merge user config with built-in (preserve browserArgs)
            mcpServers[name] = {
              ...mcpServers[name],
              ...userConfig,
              // Preserve __builtIn flag
              __builtIn: true
            }
          } else {
            // User-defined server (not built-in)
            mcpServers[name] = userConfig
          }
        }
        
        // Enhance Playwright MCP server args with browserArgs if configured
        // This allows users to configure browser launch options like --disable-web-security
        for (const [name, config] of Object.entries(mcpServers)) {
          if (name === 'playwright' || (config as any)?.__builtIn) {
            mcpServers[name] = enhancePlaywrightMcpArgs(config)
          }
        }
        
        return mcpServers
      })(),
      // skills: merge built-in skills with user config (user config overrides)
      skills: (() => {
        const builtInSkills = getBuiltInSkills()
        let skills: SkillsConfig = {}

        // First, add built-in skills
        for (const [name, builtInConfig] of Object.entries(builtInSkills)) {
          skills[name] = { ...builtInConfig }
        }

        // Then, merge user config (user can override or disable built-in skills)
        const userSkills = parsed.skills || DEFAULT_CONFIG.skills
        for (const [name, userConfig] of Object.entries(userSkills)) {
          if (skills[name] && (skills[name] as any).__builtIn) {
            // Merge user config with built-in (user can disable or modify)
            skills[name] = {
              ...skills[name],
              ...userConfig,
              // Preserve __builtIn flag
              __builtIn: true
            }
          } else {
            // User-defined skill (not built-in)
            skills[name] = userConfig
          }
        }

        return skills
      })(),
      // analytics: keep as-is (managed by analytics.service.ts)
      analytics: parsed.analytics
    }
  } catch (error) {
    console.error('Failed to read config:', error)
    return DEFAULT_CONFIG
  }
}

// Save configuration
export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const currentConfig = getConfig()
  const newConfig = { ...currentConfig, ...config }
  const previousAiSourcesSignature = getAiSourcesSignature(currentConfig.aiSources)

  // Deep merge for nested objects
  if (config.api) {
    newConfig.api = { ...currentConfig.api, ...config.api }
  }
  if (config.permissions) {
    newConfig.permissions = { ...currentConfig.permissions, ...config.permissions }
  }
  if (config.appearance) {
    newConfig.appearance = { ...currentConfig.appearance, ...config.appearance }
  }
  if (config.system) {
    newConfig.system = { ...currentConfig.system, ...config.system }
  }
  if (config.onboarding) {
    newConfig.onboarding = { ...currentConfig.onboarding, ...config.onboarding }
  }
  // mcpServers: replace entirely when provided (not merged)
  if (config.mcpServers !== undefined) {
    newConfig.mcpServers = config.mcpServers
  }
  // skills: replace entirely when provided (not merged)
  if ((config as any).skills !== undefined) {
    (newConfig as any).skills = (config as any).skills
  }
  // analytics: replace entirely when provided (managed by analytics.service.ts)
  if (config.analytics !== undefined) {
    newConfig.analytics = config.analytics
  }
  // gitBash: replace entirely when provided (Windows only)
  if ((config as any).gitBash !== undefined) {
    (newConfig as any).gitBash = (config as any).gitBash
  }

  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(newConfig, null, 2))

  // Detect API config changes and notify subscribers
  // This allows agent.service to invalidate sessions when API config changes
  const nextAiSourcesSignature = getAiSourcesSignature(newConfig.aiSources)
  const aiSourcesChanged = previousAiSourcesSignature !== nextAiSourcesSignature

  // Check if skills or MCP servers changed (both require session rebuild)
  const skillsChanged = (config as any).skills !== undefined
  const mcpChanged = config.mcpServers !== undefined

  if (config.api || config.aiSources || skillsChanged || mcpChanged) {
    const apiChanged =
      !!config.api &&
      (config.api.provider !== currentConfig.api.provider ||
        config.api.apiKey !== currentConfig.api.apiKey ||
        config.api.apiUrl !== currentConfig.api.apiUrl)

    if ((apiChanged || aiSourcesChanged || skillsChanged || mcpChanged) && apiConfigChangeHandlers.length > 0) {
      const changes = [
        apiChanged && 'API',
        aiSourcesChanged && 'AI Sources',
        skillsChanged && 'Skills',
        mcpChanged && 'MCP'
      ].filter(Boolean).join(', ')
      console.log(`[Config] Configuration changed (${changes}), notifying subscribers...`)
      // Use setTimeout to avoid blocking the save operation
      // and ensure all handlers are called asynchronously
      setTimeout(() => {
        apiConfigChangeHandlers.forEach(handler => {
          try {
            handler()
          } catch (e) {
            console.error('[Config] Error in config change handler:', e)
          }
        })
      }, 0)
    }
  }

  return newConfig
}

// Validate API connection
export async function validateApiConnection(
  apiKey: string,
  apiUrl: string,
  provider: string
): Promise<{ valid: boolean; message?: string; model?: string }> {
  try {
    const trimSlash = (s: string) => s.replace(/\/+$/, '')
    const normalizeOpenAIV1Base = (input: string) => {
      // Accept:
      // - https://host
      // - https://host/v1
      // - https://host/v1/chat/completions
      // - https://host/chat/completions
      let base = trimSlash(input)
      // If user pasted full chat/completions endpoint, strip it
      if (base.endsWith('/chat/completions')) {
        base = base.slice(0, -'/chat/completions'.length)
        base = trimSlash(base)
      }
      // If already contains /v1 anywhere, normalize to ".../v1"
      const v1Idx = base.indexOf('/v1')
      if (v1Idx >= 0) {
        base = base.slice(0, v1Idx + 3) // include "/v1"
        base = trimSlash(base)
        return base
      }
      return `${base}/v1`
    }

    // OpenAI compatible validation: GET /v1/models (does not depend on user-selected model)
    if (provider === 'openai') {
      const baseV1 = normalizeOpenAIV1Base(apiUrl)
      const modelsUrl = `${baseV1}/models`

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })

      if (response.ok) {
        const data: any = await response.json().catch(() => ({}))
        const modelId =
          data?.data?.[0]?.id ||
          data?.model ||
          undefined
        return { valid: true, model: modelId }
      }

      const errorText = await response.text().catch(() => '')
      return {
        valid: false,
        message: errorText || `HTTP ${response.status}`
      }
    }

    // Anthropic compatible validation: POST /v1/messages
    const base = trimSlash(apiUrl)
    const messagesUrl = `${base}/v1/messages`
    const response = await fetch(messagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return {
        valid: true,
        model: data.model || DEFAULT_MODEL
      }
    } else {
      const error = await response.json().catch(() => ({}))
      return {
        valid: false,
        message: error.error?.message || `HTTP ${response.status}`
      }
    }
  } catch (error: unknown) {
    const err = error as Error
    return {
      valid: false,
      message: err.message || 'Connection failed'
    }
  }
}

/**
 * Set auto launch on system startup
 */
export function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true, // Start minimized
    // On macOS, also set to open at login for all users (requires admin)
    // path: process.execPath, // Optional: specify executable path
  })

  // Save to config
  saveConfig({ system: { autoLaunch: enabled } })
  console.log(`[Config] Auto launch set to: ${enabled}`)
}

/**
 * Get current auto launch status
 */
export function getAutoLaunch(): boolean {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
}
