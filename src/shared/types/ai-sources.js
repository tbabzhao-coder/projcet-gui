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
/**
 * Available Claude models
 */
export const AVAILABLE_MODELS = [
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
];
export const DEFAULT_MODEL = 'claude-opus-4-5-20251101';
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Check if any AI source is configured and ready to use
 */
export function hasAnyAISource(aiSources) {
    const hasOAuth = aiSources.oauth?.loggedIn === true;
    const hasCustom = !!(aiSources.custom?.apiKey);
    return hasOAuth || hasCustom;
}
/**
 * Check if a specific source is configured
 */
export function isSourceConfigured(aiSources, source) {
    if (source === 'oauth') {
        return aiSources.oauth?.loggedIn === true;
    }
    if (source === 'custom') {
        return !!(aiSources.custom?.apiKey);
    }
    // Check dynamic provider
    const config = aiSources[source];
    if (config && typeof config === 'object' && 'loggedIn' in config) {
        return config.loggedIn === true;
    }
    return false;
}
/**
 * Get display name for current model
 */
export function getCurrentModelName(aiSources) {
    if (aiSources.current === 'custom' && aiSources.custom) {
        const model = AVAILABLE_MODELS.find(m => m.id === aiSources.custom?.model);
        return model?.name || aiSources.custom.model;
    }
    // For OAuth or dynamic providers
    const currentConfig = aiSources[aiSources.current];
    if (currentConfig && typeof currentConfig === 'object' && 'model' in currentConfig) {
        return currentConfig.model || 'Default';
    }
    return 'No model';
}
/**
 * Get available models for a source
 */
export function getAvailableModels(aiSources, source) {
    if (source === 'custom') {
        return AVAILABLE_MODELS.map(m => m.id);
    }
    // For OAuth or dynamic providers
    const config = aiSources[source];
    if (config && typeof config === 'object' && 'availableModels' in config) {
        return config.availableModels || [];
    }
    return [];
}
