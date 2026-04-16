/**
 * Conversation List - Resizable sidebar for multiple conversations
 * Supports drag-to-resize, inline title editing, pin/unpin, status dots, and context menu
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ConversationMeta } from '../../types'
import { MessageSquare, Plus } from '../icons/ToolIcons'
import { useTranslation } from '../../i18n'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'

// Width constraints (in pixels)
const MIN_WIDTH = 140
const MAX_WIDTH = 320
const DEFAULT_WIDTH = 192 // w-48 = 12rem = 192px

// Session status type for status indicator dots
export type SessionStatus = 'thinking' | 'streaming' | 'error' | null

interface ConversationListProps {
  conversations: ConversationMeta[]
  currentConversationId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete?: (id: string) => void
  onRename?: (id: string, newTitle: string) => void
  onTogglePin?: (id: string) => void
  getSessionStatus?: (conversationId: string) => SessionStatus
  spacePath?: string
}

// Pin icon (lucide-style SVG)
function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

// Status indicator dot
function StatusDot({ status }: { status: SessionStatus }) {
  if (!status) return null

  const dotClass = {
    thinking: 'bg-yellow-400 animate-pulse',
    streaming: 'bg-blue-400 animate-pulse',
    error: 'bg-red-400',
  }[status]

  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onTogglePin,
  getSessionStatus,
  spacePath
}: ConversationListProps) {
  const { t } = useTranslation()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Split conversations into pinned and unpinned
  const pinnedConversations = conversations.filter((c) => c.pinned)
  const unpinnedConversations = conversations.filter((c) => !c.pinned)

  // Handle drag resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left
      const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
      setWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return t('Today')
    }

    return `${date.getMonth() + 1}-${date.getDate()}`
  }

  // Start editing a conversation title
  const handleStartEdit = (e: React.MouseEvent, conv: ConversationMeta) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditingTitle(conv.title || '')
    setContextMenu(null)
  }

  // Save edited title
  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim() && onRename) {
      onRename(editingId, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  // Handle input key events
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  // Handle right-click context menu - now handled by ContextMenu component

  // Get conversation by id from the full list
  const getConversation = (id: string) => conversations.find((c) => c.id === id)

  // Build context menu items for a conversation
  const getMenuItems = (conversation: ConversationMeta): ContextMenuItem[] => [
    {
      label: conversation.pinned ? t('Unpin') : t('Pin'),
      icon: <PinIcon className="w-4 h-4" />,
      onClick: () => onTogglePin?.(conversation.id),
      hidden: !onTogglePin
    },
    {
      label: t('Rename'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      onClick: () => {
        setEditingId(conversation.id)
        setEditingTitle(conversation.title || '')
      },
      hidden: !onRename
    },
    { label: '', onClick: () => {}, separator: true, hidden: !onDelete },
    {
      label: t('Delete'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      onClick: () => onDelete?.(conversation.id),
      hidden: !onDelete
    }
  ]

  // Render a single conversation item
  const renderConversationItem = (conversation: ConversationMeta) => {
    const status = getSessionStatus?.(conversation.id) ?? null

    return (
      <ContextMenu key={conversation.id} items={getMenuItems(conversation)}>
        <div
          onClick={() => editingId !== conversation.id && onSelect(conversation.id)}
          className={`w-full px-3 py-2.5 text-left rounded-lg transition-all cursor-pointer group ${
            conversation.id === currentConversationId
              ? 'bg-primary/10 shadow-sm'
              : 'hover:bg-secondary/40'
          }`}
        >
        {/* Edit mode */}
        {editingId === conversation.id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              ref={editInputRef}
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleSaveEdit}
              className="flex-1 text-sm bg-input border border-border rounded px-2 py-1 focus:outline-none focus:border-primary min-w-0"
              placeholder={t('Conversation title...')}
            />
            <button
              onClick={handleSaveEdit}
              className="p-1 hover:bg-primary/20 text-primary rounded transition-colors flex-shrink-0"
              title={t('Save')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {/* Status indicator dot */}
              <StatusDot status={status} />
              {/* Feishu source indicator */}
              {conversation.id.startsWith('feishu-') && (
                <span className="flex-shrink-0 text-xs" title="From Feishu">📱</span>
              )}
              {/* Pin icon for pinned conversations */}
              {conversation.pinned && (
                <PinIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground/60" />
              )}
              <span className="text-sm truncate flex-1">
                {conversation.title}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(conversation.updatedAt)}
            </p>
          </>
        )}
        </div>
      </ContextMenu>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-card/30 backdrop-blur-xl relative"
      style={{ width, transition: isDragging ? 'none' : 'width 0.2s ease' }}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <span className="text-sm font-semibold text-foreground/80">{t('Conversations')}</span>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto px-2 space-y-1">
        {/* Pinned section */}
        {pinnedConversations.length > 0 && (
          <>
            {pinnedConversations.map(renderConversationItem)}
            {/* Separator between pinned and unpinned */}
            {unpinnedConversations.length > 0 && (
              <div className="border-b border-border/40 mx-2 my-1.5" />
            )}
          </>
        )}
        {/* Unpinned section */}
        {unpinnedConversations.map(renderConversationItem)}
      </div>

      {/* New conversation button */}
      <div className="p-3 pt-2">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-xl transition-all shadow-sm hover:shadow"
        >
          {t('New conversation')}
        </button>
      </div>

      {/* Space path */}
      {spacePath && (
        <div className="px-3 pb-3">
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors cursor-default overflow-hidden"
            title={spacePath}
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="truncate" dir="rtl">{spacePath}</span>
          </div>
        </div>
      )}

      {/* Drag handle - on right side with subtle visual */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-all z-20 ${
          isDragging ? 'bg-primary/30 w-1.5' : 'hover:bg-primary/20'
        }`}
        onMouseDown={handleMouseDown}
        title={t('Drag to resize width')}
      />
    </div>
  )
}
