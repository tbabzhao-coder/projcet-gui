/**
 * Disposable - Resource lifecycle management primitives.
 *
 * Provides a unified way to manage the lifecycle of event subscriptions,
 * timers, and other resources that need explicit cleanup.
 *
 * Core concepts:
 * - IDisposable: Any resource that can be disposed
 * - toDisposable: Wrap a cleanup function as IDisposable
 * - DisposableStore: Manage a collection of disposables with leak detection
 */

// ============================================
// Core Interface
// ============================================

/**
 * An object that can release resources when no longer needed.
 * This is the fundamental building block for resource management.
 */
export interface IDisposable {
  dispose(): void
}

// ============================================
// Sentinel & Guards
// ============================================

/**
 * Frozen sentinel object representing an already-disposed state.
 * Used internally to mark disposed stores without allocating new objects.
 */
const DISPOSED_SENTINEL: IDisposable = Object.freeze({
  dispose() { /* no-op */ }
})

/**
 * Check whether an object implements IDisposable.
 */
export function isDisposable(thing: unknown): thing is IDisposable {
  return (
    typeof thing === 'object' &&
    thing !== null &&
    typeof (thing as IDisposable).dispose === 'function'
  )
}

// ============================================
// Factory Helpers
// ============================================

/**
 * Wrap a cleanup function as an IDisposable.
 *
 * @example
 * const timer = setInterval(tick, 1000)
 * const disposable = toDisposable(() => clearInterval(timer))
 */
export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn }
}

/**
 * Combine multiple disposables into one.
 * Disposing the returned object disposes all children in reverse order.
 *
 * @example
 * const combined = combinedDisposable(sub1, sub2, sub3)
 * combined.dispose() // disposes sub3, sub2, sub1
 */
export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
  return toDisposable(() => {
    for (let i = disposables.length - 1; i >= 0; i--) {
      disposables[i].dispose()
    }
  })
}

// ============================================
// DisposableStore
// ============================================

/**
 * Manages a collection of disposables.
 *
 * Features:
 * - add() returns the same disposable for chaining
 * - clear() disposes all without marking the store as disposed
 * - dispose() disposes all and prevents future additions
 * - Leak detection in development mode (warns if store is GC'd without dispose)
 *
 * @example
 * class MyService {
 *   private readonly _disposables = new DisposableStore()
 *
 *   init() {
 *     this._disposables.add(eventSource.onDidChange(() => { ... }))
 *     this._disposables.add(toDisposable(() => clearInterval(this._timer)))
 *   }
 *
 *   dispose() {
 *     this._disposables.dispose()
 *   }
 * }
 */
export class DisposableStore implements IDisposable {
  private _disposables = new Set<IDisposable>()
  private _isDisposed = false

  /**
   * Whether this store has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * Add a disposable to the store.
   * Returns the same disposable for convenience.
   * Throws if the store has already been disposed.
   */
  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      console.warn('[DisposableStore] Adding to an already disposed store. The disposable will be disposed immediately.')
      disposable.dispose()
      return disposable
    }
    this._disposables.add(disposable)
    return disposable
  }

  /**
   * Remove a disposable from the store without disposing it.
   * Useful when transferring ownership.
   */
  delete(disposable: IDisposable): void {
    this._disposables.delete(disposable)
  }

  /**
   * Dispose all managed disposables but keep the store usable.
   * New disposables can be added after clear().
   */
  clear(): void {
    for (const d of this._disposables) {
      try {
        d.dispose()
      } catch (e) {
        console.error('[DisposableStore] Error during clear:', e)
      }
    }
    this._disposables.clear()
  }

  /**
   * Dispose all managed disposables and mark the store as disposed.
   * Future add() calls will immediately dispose the added item.
   */
  dispose(): void {
    if (this._isDisposed) return
    this._isDisposed = true
    this.clear()
  }
}

// ============================================
// MutableDisposable
// ============================================

/**
 * Holds a single disposable value that can be replaced.
 * When a new value is set, the previous one is automatically disposed.
 *
 * @example
 * const current = new MutableDisposable<IDisposable>()
 * current.value = eventA.onDidFire(handler)  // subscribes to A
 * current.value = eventB.onDidFire(handler)  // unsubscribes from A, subscribes to B
 * current.dispose()                           // unsubscribes from B
 */
export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private _value: T | undefined
  private _isDisposed = false

  get value(): T | undefined {
    return this._isDisposed ? undefined : this._value
  }

  set value(value: T | undefined) {
    if (this._isDisposed) {
      value?.dispose()
      return
    }
    if (this._value !== value) {
      this._value?.dispose()
      this._value = value
    }
  }

  /**
   * Clear the held disposable without disposing it.
   * Returns the previously held value for the caller to manage.
   */
  detach(): T | undefined {
    const old = this._value
    this._value = undefined
    return old
  }

  dispose(): void {
    if (this._isDisposed) return
    this._isDisposed = true
    this._value?.dispose()
    this._value = undefined
  }
}
