/**
 * Space Service - Manages workspaces/spaces
 *
 * PERFORMANCE OPTIMIZED:
 * - Async stats calculation
 * - Fast estimation for large directories
 * - Caching for repeated access
 */

import { shell } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'fs'
import { getProject4Dir, getTempSpacePath, getSpacesDir } from './config.service'
import { v4 as uuidv4 } from 'uuid'

// Re-export config helper for backward compatibility with existing imports
export { getSpacesDir } from './config.service'

// Cache for space stats to avoid repeated scanning
interface StatsCache {
  artifactCount: number
  conversationCount: number
  timestamp: number
}
const statsCache = new Map<string, StatsCache>()
const STATS_CACHE_TTL = 30000 // 30 seconds

interface Space {
  id: string
  name: string
  icon: string
  path: string
  isTemp: boolean
  createdAt: string
  updatedAt: string
  stats: {
    artifactCount: number
    conversationCount: number
  }
  preferences?: SpacePreferences
}

// Layout preferences for a space
interface SpaceLayoutPreferences {
  artifactRailExpanded?: boolean
  chatWidth?: number
}

// All space preferences
interface SpacePreferences {
  layout?: SpaceLayoutPreferences
}

interface SpaceMeta {
  id: string
  name: string
  icon: string
  createdAt: string
  updatedAt: string
  preferences?: SpacePreferences
}

// Space index for tracking custom path spaces
interface SpaceIndex {
  customPaths: string[]  // Array of paths to spaces outside ~/.project4/spaces/
}

function getSpaceIndexPath(): string {
  return join(getProject4Dir(), 'spaces-index.json')
}

function loadSpaceIndex(): SpaceIndex {
  const indexPath = getSpaceIndexPath()
  if (existsSync(indexPath)) {
    try {
      return JSON.parse(readFileSync(indexPath, 'utf-8'))
    } catch {
      return { customPaths: [] }
    }
  }
  return { customPaths: [] }
}

function saveSpaceIndex(index: SpaceIndex): void {
  const indexPath = getSpaceIndexPath()
  writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

function addToSpaceIndex(path: string): void {
  const index = loadSpaceIndex()
  if (!index.customPaths.includes(path)) {
    index.customPaths.push(path)
    saveSpaceIndex(index)
  }
}

function removeFromSpaceIndex(path: string): void {
  const index = loadSpaceIndex()
  index.customPaths = index.customPaths.filter(p => p !== path)
  saveSpaceIndex(index)
}

const PROJECT4_TEMP_SPACE: Space = {
  id: 'project4-temp',
  name: 'Project4',
  icon: 'sparkles',  // Maps to Lucide Sparkles icon
  path: '',
  isTemp: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    artifactCount: 0,
    conversationCount: 0
  }
}

// Get all valid space paths (for security checks)
export function getAllSpacePaths(): string[] {
  const paths: string[] = []

  // Add temp space path
  paths.push(getTempSpacePath())

  // Add default spaces directory
  const spacesDir = getSpacesDir()
  if (existsSync(spacesDir)) {
    const dirs = readdirSync(spacesDir)
    for (const dir of dirs) {
      const spacePath = join(spacesDir, dir)
      if (statSync(spacePath).isDirectory()) {
        paths.push(spacePath)
      }
    }
  }

  // Add custom path spaces from index
  const index = loadSpaceIndex()
  for (const customPath of index.customPaths) {
    if (existsSync(customPath)) {
      paths.push(customPath)
    }
  }

  return paths
}

/**
 * Get space stats (sync version, with caching)
 * Uses cache to avoid repeated expensive scans
 *
 * PERFORMANCE: For custom path spaces (large directories), we limit scanning
 * to avoid blocking the main thread and causing UI freezes.
 */
