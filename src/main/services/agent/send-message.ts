/**
 * Agent Module - Send Message
 *
 * Core message sending logic including:
 * - API credential resolution and routing
 * - V2 Session management
 * - SDK message streaming and processing
 * - Token-level streaming support
 * - Error handling and recovery
 */

import { getConfig } from '../config.service'
import { getConversation, saveSessionId, addMessage, updateLastMessage } from '../conversation.service'
import {
  AI_BROWSER_SYSTEM_PROMPT,
  createAIBrowserMcpServer
} from '../ai-browser'
import type {
  AgentRequest,
  Thought,
  SessionConfig,
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials,
  getEnabledMcpServers,
  buildSystemPromptAppend,
  calculateSkillsHash,
  calculateCredentialsHash
} from './helpers'
import {
  resolveCredentialsForSdk,
  buildBaseSdkOptions
} from './sdk-config'
import {
  getOrCreateV2Session,
  closeV2Session,
  createSessionState,
  registerActiveSession,
  unregisterActiveSession,
  v2Sessions
} from './session-manager'
import {
  formatCanvasContext,
  buildMessageContent,
} from './message-utils'
import { processStream, type StreamResult } from './stream-processor'
import { emitAgentEvent } from './events'

// ============================================
// Send Message
// ============================================

/**
 * Send message to agent (supports multiple concurrent sessions)
 *
 * This is the main entry point for sending messages to the AI agent.
 * It handles:
 * - API credential resolution (Anthropic, OpenAI, OAuth providers)
 * - V2 Session creation/reuse
 * - Message streaming with token-level updates
 * - Tool calls and permissions
 * - Error handling and recovery
 */
