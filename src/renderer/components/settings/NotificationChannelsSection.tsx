/**
 * Notification Channels Section Component (通知渠道)
 *
 * Settings section for configuring external notification channels.
 * Supports: Email (SMTP), WeCom, DingTalk, Feishu, Webhook.
 *
 * Each channel has:
 * - Enable/disable toggle
 * - Configuration form (data-driven from field definitions)
 * - Test connection button
 *
 * Ported from upstream hello-halo-main MessageChannelsSection,
 * simplified to notification channels only (no IM channels).
 */

import { useState, useCallback, useRef } from 'react'
import {
  Mail, MessageSquare, Bell, Webhook, Loader2,
  CheckCircle, XCircle, ChevronDown,
} from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { useNotificationStore } from '../../stores/notification.store'
import type { AppConfig } from '../../types'
import { NOTIFICATION_CHANNEL_META } from '../../../shared/types/notification-channels'
import type {
  NotificationChannelType,
  NotificationChannelsConfig,
} from '../../../shared/types/notification-channels'

// ============================================
// Types
// ============================================

interface NotificationChannelsSectionProps {
  config: AppConfig | null
  setConfig: (config: AppConfig) => void
}

interface TestResult {
  success: boolean
  error?: string
}

/** Field descriptor for data-driven form rendering */
interface FieldDef {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'toggle' | 'select'
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  nested?: string
}

/** Notification channel definition */
interface NotifyChannelDef {
  id: string
  notifyType: NotificationChannelType
  icon: typeof Mail
  labelKey: string
  descriptionKey: string
  fields: FieldDef[]
  defaults: Record<string, unknown>
}

// ============================================
// Channel Definitions (data-driven)
// ============================================

const NOTIFY_CHANNEL_DEFS: NotifyChannelDef[] = [
  {
    id: 'email',
    notifyType: 'email',
    icon: Mail,
    labelKey: NOTIFICATION_CHANNEL_META.email.labelKey,
    descriptionKey: NOTIFICATION_CHANNEL_META.email.descriptionKey,
    fields: [
      { key: 'smtp.host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com', required: true, nested: 'smtp.host' },
      { key: 'smtp.port', label: 'SMTP Port', type: 'number', placeholder: '465', required: true, nested: 'smtp.port' },
      { key: 'smtp.secure', label: 'Use SSL/TLS', type: 'toggle', nested: 'smtp.secure' },
      { key: 'smtp.user', label: 'Username', type: 'text', placeholder: 'user@example.com', required: true, nested: 'smtp.user' },
      { key: 'smtp.password', label: 'Password', type: 'password', placeholder: 'App password', required: true, nested: 'smtp.password' },
      { key: 'defaultTo', label: 'Default Recipient', type: 'text', placeholder: 'recipient@example.com', required: true },
    ],
    defaults: { enabled: false, smtp: { host: '', port: 465, secure: true, user: '', password: '' }, defaultTo: '' },
  },
  {
    id: 'wecom',
    notifyType: 'wecom',
    icon: MessageSquare,
    labelKey: NOTIFICATION_CHANNEL_META.wecom.labelKey,
    descriptionKey: NOTIFICATION_CHANNEL_META.wecom.descriptionKey,
    fields: [
      { key: 'corpId', label: 'Corp ID', type: 'text', placeholder: 'ww...', required: true },
      { key: 'agentId', label: 'Agent ID', type: 'number', placeholder: '1000002', required: true },
      { key: 'secret', label: 'Secret', type: 'password', required: true },
      { key: 'defaultToUser', label: 'Default User ID', type: 'text', placeholder: 'userid (optional)' },
      { key: 'defaultToParty', label: 'Default Party ID', type: 'text', placeholder: 'party id (optional)' },
    ],
    defaults: { enabled: false, corpId: '', agentId: 0, secret: '', defaultToUser: '', defaultToParty: '' },
  },
  {
    id: 'dingtalk',
    notifyType: 'dingtalk',
    icon: Bell,
    labelKey: NOTIFICATION_CHANNEL_META.dingtalk.labelKey,
    descriptionKey: NOTIFICATION_CHANNEL_META.dingtalk.descriptionKey,
    fields: [
      { key: 'appKey', label: 'App Key', type: 'text', required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
      { key: 'agentId', label: 'Agent ID', type: 'number', required: true },
      { key: 'defaultChatId', label: 'Default Chat ID', type: 'text', placeholder: 'Group chat ID (optional)' },
      { key: 'defaultUserId', label: 'Default User ID', type: 'text', placeholder: 'User ID (optional)' },
    ],
    defaults: { enabled: false, appKey: '', appSecret: '', agentId: 0, defaultChatId: '', defaultUserId: '' },
  },
  {
    id: 'feishu',
    notifyType: 'feishu',
    icon: MessageSquare,
    labelKey: NOTIFICATION_CHANNEL_META.feishu.labelKey,
    descriptionKey: NOTIFICATION_CHANNEL_META.feishu.descriptionKey,
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
      { key: 'defaultChatId', label: 'Default Chat ID', type: 'text', placeholder: 'oc_xxx (group chat)' },
      { key: 'defaultUserId', label: 'Default User ID', type: 'text', placeholder: 'ou_xxx (optional)' },
    ],
    defaults: { enabled: false, appId: '', appSecret: '', defaultChatId: '', defaultUserId: '' },
  },
  {
    id: 'webhook',
    notifyType: 'webhook',
    icon: Webhook,
    labelKey: NOTIFICATION_CHANNEL_META.webhook.labelKey,
    descriptionKey: NOTIFICATION_CHANNEL_META.webhook.descriptionKey,
    fields: [
      { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://your-server.com/webhook', required: true },
      { key: 'method', label: 'HTTP Method', type: 'select', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }] },
      { key: 'secret', label: 'HMAC Secret', type: 'password', placeholder: 'Optional signing secret' },
    ],
    defaults: { enabled: false, url: '', method: 'POST', secret: '' },
  },
]

