import { AsyncObservable } from "./observable";

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
  cancel(): Promise<void>;
}

export interface AsyncObserver<T> {
  (this: Subscriber<T>, value: T): PromiseOrValue<any>;
}

export interface SubscriptionLike extends Unsubscribable {
  cancel(): Promise<void>;
}

/** Scheduler Interfaces */

export interface SchedulerLike {
  add(subscriber: Subscriber<any>, execution: Promise<void>): void;
  schedule(subscriber: Subscriber<any>, callback: () => Promise<void>): void;
  promise(sub?: Subscriber<any>): Promise<void>;
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

/** Other Interfaces */

/**
 * Extracts the type from an `AsyncObservableInput<any>`. If you have
 * `O extends AsyncObservableInput<any>` and you pass in `AsyncObservable<number>`, or
 * `Promise<number>`, etc, it will type as `number`.
 */
export type ObservedValueOf<O> = O extends AsyncObservableInput<infer T> ? T : never;

/**
 * The base signature eventkit will look for to identify and use
 * a [ReadableStream](https://streams.spec.whatwg.org/#rs-class)
 * as an {@link AsyncObservableInput} source.
 */
export type ReadableStreamLike<T> = Pick<ReadableStream<T>, "getReader">;
