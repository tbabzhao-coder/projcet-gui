/**
 * Artifact Cache Service - Manages file system cache with chokidar watcher
 *
 * Features:
 * - Per-space caching with lazy loading
 * - File system watching for incremental updates
 * - Event-driven notifications to renderer
 * - Memory-efficient with LRU-style cleanup
 */

import chokidar, { FSWatcher } from 'chokidar'
import { join, extname, basename, dirname, relative } from 'path'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { getMainWindow } from '../index'
import { broadcastToAll } from '../http/websocket'

/**
 * Broadcast event to all clients (Electron IPC + WebSocket)
 * Pattern from agent/helpers.ts:broadcastToAllClients
 */
function broadcastToAllClients(channel: string, data: Record<string, unknown>): void {
  // 1. Send to Electron renderer via IPC
  try {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  } catch (error) {
    console.error('[ArtifactCache] Failed to send event to renderer:', error)
  }

  // 2. Broadcast to remote WebSocket clients
  try {
    broadcastToAll(channel, data)
  } catch (error) {
    // WebSocket module might not be initialized yet, ignore
  }
}

// File type icon IDs mapping (same as artifact.service.ts)
const FILE_ICON_IDS: Record<string, string> = {
  html: 'globe', htm: 'globe', css: 'palette', scss: 'palette', less: 'palette',
  js: 'file-code', jsx: 'file-code', ts: 'file-code', tsx: 'file-code',
  json: 'file-json', md: 'book', markdown: 'book', txt: 'file-text',
  py: 'file-code', rs: 'cpu', go: 'file-code', java: 'coffee',
  cpp: 'cpu', c: 'cpu', h: 'cpu', hpp: 'cpu', vue: 'file-code',
  svelte: 'file-code', php: 'file-code', rb: 'gem', swift: 'file-code',
  kt: 'file-code', sql: 'database', sh: 'terminal', bash: 'terminal',
  zsh: 'terminal', yaml: 'file-json', yml: 'file-json', xml: 'file-json',
  svg: 'image', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', ico: 'image', pdf: 'book', default: 'file-text'
}

// Hidden patterns - system junk files that should never be shown
const HIDDEN_PATTERNS = [
  /\.DS_Store$/,      // macOS system file
  /Thumbs\.db$/,      // Windows thumbnail cache
  /desktop\.ini$/,    // Windows folder settings
]

// Watcher exclude patterns - directories NOT to watch for changes
// These directories are still VISIBLE in the tree, but changes inside them
// won't trigger file watcher events. User needs to manually refresh to see changes.
// This prevents EMFILE (too many open files) errors from large directories.
const WATCHER_EXCLUDE = [
  // System junk (also hidden from display)
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /desktop\.ini$/,

  // Large directories - exclude internals (VSCode style)
  // Top-level directory is visible, but contents are not watched
  /node_modules\/.+/,         // node_modules internals
  /\.git\/objects/,           // .git/objects (large binary storage)
  /\.git\/subtree-cache/,     // .git/subtree-cache
  /\.hg\/store/,              // Mercurial store
  /\.venv\/.+/,               // Python venv internals
  /venv\/.+/,                 // Python venv internals (alternative name)
  /\.pnpm\/.+/,               // pnpm store internals
  /__pycache__/,              // Python bytecode cache
  /\.pytest_cache/,           // pytest cache
  /\.mypy_cache/,             // mypy cache
  /\.tox/,                    // tox environments
  /\.cache\/.+/,              // Generic cache directories
  /\.turbo\/.+/,              // Turborepo cache
  /\.next\/.+/,               // Next.js build cache
  /\.nuxt\/.+/,               // Nuxt.js build cache
  /dist\/.+/,                 // Build output internals
  /build\/.+/,                // Build output internals
  /coverage\/.+/,             // Test coverage reports
]

/**
 * Artifact item for flat list view
 */
export interface CachedArtifact {
  id: string
  spaceId: string
  name: string
  type: 'file' | 'folder'
  path: string
  relativePath: string  // Path relative to space root
  extension: string
  icon: string
  size?: number
  createdAt: string
  modifiedAt: string
}

/**
 * Tree node for hierarchical view
 */
export interface CachedTreeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  path: string
  relativePath: string
  extension: string
  icon: string
  size?: number
  depth: number
  children?: CachedTreeNode[]
  childrenLoaded: boolean  // For lazy loading
}

