/**
 * Custom AI Source Provider
 *
 * Handles custom API configuration (Anthropic Claude or OpenAI compatible).
 * This is the simplest provider - no OAuth, just API key configuration.
 *
 * Design Notes:
 * - Stateless: all state comes from config
 * - No authentication flow needed
 * - Supports both Anthropic and OpenAI compatible endpoints
 */

import type {
  AISourceProvider,
  ProviderResult
} from '../../../../shared/interfaces'
import type {
  AISourceType,
  AISourcesConfig,
  BackendRequestConfig,
  CustomSourceConfig
} from '../../../../shared/types'
import { AVAILABLE_MODELS } from '../../../../shared/types'

/**
 * Anthropic API base URL
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com'

/**
 * Custom AI Source Provider Implementation
 */
export class CustomAISourceProvider implements AISourceProvider {
  readonly type: AISourceType = 'custom'
  readonly displayName = 'Custom API'

  /**
   * Check if custom API is configured
   * Supports both 'custom' and 'custom_xxx' format sources
   */
  isConfigured(config: AISourcesConfig): boolean {
    const currentSource = config.current || 'custom'

    console.log('[CustomProvider] isConfigured called, currentSource:', currentSource)

    // Check if current source is a custom source
    if (currentSource === 'custom') {
      const hasKey = !!(config.custom?.apiKey)
      console.log('[CustomProvider] Checking custom source, hasKey:', hasKey)
      if (config.custom?.apiKey) {
        const key = config.custom.apiKey
        console.log('[CustomProvider] custom.apiKey:', key.substring(0, 10) + '...' + key.substring(key.length - 10))
      }
      return hasKey
    }

    if (currentSource.startsWith('custom_')) {
      const customConfig = config[currentSource] as CustomSourceConfig | undefined
      const hasKey = !!(customConfig?.apiKey)
      console.log('[CustomProvider] Checking custom_xxx source, hasKey:', hasKey)
      return hasKey
    }

    console.log('[CustomProvider] Not a custom source')
    return false
  }

  /**
   * Get backend request configuration
   * Supports both 'custom' and 'custom_xxx' format sources
   */
  getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
    const currentSource = config.current || 'custom'

    console.log('[CustomProvider] ========== getBackendConfig START ==========')
    console.log('[CustomProvider] currentSource:', currentSource)

    // Get custom config from current source (supports both 'custom' and 'custom_xxx')
    let customConfig: CustomSourceConfig | undefined

    if (currentSource === 'custom') {
      customConfig = config.custom
      console.log('[CustomProvider] Using config.custom')
    } else if (currentSource.startsWith('custom_')) {
      customConfig = config[currentSource] as CustomSourceConfig | undefined
      console.log('[CustomProvider] Using config[' + currentSource + ']')
    }

    if (!customConfig) {
      console.log('[CustomProvider] ❌ customConfig is NULL or UNDEFINED')
      return null
    }

    console.log('[CustomProvider] customConfig found:')
    console.log('[CustomProvider]   - provider:', customConfig.provider)
    console.log('[CustomProvider]   - apiUrl:', customConfig.apiUrl)
    console.log('[CustomProvider]   - model:', customConfig.model)

    if (!customConfig.apiKey) {
      console.log('[CustomProvider] ❌ customConfig.apiKey is NULL or UNDEFINED')
      return null
    }

    const key = customConfig.apiKey
    console.log('[CustomProvider]   - apiKey:', key.substring(0, 10) + '...' + key.substring(key.length - 10))

    const isAnthropic = customConfig.provider === 'anthropic'
    const baseUrl = customConfig.apiUrl || ANTHROPIC_API_URL

    console.log(`[CustomProvider] provider: ${customConfig.provider}, isAnthropic: ${isAnthropic}, baseUrl: ${baseUrl}`)

    // Remove trailing slash from base URL if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')

    // Trim whitespace from URL (fix for leading/trailing spaces)
    const trimmedUrl = cleanBaseUrl.trim()

    if (trimmedUrl !== cleanBaseUrl) {
      console.log('[CustomProvider] ⚠️  WARNING: URL had whitespace! Original:', JSON.stringify(cleanBaseUrl))
      console.log('[CustomProvider] ⚠️  WARNING: Trimmed URL:', JSON.stringify(trimmedUrl))
    }

    // Return URL as-is - user provides the complete endpoint URL
    // For Anthropic: base URL only (SDK will add /v1/messages)
    // For OpenAI compatible: user should provide full endpoint like https://api.example.com/v1/chat/completions
    const result = {
      url: trimmedUrl,
      key: customConfig.apiKey,
      model: customConfig.model,
      // For OpenAI compatible, infer API type from URL
      apiType: isAnthropic ? undefined : this.inferApiTypeFromUrl(trimmedUrl)
    }

    console.log(`[CustomProvider] ✅ Returning backend config:`)
    console.log(`[CustomProvider]   - url: ${result.url}`)
    console.log(`[CustomProvider]   - key: ${result.key.substring(0, 10)}...${result.key.substring(result.key.length - 10)}`)
    console.log(`[CustomProvider]   - model: ${result.model}`)
    console.log(`[CustomProvider]   - apiType: ${result.apiType}`)
    console.log('[CustomProvider] ========== getBackendConfig END ==========')

    return result
  }

  /**
   * Infer API type from URL
   */
  private inferApiTypeFromUrl(url: string): 'chat_completions' | 'responses' {
    if (url.includes('/responses')) return 'responses'
    // Default to chat_completions (most common for third-party providers)
    return 'chat_completions'
  }

  /**
   * Get current model ID
   * Supports both 'custom' and 'custom_xxx' format sources
   */
  getCurrentModel(config: AISourcesConfig): string | null {
    const currentSource = config.current || 'custom'
    
    if (currentSource === 'custom') {
      return config.custom?.model || null
    }
    
    if (currentSource.startsWith('custom_')) {
      const customConfig = config[currentSource] as CustomSourceConfig | undefined
      return customConfig?.model || null
    }
    
    return null
  }

  /**
   * Get available models - returns static list for custom API
   * Supports both 'custom' and 'custom_xxx' format sources
   */
  async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
    const currentSource = config.current || 'custom'
    
    let customConfig: CustomSourceConfig | undefined
    
    if (currentSource === 'custom') {
      customConfig = config.custom
    } else if (currentSource.startsWith('custom_')) {
      customConfig = config[currentSource] as CustomSourceConfig | undefined
    }
    
    if (!customConfig) {
      return []
    }

    // For Anthropic provider, return known Claude models
    if (customConfig.provider === 'anthropic') {
      return AVAILABLE_MODELS.map(m => m.id)
    }

    // For OpenAI compatible, return availableModels if configured, otherwise empty
    return customConfig.availableModels || []
  }

  /**
   * No refresh needed for custom API
   */
  async refreshConfig(_config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
    // Custom API doesn't need refresh - configuration is static
    return { success: true, data: {} }
  }
}

/**
 * Singleton instance
 */
let instance: CustomAISourceProvider | null = null

/**
 * Get the CustomAISourceProvider instance
 */
export function getCustomProvider(): CustomAISourceProvider {
  if (!instance) {
    instance = new CustomAISourceProvider()
  }
  return instance
}
