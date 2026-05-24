/**
 * APA IPC Handlers - 录制/执行/验证/更新
 *
 * 录制和执行都是长时间运行的操作（录制要等用户关闭浏览器，执行要等脚本跑完）。
 * 采用 fire-and-forget 模式：IPC 立即返回，状态通过 sendToRenderer 事件推送。
 */

import { ipcMain } from 'electron'
import {
  startRecording,
  stopRecording,
  isRecording,
  type RecordingOptions,
} from '../services/apa-recorder.service'
import {
  executeSkill,
  validateSkill,
  stopExecution,
  updateScript,
  isExecuting,
  type ExecuteOptions,
  type ValidateOptions,
} from '../services/apa-executor.service'

export function registerApaHandlers(): void {
  // 启动录制（fire-and-forget：立即返回，完成后通过 apa:recording-stopped 事件通知）
  ipcMain.handle('apa:start-recording', async (_event, options: RecordingOptions) => {
    try {
      if (isRecording()) {
        return { success: false, error: '已有录制进程在运行' }
      }

      // 不 await —— 录制会持续到用户关闭浏览器，不能阻塞 IPC
      startRecording(options || {}).catch((err) => {
        console.error('[APA IPC] Recording failed:', err)
      })

      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[APA IPC] start-recording error:', err)
      return { success: false, error: err.message }
    }
  })

  // 停止录制
  ipcMain.handle('apa:stop-recording', async () => {
    try {
      stopRecording()
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // 执行 skill（fire-and-forget：立即返回，完成后通过 apa:execution-complete/failed 事件通知）
  ipcMain.handle('apa:execute-skill', async (_event, options: ExecuteOptions) => {
    try {
      if (isExecuting()) {
        return { success: false, error: '已有执行进程在运行' }
      }

      // 不 await —— 脚本执行可能耗时较长
      executeSkill(options).catch((err) => {
        console.error('[APA IPC] Execution failed:', err)
      })

      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[APA IPC] execute-skill error:', err)
      return { success: false, error: err.message }
    }
  })

  // 停止执行
  ipcMain.handle('apa:stop-execution', async () => {
    try {
      stopExecution()
      return { success: true }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // 验证 skill（运行脚本 + 解析结构化输出 + 收集截图）
  ipcMain.handle('apa:validate-skill', async (_event, options: ValidateOptions) => {
    try {
      const result = await validateSkill(options)
      return { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[APA IPC] validate-skill error:', err)
      return { success: false, error: err.message }
    }
  })

  // 验证修复后更新脚本
  ipcMain.handle('apa:update-script', async (_event, skillName: string, newScript: string) => {
    try {
      const result = updateScript(skillName, newScript)
      return { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      console.error('[APA IPC] update-script error:', err)
      return { success: false, error: err.message }
    }
  })
}
