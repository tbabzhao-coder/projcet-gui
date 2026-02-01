/**
 * Space IPC Handlers
 */

import { ipcMain, dialog } from 'electron'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import {
  getTempSpace,
  listSpaces,
  createSpace,
  deleteSpace,
  getSpace,
  openSpaceFolder,
  updateSpace,
  updateSpacePreferences,
  getSpacePreferences
} from '../services/space.service'
import { getSpacesDir } from '../services/config.service'

// Import types for preferences
interface SpaceLayoutPreferences {
  artifactRailExpanded?: boolean
  chatWidth?: number
}

interface SpacePreferences {
  layout?: SpaceLayoutPreferences
}

export function registerSpaceHandlers(): void {
  // Get Project4 temp space
  ipcMain.handle('space:get-project4', async () => {
    try {
      const space = getTempSpace()
      return { success: true, data: space }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // List all spaces
  ipcMain.handle('space:list', async () => {
    try {
      const spaces = listSpaces()
      return { success: true, data: spaces }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Create a new space
  ipcMain.handle(
    'space:create',
    async (_event, input: { name: string; icon: string; customPath?: string }) => {
      try {
        const space = createSpace(input)
        return { success: true, data: space }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Delete a space
  ipcMain.handle('space:delete', async (_event, spaceId: string) => {
    try {
      const result = deleteSpace(spaceId)
      return { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Get a specific space
  ipcMain.handle('space:get', async (_event, spaceId: string) => {
    try {
      const space = getSpace(spaceId)
      return { success: true, data: space }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Open space folder
  ipcMain.handle('space:open-folder', async (_event, spaceId: string) => {
    try {
      const result = openSpaceFolder(spaceId)
      return { success: true, data: result }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Update space
  ipcMain.handle(
    'space:update',
    async (_event, spaceId: string, updates: { name?: string; icon?: string }) => {
      try {
        const space = updateSpace(spaceId, updates)
        return { success: true, data: space }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Get default space path
  ipcMain.handle('space:get-default-path', async () => {
    try {
      const spacesDir = getSpacesDir()
      return { success: true, data: spacesDir }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Select folder dialog (for custom space location)
  ipcMain.handle('dialog:select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Space Location',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Folder'
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null }
      }

      return { success: true, data: result.filePaths[0] }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Update space preferences (layout settings)
  ipcMain.handle(
    'space:update-preferences',
    async (_event, spaceId: string, preferences: Partial<SpacePreferences>) => {
      try {
        const space = updateSpacePreferences(spaceId, preferences)
        return { success: true, data: space }
      } catch (error: unknown) {
        const err = error as Error
        return { success: false, error: err.message }
      }
    }
  )

  // Get space preferences
  ipcMain.handle('space:get-preferences', async (_event, spaceId: string) => {
    try {
      const preferences = getSpacePreferences(spaceId)
      return { success: true, data: preferences }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Recursively find all files in a directory (with max depth to avoid infinite loops)
  function getAllFiles(dirPath: string, rootPath: string, maxDepth: number = 3, currentDepth: number = 0): string[] {
    const files: string[] = []
    
    if (currentDepth >= maxDepth) {
      return files
    }

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        
        try {
          if (entry.isDirectory()) {
            // Recursively get files from subdirectories
            const subFiles = getAllFiles(fullPath, rootPath, maxDepth, currentDepth + 1)
            files.push(...subFiles)
          } else {
            // Calculate relative path from root folder
            const relativePath = relative(rootPath, fullPath)
            // Add both filename and relative path for flexible checking
            files.push(entry.name)
            if (relativePath !== entry.name) {
              files.push(relativePath)
            }
          }
        } catch (err) {
          // Skip files we can't access
          console.warn(`[Space] Cannot access ${fullPath}:`, err)
        }
      }
    } catch (err) {
      console.warn(`[Space] Cannot read directory ${dirPath}:`, err)
    }

    return files
  }

  // Select folder dialog
  ipcMain.handle('space:select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'No folder selected' }
      }

      const folderPath = result.filePaths[0]

      // Recursively read folder contents (up to 3 levels deep)
      const files = getAllFiles(folderPath, folderPath, 3)

      return {
        success: true,
        data: {
          path: folderPath,
          files
        }
      }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

  // Select file dialog
  ipcMain.handle('space:select-file', async (_event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: options?.filters || []
      })

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'No file selected' }
      }

      return {
        success: true,
        data: {
          path: result.filePaths[0]
        }
      }
    } catch (error: unknown) {
      const err = error as Error
      return { success: false, error: err.message }
    }
  })

}
