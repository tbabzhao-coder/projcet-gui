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
 * Available AI Source Types
 * 'oauth' - OAuth-based providers (loaded from your oauth providers)
 * 'custom' - User's own API key
 */
export type AISourceType = 'oauth' | 'custom' | string;
/**
 * Provider types for custom API
 */
export type ApiProvider = 'anthropic' | 'openai';
/**
 * Login status for OAuth-based sources
 */
export type LoginStatus = 'idle' | 'starting' | 'waiting' | 'completing' | 'success' | 'error';
/**
 * Model option for UI display
 */
export interface ModelOption {
    id: string;
    name: string;
    description: string;
}
/**
 * Available Claude models
 */
export declare const AVAILABLE_MODELS: ModelOption[];
export declare const DEFAULT_MODEL = "claude-opus-4-5-20251101";
/**
 * User info from OAuth provider
 */
export interface AISourceUserInfo {
    name: string;
    avatar?: string;
}
/**
 * Base configuration that all sources share
 */
export interface AISourceBaseConfig {
    model: string;
}
/**
 * OAuth source configuration (generic for any OAuth provider)
 * Stored securely, only essential data exposed to renderer
 */
export interface OAuthSourceConfig extends AISourceBaseConfig {
    loggedIn: boolean;
    user?: AISourceUserInfo;
    availableModels: string[];
    accessToken?: string;
    refreshToken?: string;
    tokenExpires?: number;
}
/**
 * Custom API source configuration
 */
export interface CustomSourceConfig extends AISourceBaseConfig {
    provider: ApiProvider;
    apiKey: string;
    apiUrl: string;
}
/**
 * Combined AI Sources configuration
 */
export interface AISourcesConfig {
    current: AISourceType;
    oauth?: OAuthSourceConfig;
    custom?: CustomSourceConfig;
    [key: string]: AISourceType | OAuthSourceConfig | CustomSourceConfig | undefined;
}
/**
 * Configuration for making API requests
 * Used by OpenAI compat router
 */
export interface BackendRequestConfig {
    url: string;
    key: string;
    model?: string;
    headers?: Record<string, string>;
    apiType?: 'chat_completions' | 'responses';
}
/**
 * OAuth login state tracking
 */
export interface OAuthLoginState {
    status: LoginStatus;
    state?: string;
    error?: string;
}
/**
 * Result from starting an OAuth login flow
 */
export interface OAuthStartResult {
    loginUrl: string;
    state: string;
}
/**
 * Result from completing an OAuth login flow
 */
export interface OAuthCompleteResult {
    success: boolean;
    user?: AISourceUserInfo;
    error?: string;
}
/**
 * Check if any AI source is configured and ready to use
 */
export declare function hasAnyAISource(aiSources: AISourcesConfig): boolean;
/**
 * Check if a specific source is configured
 */
export declare function isSourceConfigured(aiSources: AISourcesConfig, source: AISourceType): boolean;
/**
 * Get display name for current model
 */
export declare function getCurrentModelName(aiSources: AISourcesConfig): string;
/**
 * Get available models for a source
 */
export declare function getAvailableModels(aiSources: AISourcesConfig, source: AISourceType): string[];
