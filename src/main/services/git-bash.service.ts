/**
 * Git Bash Service - Detection and path management for Windows
 *
 * Claude Code CLI on Windows requires Git Bash as the shell execution environment.
 * This service detects existing Git Bash installations and manages paths.
 */

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

export interface GitBashDetectionResult {
  found: boolean
  path: string | null
  source: 'system' | 'app-local' | 'env-var' | null
}

/**
 * Detect Git Bash installation on the system
 *
 * Detection order (optimized for offline installation):
 * 1. Environment variable (CLAUDE_CODE_GIT_BASH_PATH) - for development/testing
 * 2. System installation (Program Files) - prefer user's existing Git
 * 3. App-local installation (userData/git-bash) - offline installed by app
 * 4. Bundled Git Bash (extraResources/git-bash-win-x64) - fallback to bundled
 * 5. PATH-based discovery - last resort
 */
export function detectGitBash(): GitBashDetectionResult {
  // Non-Windows platforms use system bash
  if (process.platform !== 'win32') {
    return { found: true, path: '/bin/bash', source: 'system' }
  }

  // 1. Check environment variable (for development/testing)
  const envPath = process.env.CLAUDE_CODE_GIT_BASH_PATH
  if (envPath && existsSync(envPath)) {
    console.log('[GitBash] Found via environment variable:', envPath)
    return { found: true, path: envPath, source: 'env-var' }
  }

  // 2. Check system installation paths (prefer user's existing Git)
  const systemPaths = [
    join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'bash.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Git', 'bin', 'bash.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ]

  for (const p of systemPaths) {
    if (p && existsSync(p)) {
      console.log('[GitBash] Found system installation:', p)
      return { found: true, path: p, source: 'system' }
    }
  }

  // 3. Try to find git in PATH and derive bash path
  const gitFromPath = findGitInPath()
  if (gitFromPath) {
    // Git is typically at: C:\Program Files\Git\cmd\git.exe
    // Bash is at: C:\Program Files\Git\bin\bash.exe
    const bashPath = join(gitFromPath, '..', '..', 'bin', 'bash.exe')
    if (existsSync(bashPath)) {
      console.log('[GitBash] Found via PATH:', bashPath)
      return { found: true, path: bashPath, source: 'system' }
    }
  }

  // 4. Check app-local installation (offline installed by app)
  const localGitBash = join(app.getPath('userData'), 'git-bash', 'bin', 'bash.exe')
  if (existsSync(localGitBash)) {
    console.log('[GitBash] Found app-local installation:', localGitBash)
    return { found: true, path: localGitBash, source: 'app-local' }
  }

  // 5. Check bundled Git Bash (packaged with app) - fallback
  const bundledGitBash = getBundledGitBashPath()
  if (bundledGitBash && existsSync(bundledGitBash)) {
    console.log('[GitBash] Found bundled installation:', bundledGitBash)
    return { found: true, path: bundledGitBash, source: 'app-local' }
  }

  console.log('[GitBash] Not found')
  return { found: false, path: null, source: null }
}

/**
 * Find git.exe in PATH environment variable
 */
function findGitInPath(): string | null {
  const pathEnv = process.env.PATH || ''
  const paths = pathEnv.split(';')

  for (const p of paths) {
    const gitExe = join(p, 'git.exe')
    if (existsSync(gitExe)) {
      return gitExe
    }
  }
  return null
}

/**
 * Get the path to the bundled Git Bash (packaged with app)
 * Returns null if not found or not in production mode
 */
function getBundledGitBashPath(): string | null {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    // Development: check resources/git-bash-win-x64
    const projectRoot = join(__dirname, '../..')
    const devPath = join(projectRoot, 'resources', 'git-bash-win-x64', 'bin', 'bash.exe')
    return existsSync(devPath) ? devPath : null
  } else {
    // Production: check extraResources
    try {
      const resourcesPath = process.resourcesPath || app.getPath('resources')
      const prodPath = join(resourcesPath, 'git-bash-win-x64', 'bin', 'bash.exe')
      return existsSync(prodPath) ? prodPath : null
    } catch (error) {
      console.error('[GitBash] Error getting bundled path:', error)
      return null
    }
  }
}

