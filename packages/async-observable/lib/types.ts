import { AsyncObservable, Subscription } from "./observable";

declare global {
  interface SymbolConstructor {
    readonly asyncObservable: symbol;
    // Ensure that the disposer symbols is defined in TypeScript
    readonly dispose: unique symbol;
    readonly asyncDispose: unique symbol;
  }
}

/** Utility Interfaces */

export type PromiseOrValue<T> = T | Promise<T>;

/** Operator Interfaces */

/**
 * A function type interface that describes a function that accepts one parameter `T`
 * and returns another parameter `R`.
 *
 * Usually used to describe {@link OperatorFunction} - it always takes a single
 * parameter (the source AsyncObservable) and returns another AsyncObservable.
 */
export interface UnaryFunction<T, R> {
  (value: T): R;
}

export interface OperatorFunction<T, R> extends UnaryFunction<AsyncObservable<T>, AsyncObservable<R>> {}

/**
 * A function type interface that describes a function that accepts and returns a parameter of the same type.
 *
 * Used to describe {@link OperatorFunction} with the only one type: `OperatorFunction<T, T>`.
 */
export interface MonoTypeOperatorFunction<T, R> extends OperatorFunction<T, R> {}

/** Subscription Interfaces */

export interface Unsubscribable {
  unsubscribe(): Promise<void>;
}

export interface SubscriptionLike extends Unsubscribable {
  unsubscribe(): Promise<void>;
  readonly closed: boolean;
}

export type Disposer = Subscription | Unsubscribable | Promise<any> | (() => void) | void;

/** Observer Interfaces */

/**
 * An object interface that describes a set of callback functions a user can use to get
 * notified of any events emitted by an {@link AsyncObservable}.
 */
export interface AsyncObserver<T> {
  /**
   * A callback function that is called when the {@link AsyncObservable} emits a new value.
   */
  push(value: T): PromiseOrValue<void>;
}

/** Observable Interfaces */

export interface Subscribable<T> {
  subscribe(observer: AsyncObserver<T>): SubscriptionLike;
}

export type AsyncObservableInput<T> =
  | AsyncObservable<T>
  | InteropAsyncObservable<T>
  | AsyncIterable<T>
  | PromiseLike<T>
  | ArrayLike<T>
  | Iterable<T>;

export interface InteropAsyncObservable<T> {
  [Symbol.asyncObservable](): Subscribable<T>;
}
