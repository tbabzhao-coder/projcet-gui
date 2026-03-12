/**
 * Artifact IPC Handlers - Handle artifact-related requests from renderer
 */

import { ipcMain, shell, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import { promises as fs } from 'fs'
import { join } from 'path'
import { listArtifacts, listArtifactsTree, readArtifactContent } from '../services/artifact.service'
import { initSpaceCache } from '../services/artifact-cache.service'
import { getSpace } from '../services/space.service'

// Worker event types
type WorkerEvent =
  | { type: 'progress'; copied: number; total: number; currentFile: string }
  | { type: 'done'; results: Array<{ src: string; dest: string }> }
  | { type: 'error'; message: string }

// Count files recursively for pre-copy validation
async function countFilesRecursive(srcPath: string): Promise<number> {
  try {
    const stat = await fs.stat(srcPath)
    if (!stat.isDirectory()) return 1

    let count = 0
    const entries = await fs.readdir(srcPath, { withFileTypes: true })
    for (const entry of entries) {
      count += await countFilesRecursive(join(srcPath, entry.name))
    }
    return count
  } catch (err) {
    console.error('[IPC] countFilesRecursive error:', err)
    return 0
  }
}

// Register all artifact handlers
export function registerArtifactHandlers(): void {
  // Initialize artifact watcher for a space
  ipcMain.handle('artifact:init-watcher', async (_event, spaceId: string) => {
    try {
      console.log(`[IPC] artifact:init-watcher - spaceId: ${spaceId}`)
      const space = getSpace(spaceId)
      if (!space) {
        return { success: false, error: 'Space not found' }
      }
      await initSpaceCache(spaceId, space.path)
      return { success: true }
    } catch (error) {
      console.error('[IPC] artifact:init-watcher error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // List artifacts in a space (flat list for card view)
  ipcMain.handle('artifact:list', async (_event, spaceId: string) => {
    try {
      // console.log(`[IPC] artifact:list - spaceId: ${spaceId}`)
      const artifacts = listArtifacts(spaceId)
      return { success: true, data: artifacts }
    } catch (error) {
      console.error('[IPC] artifact:list error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // List artifacts as tree structure (for developer view)
  ipcMain.handle('artifact:list-tree', async (_event, spaceId: string) => {
    try {
      console.log(`[IPC] artifact:list-tree - spaceId: ${spaceId}`)
      const tree = listArtifactsTree(spaceId)
      return { success: true, data: tree }
    } catch (error) {
      console.error('[IPC] artifact:list-tree error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Load children for a directory (lazy loading for tree view)
  ipcMain.handle('artifact:load-children', async (_event, spaceId: string, dirPath: string) => {
    try {
      console.log(`[IPC] artifact:load-children - spaceId: ${spaceId}, dirPath: ${dirPath}`)
      const { loadArtifactChildren } = await import('../services/artifact.service')
      const children = loadArtifactChildren(spaceId, dirPath)
      return { success: true, data: children }
    } catch (error) {
      console.error('[IPC] artifact:load-children error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Open file or folder with system default application
  ipcMain.handle('artifact:open', async (_event, filePath: string) => {
    try {
      console.log(`[IPC] artifact:open - path: ${filePath}`)
      // shell.openPath opens file with default app, or folder with file manager
      const error = await shell.openPath(filePath)
      if (error) {
        console.error('[IPC] artifact:open error:', error)
        return { success: false, error }
      }
      return { success: true }
    } catch (error) {
      console.error('[IPC] artifact:open error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Show file in folder (highlight in file manager)
  ipcMain.handle('artifact:show-in-folder', async (_event, filePath: string) => {
    try {
      console.log(`[IPC] artifact:show-in-folder - path: ${filePath}`)
      // shell.showItemInFolder opens the folder and selects the file
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      console.error('[IPC] artifact:show-in-folder error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Read file content for Content Canvas
  ipcMain.handle('artifact:read-content', async (_event, filePath: string) => {
    try {
      console.log(`[IPC] artifact:read-content - path: ${filePath}`)
      const content = readArtifactContent(filePath)
      return { success: true, data: content }
    } catch (error) {
      console.error('[IPC] artifact:read-content error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Count files before copying (for large folder confirmation)
  ipcMain.handle('artifact:count-files', async (_event, files: string[]) => {
    try {
      console.log(`[IPC] artifact:count-files - ${files.length} items`)
      let total = 0
      for (const f of files) {
        total += await countFilesRecursive(f)
      }
      return { success: true, data: { total } }
    } catch (error) {
      console.error('[IPC] artifact:count-files error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Copy files to space (async with worker thread)
  ipcMain.handle('artifact:copy-files', async (event, payload: {
    files: string[]
    targetDir: string
    jobId: string
  }) => {
    const { files, targetDir, jobId } = payload
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      return { success: false, error: 'No window found' }
    }

    try {
      console.log(`[IPC] artifact:copy-files - jobId: ${jobId}, files: ${files.length}, target: ${targetDir}`)

      // Resolve worker path - handle both dev and production
      // In dev: out/main/index.mjs, worker at out/main/workers/copy-files.worker.mjs
      // In prod: out/main/index.mjs, worker at out/main/workers/copy-files.worker.mjs
      const workerPath = join(__dirname, 'workers/copy-files.worker.mjs')
      console.log('[IPC] Worker path:', workerPath)

      const worker = new Worker(workerPath)

      worker.on('message', (msg: WorkerEvent) => {
        if (win.isDestroyed()) return

        if (msg.type === 'progress') {
          win.webContents.send('artifact:copy-progress', { jobId, ...msg })
        } else if (msg.type === 'done' || msg.type === 'error') {
          win.webContents.send('artifact:copy-done', { jobId, ...msg })
          worker.terminate()
        }
      })

      worker.on('error', (err) => {
        console.error('[IPC] Worker error:', err)
        if (!win.isDestroyed()) {
          win.webContents.send('artifact:copy-done', {
            jobId,
            type: 'error',
            message: err.message
          })
        }
        worker.terminate()
      })

      // Start copying in background
      worker.postMessage({ type: 'start', files, targetDir })

      return { success: true }
    } catch (error) {
      console.error('[IPC] artifact:copy-files error:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