function getSpaceStats(spacePath: string): { artifactCount: number; conversationCount: number } {
  // Check cache first
  const cached = statsCache.get(spacePath)
  const now = Date.now()
  if (cached && now - cached.timestamp < STATS_CACHE_TTL) {
    return { artifactCount: cached.artifactCount, conversationCount: cached.conversationCount }
  }

  const startTime = performance.now()

  // Fast estimation: only count top-level items for artifacts
  // This is much faster than recursive counting for large projects
  let artifactCount = 0
  let conversationCount = 0

  // Determine artifact directory based on space type
  const isTemp = spacePath === getTempSpacePath()
  const spacesDir = getSpacesDir()
  const isCustomPath = !isTemp && !spacePath.startsWith(spacesDir)
  const artifactsDir = isTemp ? join(spacePath, 'artifacts') : spacePath

  // Count artifacts - fast estimation (top-level only for non-temp, or artifacts folder for temp)
  if (existsSync(artifactsDir)) {
    try {
      // CRITICAL: For custom path spaces, limit scanning to prevent UI freeze
      // Custom paths may be large project directories with thousands of files
      const MAX_ITEMS_TO_SCAN = isCustomPath ? 100 : 1000

      const items = readdirSync(artifactsDir)

      // For custom paths with many items, return early with estimation
      if (isCustomPath && items.length > MAX_ITEMS_TO_SCAN) {
        console.log(`[Space] ⚠️ Custom path has ${items.length} items, using fast estimation (limit: ${MAX_ITEMS_TO_SCAN})`)
        // Quick estimation: count first N items and extrapolate
        const sampleSize = Math.min(MAX_ITEMS_TO_SCAN, items.length)
        const ignoredDirs = new Set(['.project4', '.git', 'node_modules', '__pycache__', 'dist', 'build', '.DS_Store'])
        const sampleCount = items.slice(0, sampleSize).filter(item =>
          !item.startsWith('.') && !ignoredDirs.has(item)
        ).length
        // Use sample count directly (don't extrapolate to avoid misleading numbers)
        artifactCount = sampleCount
      } else {
        // Normal counting for small directories
        const ignoredDirs = new Set(['.project4', '.git', 'node_modules', '__pycache__', 'dist', 'build', '.DS_Store'])
        artifactCount = items.filter(item =>
          !item.startsWith('.') && (isTemp || !ignoredDirs.has(item))
        ).length
      }
    } catch (error) {
      console.error(`[Space] Error counting artifacts:`, error)
    }
  }

  // Count conversations - this is already fast (just .json files in one directory)
  const conversationsDir = isTemp
    ? join(spacePath, 'conversations')
    : join(spacePath, '.project4', 'conversations')

  if (existsSync(conversationsDir)) {
    try {
      const indexPath = join(conversationsDir, 'index.json')
      if (existsSync(indexPath)) {
        // Use index.json for fast count (already has conversation metadata)
        const indexContent = readFileSync(indexPath, 'utf-8')
        const index = JSON.parse(indexContent)
        conversationCount = Array.isArray(index) ? index.length : Object.keys(index).length
      } else {
        // Fallback: count .json files
        conversationCount = readdirSync(conversationsDir).filter(f =>
          f.endsWith('.json') && f !== 'index.json'
        ).length
      }
    } catch (error) {
      console.error(`[Space] Error counting conversations:`, error)
    }
  }

  // Update cache
  statsCache.set(spacePath, {
    artifactCount,
    conversationCount,
    timestamp: now
  })

  const elapsed = performance.now() - startTime
  const pathType = isTemp ? 'temp' : (isCustomPath ? 'custom' : 'default')
  console.log(`[Space] ⏱️ getSpaceStats completed: ${artifactCount} artifacts, ${conversationCount} conversations in ${elapsed.toFixed(1)}ms (type=${pathType}, path=${spacePath})`)

  return { artifactCount, conversationCount }
}

/**
 * Invalidate stats cache for a space
 */
export function invalidateStatsCache(spacePath: string): void {
  statsCache.delete(spacePath)
}

// Get Project4 temp space
export function getTempSpace(): Space {
  const tempPath = getTempSpacePath()
  const stats = getSpaceStats(tempPath)

  // Load preferences if they exist
  const metaPath = join(tempPath, '.project4', 'meta.json')
  let preferences: SpacePreferences | undefined

  if (existsSync(metaPath)) {
    try {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      preferences = meta.preferences
    } catch {
      // Ignore parse errors
    }
  }

  return {
    ...PROJECT4_TEMP_SPACE,
    path: tempPath,
    stats,
    preferences
  }
}

// Helper to load a space from a path
function loadSpaceFromPath(spacePath: string): Space | null {
  const metaPath = join(spacePath, '.project4', 'meta.json')

  if (existsSync(metaPath)) {
    try {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      const stats = getSpaceStats(spacePath)

      return {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        path: spacePath,
        isTemp: false,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        stats,
        preferences: meta.preferences
      }
    } catch (error) {
      console.error(`Failed to read space meta for ${spacePath}:`, error)
    }
  }
  return null
}

