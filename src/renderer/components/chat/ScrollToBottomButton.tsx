/**
 * Scroll to Bottom Button
 *
 * Floating button that appears when user scrolls up in chat.
 * Clicking it smoothly scrolls back to the latest message.
 * Design follows ChatGPT/Claude Web style.
 */

import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useTranslation } from '../../i18n'

interface ScrollToBottomButtonProps {
  /** Whether to show the button */
  visible: boolean
  /** Callback when button is clicked */
  onClick: () => void
  /** Optional class name */
  className?: string
}

export function ScrollToBottomButton({
  visible,
  onClick,
  className
}: ScrollToBottomButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      onClick={onClick}
      className={cn(
        // Base styles - absolute positioned in parent wrapper
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-10',
        'flex items-center gap-2 px-4 py-2',
        'rounded-full shadow-lg',
        // Colors - Apple style glass effect
        'bg-card/90 backdrop-blur-md',
        'border border-border',
        'text-sm text-foreground-secondary font-medium',
        // Hover state - subtle highlight
        'hover:bg-card hover:text-foreground',
        'hover:shadow-xl hover:scale-105',
        'active:scale-95',
        // Transition - smooth Apple-style
        'transition-all duration-200 ease-out',
        // Visibility animation
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-2 pointer-events-none',
        className
      )}
      aria-label={t('Scroll to latest message')}
    >
      <ChevronDown className="w-4 h-4" />
      <span>{t('Back to latest')}</span>
    </button>
  )
}
