/**
 * Platform Event System - Public API
 *
 * Core event primitives for Project4's service-to-service communication.
 *
 * Design principles:
 * - Decentralized: each service owns its events via Emitter<T>
 * - Type-safe: Event<T> carries payload type to listeners
 * - Lifecycle-aware: IDisposable for deterministic cleanup
 *
 * This module is the single import point for the event system:
 *
 * @example
 * import { Emitter, type Event, type IDisposable, DisposableStore } from '../../platform/event'
 */

// Disposable primitives
export {
  type IDisposable,
  isDisposable,
  toDisposable,
  combinedDisposable,
  DisposableStore,
  MutableDisposable
} from './disposable'

// Emitter & Event
export { Emitter, type Event, type EmitterOptions } from './emitter'

// Event combinators
export {
  once,
  map,
  filter,
  debounce,
  merge
} from './event-utils'