// List all spaces (including custom path spaces)
export function listSpaces(): Space[] {
  const spacesDir = getSpacesDir()
  const spaces: Space[] = []
  const loadedPaths = new Set<string>()

  // Load spaces from default directory
  if (existsSync(spacesDir)) {
    const dirs = readdirSync(spacesDir)

    for (const dir of dirs) {
      const spacePath = join(spacesDir, dir)
      const space = loadSpaceFromPath(spacePath)
      if (space) {
        spaces.push(space)
        loadedPaths.add(spacePath)
      }
    }
  }

  // Load spaces from custom paths (indexed)
  const index = loadSpaceIndex()
  for (const customPath of index.customPaths) {
    if (!loadedPaths.has(customPath) && existsSync(customPath)) {
      const space = loadSpaceFromPath(customPath)
      if (space) {
        spaces.push(space)
        loadedPaths.add(customPath)
      }
    }
  }

  // Sort by updatedAt (most recent first)
  spaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return spaces
}

// Create a new space
export function createSpace(input: { name: string; icon: string; customPath?: string }): Space {
  const id = uuidv4()
  const now = new Date().toISOString()
  const isCustomPath = !!input.customPath

  // Determine space path
  let spacePath: string
  if (input.customPath) {
    spacePath = input.customPath
  } else {
    spacePath = join(getSpacesDir(), input.name)
  }

  // Create directories
  mkdirSync(spacePath, { recursive: true })
  mkdirSync(join(spacePath, '.project4'), { recursive: true })
  mkdirSync(join(spacePath, '.project4', 'conversations'), { recursive: true })

  // Create meta file
  const meta: SpaceMeta = {
    id,
    name: input.name,
    icon: input.icon,
    createdAt: now,
    updatedAt: now
  }

  writeFileSync(join(spacePath, '.project4', 'meta.json'), JSON.stringify(meta, null, 2))

  // Register custom path in index
  if (isCustomPath) {
    addToSpaceIndex(spacePath)
  }

  return {
    id,
    name: input.name,
    icon: input.icon,
    path: spacePath,
    isTemp: false,
    createdAt: now,
    updatedAt: now,
    stats: {
      artifactCount: 0,
      conversationCount: 0
    }
  }
}

// Delete a space
export function deleteSpace(spaceId: string): boolean {
  // Find the space first
  const space = getSpace(spaceId)
  if (!space || space.isTemp) {
    return false
  }

  const spacePath = space.path
  const spacesDir = getSpacesDir()
  const isCustomPath = !spacePath.startsWith(spacesDir)

  try {
    if (isCustomPath) {
      // For custom path spaces, only delete the .project4 folder (preserve user's files)
      const project4Dir = join(spacePath, '.project4')
      if (existsSync(project4Dir)) {
        rmSync(project4Dir, { recursive: true, force: true })
      }
      // Remove from index
      removeFromSpaceIndex(spacePath)
    } else {
      // For default path spaces, delete the entire folder
      rmSync(spacePath, { recursive: true, force: true })
    }
    return true
  } catch (error) {
    console.error(`Failed to delete space ${spaceId}:`, error)
    return false
  }
}

// Get a specific space by ID
export function getSpace(spaceId: string): Space | null {
  if (spaceId === 'project4-temp') {
    return getTempSpace()
  }

  const spaces = listSpaces()
  return spaces.find(s => s.id === spaceId) || null
}

// Open space folder in file explorer
export function openSpaceFolder(spaceId: string): boolean {
  const space = getSpace(spaceId)

  if (space) {
    // For temp space, open artifacts folder
    if (space.isTemp) {
      const artifactsPath = join(space.path, 'artifacts')
      if (existsSync(artifactsPath)) {
        shell.openPath(artifactsPath)
        return true
      }
    } else {
      shell.openPath(space.path)
      return true
    }
  }

  return false
}

// Update space metadata
export function updateSpace(spaceId: string, updates: { name?: string; icon?: string }): Space | null {
  const space = getSpace(spaceId)

  if (!space || space.isTemp) {
    return null
  }

  const metaPath = join(space.path, '.project4', 'meta.json')

  try {
    const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))

    if (updates.name) meta.name = updates.name
    if (updates.icon) meta.icon = updates.icon
    meta.updatedAt = new Date().toISOString()

    writeFileSync(metaPath, JSON.stringify(meta, null, 2))

    return getSpace(spaceId)
  } catch (error) {
    console.error('Failed to update space:', error)
    return null
  }
}

