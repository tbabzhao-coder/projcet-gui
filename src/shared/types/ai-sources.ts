/**
 * AI Sources - Unified Type Definitions
 *
 * This module defines all types related to AI source providers.
 * These types are shared between main process and renderer.
 *
 * Design Principles:
 * - Single source of truth for all AI-related types
 * - Extensible for future providers
 * - Minimal coupling with specific provider implementations
 */

// ============================================================================
// Core Enums and Constants
// ============================================================================

/**
 * Available AI Source Types
 * 'oauth' - OAuth-based providers 
 * 'custom' - User's own API key
 */
export type AISourceType = 'oauth' | 'custom' | string

/**
 * Provider types for custom API
 */
export type ApiProvider = 'anthropic' | 'openai'

/**
 * Login status for OAuth-based sources
 */
export type LoginStatus = 'idle' | 'starting' | 'waiting' | 'completing' | 'success' | 'error'

// ============================================================================
// Model Definitions
// ============================================================================

/**
 * Model option for UI display
 */
export interface ModelOption {
  id: string
  name: string
  description: string
}

/**
 * Available Claude models
 */
export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Most powerful model, great for complex reasoning and architecture decisions'
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and cost, suitable for most tasks'
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and lightweight, ideal for simple tasks'
  }
]

export const DEFAULT_MODEL = 'claude-opus-4-5-20251101'

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * User info from OAuth provider
 */
export interface AISourceUserInfo {
  name: string
  avatar?: string
  /** User ID (for API headers, should be ASCII-safe) */
  uid?: string
}

/**
 * Base configuration that all sources share
 */
export interface AISourceBaseConfig {
  model: string
}

/**
 * OAuth source configuration (generic for any OAuth provider)
 * Stored securely, only essential data exposed to renderer
 */
export interface OAuthSourceConfig extends AISourceBaseConfig {
  loggedIn: boolean
  user?: AISourceUserInfo
  availableModels: string[]
  /** Model ID to display name mapping (provided by provider) */
  modelNames?: Record<string, string>
  // Provider-specific token data - managed by main process
  // Field names are generic; actual data populated by provider
  accessToken?: string
  refreshToken?: string
  tokenExpires?: number
}

/**
 * Custom API source configuration
 */
export interface CustomSourceConfig extends AISourceBaseConfig {
  provider: ApiProvider
  apiKey: string
  apiUrl: string
  // Optional fields for multiple custom sources
  id?: string
  name?: string
  type?: 'custom'
  availableModels?: string[]
}

/**
 * Combined AI Sources configuration
 */
export interface AISourcesConfig {
  current: AISourceType
  oauth?: OAuthSourceConfig
  custom?: CustomSourceConfig
  // Dynamic provider configs (keyed by provider type)
  [key: string]: AISourceType | OAuthSourceConfig | CustomSourceConfig | undefined
}

// ============================================================================
// Backend Configuration Types (for request routing)
// ============================================================================

/**
 * Configuration for making API requests
 * Used by OpenAI compat router
 */
export interface BackendRequestConfig {
  url: string
  key: string
  model?: string
  headers?: Record<string, string>
  apiType?: 'chat_completions' | 'responses'
  forceStream?: boolean
}

// ============================================================================
// Login Flow Types
// ============================================================================

/**
 * OAuth login state tracking
 */
export interface OAuthLoginState {
  status: LoginStatus
  state?: string
  error?: string
}

/**
 * Result from starting an OAuth login flow
 */
export interface OAuthStartResult {
  loginUrl: string
  state: string
  /** User code for device code flow (e.g., GitHub Copilot) */
  userCode?: string
  /** Verification URL for device code flow */
  verificationUri?: string
}

/**
 * Result from completing an OAuth login flow
 */
export interface OAuthCompleteResult {
  success: boolean
  user?: AISourceUserInfo
  error?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if any AI source is configured and ready to use
 */
export function hasAnyAISource(aiSources: AISourcesConfig): boolean {
  const hasCustom = !!(aiSources.custom?.apiKey)

  // Check any OAuth provider dynamically (any key with loggedIn: true except 'current' and 'custom')
  const hasOAuth = Object.keys(aiSources).some(key => {
    if (key === 'current' || key === 'custom') return false
    const source = aiSources[key as keyof typeof aiSources] as OAuthSourceConfig | undefined
    return source?.loggedIn === true
  })

  return hasOAuth || hasCustom
}

/**
 * Check if a specific source is configured
 */
export function isSourceConfigured(aiSources: AISourcesConfig, source: AISourceType): boolean {
  if (source === 'custom') {
    return !!(aiSources.custom?.apiKey)
  }
  // Check dynamic provider (OAuth providers like 'google', etc.)
  const config = aiSources[source]
  if (config && typeof config === 'object' && 'loggedIn' in config) {
    return config.loggedIn === true
  }
  return false
}

/**
 * Get display name for current model
 */
export function getCurrentModelName(aiSources: AISourcesConfig): string {
  if (aiSources.current === 'custom' && aiSources.custom) {
    const model = AVAILABLE_MODELS.find(m => m.id === aiSources.custom?.model)
    return model?.name || aiSources.custom.model
  }
  // For OAuth or dynamic providers
  const currentConfig = aiSources[aiSources.current] as OAuthSourceConfig | undefined
  if (currentConfig && typeof currentConfig === 'object' && 'model' in currentConfig) {
    const modelId = currentConfig.model
    // Use modelNames mapping if available
    return currentConfig.modelNames?.[modelId] || modelId || 'No model'
  }
  return 'No model'
}

/**
 * Get available models for a source
 */
export function getAvailableModels(aiSources: AISourcesConfig, source: AISourceType): string[] {
  if (source === 'custom') {
    return AVAILABLE_MODELS.map(m => m.id)
  }
  // For OAuth or dynamic providers
  const config = aiSources[source]
  if (config && typeof config === 'object' && 'availableModels' in config) {
    return config.availableModels || []
  }
  return []
}

