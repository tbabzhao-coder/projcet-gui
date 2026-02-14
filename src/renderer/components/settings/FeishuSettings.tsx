/**
 * FeishuSettings - Configuration UI for Feishu/Lark integration
 */

import { useState, useEffect } from 'react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import type { FeishuConfig, FeishuConnectionStatus } from '../../types'

interface FeishuSettingsProps {
  config?: FeishuConfig | null
  onSave: (config: FeishuConfig) => void
}

export function FeishuSettings({ config, onSave }: FeishuSettingsProps) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [appId, setAppId] = useState(config?.appId ?? '')
  const [appSecret, setAppSecret] = useState(config?.appSecret ?? '')
  const [domain, setDomain] = useState<'feishu' | 'lark'>(config?.domain ?? 'feishu')
  const [showSecret, setShowSecret] = useState(false)
  const [status, setStatus] = useState<FeishuConnectionStatus>('disconnected')
  const [statusError, setStatusError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Load initial status
  useEffect(() => {
    loadStatus()
    const unsub = api.onFeishuStatusChange((data: any) => {
      setStatus(data.status || 'disconnected')
      setStatusError(data.error)
    })
    return unsub
  }, [])

  // Sync from parent config
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled)
      setAppId(config.appId)
      setAppSecret(config.appSecret)
      setDomain(config.domain)
    }
  }, [config])

  async function loadStatus() {
    try {
      const res = await api.feishuGetStatus()
      if (res.success && res.data) {
        const data = res.data as any
        setStatus(data.status || 'disconnected')
        setStatusError(data.error)
      }
    } catch {
      // ignore
    }
  }

  function markDirty() {
    setIsDirty(true)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const feishuConfig: FeishuConfig = { enabled, appId, appSecret, domain }
      const res = await api.feishuSaveConfig(feishuConfig)
      if (res.success) {
        onSave(feishuConfig)
        setIsDirty(false)
        // Refresh status
        await loadStatus()
      }
    } catch (err) {
      console.error('Failed to save feishu config:', err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStop() {
    await api.feishuStop()
    setStatus('disconnected')
    setStatusError(undefined)
  }

  const statusColor = {
    disconnected: 'text-muted-foreground',
    connecting: 'text-yellow-500',
    connected: 'text-green-500',
    error: 'text-red-500'
  }[status]

  const statusLabel = {
    disconnected: '未连接',
    connecting: '连接中...',
    connected: '已连接',
    error: '连接失败'
  }[status]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">飞书集成</h2>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${statusColor}`}>{statusLabel}</span>
          {status === 'connected' && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
      </div>

      {statusError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-500">{statusError}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">启用飞书机器人</p>
            <p className="text-sm text-muted-foreground">
              通过飞书发消息远程触发本机 AI 执行任务
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); markDirty() }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
              <div
                className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}
              />
            </div>
          </label>
        </div>

        {/* Config fields */}
        <div className="space-y-3">
          {/* Domain */}
          <div>
            <label className="block text-sm font-medium mb-1">平台</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setDomain('feishu'); markDirty() }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  domain === 'feishu'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary/40'
                }`}
              >
                飞书 (feishu.cn)
              </button>
              <button
                onClick={() => { setDomain('lark'); markDirty() }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  domain === 'lark'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary/40'
                }`}
              >
                Lark (larksuite.com)
              </button>
            </div>
          </div>

          {/* App ID */}
          <div>
            <label className="block text-sm font-medium mb-1">App ID</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => { setAppId(e.target.value); markDirty() }}
              placeholder="cli_xxxxxxxxxx"
              className="w-full px-3 py-2 text-sm bg-input rounded-lg border border-border focus:border-primary focus:outline-none"
            />
          </div>

          {/* App Secret */}
          <div>
            <label className="block text-sm font-medium mb-1">App Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => { setAppSecret(e.target.value); markDirty() }}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 pr-16 text-sm bg-input rounded-lg border border-border focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showSecret ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving || (!isDirty && status !== 'error')}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSaving ? '保存中...' : '保存并连接'}
          </button>
          {status === 'connected' && (
            <button
              onClick={handleStop}
              className="px-4 py-2 text-sm bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              断开连接
            </button>
          )}
        </div>
      </div>

      {/* Help text */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          前往 <span className="text-primary">open.feishu.cn/app</span> 创建企业自建应用并启用机器人能力。给机器人发消息即可远程触发本机 AI 执行任务。
        </p>
      </div>
    </div>
  )
}