/**
 * File change event for incremental updates
 */
export interface ArtifactChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  relativePath: string
  spaceId: string
  item?: CachedArtifact | CachedTreeNode
}

/**
 * Space cache entry
 */
interface SpaceCache {
  spaceId: string
  rootPath: string
  watcher: FSWatcher | null
  // Cache for flat list (only top-level items for card view)
  flatItems: Map<string, CachedArtifact>
  // Cache for tree structure (with lazy-loaded children)
  treeNodes: Map<string, CachedTreeNode>
  // Track loaded directories for lazy loading
  loadedDirs: Set<string>
  // Last update timestamp
  lastUpdate: number
}

// Global cache map (per-space)
const cacheMap = new Map<string, SpaceCache>()

// Event listeners registry
type ChangeListener = (event: ArtifactChangeEvent) => void
const changeListeners: ChangeListener[] = []

/**
 * Get file icon ID from extension
 */
function getFileIconId(ext: string): string {
  const normalized = ext.toLowerCase().replace('.', '')
  return FILE_ICON_IDS[normalized] || FILE_ICON_IDS.default
}

/**
 * Generate unique ID for artifacts
 */
function generateId(): string {
  return `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Check if path should be hidden (system junk files and hidden files/folders)
 */
function shouldHide(filePath: string): boolean {
  // Check against system junk file patterns
  if (HIDDEN_PATTERNS.some(pattern => pattern.test(filePath))) {
    return true
  }

  // Hide all files/folders starting with '.' (hidden files/folders)
  const name = basename(filePath)
  if (name.startsWith('.')) {
    return true
  }

  return false
}

/**
 * Create artifact from file stats
 */
async function createArtifact(
  fullPath: string,
  rootPath: string,
  spaceId: string
): Promise<CachedArtifact | null> {
  try {
    const stats = await fs.stat(fullPath)
    const ext = extname(fullPath)
    const name = basename(fullPath)
    const relativePath = relative(rootPath, fullPath)

    return {
      id: generateId(),
      spaceId,
      name,
      type: stats.isDirectory() ? 'folder' : 'file',
      path: fullPath,
      relativePath,
      extension: ext.replace('.', ''),
      icon: stats.isDirectory() ? 'folder' : getFileIconId(ext),
      size: stats.isFile() ? stats.size : undefined,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString()
    }
  } catch (error) {
    console.error(`[ArtifactCache] Failed to create artifact for ${fullPath}:`, error)
    return null
  }
}

/**
 * Create tree node from file stats
 */
async function createTreeNode(
  fullPath: string,
  rootPath: string,
  depth: number
): Promise<CachedTreeNode | null> {
  try {
    const stats = await fs.stat(fullPath)
    const ext = extname(fullPath)
    const name = basename(fullPath)
    const relativePath = relative(rootPath, fullPath)
    const isDir = stats.isDirectory()

    return {
      id: generateId(),
      name,
      type: isDir ? 'folder' : 'file',
      path: fullPath,
      relativePath,
      extension: ext.replace('.', ''),
      icon: isDir ? 'folder' : getFileIconId(ext),
      size: stats.isFile() ? stats.size : undefined,
      depth,
      children: isDir ? [] : undefined,
      childrenLoaded: false
    }
  } catch (error) {
    console.error(`[ArtifactCache] Failed to create tree node for ${fullPath}:`, error)
    return null
  }
}

/**
 * Scan directory for immediate children only (async, non-blocking)
 */
async function scanDirectoryShallow(
  dirPath: string,
  rootPath: string,
  spaceId: string
): Promise<CachedArtifact[]> {
  const startTime = performance.now()
  const artifacts: CachedArtifact[] = []

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    // Process entries in parallel with concurrency limit
    const CONCURRENCY = 50
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch
          .filter(entry => !shouldHide(entry.name))
          .map(async entry => {
            const fullPath = join(dirPath, entry.name)
            return createArtifact(fullPath, rootPath, spaceId)
          })
      )

      for (const artifact of results) {
        if (artifact) {
          artifacts.push(artifact)
        }
      }
    }
  } catch (error) {
    console.error(`[ArtifactCache] Failed to scan directory ${dirPath}:`, error)
  }

  const elapsed = performance.now() - startTime
  console.log(`[ArtifactCache] ⏱️ scanDirectoryShallow: ${artifacts.length} items in ${elapsed.toFixed(1)}ms (path=${dirPath})`)

  return artifacts
}

/**
 * Scan directory and return tree nodes (first level only)
 */
async function scanDirectoryTreeShallow(
  dirPath: string,
  rootPath: string,
  depth: number = 0
): Promise<CachedTreeNode[]> {
  const startTime = performance.now()
  const nodes: CachedTreeNode[] = []

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    // Sort: folders first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    // Process entries in parallel with concurrency limit
    const CONCURRENCY = 50
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch
          .filter(entry => !shouldHide(entry.name))
          .map(async entry => {
            const fullPath = join(dirPath, entry.name)
            return createTreeNode(fullPath, rootPath, depth)
          })
      )

      for (const node of results) {
        if (node) {
          nodes.push(node)
        }
      }
    }

    // Re-sort after parallel processing
    nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1
      if (a.type !== 'folder' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })

  } catch (error) {
    console.error(`[ArtifactCache] Failed to scan tree ${dirPath}:`, error)
  }

  const elapsed = performance.now() - startTime
  console.log(`[ArtifactCache] ⏱️ scanDirectoryTreeShallow: ${nodes.length} nodes in ${elapsed.toFixed(1)}ms (depth=${depth}, path=${dirPath})`)

  return nodes
}

/**
 * Initialize watcher for a space
 */
function initWatcher(cache: SpaceCache): void {
  if (cache.watcher) {
    return // Already initialized
  }

  console.log(`[ArtifactCache] Initializing watcher for space: ${cache.spaceId} at ${cache.rootPath}`)

  const watcher = chokidar.watch(cache.rootPath, {
    ignored: WATCHER_EXCLUDE,  // Use watcher-specific exclusions (not display filtering)
    persistent: true,
    ignoreInitial: true,  // Don't trigger events for existing files
    depth: 10,            // Max depth for watching
    awaitWriteFinish: {   // Wait for file writes to complete
      stabilityThreshold: 300,
      pollInterval: 100
    },
    // Performance optimizations
    usePolling: false,    // Use native fs events when available
    interval: 1000,       // Polling interval if polling is used
    binaryInterval: 3000, // Polling interval for binary files
  })

  // Handle file add
  watcher.on('add', async (filePath) => {
    console.log(`[ArtifactCache] File added: ${filePath}`)
    const artifact = await createArtifact(filePath, cache.rootPath, cache.spaceId)
    if (artifact) {
      cache.flatItems.set(filePath, artifact)
      emitChange({
        type: 'add',
        path: filePath,
        relativePath: relative(cache.rootPath, filePath),
        spaceId: cache.spaceId,
        item: artifact
      })
    }
  })

  // Handle file change
  watcher.on('change', async (filePath) => {
    console.log(`[ArtifactCache] File changed: ${filePath}`)
    const artifact = await createArtifact(filePath, cache.rootPath, cache.spaceId)
    if (artifact) {
      cache.flatItems.set(filePath, artifact)
      emitChange({
        type: 'change',
        path: filePath,
        relativePath: relative(cache.rootPath, filePath),
        spaceId: cache.spaceId,
        item: artifact
      })
    }
  })

  // Handle file delete
  watcher.on('unlink', (filePath) => {
    console.log(`[ArtifactCache] File removed: ${filePath}`)
    cache.flatItems.delete(filePath)
    cache.treeNodes.delete(filePath)
    emitChange({
      type: 'unlink',
      path: filePath,
      relativePath: relative(cache.rootPath, filePath),
      spaceId: cache.spaceId
    })
  })

  // Handle directory add
  watcher.on('addDir', async (dirPath) => {
    // Skip root path
    if (dirPath === cache.rootPath) return

    console.log(`[ArtifactCache] Directory added: ${dirPath}`)
    const artifact = await createArtifact(dirPath, cache.rootPath, cache.spaceId)
    if (artifact) {
      cache.flatItems.set(dirPath, artifact)
      emitChange({
        type: 'addDir',
        path: dirPath,
        relativePath: relative(cache.rootPath, dirPath),
        spaceId: cache.spaceId,
        item: artifact
      })
    }
  })

  // Handle directory delete
  watcher.on('unlinkDir', (dirPath) => {
    console.log(`[ArtifactCache] Directory removed: ${dirPath}`)
    cache.flatItems.delete(dirPath)
    cache.treeNodes.delete(dirPath)
    cache.loadedDirs.delete(dirPath)
    emitChange({
      type: 'unlinkDir',
      path: dirPath,
      relativePath: relative(cache.rootPath, dirPath),
      spaceId: cache.spaceId
    })
  })

  // Handle errors - graceful degradation like VSCode
  watcher.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`[ArtifactCache] Watcher error for ${cache.spaceId}:`, error)

    // Handle EMFILE (too many open files) gracefully
    if (error.code === 'EMFILE' || error.code === 'ENFILE') {
      console.warn(`[ArtifactCache] ⚠️ Too many open files. Disabling file watcher for ${cache.spaceId}.`)
      console.warn('[ArtifactCache] File changes will not be detected automatically. Manual refresh required.')

      // Close the watcher to release file descriptors
      if (cache.watcher) {
        cache.watcher.close().catch(() => {})
        cache.watcher = null
      }

      // Notify renderer about the degraded state
      try {
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('artifact:watcher-error', {
            spaceId: cache.spaceId,
            error: 'EMFILE',
            message: 'Too many open files. File watcher disabled.'
          })
        }
      } catch (e) {
        // Ignore notification errors
      }
    }
  })

  cache.watcher = watcher
}

/**
 * Emit change event to all listeners
 */
function emitChange(event: ArtifactChangeEvent): void {
  // Notify registered listeners (internal callbacks)
  for (const listener of changeListeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('[ArtifactCache] Listener error:', error)
    }
  }

  // Broadcast to all clients (Electron IPC + WebSocket)
  broadcastToAllClients('artifact:changed', event as unknown as Record<string, unknown>)
}

// ============================================
// Public API
// ============================================

/**
 * Initialize cache for a space
 */
export async function initSpaceCache(spaceId: string, rootPath: string): Promise<void> {
  console.log(`[ArtifactCache] Initializing cache for space: ${spaceId}`)

  // Clean up existing cache if any
  if (cacheMap.has(spaceId)) {
    await destroySpaceCache(spaceId)
  }

  const cache: SpaceCache = {
    spaceId,
    rootPath,
    watcher: null,
    flatItems: new Map(),
    treeNodes: new Map(),
    loadedDirs: new Set(),
    lastUpdate: Date.now()
  }

  cacheMap.set(spaceId, cache)

  // Initialize watcher in background (don't block)
  setImmediate(() => {
    initWatcher(cache)
  })
}

/**
 * Ensure cache exists without tearing down existing watcher
 */
export async function ensureSpaceCache(spaceId: string, rootPath: string): Promise<void> {
  const cache = cacheMap.get(spaceId)
  if (!cache) {
    await initSpaceCache(spaceId, rootPath)
    return
  }

  if (!cache.watcher) {
    setImmediate(() => initWatcher(cache))
  }
}

/**
 * Destroy cache for a space
 */
export async function destroySpaceCache(spaceId: string): Promise<void> {
  const cache = cacheMap.get(spaceId)
  if (!cache) return

  console.log(`[ArtifactCache] Destroying cache for space: ${spaceId}`)

  if (cache.watcher) {
    await cache.watcher.close()
    cache.watcher = null
  }

  cache.flatItems.clear()
  cache.treeNodes.clear()
  cache.loadedDirs.clear()

  cacheMap.delete(spaceId)
}

/**
 * Get artifacts as flat list (for card view)
 * Only returns top-level items
 */
export async function listArtifacts(
  spaceId: string,
  rootPath: string,
  maxDepth: number = 2
): Promise<CachedArtifact[]> {
  console.log(`[ArtifactCache] listArtifacts for space: ${spaceId}`)

  // Ensure cache is initialized
  if (!cacheMap.has(spaceId)) {
    await initSpaceCache(spaceId, rootPath)
  }

  const cache = cacheMap.get(spaceId)!

  // If cache is fresh (within 5 seconds), return cached items
  const now = Date.now()
  if (cache.flatItems.size > 0 && now - cache.lastUpdate < 5000) {
    console.log(`[ArtifactCache] Returning cached ${cache.flatItems.size} items`)
    return Array.from(cache.flatItems.values())
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
  }

  // Scan root directory
  const artifacts = await scanDirectoryRecursive(rootPath, rootPath, spaceId, maxDepth, 0)

  // Update cache
  cache.flatItems.clear()
  for (const artifact of artifacts) {
    cache.flatItems.set(artifact.path, artifact)
  }
  cache.lastUpdate = now

  return artifacts.sort((a, b) =>
    new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  )
}

/**
 * Recursively scan directory with depth limit (async)
 */
async function scanDirectoryRecursive(
  dirPath: string,
  rootPath: string,
  spaceId: string,
  maxDepth: number,
  currentDepth: number
): Promise<CachedArtifact[]> {
  if (currentDepth >= maxDepth || !existsSync(dirPath)) {
    return []
  }

  const artifacts: CachedArtifact[] = []

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    // Process in parallel with concurrency limit
    const CONCURRENCY = 50
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY)

      const results = await Promise.all(
        batch
          .filter(entry => !shouldHide(entry.name))
          .map(async entry => {
            const fullPath = join(dirPath, entry.name)
            const artifact = await createArtifact(fullPath, rootPath, spaceId)

            if (!artifact) return []

            const items = [artifact]

            // Recursively scan subdirectories
            if (entry.isDirectory()) {
              const subItems = await scanDirectoryRecursive(
                fullPath, rootPath, spaceId, maxDepth, currentDepth + 1
              )
              items.push(...subItems)
            }

            return items
          })
      )

      for (const items of results) {
        artifacts.push(...items)
      }
    }
  } catch (error) {
    console.error(`[ArtifactCache] Failed to scan ${dirPath}:`, error)
  }

  return artifacts
}

/**
 * Get artifacts as tree structure (lazy loading)
 */
export async function listArtifactsTree(
  spaceId: string,
  rootPath: string
): Promise<CachedTreeNode[]> {
  console.log(`[ArtifactCache] listArtifactsTree for space: ${spaceId}`)

  // Ensure cache is initialized
  if (!cacheMap.has(spaceId)) {
    await initSpaceCache(spaceId, rootPath)
  }

  // Scan root level only
  return scanDirectoryTreeShallow(rootPath, rootPath, 0)
}

/**
 * Load children for a specific directory (lazy loading)
 */
export async function loadDirectoryChildren(
  spaceId: string,
  dirPath: string,
  rootPath: string
): Promise<CachedTreeNode[]> {
  console.log(`[ArtifactCache] Loading children for: ${dirPath}`)

  const cache = cacheMap.get(spaceId)
  if (!cache) {
    await initSpaceCache(spaceId, rootPath)
  }

  // Calculate depth based on relative path
  const relativePath = relative(rootPath, dirPath)
  const depth = relativePath ? relativePath.split(/[\\/]/).length : 0

  const children = await scanDirectoryTreeShallow(dirPath, rootPath, depth + 1)

  // Mark directory as loaded
  if (cache) {
    cache.loadedDirs.add(dirPath)
  }

  return children
}

/**
 * Register a change listener
 */
export function onArtifactChange(listener: ChangeListener): () => void {
  changeListeners.push(listener)
  return () => {
    const index = changeListeners.indexOf(listener)
    if (index > -1) {
      changeListeners.splice(index, 1)
    }
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(spaceId: string): {
  flatItems: number
  treeNodes: number
  loadedDirs: number
  watcherActive: boolean
} | null {
  const cache = cacheMap.get(spaceId)
  if (!cache) return null

  return {
    flatItems: cache.flatItems.size,
    treeNodes: cache.treeNodes.size,
    loadedDirs: cache.loadedDirs.size,
    watcherActive: cache.watcher !== null
  }
}

/**
 * Force refresh cache for a space
 */
export async function refreshCache(spaceId: string, rootPath: string): Promise<void> {
  console.log(`[ArtifactCache] Force refreshing cache for space: ${spaceId}`)

  const cache = cacheMap.get(spaceId)
  if (cache) {
    cache.flatItems.clear()
    cache.treeNodes.clear()
    cache.loadedDirs.clear()
    cache.lastUpdate = 0
  }
}

/**
 * Cleanup all caches (call on app exit)
 */
export async function cleanupAllCaches(): Promise<void> {
  console.log('[ArtifactCache] Cleaning up all caches')

  for (const spaceId of cacheMap.keys()) {
    await destroySpaceCache(spaceId)
  }
}
