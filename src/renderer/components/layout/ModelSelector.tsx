/**
 * ModelSelector - Dropdown for selecting AI model in header
 * - Desktop: Dropdown menu from button
 * - Mobile: Bottom sheet for better touch interaction
 *
 * Design: Dynamic rendering based on config - no hardcoded provider names
 * OAuth providers are loaded from product.json configuration
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Sparkles, X, Check } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import {
  AVAILABLE_MODELS,
  getCurrentModelName,
  type AppConfig,
  type AISourceType,
  type OAuthSourceConfig
} from '../../types'
import { useTranslation, getCurrentLanguage } from '../../i18n'
import { useIsMobile } from '../../hooks/useIsMobile'

/**
 * Localized text - either a simple string or object with language codes
 */
type LocalizedText = string | Record<string, string>

// Provider config from authGetProviders
interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  enabled: boolean
}

/**
 * Get localized text based on current language
 */
function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') {
    return value
  }
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

export function ModelSelector() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { config, setConfig, setView } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load auth providers from config
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
  }, [])

  // State for expanded sections (accordion)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // Initialize expanded section to current source when opening
  useEffect(() => {
    if (isOpen) {
      setExpandedSection(config?.aiSources?.current || null)
    }
  }, [isOpen, config?.aiSources?.current])

  const toggleSection = (sectionKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedSection(prev => prev === sectionKey ? null : sectionKey)
  }

  // Close dropdown when clicking outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the click event that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleClose = () => {
    if (isMobile) {
      setIsAnimatingOut(true)
      setTimeout(() => {
        setIsOpen(false)
        setIsAnimatingOut(false)
      }, 200)
    } else {
      setIsOpen(false)
    }
  }

  if (!config) return null

  const aiSources = config.aiSources || { current: 'custom' as AISourceType }

  const currentSource = aiSources.current
  const hasCustom = !!(aiSources.custom?.apiKey)
  const isCustomAnthropic = aiSources.custom?.provider === 'anthropic'

  // Get logged-in OAuth providers dynamically
  const loggedInOAuthProviders = authProviders
    .filter(p => p.type !== 'custom' && p.enabled)
    .map(p => {
      const providerConfig = aiSources[p.type] as OAuthSourceConfig | undefined
      return {
        type: p.type,
        displayName: getLocalizedText(p.displayName),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Get current model display name
  const currentModelName = getCurrentModelName(config)

  // Handle model selection for any provider
  const handleSelectModel = async (source: AISourceType, modelId: string) => {
    const newAiSources = {
      ...aiSources,
      current: source
    }

    // Get current provider config
    const providerConfig = aiSources[source] as OAuthSourceConfig | undefined

    if (source === 'custom' && aiSources.custom) {
      newAiSources.custom = {
        ...aiSources.custom,
        model: modelId
      }
      // Also update legacy api field
      ;(config as any).api = {
        ...config.api,
        model: modelId
      }
    } else if (source.startsWith('custom_')) {
      // Multi custom sources
      newAiSources[source] = {
        ...(aiSources[source] as any),
        model: modelId
      }
    } else if (providerConfig) {
      // OAuth provider - update dynamically
      newAiSources[source] = {
        ...providerConfig,
        model: modelId
      }
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as AppConfig)
    handleClose()
  }

  // Handle switching source only (keeps last selected model for that source)
  const handleSwitchSource = async (source: AISourceType, e: React.MouseEvent) => {
    e.stopPropagation()

    if (aiSources.current === source) return

    const newAiSources = {
      ...aiSources,
      current: source
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as AppConfig)
    handleClose()
  }

  // Handle add source
  const handleAddSource = () => {
    handleClose()
    setView('settings')
  }

  // Shared model list content with accordion support
  const renderModelList = () => (
    <>
      {/* Custom API Sections - Iterate all custom sources */}
      {Object.keys(aiSources)
        .filter(key => key === 'custom' || key.startsWith('custom_') || (aiSources[key] as any)?.type === 'custom')
        .sort((a, b) => (a === 'custom' ? -1 : b === 'custom' ? 1 : a.localeCompare(b)))
        .map(key => {
          const sourceConfig = aiSources[key] as any
          if (!sourceConfig || !sourceConfig.apiKey) return null

          const isAnthropic = sourceConfig.provider === 'anthropic'
          const groupName = sourceConfig.name || (isAnthropic ? 'Claude API' : t('Custom API'))
          const isExpanded = expandedSection === key
          const isActiveSource = currentSource === key

          return (
            <div key={key}>
              <div
                className={`px-3 py-2 text-xs font-medium flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isActiveSource ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={(e) => toggleSection(key, e)}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  <span>{groupName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isActiveSource ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" title={t('Active')} />
                  ) : (
                    <button
                      onClick={(e) => handleSwitchSource(key as AISourceType, e)}
                      className="w-2.5 h-2.5 rounded-full border border-muted-foreground hover:border-primary hover:bg-primary/20 transition-colors"
                      title={t('Switch to this source')}
                    />
                  )}
                  {key === 'custom' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAddSource() }}
                      className="text-xs text-muted-foreground hover:text-foreground p-0.5 ml-1"
                      title={t('Add source')}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-secondary/10 pb-1">
                  {isAnthropic ? (
                    AVAILABLE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleSelectModel(key as AISourceType, model.id)}
                        className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                          isActiveSource && sourceConfig.model === model.id
                            ? 'text-primary'
                            : 'text-foreground'
                        }`}
                      >
                        {isActiveSource && sourceConfig.model === model.id ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                        {model.name}
                      </button>
                    ))
                  ) : (
                    <>
                      {(sourceConfig.availableModels && sourceConfig.availableModels.length > 0) ? (
                        sourceConfig.availableModels.map((modelId: string) => (
                          <button
                            key={modelId}
                            onClick={() => handleSelectModel(key as AISourceType, modelId)}
                            className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                              isActiveSource && sourceConfig.model === modelId
                                ? 'text-primary'
                                : 'text-foreground'
                            }`}
                          >
                            {isActiveSource && sourceConfig.model === modelId ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                            {modelId}
                          </button>
                        ))
                      ) : (
                        <button
                          onClick={() => handleClose()}
                          className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${isActiveSource ? 'text-primary' : 'text-foreground'}`}
                        >
                          {isActiveSource ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                          {sourceConfig.model || 'Custom Model'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="border-t border-border/50" />
            </div>
          )
        })}

      {/* OAuth Providers - Dynamic rendering with accordion */}
      {loggedInOAuthProviders.map((provider) => {
        const isExpanded = expandedSection === provider.type
        const isActiveSource = currentSource === provider.type

        return (
          <div key={provider.type}>
            <div
              className={`px-3 py-2 text-xs font-medium flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isActiveSource ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={(e) => toggleSection(provider.type, e)}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                <span>{provider.displayName}</span>
              </div>
              <div className="flex items-center gap-2">
                {isActiveSource ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" title={t('Active')} />
                ) : (
                  <button
                    onClick={(e) => handleSwitchSource(provider.type, e)}
                    className="w-2.5 h-2.5 rounded-full border border-muted-foreground hover:border-primary hover:bg-primary/20 transition-colors"
                    title={t('Switch to this source')}
                  />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="bg-secondary/10 pb-1">
                {(provider.config?.availableModels || []).map((modelId) => {
                  const displayName = provider.config?.modelNames?.[modelId] || modelId
                  const isSelected = isActiveSource && provider.config?.model === modelId
                  return (
                    <button
                      key={modelId}
                      onClick={() => handleSelectModel(provider.type, modelId)}
                      className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                        isSelected ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {isSelected ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                      {displayName}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="border-t border-border/50" />
          </div>
        )
      })}

      {/* Add source if none configured */}
      {!hasCustom && loggedInOAuthProviders.length === 0 && (
        <>
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleAddSource}
            className="w-full px-3 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add Custom API')}
          </button>
        </>
      )}
    </>
  )

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button - icon only on mobile, text on desktop */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
        title={currentModelName}
      >
        {/* Mobile: show Sparkles icon */}
        <Sparkles className="w-4 h-4 sm:hidden" />
        {/* Desktop: show model name */}
        <span className="hidden sm:inline max-w-[140px] truncate">{currentModelName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown/Bottom Sheet */}
      {isOpen && (
        <>
          {isMobile ? (
            /* Mobile: Bottom Sheet */
            <>
              {/* Backdrop */}
              <div
                onClick={handleClose}
                className={`fixed inset-0 bg-black/40 z-40 ${isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'}`}
                style={{ animationDuration: '0.2s' }}
              />

              <div
                className={`
                  fixed inset-x-0 bottom-0 z-50
                  bg-card rounded-t-2xl border-t border-border/50
                  shadow-2xl overflow-hidden
                  ${isAnimatingOut ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}
                `}
                style={{ maxHeight: '60vh' }}
              >
                {/* Drag handle */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{t('Select Model')}</h3>
                      <p className="text-xs text-muted-foreground">{currentModelName}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Model list */}
                <div className="overflow-auto" style={{ maxHeight: 'calc(60vh - 80px)' }}>
                  {renderModelList()}
                </div>
              </div>
            </>
          ) : (
            /* Desktop: Dropdown Menu */
            <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-lg z-50 py-1 max-h-[60vh] overflow-y-auto">
              {renderModelList()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