export async function sendMessage(
  request: AgentRequest
): Promise<void> {
  const {
    spaceId,
    conversationId,
    message,
    resumeSessionId,
    images,
    aiBrowserEnabled,
    thinkingEnabled,
    canvasContext
  } = request

  console.log(`[Agent] sendMessage: conv=${conversationId}${images && images.length > 0 ? `, images=${images.length}` : ''}${aiBrowserEnabled ? ', AI Browser enabled' : ''}${thinkingEnabled ? ', thinking=ON' : ''}${canvasContext?.isOpen ? `, canvas tabs=${canvasContext.tabCount}` : ''}`)

  const config = getConfig()
  const workDir = getWorkingDir(spaceId)

  // Get API credentials based on current aiSources configuration
  const credentials = await getApiCredentials(config)
  console.log(`[Agent] provider=${credentials.provider} model=${credentials.model} key=${credentials.apiKey.substring(0, 8)}...`)

  // Push session start info to renderer DevTools
  emitAgentEvent('debug:api-log', spaceId, conversationId, {
    type: 'session-start',
    provider: credentials.provider,
    model: credentials.model,
    baseUrl: credentials.baseUrl,
    aiBrowserEnabled: !!aiBrowserEnabled,
    thinkingEnabled: !!thinkingEnabled,
    maxTurns: config.agent?.maxTurns ?? 50
  })

  // Resolve credentials for SDK (handles OpenAI compat router for non-Anthropic providers)
  const resolvedCredentials = await resolveCredentialsForSdk(credentials)

  // Get conversation for session resumption
  const conversation = getConversation(spaceId, conversationId)
  const sessionId = resumeSessionId || conversation?.sessionId

  // Create abort controller for this session
  const abortController = new AbortController()

  // Accumulate stderr for detailed error messages
  let stderrBuffer = ''

  // Register this session in the active sessions map
  const sessionState = createSessionState(spaceId, conversationId, abortController)
  registerActiveSession(conversationId, sessionState)

  // Add user message to conversation (with images if provided)
  addMessage(spaceId, conversationId, {
    role: 'user',
    content: message,
    images: images  // Include images in the saved message
  })

  // Add placeholder for assistant response
  addMessage(spaceId, conversationId, {
    role: 'assistant',
    content: '',
    toolCalls: []
  })

  try {
    // Use headless Electron binary (outside .app bundle on macOS to prevent Dock icon)
    const electronPath = getHeadlessElectronPath()
    console.log(`[Agent] Using headless Electron as Node runtime: ${electronPath}`)

    // Configure SDK options
    // Note: These parameters require SDK patch to work in V2 Session
    // Native SDK SDKSessionOptions only supports model, executable, executableArgs
    // After patch supports full parameter pass-through, see notes in session-manager.ts

    // Get enabled MCP servers
    const enabledMcpServers = getEnabledMcpServers(config.mcpServers || {})

    // Build MCP servers config (including AI Browser if enabled)
    const mcpServers: Record<string, any> = enabledMcpServers ? { ...enabledMcpServers } : {}
    if (aiBrowserEnabled) {
      mcpServers['ai-browser'] = createAIBrowserMcpServer()
      console.log(`[Agent][${conversationId}] AI Browser MCP server added`)
    }

    // Build base SDK options using shared configuration
    const sdkOptions = buildBaseSdkOptions({
      credentials: resolvedCredentials,
      workDir,
      electronPath,
      spaceId,
      conversationId,
      abortController,
      stderrHandler: (data: string) => {
        console.error(`[Agent][${conversationId}] CLI stderr:`, data)
        stderrBuffer += data  // Accumulate for error reporting
      },
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : null,
      maxTurns: config.agent?.maxTurns
    })

    // Apply dynamic configurations (AI Browser system prompt, Thinking mode)
    // These are specific to sendMessage and not part of base options
    if (aiBrowserEnabled) {
      sdkOptions.systemPrompt = {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: buildSystemPromptAppend(workDir, credentials.model) + AI_BROWSER_SYSTEM_PROMPT
      }
    }
    if (thinkingEnabled) {
      sdkOptions.thinkingConfig = { type: 'enabled', budgetTokens: 10240 }
    }

    const t0 = Date.now()
    console.log(`[Agent][${conversationId}] Getting or creating V2 session...`)

    // Log MCP servers if configured (only enabled ones)
    const mcpServerNames = enabledMcpServers ? Object.keys(enabledMcpServers) : []
    if (mcpServerNames.length > 0) {
      console.log(`[Agent][${conversationId}] MCP servers configured: ${mcpServerNames.join(', ')}`)
    }

    // Session config for rebuild detection (credentialsHash: rebuild when API key/URL changes)
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: !!aiBrowserEnabled,
      skillsHash: calculateSkillsHash(config.skills),
      credentialsHash: calculateCredentialsHash(credentials)
    }

    // Get or create persistent V2 session for this conversation
    // Pass config for rebuild detection when aiBrowserEnabled changes
    const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig)

    // Dynamic runtime parameter adjustment (via SDK patch)
    // These can be changed without rebuilding the session
    try {
      // Set model dynamically (allows model switching without session rebuild)
      // Note: For OpenAI-compat/OAuth providers, model is encoded in apiKey and always fresh
      // This setModel call is mainly for pure Anthropic API sessions
      if (v2Session.setModel) {
        await v2Session.setModel(resolvedCredentials.sdkModel)
        console.log(`[Agent][${conversationId}] Model set: ${resolvedCredentials.sdkModel}`)
      }

      // Set thinking tokens dynamically
      if (v2Session.setMaxThinkingTokens) {
        await v2Session.setMaxThinkingTokens(thinkingEnabled ? 10240 : null)
        console.log(`[Agent][${conversationId}] Thinking mode: ${thinkingEnabled ? 'ON (10240 tokens)' : 'OFF'}`)
      }

      // Set permission mode dynamically
      if (v2Session.setPermissionMode) {
        await v2Session.setPermissionMode('acceptEdits')
        console.log(`[Agent][${conversationId}] Permission mode: acceptEdits`)
      }
    } catch (e) {
      console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
    }
    console.log(`[Agent][${conversationId}] ⏱️ V2 session ready: ${Date.now() - t0}ms`)

    // Build message content (text-only or multi-modal with images)
    const canvasPrefix = formatCanvasContext(canvasContext)
    const messageWithContext = canvasPrefix + message
    const messageContent = buildMessageContent(messageWithContext, images)

    if (images && images.length > 0) {
      console.log(`[Agent][${conversationId}] Message includes ${images.length} image(s)`)
    }

    // Process the stream using the shared stream processor
    const result = await processStream({
      v2Session,
      sessionState,
      spaceId,
      conversationId,
      messageContent,
      displayModel: resolvedCredentials.displayModel,
      abortController,
      t0,
      callbacks: {
        onComplete: (streamResult: StreamResult) => {
          // Save session ID for future resumption
          if (streamResult.capturedSessionId) {
            saveSessionId(spaceId, conversationId, streamResult.capturedSessionId)
            console.log(`[Agent][${conversationId}] Session ID saved:`, streamResult.capturedSessionId)
          }

          // Persist final content to conversation
          const { finalContent, thoughts, tokenUsage } = streamResult

          if (finalContent) {
            updateLastMessage(spaceId, conversationId, {
              content: finalContent,
              thoughts: thoughts.length > 0 ? [...thoughts] : undefined,
              tokenUsage: tokenUsage || undefined
            })
            console.log(`[Agent][${conversationId}] Saved ${thoughts.length} thoughts${tokenUsage ? ' with tokenUsage' : ''} to backend`)
          } else {
            // No text content — handle tool-only completion or empty response
            const hasThoughts = thoughts.length > 0
            const PLACEHOLDER_TOOLS_ONLY = 'Task completed using tools.'
            const contentToSave = hasThoughts ? PLACEHOLDER_TOOLS_ONLY : ''

            if (contentToSave || hasThoughts) {
              updateLastMessage(spaceId, conversationId, {
                content: contentToSave,
                thoughts: hasThoughts ? [...thoughts] : undefined,
                tokenUsage: tokenUsage || undefined,
                timestamp: new Date().toISOString()
              })
            }
          }
        }
      }
    })

  } catch (error: unknown) {
    const err = error as Error

    // Don't report abort as error
    if (err.name === 'AbortError') {
      console.log(`[Agent][${conversationId}] Aborted by user`)
      return
    }

    console.error(`[Agent][${conversationId}] Error:`, error)

    // Extract detailed error message from stderr if available
    let errorMessage = err.message || 'Unknown error occurred'

    // Windows: Check for Git Bash related errors
    if (process.platform === 'win32') {
      const isExitCode1 = errorMessage.includes('exited with code 1') ||
                          errorMessage.includes('process exited') ||
                          errorMessage.includes('spawn ENOENT')
      const isBashError = stderrBuffer?.includes('bash') ||
                          stderrBuffer?.includes('ENOENT') ||
                          errorMessage.includes('ENOENT')

      if (isExitCode1 || isBashError) {
        // Check if Git Bash is properly configured
        const { detectGitBash } = require('../git-bash.service')
        const gitBashStatus = detectGitBash()

        if (!gitBashStatus.found) {
          errorMessage = 'Command execution environment not installed. Please restart the app and complete setup, or install manually in settings.'
        } else {
          // Git Bash found but still got error - could be path issue
          errorMessage = 'Command execution failed. This may be an environment configuration issue, please try restarting the app.\n\n' +
                        `Technical details: ${err.message}`
        }
      }
    }

    // Check for context window overflow errors
    // Covers Anthropic native errors + OpenAI-format provider errors (doubao, deepseek, etc.)
    const isContextOverflow = errorMessage.includes('input length must be in range') ||
                              errorMessage.includes('202752') ||
                              errorMessage.includes('prompt is too long') ||
                              (errorMessage.includes('context') && errorMessage.includes('overflow')) ||
                              (errorMessage.includes('max') && errorMessage.includes('token')) ||
                              errorMessage.includes('context_length_exceeded') ||
                              errorMessage.includes('maximum context length') ||
                              errorMessage.includes('Request too large') ||
                              errorMessage.includes('input is too long') ||
                              (errorMessage.includes('tokens') && errorMessage.includes('exceed')) ||
                              stderrBuffer?.includes('input length must be in range') ||
                              stderrBuffer?.includes('prompt is too long') ||
                              stderrBuffer?.includes('context_length_exceeded') ||
                              stderrBuffer?.includes('maximum context length')

    if (isContextOverflow) {
      errorMessage = 'Context window exceeded. The conversation has accumulated too much context.\n\n' +
                    'This usually happens when AI reads large files or makes many tool calls in a long conversation.\n\n' +
                    'Solutions:\n' +
                    '1. Start a new conversation — you can reference the same task, AI will re-read needed files\n' +
                    '2. Retry — the system will auto-compress context and try again\n' +
                    '3. Avoid reading entire large files — ask AI to search for specific content instead'
      console.log(`[Agent][${conversationId}] Context overflow detected, closing session`)
      closeV2Session(conversationId)
    } else if (stderrBuffer && !errorMessage.includes('Command execution')) {
      // Try to extract the most useful error info from stderr
      const mcpErrorMatch = stderrBuffer.match(/Error: Invalid MCP configuration:[\s\S]*?(?=\n\s*at |$)/m)
      const genericErrorMatch = stderrBuffer.match(/Error: [\s\S]*?(?=\n\s*at |$)/m)
      if (mcpErrorMatch) {
        errorMessage = mcpErrorMatch[0].trim()
      } else if (genericErrorMatch) {
        errorMessage = genericErrorMatch[0].trim()
      }
    }

    emitAgentEvent('agent:error', spaceId, conversationId, {
      type: 'error',
      error: errorMessage
    })

    // Close V2 session on error (it may be in a bad state)
    closeV2Session(conversationId)
  } finally {
    // Clean up active session state (but keep V2 session for reuse)
    unregisterActiveSession(conversationId)
    console.log(`[Agent][${conversationId}] Active session state cleaned up. V2 sessions: ${v2Sessions.size}`)
  }
}

