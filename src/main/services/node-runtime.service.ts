/**
 * Node.js Runtime Service
 * Provides path to bundled Node.js runtime for Git Bash commands
 *
 * This ensures AI-executed commands that use 'node' will use our bundled version,
 * not the system's Node.js (which may not exist or be a different version).
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { platform } from 'os'

// Cache for bundled Node.js path to avoid repeated filesystem checks
let cachedBundledNodePath: string | null | undefined = undefined
let cachedUnixStylePath: string | null = null
let envConfiguredLogged = false

/**
 * Get the path to the bundled Node.js directory
 * Returns null if Node.js is not bundled or not found
 * Results are cached after first call.
 */
export function getBundledNodePath(): string | null {
  // Return cached result if available
  if (cachedBundledNodePath !== undefined) {
    return cachedBundledNodePath
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const osPlatform = platform()
  const arch = process.arch

  // Determine Node.js directory name based on platform and architecture
  let nodeDirName: string
  let nodeExecutableName: string

  if (osPlatform === 'win32') {
    nodeDirName = 'node-win-x64'
    nodeExecutableName = 'node.exe'
  } else if (osPlatform === 'darwin') {
    // Mac: support both arm64 and x64
    if (arch === 'arm64') {
      nodeDirName = 'node-arm64'
      nodeExecutableName = 'bin/node'
    } else {
      nodeDirName = 'node-x64'
      nodeExecutableName = 'bin/node'
    }
  } else {
    // Linux or other platforms - not supported yet
    cachedBundledNodePath = null
    return null
  }

  let nodePath: string

  if (isDev) {
    // Development: use resources/node-{platform} from project root
    // In dev mode, __dirname is out/main, so we need to go up to project root
    const projectRoot = join(__dirname, '../..')
    nodePath = join(projectRoot, 'resources', nodeDirName)
    console.log(`[NodeRuntime] Dev mode - projectRoot: ${projectRoot}, nodePath: ${nodePath}`)
  } else {
    // Production: use extraResources path
    let resourcesPath: string

    try {
      if (process.resourcesPath) {
        resourcesPath = process.resourcesPath
      } else {
        if (!app.isReady()) {
          console.warn('[NodeRuntime] App not ready yet, cannot get resources path')
          return null  // Don't cache - app may become ready later
        }
        resourcesPath = (app as any).getPath('resources')
      }
    } catch (error) {
      console.error('[NodeRuntime] Error getting resources path:', error)
      return null  // Don't cache - may be transient error
    }

    nodePath = join(resourcesPath, nodeDirName)
  }

  const nodeExecutable = join(nodePath, nodeExecutableName)

  if (existsSync(nodeExecutable)) {
    console.log(`[NodeRuntime] Found bundled Node.js at: ${nodePath}`)
    cachedBundledNodePath = nodePath
    return nodePath
  }

  console.warn(`[NodeRuntime] Bundled Node.js not found at: ${nodePath}`)
  cachedBundledNodePath = null
  return null
}

/**
 * Get the full path to the bundled Node.js executable
 * Returns null if not found
 */
export function getBundledNodeExecutable(): string | null {
  const nodePath = getBundledNodePath()
  if (!nodePath) {
    return null
  }

  const osPlatform = platform()
  const executable = osPlatform === 'win32' ? 'node.exe' : 'bin/node'
  return join(nodePath, executable)
}

/**
 * Check if bundled Node.js is available
 */
export function hasBundledNode(): boolean {
  return getBundledNodePath() !== null
}

/**
 * Convert Windows path to Unix-style path for Git Bash compatibility
 * D:\path\to\node -> /d/path/to/node
 * Results are cached.
 */
function toUnixStylePath(windowsPath: string): string {
  // Return cached result if available
  if (cachedUnixStylePath !== null) {
    return cachedUnixStylePath
  }

  if (platform() !== 'win32') {
    cachedUnixStylePath = windowsPath
    return windowsPath
  }

  // Replace backslashes with forward slashes
  let unixPath = windowsPath.replace(/\\/g, '/')
  // Convert drive letter: D:/... -> /d/...
  if (/^[A-Za-z]:/.test(unixPath)) {
    unixPath = '/' + unixPath[0].toLowerCase() + unixPath.slice(2)
  }

  cachedUnixStylePath = unixPath
  return unixPath
}

/**
 * Build environment variables for Git Bash with bundled Node.js
 *
 * Git Bash's /etc/profile rebuilds PATH on startup using ORIGINAL_PATH.
 * To ensure our bundled Node.js is used, we must set BOTH:
 * - PATH: For immediate use
 * - ORIGINAL_PATH: For Git Bash to inherit when it rebuilds PATH
 *
 * @param existingEnv - The existing environment variables
 * @returns Environment variables with bundled Node.js paths configured
 */
export function buildEnvWithBundledNode(existingEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const bundledNodePath = getBundledNodePath()

  if (!bundledNodePath) {
    if (!envConfiguredLogged) {
      console.log('[NodeRuntime] No bundled Node.js found, using original env')
      envConfiguredLogged = true
    }
    return existingEnv
  }

  const unixStylePath = toUnixStylePath(bundledNodePath)
  const separator = ':'
  const existingPath = existingEnv.PATH || ''

  // Build new PATH with bundled Node.js prepended
  const newPath = existingPath
    ? `${unixStylePath}${separator}${existingPath}`
    : unixStylePath

  // CRITICAL: Git Bash's /etc/profile uses ORIGINAL_PATH to rebuild PATH
  // If ORIGINAL_PATH is set, Git Bash uses it as the base for PATH construction
  // We must set ORIGINAL_PATH to include our bundled Node.js path
  const existingOriginalPath = existingEnv.ORIGINAL_PATH || existingPath
  const newOriginalPath = existingOriginalPath
    ? `${unixStylePath}${separator}${existingOriginalPath}`
    : unixStylePath

  // Only log once to reduce noise
  if (!envConfiguredLogged) {
    console.log(`[NodeRuntime] Env configured for Git Bash: PATH and ORIGINAL_PATH prepended with ${unixStylePath}`)
    envConfiguredLogged = true
  }

  return {
    ...existingEnv,
    PATH: newPath,
    ORIGINAL_PATH: newOriginalPath
  }
}

/**
 * @deprecated Use buildEnvWithBundledNode instead for proper Git Bash support.
 * This function only modifies PATH, which gets overwritten by Git Bash's /etc/profile.
 */
export function buildPathWithBundledNode(existingPath: string = ''): string {
  const bundledNodePath = getBundledNodePath()

  if (!bundledNodePath) {
    return existingPath
  }

  const unixStylePath = toUnixStylePath(bundledNodePath)
  const separator = ':'

  return existingPath
    ? `${unixStylePath}${separator}${existingPath}`
    : unixStylePath
}