// ============================================
// Nested value helpers
// ============================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.')
  const result = { ...obj }
  let current: Record<string, unknown> = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    current[key] = { ...(current[key] as Record<string, unknown> || {}) }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
  return result
}

// ============================================
// ChannelField - Single form field
// ============================================

interface ChannelFieldProps {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
}

function ChannelField({ field, value, onChange }: ChannelFieldProps) {
  const { t } = useTranslation()

  if (field.type === 'toggle') {
    const checked = Boolean(value)
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">{t(field.label)}</label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                checked ? 'translate-x-5' : 'translate-x-0.5'
              } mt-0.5`}
            />
          </div>
        </label>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">{t(field.label)}</label>
        <select
          value={(value as string) || field.options?.[0]?.value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const inputType = field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'

  let displayValue: string
  if (field.key === 'smtp.port' && field.type === 'number') {
    displayValue = value !== undefined && value !== null ? String(value) : ''
  } else {
    displayValue = (value as string) ?? ''
  }

  const handleChange = (newValue: string) => {
    if (field.type === 'number') {
      const num = parseInt(newValue, 10)
      onChange(isNaN(num) ? 0 : num)
    } else {
      onChange(newValue)
    }
  }

  const handleBlur = () => {
    if (field.type === 'number' && (value === undefined || value === null || value === '')) {
      onChange(0)
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground">
        {t(field.label)}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={inputType}
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

// ============================================
// NotifyChannelCard - Single channel card
// ============================================

interface NotifyChannelCardProps {
  def: NotifyChannelDef
  channelConfig: Record<string, unknown>
  isExpanded: boolean
  onToggleExpand: () => void
  onSave: (def: NotifyChannelDef, config: Record<string, unknown>) => Promise<void>
  onTest: (channelType: string) => void
  isTesting: boolean
  testResult?: TestResult
}

function NotifyChannelCard({
  def,
  channelConfig,
  isExpanded,
  onToggleExpand,
  onSave,
  onTest,
  isTesting,
  testResult,
}: NotifyChannelCardProps) {
  const { t } = useTranslation()
  const Icon = def.icon
  const isEnabled = Boolean(channelConfig?.enabled)

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentConfig = draft ?? channelConfig

  const scheduleSave = useCallback((updated: Record<string, unknown>) => {
    setDraft(updated)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onSave(def, updated)
      setDraft(null)
      saveTimerRef.current = null
    }, 500)
  }, [def, onSave])

  const handleToggleEnabled = async () => {
    const updated = { ...currentConfig, enabled: !isEnabled }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setDraft(null)
    await onSave(def, updated)
  }

  const handleFieldChange = (fieldKey: string, value: unknown, nested?: string) => {
    const path = nested || fieldKey
    const updated = setNestedValue({ ...currentConfig }, path, value)
    scheduleSave(updated)
  }

  const getFieldValue = (field: FieldDef): unknown => {
    const path = field.nested || field.key
    return getNestedValue(currentConfig || {}, path)
  }

  const statusLabel = isEnabled ? t('Configured') : t('Not configured')
  const statusColor = isEnabled ? 'bg-green-500' : 'bg-muted-foreground/30'

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Card header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <div className="text-left min-w-0">
            <p className="font-medium text-sm">{t(def.labelKey)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              {t(def.descriptionKey)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">{statusLabel}</span>
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded config form */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3 animate-in slide-in-from-top-1 duration-150">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('Enable')}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={handleToggleEnabled}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                    isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  } mt-0.5`}
                />
              </div>
            </label>
          </div>

          {/* Config fields */}
          <div className="space-y-3">
            {def.fields.map((field) => (
              <ChannelField
                key={field.key}
                field={field}
                value={getFieldValue(field)}
                onChange={(value) => handleFieldChange(field.key, value, field.nested)}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={() => onTest(def.notifyType)}
              disabled={isTesting || !isEnabled}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              {isTesting ? t('Testing...') : t('Test')}
            </button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{testResult.success ? t('Test passed') : testResult.error || t('Test failed')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function NotificationChannelsSection({ config, setConfig }: NotificationChannelsSectionProps) {
  const { t } = useTranslation()

  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  const toggleExpanded = useCallback((channelId: string) => {
    setExpandedChannels(prev => {
      const next = new Set(prev)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }, [])

  const handleSaveNotifyChannel = useCallback(async (def: NotifyChannelDef, channelConfig: Record<string, unknown>) => {
    if (!config) return
    const updatedConfig = {
      ...config,
      notificationChannels: {
        ...config.notificationChannels,
        [def.notifyType]: channelConfig,
      },
    } as AppConfig
    try {
      await api.setConfig({ notificationChannels: updatedConfig.notificationChannels })
      setConfig(updatedConfig)
      api.clearNotificationChannelCache().catch(() => {})
    } catch (error) {
      console.error('[NotificationChannelsSection] Failed to save channel config:', error)
    }
  }, [config, setConfig])

  const handleTestChannel = useCallback(async (channelType: string) => {
    setTestingChannel(channelType)
    setTestResults(prev => { const next = { ...prev }; delete next[channelType]; return next })
    try {
      const result = await api.testNotificationChannel(channelType) as { data: TestResult }
      setTestResults(prev => ({ ...prev, [channelType]: result.data }))
    } catch {
      setTestResults(prev => ({ ...prev, [channelType]: { success: false, error: t('Test failed') } }))
    } finally {
      setTestingChannel(null)
    }
  }, [t])

  const getNotifyConfig = (def: NotifyChannelDef): Record<string, unknown> => {
    const channels = config?.notificationChannels as NotificationChannelsConfig | undefined
    if (!channels) return {}
    const raw = channels[def.notifyType]
    return raw ? (raw as unknown as Record<string, unknown>) : {}
  }

  const showToast = useNotificationStore((s) => s.show)

  return (
    <section id="notification-channels" className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">{t('Notification Channels')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('Configure channels for sending task completion and event notifications')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            showToast({ title: 'Toast Test', body: 'Notification system is working!', variant: 'success', duration: 4000 })
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
          Test Toast
        </button>
      </div>

      <div className="space-y-3">
        {NOTIFY_CHANNEL_DEFS.map((def) => (
          <NotifyChannelCard
            key={def.id}
            def={def}
            channelConfig={getNotifyConfig(def)}
            isExpanded={expandedChannels.has(def.id)}
            onToggleExpand={() => toggleExpanded(def.id)}
            onSave={handleSaveNotifyChannel}
            onTest={handleTestChannel}
            isTesting={testingChannel === def.notifyType}
            testResult={testResults[def.notifyType]}
          />
        ))}
      </div>
    </section>
  )
}
