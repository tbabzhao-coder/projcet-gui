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
  getCurrentModelName,
  type AppConfig
} from '../../types'
import type { AISource, AISourcesConfig, ModelOption } from '../../../shared/types/ai-sources'
import { AVAILABLE_MODELS } from '../../../shared/types/ai-sources'
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

// Helper to get v2 aiSources config
function getAISourcesV2(config: AppConfig | null): AISourcesConfig {
  const aiSources = config?.aiSources as any
  if (aiSources?.version === 2 && Array.isArray(aiSources.sources)) {
    return aiSources as AISourcesConfig
  }
  // Return empty v2 config if not v2 format
  return { version: 2, currentId: null, sources: [] }
}

export function ModelSelector() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { config, setConfig, setView } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  // Get v2 aiSources
  const aiSourcesV2 = getAISourcesV2(config)

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
      setExpandedSection(aiSourcesV2.currentId || null)
    }
  }, [isOpen, aiSourcesV2.currentId])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && !isMobile && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right
      })
    }
  }, [isOpen, isMobile])

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

  // Get current model display name
  const currentModelName = getCurrentModelName(config)

  // Handle model selection (v2)
  const handleSelectModel = async (sourceId: string, modelId: string) => {
    const newSources = aiSourcesV2.sources.map(s =>
      s.id === sourceId ? { ...s, model: modelId, updatedAt: new Date().toISOString() } : s
    )
    const newAiSources: AISourcesConfig = {
      version: 2,
      currentId: sourceId,
      sources: newSources
    }

    const newConfig = { ...config, aiSources: newAiSources }
    await api.setConfig(newConfig)
    setConfig(newConfig as AppConfig)
    handleClose()
  }

  // Handle switching source only (v2)
  const handleSwitchSource = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (aiSourcesV2.currentId === sourceId) return

    const newAiSources: AISourcesConfig = {
      ...aiSourcesV2,
      currentId: sourceId
    }

    const newConfig = { ...config, aiSources: newAiSources }
    await api.setConfig(newConfig)
    setConfig(newConfig as AppConfig)
    handleClose()
  }

  // Handle add source
  const handleAddSource = () => {
    handleClose()
    setView('settings')
  }

  // Shared model list content (v2)
  const renderModelList = () => (
    <>
      {/* API Key Sources (v2) */}
      {aiSourcesV2.sources
        .filter(source => source.authType === 'api-key')
        .map(source => {
          const isExpanded = expandedSection === source.id
          const isActiveSource = aiSourcesV2.currentId === source.id
          const isAnthropic = source.provider === 'anthropic'
          const groupName = source.name || (isAnthropic ? 'Claude API' : t('Custom API'))

          return (
            <div key={source.id}>
              <div
                className={`px-3 py-2 text-xs font-medium flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isActiveSource ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={(e) => toggleSection(source.id, e)}
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
                      onClick={(e) => handleSwitchSource(source.id, e)}
                      className="w-2.5 h-2.5 rounded-full border border-muted-foreground hover:border-primary hover:bg-primary/20 transition-colors"
                      title={t('Switch to this source')}
                    />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-secondary/10 pb-1">
                  {isAnthropic ? (
                    AVAILABLE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleSelectModel(source.id, model.id)}
                        className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                          isActiveSource && source.model === model.id
                            ? 'text-primary'
                            : 'text-foreground'
                        }`}
                      >
                        {isActiveSource && source.model === model.id ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                        {model.name}
                      </button>
                    ))
                  ) : (
                    <>
                      {(source.availableModels && source.availableModels.length > 0) ? (
                        source.availableModels.map((modelOption: ModelOption) => (
                          <button
                            key={modelOption.id}
                            onClick={() => handleSelectModel(source.id, modelOption.id)}
                            className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                              isActiveSource && source.model === modelOption.id
                                ? 'text-primary'
                                : 'text-foreground'
                            }`}
                          >
                            {isActiveSource && source.model === modelOption.id ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                            {modelOption.name || modelOption.id}
                          </button>
                        ))
                      ) : (
                        <button
                          onClick={() => handleClose()}
                          className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${isActiveSource ? 'text-primary' : 'text-foreground'}`}
                        >
                          {isActiveSource ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                          {source.model || 'Custom Model'}
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

      {/* OAuth Sources (v2) */}
      {aiSourcesV2.sources
        .filter(source => source.authType === 'oauth')
        .map(source => {
          const isExpanded = expandedSection === source.id
          const isActiveSource = aiSourcesV2.currentId === source.id

          return (
            <div key={source.id}>
              <div
                className={`px-3 py-2 text-xs font-medium flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isActiveSource ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={(e) => toggleSection(source.id, e)}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  <span>{source.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isActiveSource ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" title={t('Active')} />
                  ) : (
                    <button
                      onClick={(e) => handleSwitchSource(source.id, e)}
                      className="w-2.5 h-2.5 rounded-full border border-muted-foreground hover:border-primary hover:bg-primary/20 transition-colors"
                      title={t('Switch to this source')}
                    />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-secondary/10 pb-1">
                  {(source.availableModels || []).map((modelOption: ModelOption) => {
                    const isSelected = isActiveSource && source.model === modelOption.id
                    return (
                      <button
                        key={modelOption.id}
                        onClick={() => handleSelectModel(source.id, modelOption.id)}
                        className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                          isSelected ? 'text-primary' : 'text-foreground'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                        {modelOption.name || modelOption.id}
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
      {aiSourcesV2.sources.length === 0 && (
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

      {/* Always show add button at bottom */}
      {aiSourcesV2.sources.length > 0 && (
        <>
          <button
            onClick={handleAddSource}
            className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            {t('Add source')}
          </button>
        </>
      )}
    </>
  )

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Display only - no dropdown */}
      <div
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-sm text-muted-foreground"
        title={currentModelName}
      >
        {/* Mobile: show Sparkles icon */}
        <Sparkles className="w-4 h-4 sm:hidden" />
        {/* Desktop: show model name */}
        <span className="hidden sm:inline max-w-[140px] truncate">{currentModelName}</span>
      </div>
    </div>
  )
}
