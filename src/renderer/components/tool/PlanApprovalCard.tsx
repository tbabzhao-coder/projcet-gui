/**
 * PlanApprovalCard - Displays plan content and approval options for ExitPlanMode
 * Shows the AI's plan in markdown format with approve/reject/feedback buttons
 */

import { Check, XCircle, MessageSquareText } from 'lucide-react'
import { useChatStore } from '../../stores/chat.store'
import { useTranslation } from '../../i18n'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'

interface PlanApprovalCardProps {
  planContent: string
  conversationId: string
}

export function PlanApprovalCard({ planContent, conversationId }: PlanApprovalCardProps) {
  const { t } = useTranslation()
  const { approveTool, rejectTool, stopGeneration } = useChatStore()

  const handleApprove = async () => {
    try {
      await approveTool(conversationId)
    } catch (error) {
      console.error('Failed to approve plan:', error)
    }
  }

  const handleReject = async () => {
    try {
      // Reject + interrupt to stop Agent immediately
      await rejectTool(conversationId, '[INTERRUPT]User rejected the plan.')
    } catch (error) {
      console.error('Failed to reject plan:', error)
    }
  }

  // "Give Feedback":
  // 1. Reject the ExitPlanMode (so SDK doesn't proceed)
  // 2. Stop generation (so Agent turn ends)
  // 3. Show plan content in bubble with prompt for user feedback
  const handleGiveFeedback = async () => {
    try {
      // First reject to resolve the pending permission, then stop
      await rejectTool(
        conversationId,
        '[INTERRUPT]User wants to modify the plan.',
        `${content}\n\n---\n\n> ${t('Please describe what you want to change in the plan above, then send your message.')}`
      )
    } catch (error) {
      console.error('Failed to give feedback:', error)
    }
  }

  // Strip the leading emoji prefix from description if present
  const content = planContent.replace(/^📋 AI 已完成规划.*?\n\n/, '')

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card border-primary/20 shadow-lg animate-fade-in">
      {/* Plan content - markdown rendered, no height limit */}
      <div className="p-5">
        <div className="overflow-auto p-4 bg-secondary/30 rounded-xl">
          <MarkdownRenderer content={content} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-5">
        <p className="text-xs text-muted-foreground mb-3">
          {t('AI has completed planning. Approve to start execution, or reject to stay in plan mode.')}
        </p>
        <div className="flex gap-2">
          {/* Approve */}
          <button
            onClick={handleApprove}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium
              bg-green-500/20 text-green-400 rounded-xl
              hover:bg-green-500/30 active:bg-green-500/40
              transition-all duration-150"
          >
            <Check size={16} />
            {t('Approve')}
          </button>

          {/* Give feedback - stop and show plan in bubble */}
          <button
            onClick={handleGiveFeedback}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium
              bg-primary/20 text-primary rounded-xl
              hover:bg-primary/30 active:bg-primary/40
              transition-all duration-150"
          >
            <MessageSquareText size={16} />
            {t('Give Feedback')}
          </button>

          {/* Reject */}
          <button
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium
              bg-red-500/20 text-red-400 rounded-xl
              hover:bg-red-500/30 active:bg-red-500/40
              transition-all duration-150"
          >
            <XCircle size={16} />
            {t('Reject')}
          </button>
        </div>
      </div>
    </div>
  )
}
