/**
 * Proxy-Aware Fetch
 *
 * Drop-in replacement for the global `fetch()` that respects system proxy
 * settings and supports all proxy protocols: HTTP, HTTPS, SOCKS4, SOCKS5.
 *
 * Architecture:
 *   proxyFetch(url, init)
 *       ↓
 *   resolveSystemProxy(url)    ← Electron session.resolveProxy() (Chromium PAC/WPAD)
 *       ↓
 *   ProxyAgent (proxy-agent)   ← auto-selects http-proxy-agent / socks-proxy-agent
 *       ↓
 *   node:https / node:http     ← streaming native Response
 *
 * Supported proxy protocols:
 *   HTTP   (PROXY / http://)   → http-proxy-agent
 *   HTTPS  (HTTPS / https://)  → https-proxy-agent
 *   SOCKS4 (SOCKS4)            → socks-proxy-agent
 *   SOCKS5 (SOCKS5 / socks://) → socks-proxy-agent
 *   DIRECT                     → plain global fetch, zero overhead
 *
 * Usage:
 *   import { proxyFetch } from '../services/proxy-fetch'
 *   const res = await proxyFetch('https://api.github.com/...', { method: 'POST', ... })
 */

import { session } from 'electron'
import https from 'node:https'
import http from 'node:http'
import zlib from 'node:zlib'
import { ProxyAgent } from 'proxy-agent'
import { getConfig } from './config.service'

// ============================================================================
// Preserve originals before any global patching
// ============================================================================

/**
 * Original global fetch — captured before initGlobalProxy() patches globalThis.fetch.
 * Used internally in the DIRECT path to avoid infinite recursion.
 */
const _originalFetch: typeof fetch = globalThis.fetch

/** Default Node.js agents — restored when proxy is cleared */
const _defaultHttpAgent = http.globalAgent
const _defaultHttpsAgent = https.globalAgent

// ============================================================================
// Proxy Resolution Cache
// ============================================================================

const PROXY_CACHE_TTL_MS = 30_000

interface ProxyCacheEntry {
  proxyUrl: string | null
  expiresAt: number
}

const proxyCache = new Map<string, ProxyCacheEntry>()

/** Hosts that always bypass proxy */
const BYPASS_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Convert Chromium PAC result string to a proxy URL.
 *
 * session.resolveProxy() returns strings like:
 *   "DIRECT"
 *   "PROXY 127.0.0.1:7890"
 *   "HTTPS 127.0.0.1:7890"
 *   "SOCKS5 127.0.0.1:1080"
 *   "SOCKS5 127.0.0.1:1080;SOCKS 127.0.0.1:1080;DIRECT"  ← PAC, first wins
 */
function parseProxyString(proxyString: string): string | null {
  const entries = proxyString.split(';').map(s => s.trim()).filter(Boolean)

  for (const entry of entries) {
    if (entry === 'DIRECT') continue

    const match = entry.match(/^(\w+)\s+(.+)$/)
    if (!match) continue

    const [, type, hostPort] = match

    switch (type.toUpperCase()) {
      case 'PROXY':
        return `http://${hostPort}`
      case 'HTTPS':
        return `https://${hostPort}`
      case 'SOCKS':
      case 'SOCKS4':
        return `socks4://${hostPort}`
      case 'SOCKS5':
        return `socks5://${hostPort}`
      default:
        return `http://${hostPort}`
    }
  }

  return null // DIRECT or empty
}

/**
 * Resolve system proxy for a URL via Chromium's proxy resolution engine.
 * Results are cached per-origin with a short TTL.
 */
async function resolveSystemProxy(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (BYPASS_HOSTS.has(parsed.hostname)) {
    return null
  }

  const origin = parsed.origin
  const now = Date.now()
  const cached = proxyCache.get(origin)
  if (cached && cached.expiresAt > now) {
    return cached.proxyUrl
  }

  try {
    const proxyString = await session.defaultSession.resolveProxy(url)
    const proxyUrl = parseProxyString(proxyString)

    proxyCache.set(origin, { proxyUrl, expiresAt: now + PROXY_CACHE_TTL_MS })

    if (proxyUrl) {
      console.log(`[ProxyFetch] Resolved proxy for ${origin}: ${proxyUrl}`)
    }

    return proxyUrl
  } catch (err) {
    console.warn('[ProxyFetch] Failed to resolve proxy, falling back to direct:', err)
    return null
  }
}

// ============================================================================
// Agent Pool
// ============================================================================

const agentPool = new Map<string, ProxyAgent>()

function getOrCreateAgent(proxyUrl: string): ProxyAgent {
  let agent = agentPool.get(proxyUrl)
  if (!agent) {
    // proxy-agent v7: pass getProxyForUrl to force all requests through
    // the specified proxy. Passing a bare string does NOT work in v7 —
    // it falls back to env vars (HTTP_PROXY) which may be unset.
    agent = new ProxyAgent({
      getProxyForUrl: () => proxyUrl,
    })
    agentPool.set(proxyUrl, agent)
  }
  return agent
}

// ============================================================================
// App-level proxy cache (in-memory, refreshed on each call)
// ============================================================================

/**
 * Read proxy from config on each call.
 * Fork simplified version — no onNetworkConfigChange listener.
 */
function getAppProxy(): string | null {
  try {
    const config = getConfig() as Record<string, unknown>
    const network = config.network as Record<string, unknown> | undefined
    return (network?.proxy as string)?.trim() || null
  } catch {
    return null
  }
}

