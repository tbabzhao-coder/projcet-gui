/**
 * Feishu Service - WebSocket long connection to Feishu/Lark platform
 *
 * Receives messages from Feishu bot, triggers local Agent execution,
 * and sends results back to Feishu.
 */

import * as Lark from '@larksuiteoapi/node-sdk'
import { getConfig, saveConfig } from './config.service'
import { sendMessage } from './agent'
import { getMainWindow } from './window.service'
import { createConversationWithId } from './conversation.service'

// ============================================
// Types
// ============================================

export interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  domain: 'feishu' | 'lark'
}

export type FeishuConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface FeishuState {
  status: FeishuConnectionStatus
  error?: string
}

// ============================================
// State
// ============================================

let larkClient: InstanceType<typeof Lark.Client> | null = null
let wsClient: any = null
let state: FeishuState = { status: 'disconnected' }

// Pending response callbacks: conversationId -> chatId
const pendingCallbacks = new Map<string, string>()

// Track feishu conversationIds to chatIds for ongoing conversations
const chatIdMap = new Map<string, string>()

// ============================================
// Config Helpers
// ============================================

export function getFeishuConfig(): FeishuConfig | null {
  const config = getConfig()
  const feishu = (config as any).feishu as FeishuConfig | undefined
  if (!feishu) return null
  return feishu
}

export function saveFeishuConfig(feishuConfig: FeishuConfig): void {
  saveConfig({ feishu: feishuConfig } as any)
}

// ============================================
// Status
// ============================================

export function getFeishuStatus(): FeishuState {
  return { ...state }
}

function setState(newState: Partial<FeishuState>): void {
  state = { ...state, ...newState }
  // Notify renderer
  try {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('feishu:status-change', state)
    }
  } catch {
    // Window may not be ready
  }
}

// ============================================
// Message Parsing
// ============================================

function parseMessageContent(content: string, msgType: string): string {
  try {
    const parsed = JSON.parse(content)
    if (msgType === 'text') {
      return parsed.text || content
    }
    // For other types, return a description
    return `[${msgType} message]`
  } catch {
    return content
  }
}

// ============================================
// Agent Response Callback
// ============================================

/**
 * Called when agent completes - sends result back to Feishu
 * This is invoked from the sendToRenderer hook in helpers.ts
 */
export function onAgentEvent(
  channel: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  // Only handle feishu conversations
  if (!conversationId.startsWith('feishu-')) return

  const chatId = chatIdMap.get(conversationId)
  if (!chatId || !larkClient) return

  if (channel === 'agent:complete') {
    // Agent finished - send the accumulated content back to Feishu
    // The content was already sent via agent:message events
    // We just need to clean up pending state
    pendingCallbacks.delete(conversationId)
    console.log(`[Feishu] Agent complete for ${conversationId}`)
  }

  if (channel === 'agent:message') {
    const isComplete = data.isComplete as boolean
    const content = data.content as string

    // Only send the final complete message to Feishu
    if (isComplete && content) {
      sendFeishuReply(chatId, content).catch(err => {
        console.error('[Feishu] Failed to send reply:', err)
      })
    }
  }

  if (channel === 'agent:error') {
    const error = data.error as string
    sendFeishuReply(chatId, `Error: ${error}`).catch(err => {
      console.error('[Feishu] Failed to send error reply:', err)
    })
    pendingCallbacks.delete(conversationId)
  }
}

// ============================================
// Send Reply to Feishu
// ============================================

async function sendFeishuReply(chatId: string, text: string): Promise<void> {
  if (!larkClient) {
    console.error('[Feishu] Cannot send reply: client not initialized')
    return
  }

  try {
    // Truncate very long messages (Feishu has limits)
    const maxLen = 4000
    const truncated = text.length > maxLen
      ? text.substring(0, maxLen) + '\n\n... (truncated)'
      : text

    await larkClient.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: truncated })
      }
    })
    console.log(`[Feishu] Reply sent to chat ${chatId}, length: ${truncated.length}`)
  } catch (error) {
    console.error('[Feishu] Failed to send message:', error)
  }
}