/**
 * Get the path to the app-local Git Bash installation directory
 */
export function getAppLocalGitBashDir(): string {
  return join(app.getPath('userData'), 'git-bash')
}

/**
 * Check if Git Bash is installed by Project4 (app-local)
 */
export function isAppLocalInstallation(): boolean {
  const result = detectGitBash()
  return result.found && result.source === 'app-local'
}

/**
 * Set the Git Bash path environment variable for Claude Code SDK
 */
export function setGitBashPathEnv(path: string): void {
  process.env.CLAUDE_CODE_GIT_BASH_PATH = path
  console.log('[GitBash] Environment variable set:', path)
}

/**
 * Install Git Bash from bundled resources (offline installation)
 * Copies the bundled Git Bash to userData for persistent use
 *
 * @returns Installation result with path or error
 */
export async function installBundledGitBash(): Promise<{
  success: boolean
  path?: string
  error?: string
}> {
  try {
    console.log('[GitBash] Starting offline installation from bundled resources...')

    // Check if bundled Git Bash exists
    const bundledPath = getBundledGitBashPath()
    if (!bundledPath || !existsSync(bundledPath)) {
      const error = 'Bundled Git Bash not found in application resources'
      console.error('[GitBash]', error)
      return { success: false, error }
    }

    // Get bundled directory (remove /bin/bash.exe to get root)
    const bundledDir = join(bundledPath, '..', '..')
    const normalizedBundledDir = join(bundledDir) // Normalize path

    console.log('[GitBash] Bundled Git Bash found at:', normalizedBundledDir)

    // Target directory in userData
    const targetDir = getAppLocalGitBashDir()
    const targetBashPath = join(targetDir, 'bin', 'bash.exe')

    // Check if already installed
    if (existsSync(targetBashPath)) {
      console.log('[GitBash] Git Bash already installed at:', targetBashPath)
      return { success: true, path: targetBashPath }
    }

    console.log('[GitBash] Copying to:', targetDir)

    // Import fs for recursive copy
    const fs = require('fs')
    const { promisify } = require('util')
    const copyFile = promisify(fs.copyFile)
    const mkdir = promisify(fs.mkdir)
    const readdir = promisify(fs.readdir)
    const stat = promisify(fs.stat)

    // Recursive copy function
    async function copyRecursive(src: string, dest: string): Promise<void> {
      const stats = await stat(src)

      if (stats.isDirectory()) {
        // Create directory if it doesn't exist
        await mkdir(dest, { recursive: true })

        // Read directory contents
        const entries = await readdir(src)

        // Copy each entry recursively
        for (const entry of entries) {
          const srcPath = join(src, entry)
          const destPath = join(dest, entry)
          await copyRecursive(srcPath, destPath)
        }
      } else {
        // Ensure parent directory exists before copying file
        await mkdir(dirname(dest), { recursive: true })
        await copyFile(src, dest)
      }
    }

    // Perform the copy
    console.log('[GitBash] Copying files (this may take a moment)...')
    await copyRecursive(normalizedBundledDir, targetDir)

    // Verify installation
    if (!existsSync(targetBashPath)) {
      const error = 'Installation completed but bash.exe not found'
      console.error('[GitBash]', error)
      return { success: false, error }
    }

    console.log('[GitBash] Offline installation completed successfully')
    return { success: true, path: targetBashPath }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[GitBash] Offline installation failed:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/**
 * Check if bundled Git Bash is available for offline installation
 */
export function hasBundledGitBash(): boolean {
  const bundledPath = getBundledGitBashPath()
  return bundledPath !== null && existsSync(bundledPath)
}