// Update space preferences (layout settings, etc.)
export function updateSpacePreferences(
  spaceId: string,
  preferences: Partial<SpacePreferences>
): Space | null {
  const space = getSpace(spaceId)

  if (!space) {
    return null
  }

  // For temp space, store preferences in a special location
  const metaPath = space.isTemp
    ? join(space.path, '.project4', 'meta.json')
    : join(space.path, '.project4', 'meta.json')

  try {
    // Ensure .project4 directory exists for temp space
    const project4Dir = join(space.path, '.project4')
    if (!existsSync(project4Dir)) {
      mkdirSync(project4Dir, { recursive: true })
    }

    // Load or create meta
    let meta: SpaceMeta
    if (existsSync(metaPath)) {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    } else {
      // Create new meta for temp space
      meta = {
        id: space.id,
        name: space.name,
        icon: space.icon,
        createdAt: space.createdAt,
        updatedAt: new Date().toISOString()
      }
    }

    // Deep merge preferences
    meta.preferences = meta.preferences || {}

    if (preferences.layout) {
      meta.preferences.layout = {
        ...meta.preferences.layout,
        ...preferences.layout
      }
    }

    meta.updatedAt = new Date().toISOString()

    writeFileSync(metaPath, JSON.stringify(meta, null, 2))

    console.log(`[Space] Updated preferences for ${spaceId}:`, preferences)

    return getSpace(spaceId)
  } catch (error) {
    console.error('Failed to update space preferences:', error)
    return null
  }
}

// Get space preferences only (lightweight, without full space load)
export function getSpacePreferences(spaceId: string): SpacePreferences | null {
  const space = getSpace(spaceId)

  if (!space) {
    return null
  }

  const metaPath = join(space.path, '.project4', 'meta.json')

  try {
    if (existsSync(metaPath)) {
      const meta: SpaceMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      return meta.preferences || null
    }
    return null
  } catch (error) {
    console.error('Failed to get space preferences:', error)
    return null
  }
}

// Write onboarding artifact - saves a file to the space's artifacts folder
export function writeOnboardingArtifact(spaceId: string, fileName: string, content: string): boolean {
  const space = getSpace(spaceId)
  if (!space) {
    console.error(`[Space] writeOnboardingArtifact: Space not found: ${spaceId}`)
    return false
  }

  try {
    // Determine artifacts directory based on space type
    const artifactsDir = space.isTemp
      ? join(space.path, 'artifacts')
      : space.path  // For regular spaces, save to root

    // Ensure artifacts directory exists
    mkdirSync(artifactsDir, { recursive: true })

    // Write the file
    const filePath = join(artifactsDir, fileName)
    writeFileSync(filePath, content, 'utf-8')

    console.log(`[Space] writeOnboardingArtifact: Saved ${fileName} to ${filePath}`)
    return true
  } catch (error) {
    console.error(`[Space] writeOnboardingArtifact failed:`, error)
    return false
  }
}

// Save onboarding conversation - creates a conversation with the mock messages
export function saveOnboardingConversation(
  spaceId: string,
  userMessage: string,
  aiResponse: string
): string | null {
  const space = getSpace(spaceId)
  if (!space) {
    console.error(`[Space] saveOnboardingConversation: Space not found: ${spaceId}`)
    return null
  }

  try {
    const { v4: uuidv4 } = require('uuid')
    const conversationId = uuidv4()
    const now = new Date().toISOString()

    // Determine conversations directory
    const conversationsDir = space.isTemp
      ? join(space.path, 'conversations')
      : join(space.path, '.project4', 'conversations')

    // Ensure directory exists
    mkdirSync(conversationsDir, { recursive: true })

    // Create conversation data
    const conversation = {
      id: conversationId,
      title: 'Welcome to Project4',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: uuidv4(),
          role: 'user',
          content: userMessage,
          timestamp: now
        },
        {
          id: uuidv4(),
          role: 'assistant',
          content: aiResponse,
          timestamp: now
        }
      ]
    }

    // Write conversation file
    const filePath = join(conversationsDir, `${conversationId}.json`)
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8')

    console.log(`[Space] saveOnboardingConversation: Saved to ${filePath}`)
    return conversationId
  } catch (error) {
    console.error(`[Space] saveOnboardingConversation failed:`, error)
    return null
  }
}
