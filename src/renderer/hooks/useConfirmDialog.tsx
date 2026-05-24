/**
 * useConfirmDialog - Hook for showing confirmation dialogs
 * Returns a promise-based API for easy async/await usage
 */

import { useState, useCallback } from 'react'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  variant?: 'danger' | 'warning' | 'default'
}

export function useConfirmDialog() {
  const [dialog, setDialog] = useState<(ConfirmOptions & {
    onConfirm: () => void
    onCancel: () => void
  }) | null>(null)

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        ...options,
        onConfirm: () => {
          setDialog(null)
          resolve(true)
        },
        onCancel: () => {
          setDialog(null)
          resolve(false)
        }
      })
    })
  }, [])

  const DialogComponent = dialog ? <ConfirmDialog {...dialog} /> : null

  return { showConfirm, DialogComponent }
}
