/**
 * LoginSelector - First-time login method selection
 * Dynamically renders login options based on available providers from product.json
 */

import { useState, useEffect } from 'react'
import { Globe, ChevronDown, ChevronRight, MessageSquare, Wrench, Key, Cloud, Server, Shield, Lock, Zap, LogIn, User, Github, type LucideIcon } from 'lucide-react'
import { useTranslation, getCurrentLanguage } from '../../i18n'
import { api } from '../../api'

/**
 * Localized text - either a simple string or object with language codes
 */
type LocalizedText = string | Record<string, string>

/**
 * Provider configuration from backend
 */
interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  description: LocalizedText
  icon: string
  iconBgColor: string  // Hex color like #24292e
  recommended: boolean
  enabled: boolean
}

/**
 * Get localized text based on current language
 * Supports both string and { "en": "...", "zh-CN": "..." } formats
 */
function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') {
    return value
  }
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

interface LoginSelectorProps {
  onSelectProvider: (providerType: string) => void
  onSelectCustom: () => void
}

/**
 * Map icon names to Lucide components
 * Supported icons: log-in, user, globe, key, cloud, server, shield, lock, zap, message-square, wrench
 */
const iconMap: Record<string, LucideIcon> = {
  'log-in': LogIn,
  'user': User,
  'globe': Globe,
  'key': Key,
  'cloud': Cloud,
  'server': Server,
  'shield': Shield,
  'lock': Lock,
  'zap': Zap,
  'message-square': MessageSquare,
  'wrench': Wrench,
  'github': Github
}

/**
 * Convert hex color to RGBA with opacity
 */
function hexToRgba(hex: string, alpha: number = 0.15): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return `rgba(128, 128, 128, ${alpha})`
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
}

export function LoginSelector({ onSelectProvider, onSelectCustom }: LoginSelectorProps) {
  const { t } = useTranslation()

  // Providers state
  const [providers, setProviders] = useState<AuthProviderConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch available providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const result = await api.authGetProviders()
        if (result.success && result.data) {
          setProviders(result.data as AuthProviderConfig[])
        } else {
          // Fallback to default providers if fetch fails
          setProviders([
            {
              type: 'custom',
              displayName: { en: 'Custom API', 'zh-CN': '自定义 API' },
              description: { en: 'Use your own API Key', 'zh-CN': '使用自己的 API Key' },
              icon: 'wrench',
              iconBgColor: '#da7756',
              recommended: true,
              enabled: true
            }
          ])
        }
      } catch (error) {
        console.error('[LoginSelector] Failed to fetch providers:', error)
        // Fallback
        setProviders([
          {
            type: 'custom',
            displayName: { en: 'Custom API', 'zh-CN': '自定义 API' },
            description: { en: 'Use your own API Key', 'zh-CN': '使用自己的 API Key' },
            icon: 'wrench',
            iconBgColor: '#da7756',
            recommended: true,
            enabled: true
          }
        ])
      } finally {
        setIsLoading(false)
      }
    }

    fetchProviders()
  }, [])

  // Handle provider selection
  const handleProviderSelect = (provider: AuthProviderConfig) => {
    if (provider.type === 'custom') {
      onSelectCustom()
    } else {
      onSelectProvider(provider.type)
    }
  }

  // Get icon component for a provider
  const getIcon = (iconName: string): LucideIcon => {
    return iconMap[iconName] || Wrench
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8 relative">
      {/* Header with Logo */}
      <div className="flex flex-col items-center mb-10">
        {/* Logo with brand glow effect */}
        <div className="w-20 h-20 rounded-full border-2 border-primary/60 flex items-center justify-center brand-glow">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-transparent" />
        </div>
        <h1 className="mt-4 text-3xl font-light tracking-wide">Project4</h1>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        <h2 className="text-center text-lg mb-8 text-muted-foreground">
          {t('Select AI Login Method')}
        </h2>

        {/* Login options */}
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeleton
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="w-full p-5 bg-card rounded-xl border border-border animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary" />
                    <div className="flex-1">
                      <div className="h-4 bg-secondary rounded w-32 mb-2" />
                      <div className="h-3 bg-secondary rounded w-48" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Dynamic provider cards
            providers.map((provider) => {
              const IconComponent = getIcon(provider.icon)
              const bgColor = hexToRgba(provider.iconBgColor, 0.15)
              const textColor = provider.iconBgColor

              return (
                <button
                  key={provider.type}
                  onClick={() => handleProviderSelect(provider)}
                  className="w-full p-5 bg-card rounded-xl border border-border hover:border-primary/50 hover:bg-card/80 transition-all duration-200 group text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: bgColor }}
                      >
                        <IconComponent className="w-5 h-5" style={{ color: textColor }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{getLocalizedText(provider.displayName)}</span>
                          {provider.recommended && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                              {t('Recommended')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {getLocalizedText(provider.description)}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