// ============================================================================
// Node.js HTTP request → native Response (streaming, redirect-aware)
// ============================================================================

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => { result[key] = value })
    return result
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers as Record<string, string>
}

async function bodyToBuffer(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
  if (body == null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return Buffer.from(body as ArrayBuffer)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  return undefined
}

function makeRequest(
  url: string,
  init: RequestInit | undefined,
  agent: http.Agent,
  redirectCount = 0
): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      reject(new Error('[ProxyFetch] Too many redirects'))
      return
    }

    const u = new URL(url)
    const isHttps = u.protocol === 'https:'

    const options: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port ? parseInt(u.port) : (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: (init?.method || 'GET').toUpperCase(),
      headers: headersToRecord(init?.headers),
      agent,
    }

    const nodeReq = (isHttps ? https : http).request(options, (res) => {
      // Handle redirects
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers['location']
        if (location) {
          res.resume() // drain and discard body
          const redirectUrl = new URL(location, url).toString()
          // 303 always converts to GET; 307/308 preserve method
          const redirectInit =
            res.statusCode === 303 && options.method !== 'GET'
              ? { ...init, method: 'GET', body: undefined }
              : init
          makeRequest(redirectUrl, redirectInit, agent, redirectCount + 1).then(resolve, reject)
          return
        }
      }

      // Build response headers
      const responseHeaders = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue
        if (Array.isArray(value)) {
          value.forEach(v => responseHeaders.append(key, v))
        } else {
          responseHeaders.set(key, value)
        }
      }

      // Auto-decompress gzip/deflate/br responses (node:http doesn't do this)
      // This makes proxied requests behave like globalThis.fetch (undici)
      const contentEncoding = res.headers['content-encoding']?.toLowerCase()
      let bodySource: NodeJS.ReadableStream = res
      if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip') {
        bodySource = res.pipe(zlib.createGunzip())
        responseHeaders.delete('content-encoding')
        responseHeaders.delete('content-length') // length no longer valid after decompression
      } else if (contentEncoding === 'deflate') {
        bodySource = res.pipe(zlib.createInflate())
        responseHeaders.delete('content-encoding')
        responseHeaders.delete('content-length')
      } else if (contentEncoding === 'br') {
        bodySource = res.pipe(zlib.createBrotliDecompress())
        responseHeaders.delete('content-encoding')
        responseHeaders.delete('content-length')
      }

      const statusCode = res.statusCode ?? 200
      // 101, 204, 205, 304 are null body statuses per Fetch spec —
      // Response constructor throws if body is non-null for these.
      const nullBodyStatus = [101, 204, 205, 304].includes(statusCode)

      let body: ReadableStream | null = null
      if (!nullBodyStatus) {
        // Stream response body so SSE / large responses work correctly
        body = new ReadableStream({
          start(controller) {
            bodySource.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
            bodySource.on('end', () => controller.close())
            bodySource.on('error', (err) => controller.error(err))
          },
          cancel() {
            res.destroy()
          },
        })
      } else {
        res.resume()
      }

      resolve(new Response(body, {
        status: statusCode,
        statusText: res.statusMessage ?? '',
        headers: responseHeaders,
      }))
    })

    nodeReq.on('error', reject)

    // Write request body
    if (init?.body != null) {
      bodyToBuffer(init.body).then(buf => {
        if (buf) nodeReq.write(buf)
        nodeReq.end()
      }).catch(err => {
        nodeReq.destroy(err)
        reject(err)
      })
    } else {
      nodeReq.end()
    }
  })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Proxy-aware fetch — same signature as global `fetch()`.
 *
 * Priority order:
 *   1. App-level proxy (Settings > System > Proxy) — highest priority
 *   2. System proxy (Chromium PAC/WPAD via session.resolveProxy)
 *   3. Direct fetch — no proxy configured
 *
 * Supports HTTP, HTTPS, SOCKS4, SOCKS5 proxies.
 * localhost / 127.0.0.1 always bypasses proxy regardless of setting.
 */
export async function proxyFetch(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  const urlStr = typeof url === 'string' ? url : url.toString()

  // App-level proxy (in-memory cache, zero disk reads after first call)
  const appProxy = getAppProxy()

  let proxyUrl: string | null
  if (appProxy) {
    // Manual proxy configured — still respect localhost bypass
    const hostname = (() => {
      try { return new URL(urlStr).hostname } catch { return '' }
    })()
    proxyUrl = BYPASS_HOSTS.has(hostname) ? null : appProxy
  } else {
    // Auto-detect from Chromium's proxy resolution engine
    proxyUrl = await resolveSystemProxy(urlStr)
  }

  const method = (init?.method || 'GET').toUpperCase()
  if (!proxyUrl) {
    console.log(`[ProxyFetch] DIRECT ${method} ${urlStr}`)
    return _originalFetch(url, init)
  }

  console.log(`[ProxyFetch] VIA ${proxyUrl} → ${method} ${urlStr}`)
  const agent = getOrCreateAgent(proxyUrl)
  return makeRequest(urlStr, init, agent)
}

/**
 * Clear proxy resolution cache.
 * Call when network conditions may have changed (e.g., system wake from sleep).
 */
export function clearProxyCache(): void {
  proxyCache.clear()
}
