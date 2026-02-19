/**
 * useLazyVisible Hook
 *
 * Uses IntersectionObserver to defer rendering until element is visible.
 * Prevents rendering all thoughts immediately, improving performance for long conversations.
 *
 * Usage:
 *   const { ref, isVisible } = useLazyVisible()
 *   return <div ref={ref}>{isVisible ? <ExpensiveComponent /> : <Placeholder />}</div>
 */

import { useEffect, useRef, useState } from 'react'

interface UseLazyVisibleOptions {
  /** Root margin for IntersectionObserver (default: '200px' for preloading) */
  rootMargin?: string
  /** Threshold for visibility (default: 0.01) */
  threshold?: number
}

export function useLazyVisible(options: UseLazyVisibleOptions = {}) {
  const { rootMargin = '200px', threshold = 0.01 } = options
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // If already visible, no need to observe
    if (isVisible) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsVisible(true)
          // Once visible, stop observing (one-time render)
          observer.disconnect()
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [isVisible, rootMargin, threshold])

  return { ref, isVisible }
}
