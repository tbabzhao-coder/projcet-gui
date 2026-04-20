/**
 * Agent IPC Handlers
 */

import { ipcMain } from 'electron'
import {
  sendMessage, stopGeneration, handleToolApproval, handleQuestionAnswer,
  getSessionState, ensureSessionWarm, testMcpConnections,
  onAgentEvent, onAgentBroadcast
} from '../services/agent'
import { broadcastToAll, broadcastToWebSocket } from '../http/websocket'
import { onMainWindowChange } from '../services/window.service'
import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

/**
 * Subscribe to agent event system and forward to renderer + WebSocket.
 * This bridges the decoupled event system to the transport layer.
 * Uses the module-level mainWindow variable so it always has the latest reference.
 */
function subscribeToAgentEvents(): void {
  // Conversation-scoped events → Electron IPC + WebSocket
  onAgentEvent((event) => {
    const { channel, spaceId, conversationId, data } = event
    const eventData = { ...data, spaceId, conversationId }

    console.log(`[IPC] Received agent event: ${channel}, mainWindow=${mainWindow ? 'exists' : 'null'}`)

    // Forward to Electron renderer (use module-level mainWindow for latest ref)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, eventData)
      console.log(`[IPC] Forwarded to renderer: ${channel}`)
    } else {
      console.warn(`[IPC] Cannot forward ${channel} - mainWindow is ${mainWindow ? 'destroyed' : 'null'}`)
    }

    // Forward to WebSocket clients
    try {
      broadcastToWebSocket(channel, eventData)
    } catch {
      // WebSocket module might not be initialized yet
    }
  })

  // Global broadcast events → Electron IPC + WebSocket
  onAgentBroadcast((event) => {
    const { channel, data } = event

    console.log(`[IPC] Received broadcast event: ${channel}`)

    // Forward to Electron renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
      console.log(`[IPC] Forwarded broadcast to renderer: ${channel}`)
    }

    // Forward to all WebSocket clients
    try {
      broadcastToAll(channel, data)
    } catch {
      // WebSocket module might not be initialized yet
    }
  })

  console.log(`[IPC] Agent event subscriptions registered`)
}

export function registerAgentHandlers(): void {
  // Subscribe to window changes (consistent with search.ts, system.ts pattern)
  // onMainWindowChange calls back immediately if window already exists
  onMainWindowChange((window) => {
    mainWindow = window
  })

  // Subscribe to decoupled agent event system
  subscribeToAgentEvents()

  // Send message to agent (with optional images for multi-modal, optional thinking mode)
  ipcMain.handle(
    'agent:send-message',
    async (
      _event,
      request: {
        spaceId: string
        conversationId: string
        message: string
        resumeSessionId?: string
        images?: Array<{
          id: string
          type: 'image'
          mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
          data: string
          name?: string
          size?: number
        }>
        thinkingEnabled?: boolean  // Enable extended thinking mode
        planModeEnabled?: boolean  // Enable plan mode
      }
    ) => {
      try {
        console.log(`[IPC] agent:send-message called for conversation: ${request.conversationId}`)
        
        // sendMessage is async and may throw, but it also handles errors internally
        // We need to ensure we always return a response, even if sendMessage throws
        await sendMessage(request)
        
        console.log(`[IPC] agent:send-message completed for conversation: ${request.conversationId}`)
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error(`[IPC] agent:send-message error for conversation ${request.conversationId}:`, err)
        console.error(`[IPC] Error stack:`, err.stack)
        
        // Always return a response, never leave the IPC call hanging
        return { 
          success: false, 
          error: err.message || 'Unknown error occurred',
          details: err.stack
        }
      }
    }
  )

  // Stop generation for a specific conversation (or all if not specified)
  ipcMain.handle('agent:stop', async (_event, conversationId?: string) => {
    try {
      stopGeneration(conversationId)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Approve tool execution for a specific conversation
  ipcMain.handle('agent:approve-tool', async (_event, conversationId: string) => {
    try {
      handleToolApproval(conversationId, true)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Reject tool execution for a specific conversation
  ipcMain.handle('agent:reject-tool', async (_event, conversationId: string, rejectMessage?: string) => {
    try {
      handleToolApproval(conversationId, false, rejectMessage)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Answer question for a specific conversation
  ipcMain.handle('agent:answer-question', async (_event, conversationId: string, answers: Record<string, string>) => {
    try {
      handleQuestionAnswer(conversationId, answers)
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Get current session state for recovery after refresh
  ipcMain.handle('agent:get-session-state', async (_event, conversationId: string) => {
    try {
      const state = getSessionState(conversationId)
      return { success: true, data: state }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Warm up V2 session - call when switching conversations to prepare for faster message sending
  ipcMain.handle('agent:ensure-session-warm', async (_event, spaceId: string, conversationId: string) => {
    try {
      // Async initialization, non-blocking IPC call
      ensureSessionWarm(spaceId, conversationId).catch((error: unknown) => {
        console.error('[IPC] ensureSessionWarm error:', error)
      })
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Test MCP server connections
  ipcMain.handle('agent:test-mcp', async () => {
    try {
      const result = await testMcpConnections()
      return result
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, servers: [], error: err.message }
    }
  })
}
