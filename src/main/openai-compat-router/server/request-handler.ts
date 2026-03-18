/**
 * Request Handler
 *
 * Core logic for handling Anthropic -> OpenAI -> Anthropic conversion.
 * URL is the single source of truth - no inference, no override.
 */

import type { Response as ExpressResponse } from 'express'
import type { AnthropicRequest, BackendConfig } from '../types'
import {
  convertAnthropicToOpenAIChat,
  convertAnthropicToOpenAIResponses,
  convertOpenAIChatToAnthropic,
  convertOpenAIResponsesToAnthropic
} from '../converters'
import {
  streamOpenAIChatToAnthropic,
  streamOpenAIResponsesToAnthropic
} from '../stream'
import { getApiTypeFromUrl, isValidEndpointUrl, getEndpointUrlError, shouldForceStream } from './api-type'
import { withRequestQueue, generateQueueKey } from './request-queue'
import { BrowserWindow } from 'electron'

// Push a debug log event to the renderer process DevTools console
function pushToRenderer(type: string, data: Record<string, unknown>): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('debug:api-log', { type, ...data, ts: Date.now() })
  }
}

export interface RequestHandlerOptions {
  debug?: boolean
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

// Anthropic error type -> HTTP status code
const ERROR_STATUS_MAP: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  overloaded_error: 529,
  timeout_error: 504
}

// HTTP status code -> Anthropic error type
const STATUS_ERROR_MAP: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  413: 'request_too_large',
  429: 'rate_limit_error',
  500: 'api_error',
  529: 'overloaded_error'
}

/**
 * Map HTTP status code to Anthropic error type
 */
function getErrorTypeFromStatus(status: number): string {
  return STATUS_ERROR_MAP[status] || 'api_error'
}

/**
 * Extract error type and message from upstream response body.
 * Tries to parse OpenAI/Anthropic JSON error format first, falls back to status-based mapping.
 */
function getUpstreamError(status: number, errorText: string): { type: string; message: string } {
  try {
    const json = JSON.parse(errorText)
    // OpenAI format: { error: { type, message, code } }
    if (json?.error?.type) {
      return { type: json.error.type, message: json.error.message || '' }
    }
    // Some providers only have error.message without type
    if (json?.error?.message) {
      return { type: getErrorTypeFromStatus(status), message: json.error.message }
    }
  } catch {
    // Not JSON, ignore
  }
  return {
    type: getErrorTypeFromStatus(status),
    message: errorText || `HTTP ${status}`
  }
}

/**
 * Send error response in Anthropic format.
 * HTTP status is derived from errorType automatically.
 */
function sendError(
  res: ExpressResponse,
  errorType: string,
  message: string
): void {
  const status = ERROR_STATUS_MAP[errorType] || 500
  console.log(`[RequestHandler] Sending error: HTTP ${status} ${errorType} - ${message.slice(0, 100)}`)
  res.status(status).json({
    type: 'error',
    error: { type: errorType, message }
  })
}

/**
 * Make upstream request
 */
