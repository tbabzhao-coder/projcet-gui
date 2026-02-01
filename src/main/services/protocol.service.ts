/**
 * Protocol Service - Custom protocol registration for secure local resource access
 *
 * Provides project4-file:// protocol to bypass cross-origin restrictions when loading
 * local files from localhost (dev mode) or app:// (production mode).
 *
 * Usage:
 * - Images: <img src="project4-file:///path/to/image.png">
 * - PDF: BrowserView.loadURL("project4-file:///path/to/doc.pdf")
 * - Other media: Same pattern for video, audio, etc.
 *
 * Security: Only file:// URLs are allowed, no remote URLs pass through.
 */

import { protocol, net } from 'electron'

/**
 * Register custom protocols for secure local resource access
 * Must be called after app.whenReady()
 */
export function registerProtocols(): void {
  // project4-file:// - Proxy to file:// for local resources
  // Chromium blocks file:// from localhost/app origins, this bypasses that
  protocol.handle('project4-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('project4-file://', ''))
    return net.fetch(`file://${filePath}`)
  })

  console.log('[Protocol] Registered project4-file:// protocol')
}
