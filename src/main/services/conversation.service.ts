/**
 * Conversation Service - Manages chat conversations
 *
 * Performance optimization: Uses index.json for fast listing
 * - listConversations returns lightweight metadata (ConversationMeta)
 * - getConversation loads full conversation on-demand
 * - Index is auto-rebuilt on first access if missing
 */

import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs'
import { getTempSpacePath } from './config.service'
import { getSpace } from './space.service'
import { v4 as uuidv4 } from 'uuid'

// Thought types for agent reasoning
type ThoughtType = 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error'

interface Thought {
  id: string
  type: ThoughtType
  content: string
  timestamp: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  isError?: boolean
  duration?: number
  isStreaming?: boolean
  isReady?: boolean
  toolResult?: {
    output: string
    isError: boolean
    timestamp: string
  }
}

// Image attachment types for multi-modal messages
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

interface ImageAttachment {
  id: string
  type: 'image'
  mediaType: ImageMediaType
  data: string  // Base64 encoded
  name?: string
  size?: number
}

// Token usage statistics stored with assistant messages (matches renderer TokenUsage shape)
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  contextWindow: number
}

// Thoughts summary for v2 format (when thoughts are stored separately)
interface ThoughtsSummary {
  count: number
  types: Partial<Record<ThoughtType, number>>
  duration?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  thoughts?: Thought[] | null  // null = stored separately, undefined = none, Array = loaded/inline
  thoughtsSummary?: ThoughtsSummary
  images?: ImageAttachment[]  // Attached images for multi-modal messages
  tokenUsage?: TokenUsage  // Optional token usage stats for assistant messages
}

interface ToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'success' | 'error' | 'waiting_approval'
  input: Record<string, unknown>
  output?: string
  error?: string
  progress?: number
}

// Lightweight metadata for conversation list (no messages)
export interface ConversationMeta {
  id: string
  spaceId: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview?: string  // Last message preview (truncated)
}

// Full conversation with messages
interface Conversation extends ConversationMeta {
  messages: Message[]
  sessionId?: string
  version?: number  // 2 = thoughts stored separately
}

// Thoughts file structure (separate from main conversation file)
interface ThoughtsFile {
  version: 1
  conversationId: string
  messages: Record<string, Thought[]>  // messageId -> thoughts[]
}

// Index file structure
interface ConversationIndex {
  version: number
  updatedAt: string
  conversations: ConversationMeta[]
}

const INDEX_VERSION = 1
const PREVIEW_LENGTH = 50
const CONVERSATION_FORMAT_VERSION = 2

// ============================================================================
// Atomic File Operations
// ============================================================================

/**
 * Write file atomically: write to .tmp first, then rename.
 * rename() on the same filesystem is atomic on POSIX and near-atomic on Windows.
 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, data)
  const { renameSync } = require('fs')
  renameSync(tmpPath, filePath)
}

// ============================================================================
// Active Conversation Cache (write-through, LRU eviction)
// ============================================================================

const CACHE_MAX_SIZE = 3  // Keep at most 3 conversations in memory (~1-6MB)

/**
 * LRU cache for active conversations.
 * - Key: conversationId
 * - Value: { conversation, filePath, conversationsDir, spaceId }
 *
 * On read: cache hit → 0 IO. Cache miss → disk read + cache store.
 * On write: update cache + write-through to disk.
 * On delete: evict from cache.
 */
const conversationCache = new Map<string, {
  conversation: Conversation
  filePath: string
  conversationsDir: string
  spaceId: string
}>()

function cachePut(
  conversationId: string,
  conversation: Conversation,
  filePath: string,
  conversationsDir: string,
  spaceId: string
): void {
  // Evict oldest if at capacity
  if (conversationCache.size >= CACHE_MAX_SIZE && !conversationCache.has(conversationId)) {
    const oldestKey = conversationCache.keys().next().value
    if (oldestKey) {
      conversationCache.delete(oldestKey)
    }
  }
  conversationCache.set(conversationId, { conversation, filePath, conversationsDir, spaceId })
}

