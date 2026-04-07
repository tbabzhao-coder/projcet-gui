/**
 * lark-cli Runtime Service
 * Provides path to bundled lark-cli binary and PATH injection for agent subprocess.
 *
 * This ensures AI-executed commands that use 'lark-cli' will use our bundled version,
 * not requiring the user to install it globally.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { platform } from 'os'

// Cache for bundled lark-cli path to avoid repeated filesystem checks
let cachedBundledLarkCliPath: string | null | undefined = undefined
let cachedUnixStylePath: string | null = null
let envConfiguredLogged = false

/**
 * Get the path to the bundled lark-cli directory
 * Returns null if lark-cli is not bundled or not found
 * Results are cached after first call.
 */
export function getBundledLarkCliPath(): string | null {
  if (cachedBundledLarkCliPath !== undefined) {
    return cachedBundledLarkCliPath
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const osPlatform = platform()
  const arch = process.arch

  // Determine directory name based on platform and architecture
  let larkCliDirName: string
  let executableName: string

  if (osPlatform === 'win32') {
    larkCliDirName = 'lark-cli-win-x64'
    executableName = 'lark-cli.exe'
  } else if (osPlatform === 'darwin') {
    if (arch === 'arm64') {
      larkCliDirName = 'lark-cli-arm64'
    } else {
      larkCliDirName = 'lark-cli-x64'
    }
    executableName = 'lark-cli'
  } else if (osPlatform === 'linux') {
    larkCliDirName = 'lark-cli-linux-x64'
    executableName = 'lark-cli'
  } else {
    cachedBundledLarkCliPath = null
    return null
  }

  let larkCliPath: string

  if (isDev) {
    // Development: use resources/lark-cli-{platform} from project root
    // In dev mode, __dirname is out/main, so we need to go up to project root
    const projectRoot = join(__dirname, '../..')
    larkCliPath = join(projectRoot, 'resources', larkCliDirName)
    console.log(`[LarkCliRuntime] Dev mode - projectRoot: ${projectRoot}, larkCliPath: ${larkCliPath}`)
  } else {
    // Production: use extraResources path
    let resourcesPath: string

    try {
      if (process.resourcesPath) {
        resourcesPath = process.resourcesPath
      } else {
        if (!app.isReady()) {
          console.warn('[LarkCliRuntime] App not ready yet, cannot get resources path')
          return null // Don't cache - app may become ready later
        }
        resourcesPath = (app as any).getPath('resources')
      }
    } catch (error) {
      console.error('[LarkCliRuntime] Error getting resources path:', error)
      return null // Don't cache - may be transient error
    }

    larkCliPath = join(resourcesPath, larkCliDirName)
  }

  const larkCliExecutable = join(larkCliPath, executableName)

  if (existsSync(larkCliExecutable)) {
    console.log(`[LarkCliRuntime] Found bundled lark-cli at: ${larkCliPath}`)
    cachedBundledLarkCliPath = larkCliPath
    return larkCliPath
  }

  console.warn(`[LarkCliRuntime] Bundled lark-cli not found at: ${larkCliPath}`)
  cachedBundledLarkCliPath = null
  return null
}

/**
 * Get the full path to the bundled lark-cli executable
 * Returns null if not found
 */
export function getBundledLarkCliExecutable(): string | null {
  const larkCliPath = getBundledLarkCliPath()
  if (!larkCliPath) {
    return null
  }

  const osPlatform = platform()
  // Go binary is directly in the directory root (not in bin/)
  const executable = osPlatform === 'win32' ? 'lark-cli.exe' : 'lark-cli'
  return join(larkCliPath, executable)
}

/**
 * Check if bundled lark-cli is available
 */
export function hasBundledLarkCli(): boolean {
  return getBundledLarkCliPath() !== null
}

/**
 * Convert Windows path to Unix-style path for Git Bash compatibility
 * D:\path\to\lark-cli -> /d/path/to/lark-cli
 * Results are cached.
 */
function toUnixStylePath(windowsPath: string): string {
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
 * Build environment variables with bundled lark-cli in PATH.
 *
 * Git Bash's /etc/profile rebuilds PATH on startup using ORIGINAL_PATH.
 * To ensure our bundled lark-cli is found, we must set BOTH:
 * - PATH: For immediate use
 * - ORIGINAL_PATH: For Git Bash to inherit when it rebuilds PATH
 *
 * @param existingEnv - The existing environment variables
 * @returns Environment variables with bundled lark-cli path configured
 */
export function buildEnvWithLarkCli(existingEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const bundledLarkCliPath = getBundledLarkCliPath()

  if (!bundledLarkCliPath) {
    if (!envConfiguredLogged) {
      console.log('[LarkCliRuntime] No bundled lark-cli found, using original env')
      envConfiguredLogged = true
    }
    return existingEnv
  }

  // lark-cli binary is directly in the directory root (not in bin/ subdirectory)
  const unixStylePath = toUnixStylePath(bundledLarkCliPath)
  const separator = ':'
  const existingPath = existingEnv.PATH || ''

  // Build new PATH with bundled lark-cli prepended
  const newPath = existingPath
    ? `${unixStylePath}${separator}${existingPath}`
    : unixStylePath

  // CRITICAL: Git Bash's /etc/profile uses ORIGINAL_PATH to rebuild PATH
  const existingOriginalPath = existingEnv.ORIGINAL_PATH || existingPath
  const newOriginalPath = existingOriginalPath
    ? `${unixStylePath}${separator}${existingOriginalPath}`
    : unixStylePath

  if (!envConfiguredLogged) {
    console.log(`[LarkCliRuntime] Env configured: PATH and ORIGINAL_PATH prepended with ${unixStylePath}`)
    envConfiguredLogged = true
  }

  return {
    ...existingEnv,
    PATH: newPath,
    ORIGINAL_PATH: newOriginalPath
  }
}
