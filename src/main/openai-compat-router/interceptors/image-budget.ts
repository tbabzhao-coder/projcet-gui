/**
 * Image Budget Interceptor (Layer 3)
 *
 * Prevents Anthropic API 6MB request-body limit from being exceeded when
 * conversations accumulate multiple screenshots (e.g. AI Browser sessions).
 *
 * Strategy:
 *   - Scan all messages for base64 image content blocks
 *   - If total image payload exceeds the budget, replace the oldest images
 *     with a lightweight text placeholder until the total fits
 *   - Only modifies the outgoing request; stored conversation data is untouched
 *
 * This interceptor is the last line of defense after:
 *   Layer 1: source compression in ai-browser/context.ts
 *   Layer 2: per-image hard cap in ai-browser/tools/helpers.ts
 */

import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicImageBlock,
  AnthropicToolResultBlock
} from '../types'
import type { RequestInterceptor, InterceptorContext, InterceptorResult } from './types'

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum total base64 image payload allowed in a single request.
 *
 * Budget allocation within 6MB API limit:
 *   ~2MB  — text, JSON structure, tool definitions, system prompt
 *   ~3.5MB — image base64 data
 *   ~0.5MB — safety margin
 */
const IMAGE_BUDGET_BASE64 = 3.5 * 1024 * 1024  // 3.5MB in characters

/** Placeholder text that replaces evicted images. */
const IMAGE_PLACEHOLDER = '[Screenshot removed — exceeded image budget for API request]'

// ============================================================================
// Types
// ============================================================================

/**
 * Tracks the location and size of a single base64 image within the message array.
 * Used to sort images by age (position) for oldest-first eviction.
 */
interface ImageLocation {
  /** Index in the messages array */
  messageIndex: number
  /** Index in the content array of the message (or tool_result content) */
  contentIndex: number
  /** For images nested inside tool_result blocks */
  toolResultContentIndex?: number
  /** Length of the base64 data string */
  base64Length: number
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Collect all base64 image locations and their sizes from the messages array.
 *
 * Images can appear in two places in Anthropic format:
 *   1. Top-level content blocks: { type: 'image', source: { type: 'base64', data: '...' } }
 *   2. Inside tool_result content: tool_result.content[n] where n is an image block
 */
function collectImageLocations(messages: AnthropicMessage[]): ImageLocation[] {
  const locations: ImageLocation[] = []

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi]
    const content = msg.content
    if (typeof content === 'string') continue

    for (let ci = 0; ci < content.length; ci++) {
      const block = content[ci]

      // Direct image block
      if (block.type === 'image' && block.source?.type === 'base64') {
        locations.push({
          messageIndex: mi,
          contentIndex: ci,
          base64Length: block.source.data.length
        })
        continue
      }

      // Images nested inside tool_result content
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        for (let ti = 0; ti < block.content.length; ti++) {
          const inner = block.content[ti]
          if (inner.type === 'image' && (inner as AnthropicImageBlock).source?.type === 'base64') {
            locations.push({
              messageIndex: mi,
              contentIndex: ci,
              toolResultContentIndex: ti,
              base64Length: (inner as AnthropicImageBlock).source.data.length
            })
          }
        }
      }
    }
  }

  return locations
}

/**
 * Calculate total base64 payload from collected image locations.
 */
function totalBase64Size(locations: ImageLocation[]): number {
  return locations.reduce((sum, loc) => sum + loc.base64Length, 0)
}

/**
 * Deep-clone messages and replace specified image blocks with text placeholders.
 *
 * We clone to avoid mutating the original request data (which may be
 * referenced by conversation persistence).
 */
function evictImages(
  messages: AnthropicMessage[],
  toEvict: ImageLocation[]
): AnthropicMessage[] {
  if (toEvict.length === 0) return messages

  // Build a fast lookup set: "mi:ci" or "mi:ci:ti"
  const evictSet = new Set<string>()
  for (const loc of toEvict) {
    const key = loc.toolResultContentIndex !== undefined
      ? `${loc.messageIndex}:${loc.contentIndex}:${loc.toolResultContentIndex}`
      : `${loc.messageIndex}:${loc.contentIndex}`
    evictSet.add(key)
  }

  const placeholder: AnthropicContentBlock = { type: 'text', text: IMAGE_PLACEHOLDER }

  return messages.map((msg, mi) => {
    if (typeof msg.content === 'string') return msg

    let contentModified = false
    const newContent = msg.content.map((block, ci) => {
      // Direct image block
      if (evictSet.has(`${mi}:${ci}`)) {
        contentModified = true
        return placeholder
      }

      // Tool result with nested images
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        let trModified = false
        const newTrContent = (block as AnthropicToolResultBlock).content as AnthropicContentBlock[]
        const mapped = newTrContent.map((inner, ti) => {
          if (evictSet.has(`${mi}:${ci}:${ti}`)) {
            trModified = true
            return placeholder
          }
          return inner
        })
        if (trModified) {
          contentModified = true
          return { ...block, content: mapped }
        }
      }

      return block
    })

    return contentModified ? { ...msg, content: newContent } : msg
  })
}

// ============================================================================
// Interceptor Export
// ============================================================================

/**
 * Image budget interceptor — evicts oldest images when total base64 payload
 * exceeds IMAGE_BUDGET_BASE64.
 *
 * Performance overhead on non-matching requests:
 *   - Messages with no images: ~0.05ms (single scan, no allocations)
 *   - Messages under budget: ~0.1ms (scan + sum)
 *   - Over budget: proportional to eviction count (deep clone of affected messages)
 */
export const imageBudgetInterceptor: RequestInterceptor = {
  name: 'image-budget',

  shouldIntercept(request: AnthropicRequest): boolean {
    // Fast reject: no messages means nothing to check
    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      return false
    }

    // Quick scan: check if any message could contain images
    // (avoid full traversal for text-only conversations)
    return request.messages.some(msg => {
      if (typeof msg.content === 'string') return false
      return msg.content.some(block =>
        block.type === 'image' ||
        (block.type === 'tool_result' && Array.isArray(block.content))
      )
    })
  },

  intercept(request: AnthropicRequest, _context: InterceptorContext): InterceptorResult {
    const locations = collectImageLocations(request.messages)

    if (locations.length === 0) {
      return { handled: false }
    }

    const total = totalBase64Size(locations)

    if (total <= IMAGE_BUDGET_BASE64) {
      return { handled: false }
    }

    // Over budget — evict oldest images first (lowest messageIndex/contentIndex)
    // locations are already in document order from the scan
    let currentTotal = total
    const toEvict: ImageLocation[] = []

    for (const loc of locations) {
      if (currentTotal <= IMAGE_BUDGET_BASE64) break
      toEvict.push(loc)
      currentTotal -= loc.base64Length
    }

    const evictedCount = toEvict.length
    const evictedBytes = total - currentTotal
    console.log(
      `[Interceptor:image-budget] Evicting ${evictedCount} image(s) ` +
      `(${(evictedBytes / 1024 / 1024).toFixed(2)}MB) to stay within ` +
      `${(IMAGE_BUDGET_BASE64 / 1024 / 1024).toFixed(1)}MB budget. ` +
      `Remaining: ${locations.length - evictedCount} image(s), ` +
      `${(currentTotal / 1024 / 1024).toFixed(2)}MB`
    )

    const newMessages = evictImages(request.messages, toEvict)

    return {
      handled: true,
      modified: { ...request, messages: newMessages }
    }
  }
}