function cacheEvict(conversationId: string): void {
  conversationCache.delete(conversationId)
}

/**
 * Get conversation from cache or disk. Returns null if not found.
 * On cache miss, reads from disk and populates cache.
 */
function cachedRead(spaceId: string, conversationId: string): { conversation: Conversation; filePath: string; conversationsDir: string } | null {
  // Cache hit
  const cached = conversationCache.get(conversationId)
  if (cached) {
    // LRU touch
    conversationCache.delete(conversationId)
    conversationCache.set(conversationId, cached)
    return cached
  }

  // Cache miss — read from disk
  const conversationsDir = getConversationsDir(spaceId)
  const filePath = join(conversationsDir, `${conversationId}.json`)

  if (!existsSync(filePath)) {
    return null
  }

  let conversation: Conversation
  try {
    conversation = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch (error) {
    console.error(`[Conversation] Failed to read conversation ${conversationId}:`, error)
    return null
  }

  // Lazy migration from v1 to v2 format
  if (conversation.version !== CONVERSATION_FORMAT_VERSION) {
    console.log(`[Conversation] Detected v1 format for ${conversationId}, migrating...`)
    try {
      migrateConversationV1toV2(conversationsDir, conversation)
    } catch (error) {
      console.error(`[Conversation] Migration failed for ${conversationId}, falling back to original:`, error)
      try {
        conversation = JSON.parse(readFileSync(filePath, 'utf-8'))
      } catch (readError) {
        console.error(`[Conversation] Failed to re-read original for ${conversationId}:`, readError)
        return null
      }
    }
  }

  // Populate cache
  cachePut(conversationId, conversation, filePath, conversationsDir, spaceId)
  return { conversation, filePath, conversationsDir }
}

/**
 * Write conversation to cache + disk (write-through).
 */
function cachedWrite(
  conversationId: string,
  conversation: Conversation,
  filePath: string,
  conversationsDir: string,
  spaceId: string
): void {
  cachePut(conversationId, conversation, filePath, conversationsDir, spaceId)
  atomicWriteFileSync(filePath, JSON.stringify(conversation, null, 2))
}

// ============================================================================
// Index Management Functions
// ============================================================================

// ============================================================================
// Index Write Debouncing
// ============================================================================

const INDEX_DEBOUNCE_MS = 500

/**
 * Per-directory pending index writes.
 * Key: conversationsDir, Value: { timer, entries (map of convId → meta|null) }
 */
const pendingIndexWrites = new Map<string, {
  timer: ReturnType<typeof setTimeout>
  spaceId: string
  entries: Map<string, ConversationMeta | null>
}>()

/**
 * Schedule a debounced index update. Multiple calls within INDEX_DEBOUNCE_MS
 * are coalesced into a single disk write.
 */
function debouncedUpdateIndexEntry(
  conversationsDir: string,
  spaceId: string,
  conversationId: string,
  meta: ConversationMeta | null
): void {
  let pending = pendingIndexWrites.get(conversationsDir)
  if (pending) {
    // Merge into existing batch
    pending.entries.set(conversationId, meta)
    // Reset timer
    clearTimeout(pending.timer)
  } else {
    pending = {
      timer: null as unknown as ReturnType<typeof setTimeout>,
      spaceId,
      entries: new Map([[conversationId, meta]])
    }
    pendingIndexWrites.set(conversationsDir, pending)
  }

  pending.timer = setTimeout(() => {
    flushIndexWrites(conversationsDir)
  }, INDEX_DEBOUNCE_MS)
}

/**
 * Flush pending index writes for a directory immediately.
 */
function flushIndexWrites(conversationsDir: string): void {
  const pending = pendingIndexWrites.get(conversationsDir)
  if (!pending) return

  clearTimeout(pending.timer)
  pendingIndexWrites.delete(conversationsDir)

  // Read current index once
  const index = readIndex(conversationsDir)
  if (!index) {
    rebuildIndexAsync(conversationsDir, pending.spaceId)
    return
  }

  // Apply all pending entries
  for (const [conversationId, meta] of pending.entries) {
    const existingIndex = index.conversations.findIndex(c => c.id === conversationId)

    if (meta === null) {
      if (existingIndex !== -1) {
        index.conversations.splice(existingIndex, 1)
      }
    } else if (existingIndex !== -1) {
      index.conversations[existingIndex] = meta
    } else {
      index.conversations.unshift(meta)
    }
  }

  index.conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  writeIndex(conversationsDir, index.conversations)
}

/**
 * Flush all pending index writes across all directories. Call on app quit.
 */
export function flushAllPendingIndexWrites(): void {
  for (const conversationsDir of pendingIndexWrites.keys()) {
    flushIndexWrites(conversationsDir)
  }
}

// ============================================================================
// Index Management Functions (continued)
// ============================================================================

// ============================================================================
// Thoughts Summary Computation
// ============================================================================

function computeThoughtsSummary(thoughts: Thought[]): ThoughtsSummary {
  const types: Partial<Record<ThoughtType, number>> = {}
  for (const t of thoughts) {
    types[t.type] = (types[t.type] || 0) + 1
  }
  let duration: number | undefined
  if (thoughts.length >= 2) {
    const first = new Date(thoughts[0].timestamp).getTime()
    const last = new Date(thoughts[thoughts.length - 1].timestamp).getTime()
    duration = (last - first) / 1000
  }
  return { count: thoughts.length, types, duration }
}

// ============================================================================
// Migration: v1 (inline thoughts) -> v2 (separated thoughts)
// ============================================================================

/**
 * Migrate a single conversation from v1 to v2 format.
 * - Extracts thoughts from messages into a separate .thoughts.json file
 * - Replaces inline thoughts with null and adds thoughtsSummary
 * - Sets version to 2
 *
 * Safety:
 * - Idempotent: safe to run multiple times
 * - Writes thoughts file FIRST, then updates main file
 * - If crash between the two writes, next read detects v1 and re-migrates
 */
function migrateConversationV1toV2(conversationsDir: string, conversation: Conversation): void {
  const mainPath = join(conversationsDir, `${conversation.id}.json`)
  const thoughtsPath = join(conversationsDir, `${conversation.id}.thoughts.json`)

  // Step 1: Extract thoughts from all messages
  const thoughtsData: Record<string, Thought[]> = {}
  let hasAnyThoughts = false

  for (const message of conversation.messages) {
    if (Array.isArray(message.thoughts) && message.thoughts.length > 0) {
      thoughtsData[message.id] = message.thoughts
      message.thoughtsSummary = computeThoughtsSummary(message.thoughts)
      message.thoughts = null
      hasAnyThoughts = true
    }
  }

  // Step 2: Write thoughts file first (if there are thoughts)
  if (hasAnyThoughts) {
    const thoughtsFile: ThoughtsFile = {
      version: 1,
      conversationId: conversation.id,
      messages: thoughtsData
    }
    atomicWriteFileSync(thoughtsPath, JSON.stringify(thoughtsFile))
    console.log(`[Conversation] Migration: wrote thoughts file for ${conversation.id} (${Object.keys(thoughtsData).length} messages)`)
  }

  // Step 3: Update main file with version marker
  conversation.version = CONVERSATION_FORMAT_VERSION
  atomicWriteFileSync(mainPath, JSON.stringify(conversation, null, 2))
  console.log(`[Conversation] Migration: updated main file for ${conversation.id} to v2`)
}

/**
 * Get thoughts for a specific message (lazy loading from .thoughts.json).
 * Returns the thoughts array, or empty array if not found.
 */
export function getMessageThoughts(
  spaceId: string,
  conversationId: string,
  messageId: string
): Thought[] {
  const conversationsDir = getConversationsDir(spaceId)
  const thoughtsPath = join(conversationsDir, `${conversationId}.thoughts.json`)

  if (!existsSync(thoughtsPath)) {
    console.log(`[Conversation] No thoughts file for ${conversationId}, returning empty`)
    return []
  }

  try {
    const thoughtsFile: ThoughtsFile = JSON.parse(readFileSync(thoughtsPath, 'utf-8'))
    const thoughts = thoughtsFile.messages[messageId] || []
    console.log(`[Conversation] Loaded ${thoughts.length} thoughts for ${conversationId}/${messageId}`)
    return thoughts
  } catch (error) {
    console.error(`[Conversation] Failed to read thoughts for ${conversationId}/${messageId}:`, error)
    return []
  }
}

// ============================================================================
// Index Management Functions (continued)
// ============================================================================

// Get index file path for a space
function getIndexPath(conversationsDir: string): string {
  return join(conversationsDir, 'index.json')
}

// Read index file, returns null if not exists or invalid
function readIndex(conversationsDir: string): ConversationIndex | null {
  const indexPath = getIndexPath(conversationsDir)

  if (!existsSync(indexPath)) {
    return null
  }

  try {
    const content = readFileSync(indexPath, 'utf-8')
    const index: ConversationIndex = JSON.parse(content)

    // Version check - rebuild if version mismatch
    if (index.version !== INDEX_VERSION) {
      console.log(`[Conversation] Index version mismatch (${index.version} vs ${INDEX_VERSION}), will rebuild`)
      return null
    }

    return index
  } catch (error) {
    console.error('[Conversation] Failed to read index:', error)
    return null
  }
}

// Write index file
function writeIndex(conversationsDir: string, conversations: ConversationMeta[]): void {
  const indexPath = getIndexPath(conversationsDir)

  const index: ConversationIndex = {
    version: INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    conversations
  }

  try {
    atomicWriteFileSync(indexPath, JSON.stringify(index, null, 2))
    // console.log(`[Conversation] Index written with ${conversations.length} conversations`)
  } catch (error) {
    console.error('[Conversation] Failed to write index:', error)
  }
}

// Extract metadata from a full conversation
function toMeta(conversation: Conversation): ConversationMeta {
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  let preview: string | undefined

  if (lastMessage) {
    preview = lastMessage.content.slice(0, PREVIEW_LENGTH)
    if (lastMessage.content.length > PREVIEW_LENGTH) {
      preview += '...'
    }
  }

  return {
    id: conversation.id,
    spaceId: conversation.spaceId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    preview
  }
}

// Full scan: read all conversation files and build metadata list
function fullScanConversations(conversationsDir: string, spaceId: string): ConversationMeta[] {
  console.log(`[Conversation] Full scan started for ${conversationsDir}`)
  const metas: ConversationMeta[] = []

  if (!existsSync(conversationsDir)) {
    return metas
  }

  const files = readdirSync(conversationsDir).filter(f => f.endsWith('.json') && f !== 'index.json')

  for (const file of files) {
    try {
      const content = readFileSync(join(conversationsDir, file), 'utf-8')
      const conversation: Conversation = JSON.parse(content)
      metas.push(toMeta(conversation))
    } catch (error) {
      console.error(`[Conversation] Failed to read conversation ${file}:`, error)
    }
  }

  // Sort by updatedAt (most recent first)
  metas.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  console.log(`[Conversation] Full scan completed: ${metas.length} conversations`)
  return metas
}

// Rebuild index from scratch (async, non-blocking)
function rebuildIndexAsync(conversationsDir: string, spaceId: string): void {
  setImmediate(() => {
    try {
      const metas = fullScanConversations(conversationsDir, spaceId)
      writeIndex(conversationsDir, metas)
      console.log(`[Conversation] Index rebuilt asynchronously`)
    } catch (error) {
      console.error('[Conversation] Failed to rebuild index:', error)
    }
  })
}

// Update a single entry in the index
function updateIndexEntry(
  conversationsDir: string,
  spaceId: string,
  conversationId: string,
  meta: ConversationMeta | null  // null means delete
): void {
  const index = readIndex(conversationsDir)

  if (!index) {
    // No index, trigger full rebuild
    rebuildIndexAsync(conversationsDir, spaceId)
    return
  }

  const existingIndex = index.conversations.findIndex(c => c.id === conversationId)

  if (meta === null) {
    // Delete entry
    if (existingIndex !== -1) {
      index.conversations.splice(existingIndex, 1)
    }
  } else if (existingIndex !== -1) {
    // Update existing entry
    index.conversations[existingIndex] = meta
  } else {
    // Add new entry
    index.conversations.unshift(meta)
  }

  // Re-sort by updatedAt
  index.conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  writeIndex(conversationsDir, index.conversations)
}

// ============================================================================
// Core Functions
// ============================================================================

// Get conversations directory for a space
function getConversationsDir(spaceId: string): string {
  // console.log(`[Conversation] getConversationsDir called with spaceId: ${spaceId}`)

  // Use getSpace to find the space (supports both default and custom paths)
  const space = getSpace(spaceId)

  if (!space) {
    const error = `Space not found: ${spaceId}`
    console.error(`[Conversation] ERROR: ${error}`)
    throw new Error(error)
  }

  const convDir = space.isTemp
    ? join(space.path, 'conversations')
    : join(space.path, '.project4', 'conversations')
  console.log(`[Conversation] Found space "${space.name}", conversations dir: ${convDir}`)
  return convDir
}

// List all conversations for a space (returns lightweight metadata)
export function listConversations(spaceId: string): ConversationMeta[] {
  const conversationsDir = getConversationsDir(spaceId)

  // Strategy 1: Try to read from index
  const index = readIndex(conversationsDir)
  if (index) {
    // console.log(`[Conversation] Using index: ${index.conversations.length} conversations`)
    return index.conversations
  }

  // Strategy 2: Fallback to full scan + async index rebuild
  console.log(`[Conversation] No index found, performing full scan`)
  const metas = fullScanConversations(conversationsDir, spaceId)

  // Trigger async index rebuild for next time
  if (metas.length > 0) {
    writeIndex(conversationsDir, metas)
  }

  return metas
}

// Create a new conversation
export function createConversation(spaceId: string, title?: string): Conversation {
  const id = uuidv4()
  const now = new Date().toISOString()

  const conversation: Conversation = {
    id,
    spaceId,
    title: title || generateTitle(),
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
    version: CONVERSATION_FORMAT_VERSION
  }

  const conversationsDir = getConversationsDir(spaceId)

  if (!existsSync(conversationsDir)) {
    mkdirSync(conversationsDir, { recursive: true })
  }

  const filePath = join(conversationsDir, `${id}.json`)
  cachedWrite(id, conversation, filePath, conversationsDir, spaceId)

  updateIndexEntry(conversationsDir, spaceId, id, toMeta(conversation))

  return conversation
}

// Get a specific conversation
export function getConversation(spaceId: string, conversationId: string): Conversation | null {
  const result = cachedRead(spaceId, conversationId)
  return result ? result.conversation : null
}

// Update a conversation
export function updateConversation(
  spaceId: string,
  conversationId: string,
  updates: Partial<Conversation>
): Conversation | null {
  const result = cachedRead(spaceId, conversationId)
  if (!result) return null

  const { conversation, filePath, conversationsDir } = result

  const updated: Conversation = {
    ...conversation,
    ...updates,
    updatedAt: new Date().toISOString()
  }

  cachedWrite(conversationId, updated, filePath, conversationsDir, spaceId)
  debouncedUpdateIndexEntry(conversationsDir, spaceId, conversationId, toMeta(updated))

  return updated
}

// Add a message to a conversation
export function addMessage(spaceId: string, conversationId: string, message: Omit<Message, 'id' | 'timestamp'>): Message {
  const result = cachedRead(spaceId, conversationId)
  if (!result) {
    throw new Error('Conversation not found')
  }

  const { conversation, filePath, conversationsDir } = result

  const newMessage: Message = {
    ...message,
    id: uuidv4(),
    timestamp: new Date().toISOString()
  }

  conversation.messages.push(newMessage)
  conversation.updatedAt = new Date().toISOString()
  conversation.messageCount = conversation.messages.length

  // Auto-update title from first user message
  if (conversation.messages.length === 1 && message.role === 'user') {
    conversation.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
  }

  // Ensure version is set for new writes
  if (!conversation.version) {
    conversation.version = CONVERSATION_FORMAT_VERSION
  }

  cachedWrite(conversationId, conversation, filePath, conversationsDir, spaceId)
  debouncedUpdateIndexEntry(conversationsDir, spaceId, conversationId, toMeta(conversation))

  return newMessage
}

// Update the last message (for streaming and saving thoughts)
export function updateLastMessage(
  spaceId: string,
  conversationId: string,
  updates: Partial<Message>
): Message | null {
  const result = cachedRead(spaceId, conversationId)
  if (!result) return null

  const { conversation, filePath, conversationsDir } = result

  if (conversation.messages.length === 0) {
    return null
  }

  const lastMessage = conversation.messages[conversation.messages.length - 1]

  // Only update assistant messages
  if (lastMessage.role !== 'assistant') {
    return lastMessage
  }

  // Extract thoughts from updates for separate storage
  const thoughtsToStore = Array.isArray(updates.thoughts) && updates.thoughts.length > 0
    ? updates.thoughts
    : null

  // Apply updates to the message (except thoughts, handled separately)
  const { thoughts: _thoughts, ...otherUpdates } = updates
  Object.assign(lastMessage, otherUpdates)

  // Handle thoughts separation
  if (thoughtsToStore) {
    // Compute summary for the main file
    lastMessage.thoughtsSummary = computeThoughtsSummary(thoughtsToStore)
    lastMessage.thoughts = null  // Marker: thoughts exist but stored separately

    // Write thoughts file first (crash safety: if this succeeds but main fails,
    // next migration will re-extract from the still-inline thoughts)
    const thoughtsPath = join(conversationsDir, `${conversationId}.thoughts.json`)

    // Read existing thoughts file to merge (may have thoughts from previous messages)
    let thoughtsFile: ThoughtsFile
    try {
      if (existsSync(thoughtsPath)) {
        thoughtsFile = JSON.parse(readFileSync(thoughtsPath, 'utf-8'))
      } else {
        thoughtsFile = { version: 1, conversationId, messages: {} }
      }
    } catch {
      thoughtsFile = { version: 1, conversationId, messages: {} }
    }

    thoughtsFile.messages[lastMessage.id] = thoughtsToStore
    atomicWriteFileSync(thoughtsPath, JSON.stringify(thoughtsFile))
  }

  // Ensure version is set
  if (!conversation.version) {
    conversation.version = CONVERSATION_FORMAT_VERSION
  }

  conversation.updatedAt = new Date().toISOString()

  cachedWrite(conversationId, conversation, filePath, conversationsDir, spaceId)
  debouncedUpdateIndexEntry(conversationsDir, spaceId, conversationId, toMeta(conversation))

  return lastMessage
}

// Delete a conversation
export function deleteConversation(spaceId: string, conversationId: string): boolean {
  const conversationsDir = getConversationsDir(spaceId)
  const filePath = join(conversationsDir, `${conversationId}.json`)
  const thoughtsPath = join(conversationsDir, `${conversationId}.thoughts.json`)

  if (existsSync(filePath)) {
    rmSync(filePath)

    // Also delete thoughts file if it exists
    if (existsSync(thoughtsPath)) {
      rmSync(thoughtsPath)
    }

    // Evict from cache
    cacheEvict(conversationId)

    // Update index (remove entry)
    updateIndexEntry(conversationsDir, spaceId, conversationId, null)

    return true
  }

  return false
}

// Save session ID for a conversation
export function saveSessionId(spaceId: string, conversationId: string, sessionId: string): void {
  const result = cachedRead(spaceId, conversationId)
  if (!result) return

  const { conversation, filePath, conversationsDir } = result
  conversation.sessionId = sessionId
  cachedWrite(conversationId, conversation, filePath, conversationsDir, spaceId)
}

// Generate a default title
function generateTitle(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = now.getHours()
  const minute = now.getMinutes()

  return `Chat ${month}-${day} ${hour}:${minute.toString().padStart(2, '0')}`
}
