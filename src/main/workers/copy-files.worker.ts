/**
 * Worker Thread for File Copying
 * Handles recursive file/folder copying without blocking the main process
 */

import { parentPort } from 'worker_threads'
import { promises as fs, existsSync } from 'fs'
import { join, basename, extname } from 'path'

// Message types
export type WorkerMessage =
  | { type: 'start'; files: string[]; targetDir: string }

export type WorkerEvent =
  | { type: 'progress'; copied: number; total: number; currentFile: string }
  | { type: 'done'; results: Array<{ src: string; dest: string }> }
  | { type: 'error'; message: string }

// Count total files recursively (for progress calculation)
async function countFiles(srcPath: string): Promise<number> {
  try {
    const stat = await fs.stat(srcPath)
    if (!stat.isDirectory()) return 1

    let count = 0
    const entries = await fs.readdir(srcPath, { withFileTypes: true })
    for (const entry of entries) {
      count += await countFiles(join(srcPath, entry.name))
    }
    return count
  } catch (err) {
    console.error('[Worker] countFiles error:', err)
    return 0
  }
}

// Resolve destination path with auto-rename on conflict
async function resolveDestPath(srcName: string, targetDir: string): Promise<string> {
  const ext = extname(srcName)
  const base = ext ? srcName.slice(0, -ext.length) : srcName
  let candidate = join(targetDir, srcName)
  let counter = 1

  while (existsSync(candidate)) {
    candidate = join(targetDir, ext ? `${base}_${counter}${ext}` : `${base}_${counter}`)
    counter++
  }

  return candidate
}

// Recursively copy directory
async function copyDirRecursive(
  src: string,
  dest: string,
  state: { copied: number; total: number }
): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcChild = join(src, entry.name)
    const destChild = join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDirRecursive(srcChild, destChild, state)
    } else {
      await fs.copyFile(srcChild, destChild)
      state.copied++
      parentPort!.postMessage({
        type: 'progress',
        copied: state.copied,
        total: state.total,
        currentFile: entry.name
      } satisfies WorkerEvent)
    }
  }
}

// Main message handler
parentPort!.on('message', async (msg: WorkerMessage) => {
  if (msg.type !== 'start') return

  try {
    const { files, targetDir } = msg

    // Count total files for progress tracking
    let total = 0
    for (const f of files) {
      total += await countFiles(f)
    }

    const state = { copied: 0, total }
    const results: Array<{ src: string; dest: string }> = []

    // Copy each file/folder
    for (const srcPath of files) {
      const name = basename(srcPath)
      const destPath = await resolveDestPath(name, targetDir)
      const stat = await fs.stat(srcPath)

      if (stat.isDirectory()) {
        await copyDirRecursive(srcPath, destPath, state)
      } else {
        await fs.copyFile(srcPath, destPath)
        state.copied++
        parentPort!.postMessage({
          type: 'progress',
          copied: state.copied,
          total: state.total,
          currentFile: name
        } satisfies WorkerEvent)
      }

      results.push({ src: srcPath, dest: destPath })
    }

    parentPort!.postMessage({ type: 'done', results } satisfies WorkerEvent)
  } catch (err) {
    parentPort!.postMessage({
      type: 'error',
      message: (err as Error).message
    } satisfies WorkerEvent)
  }
})
