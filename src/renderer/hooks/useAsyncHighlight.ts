/**
 * useAsyncHighlight Hook
 *
 * Performs code highlighting asynchronously using requestAnimationFrame.
 * Prevents blocking the main thread during syntax highlighting.
 *
 * Usage:
 *   const highlightedCode = useAsyncHighlight(code, language)
 *   return <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />
 */

import { useEffect, useState } from 'react'
import hljs from 'highlight.js'

export function useAsyncHighlight(code: string, language: string): string {
  const [highlightedCode, setHighlightedCode] = useState('')

  useEffect(() => {
    let cancelled = false

    // Use RAF to defer highlighting to next frame
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return

      try {
        const result = language && hljs.getLanguage(language)
          ? hljs.highlight(code, { language }).value
          : hljs.highlightAuto(code).value

        if (!cancelled) {
          setHighlightedCode(result)
        }
      } catch (error) {
        console.error('[useAsyncHighlight] Failed to highlight code:', error)
        // Fallback to plain text
        if (!cancelled) {
          setHighlightedCode(code)
        }
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [code, language])

  return highlightedCode
}
