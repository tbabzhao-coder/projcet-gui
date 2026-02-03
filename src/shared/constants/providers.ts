/**
 * Built-in LLM Providers Configuration
 *
 * This module defines all built-in AI providers that Project4 supports out of the box.
 * Users can select these providers and only need to enter their API key.
 *
 * Based on: 2026 Global Top LLM Providers (OpenAI Compatible Version)
 *
 * Design Principles:
 * - All providers support OpenAI-compatible chat/completions API
 * - Anthropic is the only exception (native Claude API)
 * - Providers are organized by region (China / Overseas)
 * - Each provider has a default model list that can be fetched dynamically
 */

import type { AuthType, ModelOption, ProviderId } from '../types/ai-sources'

// ============================================================================
// Provider Configuration Interface
// ============================================================================

/**
 * Built-in provider configuration
 */
export interface BuiltinProvider {
  /** Provider ID (unique identifier) */
  id: ProviderId
  /** Display name */
  name: string
  /** Authentication method */
  authType: AuthType
  /** Default API endpoint URL (base URL) */
  apiUrl: string
  /** API type for OpenAI compatible (default: chat_completions) */
  apiType?: 'chat_completions' | 'responses'
  /** Models list endpoint (for dynamic fetching) */
  modelsUrl?: string
  /** Pre-configured model list */
  models: ModelOption[]
  /** Provider description */
  description?: string
  /** Official website */
  website?: string
  /** Region: 'cn' for China, 'global' for overseas */
  region: 'cn' | 'global'
  /** Whether this provider is recommended */
  recommended?: boolean
  /** Icon name (lucide icon) */
  icon?: string
  /** Special notes for this provider */
  notes?: string
}

// ============================================================================
// Built-in Providers List
// ============================================================================

/**
 * All built-in providers
 * Organized by: Protocol entries first (Claude/OpenAI Compatible), then presets by region
 */
export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  // ============================================================================
  // Protocol Entries (Top 2 - Always visible, support custom URL)
  // ============================================================================
  {
    id: 'anthropic',
    name: 'Claude (Recommended)',
    authType: 'api-key',
    apiUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }
    ],
    description: 'Anthropic official or compatible proxy',
    website: 'https://console.anthropic.com/',
    region: 'global',
    recommended: true,
    icon: 'brain'
  },
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    authType: 'api-key',
    apiUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o1', name: 'o1' },
      { id: 'o1-mini', name: 'o1-mini' }
    ],
    description: 'OpenAI or any compatible API endpoint',
    website: 'https://platform.openai.com/',
    region: 'global',
    recommended: true,
    icon: 'bot'
  },

  // ============================================================================
  // China Region Providers (Presets)
  // ============================================================================
  {
    id: 'deepseek',
    name: 'DeepSeek',
    authType: 'api-key',
    apiUrl: 'https://api.deepseek.com',
    modelsUrl: 'https://api.deepseek.com/models',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3.2)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' }
    ],
    description: 'DeepSeek official API with V3.2 and R1 reasoning model',
    website: 'https://platform.deepseek.com/',
    region: 'cn',
    recommended: true,
    icon: 'search',
    notes: 'R1 model returns reasoning_content field for chain of thought'
  },

  // ============================================================================
  // OAuth Providers
  // ============================================================================
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    authType: 'oauth',
    apiUrl: 'https://api.githubcopilot.com',
    models: [], // Fetched dynamically after OAuth login
    description: 'Login with GitHub account',
    website: 'https://github.com/features/copilot',
    region: 'global',
    icon: 'github'
  },

]

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get provider by ID
 */
export function getBuiltinProvider(id: ProviderId): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS.find(p => p.id === id)
}

/**
 * Check if a provider ID is built-in
 */
export function isBuiltinProvider(id: string): boolean {
  return BUILTIN_PROVIDERS.some(p => p.id === id)
}

/**
 * Get all recommended providers
 */
export function getRecommendedProviders(): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.recommended)
}

/**
 * Get providers by region
 */
export function getProvidersByRegion(region: 'cn' | 'global'): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.region === region)
}

/**
 * Get all API-key based providers (exclude OAuth)
 */
export function getApiKeyProviders(): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.authType === 'api-key')
}

/**
 * Get provider display info for UI
 */
export function getProviderDisplayInfo(id: ProviderId): {
  name: string
  icon: string
  description: string
} {
  const provider = getBuiltinProvider(id)
  if (provider) {
    return {
      name: provider.name,
      icon: provider.icon || 'server',
      description: provider.description || ''
    }
  }
  return {
    name: id,
    icon: 'server',
    description: ''
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(id: ProviderId): string | undefined {
  const provider = getBuiltinProvider(id)
  return provider?.models[0]?.id
}

/**
 * Check if provider requires OAuth
 */
export function isOAuthProvider(id: ProviderId): boolean {
  const provider = getBuiltinProvider(id)
  return provider?.authType === 'oauth'
}

/**
 * Check if provider is Anthropic (uses native API, not OpenAI-compat)
 */
export function isAnthropicProvider(id: ProviderId): boolean {
  return id === 'anthropic'
}

/**
 * Get all provider IDs
 */
export function getAllProviderIds(): ProviderId[] {
  return BUILTIN_PROVIDERS.map(p => p.id)
}
