/**
 * Agent Stream Constants
 *
 * Shared constants for stream processing and event replay.
 * Imported by both stream-processor.ts (real-time) and
 * apps/runtime/session-store.ts (offline replay) to guarantee
 * identical behaviour across both paths.
 */

/**
 * Tools that do NOT break text continuity between consecutive text blocks.
 *
 * When only transparent tools appear between two text blocks, the blocks are
 * concatenated into a single message bubble. All other tools are "substantive":
 * they signal a context shift, so the text before them is treated as transitional
 * and the next text block starts fresh.
 *
 * Transparent tools are internal bookkeeping / agent-coordination operations
 * that carry no meaningful output visible to the user.
 */
export const TRANSPARENT_TOOLS = new Set([
  'TodoWrite',   // Task list management
  'TeamCreate',  // Team initialisation
  'TeamDelete',  // Team cleanup
  'TaskCreate',  // Task registration
  'TaskUpdate',  // Task status update
  'TaskList',    // Task list query
  'SendMessage', // Intra-team communication
])
