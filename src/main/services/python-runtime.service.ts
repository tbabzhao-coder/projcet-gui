/**
 * Python Runtime Service
 * Provides path to bundled Python runtime for MCP servers
 */

import { existsSync, appendFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { platform } from 'os'
import { homedir } from 'os'

// Debug log helper
function debugLog(message: string) {
  const logPath = join(homedir(), '.project4', 'python-debug.log')
  const timestamp = new Date().toISOString()
  try {
    appendFileSync(logPath, `[${timestamp}] ${message}\n`)
  } catch (error) {
    // Ignore errors
  }
  console.log(message)
}

/**
 * Get the path to the bundled Python executable
 * Returns null if Python is not bundled or not found
 * On macOS, automatically detects the correct architecture (arm64/x64)
 *
 * IMPORTANT: This function requires app.whenReady() to be completed in production mode
 * because it calls app.getPath('resources'). Do not call this during module initialization.
 */
export function getBundledPythonPath(): string | null {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const osPlatform = platform()

  debugLog('[PythonRuntime] === getBundledPythonPath DEBUG ===')
  debugLog(`[PythonRuntime] isDev: ${isDev}`)
  debugLog(`[PythonRuntime] osPlatform: ${osPlatform}`)
  debugLog(`[PythonRuntime] process.arch: ${process.arch}`)
  debugLog(`[PythonRuntime] app.isReady: ${app.isReady()}`)

  let pythonPath: string

  if (isDev) {
    // Development: use resources/python from project root
    // In dev mode, __dirname is out/main, so we need to go up to project root
    const projectRoot = join(__dirname, '../..')

    debugLog(`[PythonRuntime] Dev projectRoot: ${projectRoot}`)

    // On macOS, check for architecture-specific Python first
    if (osPlatform === 'darwin') {
      // Check current architecture
      const arch = process.arch
      const archSpecificPath = join(projectRoot, 'resources', `python-${arch}`)

      debugLog(`[PythonRuntime] Dev archSpecificPath: ${archSpecificPath}`)

      if (existsSync(join(archSpecificPath, 'bin', 'python3'))) {
        pythonPath = archSpecificPath
        debugLog(`[PythonRuntime] Using arch-specific Python: ${pythonPath}`)
      } else {
        // Fallback to generic python directory
        pythonPath = join(projectRoot, 'resources', 'python')
        debugLog(`[PythonRuntime] Fallback to generic Python: ${pythonPath}`)
      }
    } else if (osPlatform === 'win32') {
      // Windows: use python-win-x64 in development
      pythonPath = join(projectRoot, 'resources', 'python-win-x64')
    } else {
      // Linux: use generic python directory
      pythonPath = join(projectRoot, 'resources', 'python')
    }
  } else {
    // Production: use extraResources path
    // macOS: app.asar/../Resources/python-arm64 or python-x64
    // Windows: app.asar/../resources/python-x64
    // Linux: app.asar/../resources/python (not configured yet)

    // Use process.resourcesPath instead of app.getPath('resources')
    // process.resourcesPath is more reliable and doesn't require app to be ready
    let resourcesPath: string

    try {
      // In Electron, process.resourcesPath is set by the framework
      // It points to the Resources directory in the app bundle
      if (process.resourcesPath) {
        resourcesPath = process.resourcesPath
        debugLog(`[PythonRuntime] Production resourcesPath (from process): ${resourcesPath}`)
      } else {
        // Fallback: try to get from app
        if (!app.isReady()) {
          debugLog('[PythonRuntime] App not ready yet, cannot get resources path')
          console.warn('[PythonRuntime] App not ready yet, cannot get resources path')
          return null
        }
        resourcesPath = app.getPath('resources')
        debugLog(`[PythonRuntime] Production resourcesPath (from app): ${resourcesPath}`)
      }
    } catch (error) {
      debugLog(`[PythonRuntime] Error getting resources path: ${error}`)
      console.error('[PythonRuntime] Error getting resources path:', error)
      return null
    }

    // On macOS, try architecture-specific path first
    if (osPlatform === 'darwin') {
      // Prioritize current system architecture to avoid using wrong Python on arm64 Macs
      // When running on arm64 Mac, prefer python-arm64 over python-x64
      const currentArch = process.arch  // 'arm64' or 'x64'
      const fallbackArch = currentArch === 'arm64' ? 'x64' : 'arm64'
      const possibleArchs = [currentArch, fallbackArch]  // Current arch first
      let foundPath: string | null = null

      for (const arch of possibleArchs) {
        const archSpecificPath = join(resourcesPath, `python-${arch}`)
        const checkPath = join(archSpecificPath, 'bin', 'python3')

        debugLog(`[PythonRuntime] Checking ${arch}: ${checkPath}`)

        if (existsSync(checkPath)) {
          foundPath = archSpecificPath
          debugLog(`[PythonRuntime] Found Python at: ${checkPath} (arch: ${arch})`)
          break
        }
      }

      if (foundPath) {
        pythonPath = foundPath
      } else {
        // Fallback to generic python directory
        pythonPath = join(resourcesPath, 'python')
        debugLog(`[PythonRuntime] Fallback to: ${pythonPath}`)
      }
    } else if (osPlatform === 'win32') {
      // Windows: use python-win-x64 (bundled for Windows x64)
      pythonPath = join(resourcesPath, 'python-win-x64')
      debugLog(`[PythonRuntime] Windows python path: ${pythonPath}`)
    } else {
      // Linux: use generic python directory (not configured yet)
      pythonPath = join(resourcesPath, 'python')
      debugLog(`[PythonRuntime] Linux python path: ${pythonPath}`)
    }
  }

  // Determine Python executable name based on platform
  let pythonExecutable: string

  if (osPlatform === 'win32') {
    pythonExecutable = 'python.exe'
  } else {
    pythonExecutable = 'bin/python3'
  }

  const fullPath = join(pythonPath, pythonExecutable)

  debugLog(`[PythonRuntime] Final pythonPath: ${pythonPath}`)
  debugLog(`[PythonRuntime] Final fullPath: ${fullPath}`)
  debugLog(`[PythonRuntime] Final existsSync: ${existsSync(fullPath)}`)

  if (existsSync(fullPath)) {
    debugLog(`[PythonRuntime] Found bundled Python at: ${fullPath}`)
    console.log(`[PythonRuntime] Found bundled Python at: ${fullPath}`)
    return fullPath
  }

  debugLog(`[PythonRuntime] Bundled Python not found at: ${fullPath}`)
  console.warn(`[PythonRuntime] Bundled Python not found at: ${fullPath}`)
  return null
}

/**
 * Get Python executable with full path
 * Falls back to system Python if bundled version not available
 */
export function getPythonExecutable(): string {
  const bundled = getBundledPythonPath()
  if (bundled) {
    return bundled
  }

  // Fallback to system Python
  const osPlatform = platform()
  if (osPlatform === 'win32') {
    return 'python' // Will be resolved from PATH
  } else {
    return 'python3' // Will be resolved from PATH
  }
}

/**
 * Check if bundled Python is available
 */
export function hasBundledPython(): boolean {
  return getBundledPythonPath() !== null
}
