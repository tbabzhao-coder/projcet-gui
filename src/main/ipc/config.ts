/**
 * Config IPC Handlers
 */

import { ipcMain } from 'electron'
import { getConfig, saveConfig, validateApiConnection } from '../services/config.service'
import { getAISourceManager } from '../services/ai-sources'
import { decryptString } from '../services/secure-storage.service'
import { getRouterInfo } from '../openai-compat-router'

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

  // List available skills from config (built-in + user-imported)
  ipcMain.handle('config:list-skills', async () => {
    try {
      const config = getConfig() as Record<string, any>
      const skills: Array<{ key: string; description: string }> = []

      if (config.skills && typeof config.skills === 'object') {
        for (const [key, skill] of Object.entries(config.skills as Record<string, any>)) {
          if (skill?.disabled) continue
          skills.push({ key, description: skill?.description || '' })
        }
      }

      return { success: true, data: skills }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message, data: [] }
    }
  })

  // List available MCP servers from config
  ipcMain.handle('config:list-mcp', async () => {
    try {
      const config = getConfig() as Record<string, any>
      const servers: Array<{ key: string; description: string }> = []

      if (config.mcpServers && typeof config.mcpServers === 'object') {
        for (const [key, server] of Object.entries(config.mcpServers as Record<string, any>)) {
          if (server?.disabled) continue
          servers.push({ key, description: server?.description || '' })
        }
      }

      return { success: true, data: servers }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message, data: [] }
    }
  })

  // Get local router base URL (for renderer to post debug logs to Network panel)
  ipcMain.handle('config:get-router-url', () => {
    const info = getRouterInfo()
    return info ? info.baseUrl : null
  })

  // Add skill to config (for APA builder)
  ipcMain.handle('config:add-skill', async (_event, skillConfig: {
    name: string
    path: string
    type: 'directory' | 'file'
    description?: string
    disabled?: boolean
    hasScripts?: boolean
  }) => {
    try {
      const config = getConfig() as Record<string, any>
      const currentSkills = config.skills || {}

      // Filter out built-in skills — only persist user-defined skills
      const userSkills: Record<string, any> = {}
      for (const [name, skill] of Object.entries(currentSkills)) {
        if (!(skill as any).__builtIn) {
          userSkills[name] = skill
        }
      }

      // Add the new skill
      userSkills[skillConfig.name] = {
        name: skillConfig.name,
        path: skillConfig.path,
        type: skillConfig.type,
        description: skillConfig.description || '',
        disabled: skillConfig.disabled || false,
        hasScripts: skillConfig.hasScripts || false,
        importedAt: new Date().toISOString(),
      }

      // Only save the skills field, not the entire config
      saveConfig({ skills: userSkills } as any)
      console.log(`[Config IPC] Added skill: ${skillConfig.name}`)

      return { success: true, data: userSkills[skillConfig.name] }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[Config IPC] Add skill error:', err)
      return { success: false, error: err.message }
    }
  })
}
