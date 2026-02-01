/**
 * Config IPC Handlers
 */

import { ipcMain } from 'electron'
import { getConfig, saveConfig, validateApiConnection } from '../services/config.service'
import { getAISourceManager } from '../services/ai-sources'
import { decryptString } from '../services/secure-storage.service'

export function registerConfigHandlers(): void {
  // Get configuration
  ipcMain.handle('config:get', async () => {
    try {
      const config = getConfig() as Record<string, any>

      // Decrypt custom API key before sending to renderer
      const decryptedConfig = { ...config }
      if (decryptedConfig.aiSources?.custom?.apiKey) {
        decryptedConfig.aiSources = {
          ...decryptedConfig.aiSources,
          custom: {
            ...decryptedConfig.aiSources.custom,
            apiKey: decryptString(decryptedConfig.aiSources.custom.apiKey)
          }
        }
      }
      // Also handle legacy api.apiKey
      if (decryptedConfig.api?.apiKey) {
        decryptedConfig.api = {
          ...decryptedConfig.api,
          apiKey: decryptString(decryptedConfig.api.apiKey)
        }
      }

      return { success: true, data: decryptedConfig }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Save configuration
  ipcMain.handle('config:set', async (_event, updates: Record<string, unknown>) => {
    try {
      const processedUpdates = { ...updates }
      const incomingAiSources = processedUpdates.aiSources as Record<string, any> | undefined

      if (incomingAiSources && typeof incomingAiSources === 'object') {
        const currentConfig = getConfig() as Record<string, any>
        const currentAiSources = currentConfig.aiSources || { current: 'custom' }

        // Start with incoming sources (this is the source of truth from frontend)
        const mergedAiSources: Record<string, any> = { ...incomingAiSources }

        // Deep merge: preserve nested fields for existing sources
        for (const key of Object.keys(incomingAiSources)) {
          if (key === 'current') continue
          const incomingValue = incomingAiSources[key]
          const currentValue = currentAiSources[key]
          if (
            incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue) &&
            currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
          ) {
            mergedAiSources[key] = { ...currentValue, ...incomingValue }
          }
        }

        processedUpdates.aiSources = mergedAiSources
      }

      const config = saveConfig(processedUpdates)
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Validate API connection
  ipcMain.handle(
    'config:validate-api',
    async (_event, apiKey: string, apiUrl: string, provider: string) => {
      try {
        const result = await validateApiConnection(apiKey, apiUrl, provider)
        return { success: true, data: result }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Refresh AI sources configuration (auto-detects logged-in sources)
  ipcMain.handle('config:refresh-ai-sources', async () => {
    try {
      const manager = getAISourceManager()
      await manager.refreshAllConfigs()
      const config = getConfig()
      return { success: true, data: config }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Config IPC] Refresh AI sources error:', err)
      return { success: false, error: err.message }
    }
  })
}
