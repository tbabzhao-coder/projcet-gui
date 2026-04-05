/**
 * Feishu IPC Handlers - Bridge between renderer and feishu.service
 */

import { ipcMain } from 'electron'
import {
  getFeishuStatus,
  getFeishuConfig,
  saveFeishuConfig,
  restartFeishuService,
  stopFeishuService
} from '../services/feishu.service'
import type { FeishuConfig } from '../services/feishu.service'

export function registerFeishuHandlers(): void {
  // Get current connection status
  ipcMain.handle('feishu:get-status', async () => {
    try {
      const status = getFeishuStatus()
      const config = getFeishuConfig()
      return { success: true, data: { ...status, config } }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Save config and restart service
  ipcMain.handle('feishu:save-config', async (_event, feishuConfig: FeishuConfig) => {
    try {
      saveFeishuConfig(feishuConfig)
      await restartFeishuService()
      const status = getFeishuStatus()
      return { success: true, data: status }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Stop service
  ipcMain.handle('feishu:stop', async () => {
    try {
      await stopFeishuService()
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })
}
