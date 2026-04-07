/**
 * lark-cli IPC Handlers
 * Registers IPC handlers for lark-cli Settings UI operations.
 */

import { ipcMain } from 'electron'
import {
  checkLarkCliStatus,
  initConfig,
  authLogin,
  logout,
  manualConfig
} from '../services/lark-cli.service'

export function registerLarkCliHandlers(): void {
  ipcMain.handle('lark-cli:get-status', async () => {
    try {
      const result = await checkLarkCliStatus()
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('lark-cli:init-config', async (_event, options: { newApp: boolean }) => {
    try {
      const result = await initConfig(options)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('lark-cli:auth-login', async (_event, options?: { scope?: string; domain?: string }) => {
    try {
      const result = await authLogin(options)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('lark-cli:logout', async () => {
    try {
      await logout()
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('lark-cli:manual-config', async (_event, config: { platform: string; appId: string; appSecret: string }) => {
    try {
      await manualConfig(config.platform, config.appId, config.appSecret)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })
}
