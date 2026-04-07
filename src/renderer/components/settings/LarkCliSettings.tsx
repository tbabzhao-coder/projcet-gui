/**
 * LarkCliSettings - Configuration UI for Feishu/Lark integration via lark-cli
 * State machine: idle → creating_app → auth_login → ready
 *                idle → manual_config → auth_login → ready
 */

import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { api } from '../../api'
import type { LarkCliStatus, LarkCliStatusInfo } from '../../types'

type SetupStep = 'idle' | 'creating_app' | 'auth_login' | 'manual_config'

export function LarkCliSettings() {
  const [step, setStep] = useState<SetupStep>('idle')
  const [status, setStatus] = useState<LarkCliStatus>('not_configured')
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Manual config fields
  const [platform, setPlatform] = useState<'feishu' | 'lark'>('feishu')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  // Generate QR code DataURL locally when qrCodeUrl changes
  useEffect(() => {
    if (!qrCodeUrl) {
      setQrCodeDataUrl(null)
      return
    }
    QRCode.toDataURL(qrCodeUrl, { width: 200, margin: 2, errorCorrectionLevel: 'M' })
      .then(dataUrl => setQrCodeDataUrl(dataUrl))
      .catch(() => setQrCodeDataUrl(null))
  }, [qrCodeUrl])

  // Load initial status
  const loadStatus = useCallback(async () => {
    try {
      const res = await api.larkCliGetStatus()
      if (res.success && res.data) {
        const info = res.data as LarkCliStatusInfo
        setStatus(info.status)
        if (info.status === 'auth_valid') {
          setStep('idle')
        }
        if (info.error) setError(info.error)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const unsub = api.onLarkCliStatusChange((data: any) => {
      if (data?.status) {
        setStatus(data.status)
        if (data.status === 'auth_valid') {
          setStep('idle')
          setQrCodeUrl(null)
        }
      }
    })
    return unsub
  }, [loadStatus])

  // Start auto config flow (create new app)
  async function handleStartConfig() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.larkCliInitConfig({ newApp: true })
      if (res.success && res.data) {
        const data = res.data as { qrUrl?: string }
        if (data.qrUrl) {
          setQrCodeUrl(data.qrUrl)
          setStep('creating_app')
        } else {
          setError('未获取到二维码链接，请重试')
        }
      } else {
        setError(res.error || '配置初始化失败')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Start auth login flow
  async function handleAuthLogin() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.larkCliAuthLogin()
      if (res.success && res.data) {
        const data = res.data as { qrUrl?: string }
        if (data.qrUrl) {
          setQrCodeUrl(data.qrUrl)
          setStep('auth_login')
        } else {
          setError('未获取到授权链接，请重试')
        }
      } else {
        setError(res.error || '授权登录失败')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Save manual config then start auth
  async function handleManualSave() {
    if (!appId.trim() || !appSecret.trim()) {
      setError('请填写 App ID 和 App Secret')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.larkCliManualConfig({ platform, appId: appId.trim(), appSecret: appSecret.trim() })
      if (res.success) {
        await handleAuthLogin()
      } else {
        setError(res.error || '配置保存失败')
        setLoading(false)
      }
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  // Logout / disconnect
  async function handleLogout() {
    setLoading(true)
    setError(null)
    try {
      await api.larkCliLogout()
      setStatus('not_configured')
      setStep('idle')
      setQrCodeUrl(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Cancel current flow
  function handleCancel() {
    setStep('idle')
    setQrCodeUrl(null)
    setError(null)
  }

  // Status badge — follows McpServerList color conventions
  function renderStatusBadge() {
    switch (status) {
      case 'auth_valid':
        return (
          <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-500 font-medium">
            已就绪
          </span>
        )
      case 'auth_expired':
        return (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-500 font-medium">
            授权已过期
          </span>
        )
      case 'configured':
        return (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-500 font-medium">
            配置中
          </span>
        )
      case 'error':
        return (
          <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-500 font-medium">
            错误
          </span>
        )
      default:
        return (
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
            未配置
          </span>
        )
    }
  }

  // Error display — follows project warning box pattern
  function renderError() {
    if (!error) return null
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mt-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  // QR code block — shared between creating_app and auth_login
  function renderQrCode() {
    if (qrCodeDataUrl) {
      return (
        <div className="flex flex-col items-center gap-3 my-5">
          <div className="p-4 bg-white rounded-xl shadow-sm">
            <img src={qrCodeDataUrl} alt="QR Code" className="w-44 h-44" />
          </div>
          <p className="text-xs text-muted-foreground animate-pulse">等待扫码完成...</p>
        </div>
      )
    }
    // Loading placeholder while lark-cli is spawning
    if (loading || qrCodeUrl) {
      return (
        <div className="flex flex-col items-center gap-3 my-5">
          <div className="w-44 h-44 rounded-xl bg-muted/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs text-muted-foreground">正在生成二维码...</p>
        </div>
      )
    }
    return null
  }

  // ============================================
  // Render: Ready state
  // ============================================
  if (status === 'auth_valid' && step === 'idle') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">飞书</h2>
          {renderStatusBadge()}
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          AI 可以操作你的飞书：日历、消息、文档、任务等
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAuthLogin}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            重新授权
          </button>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            断开连接
          </button>
        </div>
        {renderError()}
      </div>
    )
  }

  // ============================================
  // Render: Expired state
  // ============================================
  if (status === 'auth_expired' && step === 'idle') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">飞书</h2>
          {renderStatusBadge()}
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-5">
          <p className="text-sm text-amber-500">飞书授权已过期，需要重新扫码登录。</p>
        </div>
        <button
          onClick={handleAuthLogin}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? '请稍候...' : '重新授权'}
        </button>
        {renderError()}
      </div>
    )
  }

  // ============================================
  // Render: QR code flow (creating_app or auth_login)
  // ============================================
  if (step === 'creating_app' || step === 'auth_login') {
    const stepLabel = step === 'creating_app' ? '1/2' : '2/2'
    const stepTitle = step === 'creating_app' ? '创建飞书应用' : '授权登录'
    const stepDesc = step === 'creating_app'
      ? '请用飞书 App 扫描下方二维码，完成应用创建'
      : '请用飞书 App 扫描下方二维码，授权 AI 访问你的飞书数据'

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">飞书</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-500 font-medium">
            步骤 {stepLabel}
          </span>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 mb-1">
          <p className="text-sm font-medium text-foreground">{stepTitle}</p>
          <p className="text-xs text-muted-foreground mt-1">{stepDesc}</p>
        </div>

        {renderQrCode()}

        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
          >
            取消
          </button>
          {step === 'creating_app' && (
            <button
              onClick={handleAuthLogin}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? '请稍候...' : '下一步'}
            </button>
          )}
          {step === 'auth_login' && (
            <button
              onClick={async () => { await loadStatus() }}
              className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              检查状态
            </button>
          )}
        </div>
        {renderError()}
      </div>
    )
  }

  // ============================================
  // Render: Manual config form
  // ============================================
  if (step === 'manual_config') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">飞书</h2>
          <button
            onClick={handleCancel}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            返回
          </button>
        </div>

        <div className="space-y-4">
          {/* Platform selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">平台</label>
            <div className="flex gap-2">
              {(['feishu', 'lark'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    platform === p
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {p === 'feishu' ? '飞书 (feishu.cn)' : 'Lark (larksuite.com)'}
                </button>
              ))}
            </div>
          </div>

          {/* App ID */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">App ID</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="cli_xxxxxxxxxx"
              className="w-full px-4 py-2 text-sm bg-input rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
            />
          </div>

          {/* App Secret */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">App Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 pr-16 text-sm bg-input rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors text-xs"
              >
                {showSecret ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleManualSave}
            disabled={loading || !appId.trim() || !appSecret.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存并登录'}
          </button>
        </div>
        {renderError()}
      </div>
    )
  }

  // ============================================
  // Render: Idle / Not configured
  // ============================================
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">飞书</h2>
        {renderStatusBadge()}
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        让 AI 以你的身份操作飞书：查日程、发消息、建文档、管理任务等。
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleStartConfig}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? '请稍候...' : '开始配置'}
        </button>
        <button
          onClick={() => setStep('manual_config')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          手动配置
        </button>
      </div>
      {renderError()}
    </div>
  )
}
