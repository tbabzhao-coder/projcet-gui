/**
 * Event Utilities - Combinators and helpers for composing events.
 *
 * These utilities transform and combine Event<T> instances without
 * requiring access to the underlying Emitter. They work purely with
 * the read-only Event<T> interface.
 */

import type { IDisposable } from './disposable'
import { DisposableStore } from './disposable'
import { type Event, Emitter } from './emitter'

// ============================================
// Event Namespace (Combinators)
// ============================================

/**
 * Subscribe to an event but only fire the listener once.
 *
 * @example
 * EventUtils.once(service.onDidInit)(() => {
 *   console.log('Service initialized (fires only once)')
 * })
 */
export function once<T>(event: Event<T>): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    let fired = false
    const sub = event((e) => {
      if (fired) return
      fired = true
      sub.dispose()
      listener(e)
    })
    return sub
  }
}

/**
 * Transform event data before delivering to listeners.
 *
 * @example
 * const onNameChange = EventUtils.map(
 *   configService.onDidChange,
 *   (e) => e.newValue.name
 * )
 */
export function map<T, U>(event: Event<T>, fn: (e: T) => U): Event<U> {
  return (listener: (e: U) => void): IDisposable => {
    return event((e) => listener(fn(e)))
  }
}

/**
 * Only deliver events that pass the predicate.
 *
 * @example
 * const onError = EventUtils.filter(
 *   agent.onDidEmitEvent,
 *   (e) => e.channel === 'agent:error'
 * )
 */
export function filter<T>(event: Event<T>, predicate: (e: T) => boolean): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    return event((e) => {
      if (predicate(e)) listener(e)
    })
  }
}

/**
 * Debounce an event. The listener is called after the event stops firing
 * for the specified delay (in ms). Only the last event value is delivered.
 *
 * @example
 * const onSettled = EventUtils.debounce(
 *   editor.onDidChangeContent,
 *   300
 * )
 */
export function debounce<T>(event: Event<T>, delay: number): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sub = event((e) => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        listener(e)
      }, delay)
    })
    return {
      dispose() {
        if (timer !== undefined) clearTimeout(timer)
        sub.dispose()
      }
    }
  }
}

/**
 * Merge multiple events of the same type into one.
 *
 * @example
 * const onAnyChange = EventUtils.merge(
 *   configService.onDidChange,
 *   themeService.onDidChange,
 *   windowService.onDidChange
 * )
 */
export function merge<T>(...events: Event<T>[]): Event<T> {
  return (listener: (e: T) => void): IDisposable => {
    const store = new DisposableStore()
    for (const event of events) {
      store.add(event(listener))
    }
    return store
  }
}
