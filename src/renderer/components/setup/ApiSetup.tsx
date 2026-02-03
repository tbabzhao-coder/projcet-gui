/**
 * API Setup - Custom API configuration
 * No validation - just save and enter, errors will show on first chat
 * Includes language selector for first-time users
 * Now supports back button for multi-source login flow
 */

import { useState } from 'react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { Lightbulb } from '../icons/ToolIcons'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { DEFAULT_MODEL } from '../../../shared/types/ai-sources'
import { useTranslation } from '../../i18n'

interface ApiSetupProps {
  /** Called when user clicks back button */
  onBack?: () => void
  /** Whether to show the back button */
  showBack?: boolean
}

export function ApiSetup({ onBack, showBack = false }: ApiSetupProps) {
  const { t } = useTranslation()
  const { config, setConfig, setView } = useAppStore()

  // Determine initial values - for anthropic, always use our defaults unless user has saved custom values
  const initialProvider = config?.api?.provider || 'anthropic'
  const hasUserSavedConfig = !!config?.api?.apiKey // If user has saved API key, respect their settings

  const getInitialApiUrl = () => {
    if (hasUserSavedConfig && config?.api?.apiUrl) {
      return config.api.apiUrl
    }
    return initialProvider === 'anthropic' ? 'https://code.ppchat.vip/' : 'https://api.openai.com'
  }

  const getInitialModel = () => {
    if (hasUserSavedConfig && config?.api?.model) {
      return config.api.model
    }
    return initialProvider === 'anthropic' ? DEFAULT_MODEL : 'gpt-4o-mini'
  }

  // Form state
  const [provider, setProvider] = useState(initialProvider)
  const [apiKey, setApiKey] = useState(config?.api?.apiKey || '')
  const [apiUrl, setApiUrl] = useState(getInitialApiUrl())
  const [model, setModel] = useState(getInitialModel())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // API Key visibility
  const [showApiKey, setShowApiKey] = useState(false)

  const handleProviderChange = (next: string) => {
    setProvider(next as any)
    setError(null)

    if (next === 'anthropic') {
      // Claude - set defaults
      setApiUrl('https://code.ppchat.vip/')
      setModel(DEFAULT_MODEL)
    } else if (next === 'openai') {
      // OpenAI compatible
      setApiUrl('https://api.openai.com')
      setModel('gpt-4o-mini')
    }
  }

  // Handle save and enter
  const handleSaveAndEnter = async () => {
    if (!apiKey.trim()) {
      setError(t('Please enter API Key'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Save config with new aiSources structure
      const customConfig = {
        provider: provider as 'anthropic' | 'openai',
        apiKey,
        apiUrl: apiUrl || 'https://code.ppchat.vip/',
        model
      }

      const newConfig = {
        ...config,
        // Legacy api field for backward compatibility
        api: customConfig,
        // New aiSources structure
        aiSources: {
          current: 'custom' as const,
          custom: customConfig
        },
        isFirstLaunch: false
      }

      await api.setConfig(newConfig)
      setConfig(newConfig as any)

      // Enter Project4
      setView('home')
    } catch (err) {
      setError(t('Save failed, please try again'))
      setIsSaving(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8 relative overflow-auto">
      {/* Back Button - Top Left (when showBack is true) */}
      {showBack && onBack && (
        <div className="absolute top-6 left-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        {/* Logo */}
        <div className="w-16 h-16 rounded-full border-2 border-primary/60 flex items-center justify-center brand-glow">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-transparent" />
        </div>
        <h1 className="mt-4 text-2xl font-light">Project4</h1>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        <h2 className="text-center text-lg mb-6">
          {showBack ? t('Configure Custom API') : t('Before you start, configure your AI')}
        </h2>

        <div className="bg-card rounded-xl p-6 border border-border">
          {/* Provider */}
          <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-secondary/50 rounded-lg">
            <div className="w-8 h-8 rounded-lg bg-[#da7756]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#da7756]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.709 15.955l4.72-2.647.08-.08 2.726-1.529.08-.08 6.206-3.48a.25.25 0 00.125-.216V6.177a.25.25 0 00-.375-.217l-6.206 3.48-.08.08-2.726 1.53-.08.079-4.72 2.647a.25.25 0 00-.125.217v1.746c0 .18.193.294.354.216h.001zm13.937-3.584l-4.72 2.647-.08.08-2.726 1.529-.08.08-6.206 3.48a.25.25 0 00-.125.216v1.746a.25.25 0 00.375.217l6.206-3.48.08-.08 2.726-1.53.08-.079 4.72-2.647a.25.25 0 00.125-.217v-1.746a.25.25 0 00-.375-.216z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm">
                {provider === 'anthropic'
                  ? t('Claude (Recommended)')
                  : t('OpenAI Compatible')}
              </p>
              <p className="text-xs text-muted-foreground">
                {provider === 'openai'
                  ? t('Support OpenAI/compatible models via local protocol conversion')
                  : t('Connect directly to Anthropic official or compatible proxy')}
              </p>
            </div>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="px-3 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors text-sm"
            >
              <option value="anthropic">{t('Claude (Recommended)')}</option>
              <option value="openai">{t('OpenAI Compatible')}</option>
            </select>
          </div>

          {/* API Key input */}
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-xxxxxxxxxxxxx' : 'sk-ant-xxxxxxxxxxxxx'}
                className="w-full px-4 py-2 pr-12 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* API URL input */}
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">{t('API URL (optional)')}</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={provider === 'openai' ? 'https://api.openai.com or https://xx/v1' : 'https://code.ppchat.vip/'}
              className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {provider === 'openai'
                ? t('Enter OpenAI compatible service URL (supports /v1/chat/completions)')
                : t('Default official URL, modify for custom proxy')}
            </p>
          </div>

          {/* Model - Simple input for both providers */}
          <div className="mb-2">
            <label className="block text-sm text-muted-foreground mb-2">{t('Model')}</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'openai' ? 'gpt-4o-mini' : 'claude-opus-4-5-20251101'}
              className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {provider === 'openai'
                ? t('Enter OpenAI compatible service model name')
                : t('Enter Claude model name')}
            </p>
          </div>
        </div>

        {/* Help link */}
        <p className="text-center mt-4 text-sm text-muted-foreground">
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary cursor-pointer hover:underline inline-flex items-center gap-1"
          >
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            {t("Don't know how to get it? View tutorial")}
          </a>
        </p>

        {/* Error message */}
        {error && (
          <p className="text-center mt-4 text-sm text-red-500">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSaveAndEnter}
          disabled={isSaving}
          className="w-full mt-6 px-8 py-3 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50"
        >
          {isSaving ? t('Saving...') : t('Save and enter')}
        </button>
      </div>
    </div>
  )
}