async function fetchUpstream(
  targetUrl: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<globalThis.Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    console.log('[RequestHandler] Request timeout, aborting...')
    controller.abort()
  }, timeoutMs)

  const maskedKey = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
  const bodyStr = JSON.stringify(body)

  console.log(`[RequestHandler] → POST ${targetUrl} (key: ${maskedKey})`)

  // Push full request to renderer DevTools
  pushToRenderer('request', {
    method: 'POST',
    url: targetUrl,
    key: maskedKey,
    body: body,
    bodySize: bodyStr.length
  })

  const t0 = Date.now()
  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: bodyStr,
      signal: signal ?? controller.signal
    })

    const elapsed = Date.now() - t0
    console.log(`[RequestHandler] ← ${response.status} ${response.statusText} (${elapsed}ms)`)

    // Push response status to renderer DevTools
    pushToRenderer('response', {
      status: response.status,
      statusText: response.statusText,
      elapsed,
      url: targetUrl
    })

    return response
  } catch (err: any) {
    const elapsed = Date.now() - t0
    console.error(`[RequestHandler] ✗ fetch failed (${elapsed}ms):`, err?.message)
    pushToRenderer('error', { url: targetUrl, error: err?.message, elapsed })
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Handle messages request
 */
export async function handleMessagesRequest(
  anthropicRequest: AnthropicRequest,
  config: BackendConfig,
  res: ExpressResponse,
  options: RequestHandlerOptions = {}
): Promise<void> {
  const { debug = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const { url: backendUrl, key: apiKey, model } = config

  // Validate URL
  if (!isValidEndpointUrl(backendUrl)) {
    return sendError(res, 'invalid_request_error', getEndpointUrlError(backendUrl))
  }

  const apiType = getApiTypeFromUrl(backendUrl)!

  const originalModel = anthropicRequest.model
  if (model) {
    anthropicRequest.model = model
  }
  const finalModel = anthropicRequest.model

  console.log(`[RequestHandler] ${apiType.toUpperCase()} | model=${finalModel} | url=${backendUrl}`)

  const queueKey = generateQueueKey(backendUrl, apiKey)

  await withRequestQueue(queueKey, async () => {
    try {
      const forceEnvStream = shouldForceStream()
      const preferStreamByWire = apiType === 'responses' && anthropicRequest.stream === undefined
      let wantStream = !!(forceEnvStream || preferStreamByWire || anthropicRequest.stream)

      const requestToSend = { ...anthropicRequest, stream: wantStream }
      const openaiRequest = apiType === 'responses'
        ? convertAnthropicToOpenAIResponses(requestToSend).request
        : convertAnthropicToOpenAIChat(requestToSend).request

      const toolCount = (openaiRequest as any).tools?.length ?? 0
      const msgCount = (openaiRequest as any).messages?.length ?? 0
      console.log(`[RequestHandler] → model=${finalModel} tools=${toolCount} msgs=${msgCount} stream=${wantStream ?? false}`)

      // Push full converted request body to renderer DevTools
      pushToRenderer('outgoing-request', {
        url: backendUrl,
        apiType,
        model: finalModel,
        originalModel,
        stream: wantStream ?? false,
        toolCount,
        msgCount,
        body: debug ? openaiRequest : {
          model: (openaiRequest as any).model,
          messages: (openaiRequest as any).messages,
          tools: toolCount > 0 ? `[${toolCount} tools]` : undefined,
          stream: (openaiRequest as any).stream
        }
      })

      let upstreamResp = await fetchUpstream(backendUrl, apiKey, openaiRequest, timeoutMs)

      // Handle errors - extract upstream error type for correct Anthropic error mapping
      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text().catch(() => '')
        const upstream = getUpstreamError(upstreamResp.status, errorText)

        const requiresStream = errorText?.toLowerCase().includes('stream must be set to true')
        if (requiresStream && !wantStream) {
          console.warn('[RequestHandler] Upstream requires stream=true, retrying...')
          wantStream = true
          const retryRequest = apiType === 'responses'
            ? convertAnthropicToOpenAIResponses({ ...anthropicRequest, stream: true }).request
            : convertAnthropicToOpenAIChat({ ...anthropicRequest, stream: true }).request

          upstreamResp = await fetchUpstream(backendUrl, apiKey, retryRequest, timeoutMs)

          if (!upstreamResp.ok) {
            const retryErrorText = await upstreamResp.text().catch(() => '')
            const retryUpstream = getUpstreamError(upstreamResp.status, retryErrorText)
            console.error(`[RequestHandler] Provider error ${upstreamResp.status}: ${retryErrorText.slice(0, 200)}`)
            pushToRenderer('api-error', { status: upstreamResp.status, error: retryErrorText.slice(0, 500) })
            return sendError(res, retryUpstream.type, retryUpstream.message)
          }
        } else {
          console.error(`[RequestHandler] Provider error ${upstreamResp.status} [${upstream.type}]: ${errorText.slice(0, 200)}`)
          pushToRenderer('api-error', { status: upstreamResp.status, error: errorText.slice(0, 500) })
          return sendError(res, upstream.type, upstream.message)
        }
      }

      // Handle streaming response
      if (wantStream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const onStreamComplete = (text: string, usage: { inputTokens: number; outputTokens: number }): void => {
          pushToRenderer('response-body', {
            url: backendUrl,
            model: finalModel,
            text: text.length > 500 ? text.slice(0, 500) + `… (+${text.length - 500} chars)` : text,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          })
        }

        if (apiType === 'responses') {
          await streamOpenAIResponsesToAnthropic(upstreamResp.body, res, anthropicRequest.model, debug, onStreamComplete)
        } else {
          await streamOpenAIChatToAnthropic(upstreamResp.body, res, anthropicRequest.model, debug, onStreamComplete)
        }
        return
      }

      // Handle non-streaming response
      const openaiResponse = await upstreamResp.json()
      const anthropicResponse = apiType === 'responses'
        ? convertOpenAIResponsesToAnthropic(openaiResponse)
        : convertOpenAIChatToAnthropic(openaiResponse, anthropicRequest.model)

      res.json(anthropicResponse)
    } catch (error: any) {
      // Handle abort/timeout
      if (error?.name === 'AbortError') {
        console.error('[RequestHandler] AbortError (timeout or client disconnect)')
        return sendError(res, 'timeout_error', 'Request timed out')
      }

      console.error('[RequestHandler] Internal error:', error?.message || error)
      return sendError(res, 'api_error', error?.message || 'Internal error')
    }
  })
}

/**
 * Handle token counting request (simple estimation)
 */
export function handleCountTokensRequest(
  messages: unknown,
  system: unknown
): { input_tokens: number } {
  let count = 0

  // Rough estimation: 4 characters ≈ 1 token
  if (system) {
    count += Math.ceil(JSON.stringify(system).length / 4)
  }
  if (messages) {
    count += Math.ceil(JSON.stringify(messages).length / 4)
  }

  return { input_tokens: count }
}
