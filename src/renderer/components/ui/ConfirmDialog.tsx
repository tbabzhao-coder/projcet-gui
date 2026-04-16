/**
 * ConfirmDialog - VSCode-style confirmation dialog
 * Matches the project's AppInstallDialog design
 */

import { createPortal } from 'react-dom'
import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'default'
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'danger'
}: ConfirmDialogProps) {
  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard events if the dialog is open and no input is focused
      const target = e.target as HTMLElement
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      
      if (isInputFocused) return
      
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        onConfirm()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel])

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
      : variant === 'warning'
        ? 'bg-amber-600 hover:bg-amber-500 text-white'
        : 'bg-primary hover:bg-primary/90 text-primary-foreground'

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={onCancel}
    >
      <div 
        className="relative w-full max-w-md mx-4 bg-background border border-border rounded-xl shadow-xl p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="mb-6 space-y-2">
          <p className="text-sm text-foreground">{title}</p>
          {message && (
            <p className="text-xs text-muted-foreground">{message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