// ============================================
// Handle Incoming Feishu Message
// ============================================

async function handleFeishuMessage(event: any): Promise<void> {
  try {
    const message = event?.message
    if (!message) {
      console.warn('[Feishu] Received event without message:', event)
      return
    }

    const chatId = message.chat_id
    const msgType = message.message_type || 'text'
    const content = message.content || ''

    // Parse message content
    const text = parseMessageContent(content, msgType)
    if (!text || text.startsWith('[')) {
      console.log(`[Feishu] Ignoring non-text message type: ${msgType}`)
      return
    }

    console.log(`[Feishu] Received message from chat ${chatId}: ${text.substring(0, 100)}`)

    // Create a conversation ID tied to this Feishu chat
    const conversationId = `feishu-${chatId}`

    // Track the mapping
    chatIdMap.set(conversationId, chatId)
    pendingCallbacks.set(conversationId, chatId)

    // Ensure conversation exists in the feishu space
    const spaceId = 'feishu'
    createConversationWithId(spaceId, conversationId, `Feishu: ${text.substring(0, 30)}`)

    // Trigger the agent via sendMessage (same as desktop UI)
    const mainWindow = getMainWindow()
    await sendMessage(mainWindow, {
      spaceId,
      conversationId,
      message: text
    })
  } catch (error) {
    console.error('[Feishu] Error handling message:', error)
  }
}

// ============================================
// Initialize / Start / Stop
// ============================================

export async function initializeFeishuService(): Promise<void> {
  const feishuConfig = getFeishuConfig()
  if (!feishuConfig?.enabled) {
    console.log('[Feishu] Service disabled, skipping initialization')
    return
  }

  if (!feishuConfig.appId || !feishuConfig.appSecret) {
    console.warn('[Feishu] Missing appId or appSecret, skipping initialization')
    return
  }

  await startFeishuService(feishuConfig)
}

export async function startFeishuService(feishuConfig: FeishuConfig): Promise<void> {
  // Stop existing connection if any
  await stopFeishuService()

  setState({ status: 'connecting', error: undefined })

  try {
    const domain = feishuConfig.domain === 'lark'
      ? Lark.Domain.Lark
      : Lark.Domain.Feishu

    // Create Lark client
    larkClient = new Lark.Client({
      appId: feishuConfig.appId,
      appSecret: feishuConfig.appSecret,
      domain
    })

    // Create WebSocket client for long connection
    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        console.log('[Feishu] im.message.receive_v1 event received')
        await handleFeishuMessage(data)
      }
    })

    wsClient = new Lark.WSClient({
      appId: feishuConfig.appId,
      appSecret: feishuConfig.appSecret,
      domain,
      loggerLevel: Lark.LoggerLevel.INFO
    })

    await wsClient.start({ eventDispatcher })

    setState({ status: 'connected', error: undefined })
    console.log('[Feishu] WebSocket connected successfully')
  } catch (error: unknown) {
    const err = error as Error
    setState({ status: 'error', error: err.message })
    console.error('[Feishu] Failed to start service:', err)
  }
}

export async function stopFeishuService(): Promise<void> {
  if (wsClient) {
    try {
      // WSClient doesn't have a stop method in all versions
      // Try to close gracefully
      if (typeof wsClient.stop === 'function') {
        await wsClient.stop()
      }
    } catch (error) {
      console.error('[Feishu] Error stopping WebSocket client:', error)
    }
    wsClient = null
  }

  larkClient = null
  pendingCallbacks.clear()
  setState({ status: 'disconnected', error: undefined })
  console.log('[Feishu] Service stopped')
}

export async function restartFeishuService(): Promise<void> {
  const feishuConfig = getFeishuConfig()
  if (!feishuConfig?.enabled) {
    await stopFeishuService()
    return
  }
  await startFeishuService(feishuConfig)
}
