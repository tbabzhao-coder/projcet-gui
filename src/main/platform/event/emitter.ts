/**
 * Emitter<T> - Core event primitive for service-to-service communication.
 *
 * Each service owns its events and exposes them as read-only Event<T>
 * subscriptions. Consumers subscribe with full type safety; there are
 * no string keys or central bus.
 *
 * Design principles:
 * - Type-safe: Event<T> carries the payload type through to listeners
 * - Decentralized: Each service declares its own events (no global bus for service events)
 * - Lifecycle-aware: Returns IDisposable for deterministic cleanup
 * - Error-isolated: One listener failure doesn't break others
 * - Leak-detectable: Development-mode warnings for common mistakes
 *
 * @example
 * // Producer side (service)
 * class ConfigService {
 *   private readonly _onDidChange = new Emitter<ConfigChangeEvent>()
 *   readonly onDidChange: Event<ConfigChangeEvent> = this._onDidChange.event
 *
 *   updateConfig(newConfig: Config) {
 *     // ... update logic
 *     this._onDidChange.fire({ key, oldValue, newValue })
 *   }
 *
 *   dispose() {
 *     this._onDidChange.dispose()
 *   }
 * }
 *
 * // Consumer side
 * const sub = configService.onDidChange((e) => {
 *   console.log(`Config changed: ${e.key}`)
 * })
 * // Later:
 * sub.dispose()
 */

import type { IDisposable } from './disposable'

// ============================================
// Event Type
// ============================================

/**
 * A read-only event subscription interface.
 *
 * Call the event function with a listener to subscribe.
 * Returns an IDisposable to unsubscribe.
 *
 * @example
 * const disposable = myService.onDidChange((data) => { ... })
 * disposable.dispose() // unsubscribe
 */
export interface Event<T> {
  (listener: (e: T) => void): IDisposable
}

// ============================================
// Emitter
// ============================================

/**
 * Internal listener node. Using a linked-list-style structure for efficient
 * add/remove during iteration without index-shift bugs.
 */
interface ListenerEntry<T> {
  listener: (e: T) => void
  disposed: boolean
}

/**
 * Default leak warning threshold.
 * If an Emitter accumulates more than this many listeners, a warning is logged.
 * This catches the common mistake of subscribing in a loop without disposing.
 * Set to 0 to disable.
 */
const DEFAULT_LEAK_WARNING_THRESHOLD = 50

/**
 * Options for creating an Emitter.
 */
export interface EmitterOptions {
  /**
   * Listener count threshold before logging a leak warning.
   * Set to 0 to disable the check for this emitter.
   * Default: 50
   */
  leakWarningThreshold?: number
}

/**
 * Emitter<T> — the write side of an event.
 *
 * The owner calls fire(value) to notify all listeners.
 * Consumers subscribe via the read-only .event property.
 *
 * Lifecycle:
 * 1. Create: `const _onFoo = new Emitter<FooEvent>()`
 * 2. Expose: `readonly onFoo: Event<FooEvent> = this._onFoo.event`
 * 3. Fire:   `this._onFoo.fire(eventData)`
 * 4. Dispose: `this._onFoo.dispose()` — removes all listeners
 */
export class Emitter<T> {
  private _listeners: ListenerEntry<T>[] = []
  private _event: Event<T> | undefined
  private _disposed = false
  private _firing = false
  private _leakWarningThreshold: number

  constructor(options?: EmitterOptions) {
    this._leakWarningThreshold = options?.leakWarningThreshold ?? DEFAULT_LEAK_WARNING_THRESHOLD
  }

  /**
   * The read-only event subscription interface.
   * Lazily created on first access.
   */
  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => void): IDisposable => {
        if (this._disposed) {
          console.warn('[Emitter] Subscribing to a disposed emitter. The listener will never fire.')
          return { dispose() { /* no-op */ } }
        }

        const entry: ListenerEntry<T> = { listener, disposed: false }
        this._listeners.push(entry)

        // Leak detection
        if (
          this._leakWarningThreshold > 0 &&
          this._listeners.length > this._leakWarningThreshold
        ) {
          console.warn(
            `[Emitter] Potential listener leak detected: ${this._listeners.length} listeners. ` +
            `Threshold is ${this._leakWarningThreshold}. Use dispose() to unsubscribe.`
          )
        }

        return {
          dispose: () => {
            if (entry.disposed) return
            entry.disposed = true

            // If we're currently firing, defer removal to avoid index shift
            if (!this._firing) {
              const idx = this._listeners.indexOf(entry)
              if (idx >= 0) {
                this._listeners.splice(idx, 1)
              }
            }
          }
        }
      }
    }
    return this._event
  }

  /**
   * Notify all listeners with the given value.
   *
   * Listeners are called synchronously in subscription order.
   * If a listener throws, the error is logged and remaining listeners
   * still execute (error isolation).
   */
  fire(value: T): void {
    if (this._disposed) return

    this._firing = true
    const listeners = this._listeners
    for (let i = 0; i < listeners.length; i++) {
      const entry = listeners[i]
      if (entry.disposed) continue
      try {
        entry.listener(value)
      } catch (e) {
        console.error('[Emitter] Listener error:', e)
      }
    }
    this._firing = false

    // Compact: remove disposed entries after firing
    if (this._listeners.some(e => e.disposed)) {
      this._listeners = this._listeners.filter(e => !e.disposed)
    }
  }

  /**
   * Check if this emitter has any active listeners.
   */
  hasListeners(): boolean {
    return this._listeners.some(e => !e.disposed)
  }

  /**
   * Remove all listeners and mark as disposed.
   * Future fire() calls are silently ignored.
   * Future subscriptions log a warning and return a no-op disposable.
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._listeners = []
    this._event = undefined
  }
}
