import { type AsyncObservable } from "./observable";
import { type ScheduledAction } from "./scheduler";
import { type Subscriber } from "./subscriber";

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
 * A function type interface that describes a function that accepts one
 * parameter `T` and returns another parameter `R`.
 *
 * Usually used to describe {@link OperatorFunction} - it always takes a single
 * parameter (the source AsyncObservable) and returns another AsyncObservable.
 */
export type UnaryFunction<T, R> = (value: T) => R;

/**
 * A function type interface that represents an operator that transforms an AsyncObservable of type
 * T into an AsyncObservable of type R.
 *
 * Operators are the building blocks for transforming, filtering, and manipulating observables.
 * They take a source observable as input and return a new observable with the applied
 * transformation.
 *
 * @template T - The type of the source AsyncObservable's values
 * @template R - The type of the resulting AsyncObservable's values
 *
 * @see [Transforming Data](/guide/concepts/transforming-data)
 */
export type OperatorFunction<T, R> = UnaryFunction<AsyncObservable<T>, AsyncObservable<R>>;

/**
 * A function type interface that describes a function that accepts and returns
 * a parameter of the same type.
 *
 * Used to describe {@link OperatorFunction} with the only one type:
 * `OperatorFunction<T, T>`.
 *
 * @template T - The type of the source AsyncObservable's values
 *
 * @see [Transforming Data](/guide/concepts/transforming-data)
 */
export type MonoTypeOperatorFunction<T> = OperatorFunction<T, T>;

/** Subscription Interfaces */

/**
 * The function signature for a subscriber callback.
 */
export type SubscriberCallback<T> = (this: Subscriber<T>, value: T) => PromiseOrValue<any>;

export interface SubscriptionLike {
  cancel(): Promise<void>;
}

/** Scheduler Interfaces */

/** @internal */
export type SchedulerSubject = AsyncObservable<any> | Subscriber<any>;

/**
 * The interface that defines the core scheduling capabilities in eventkit.
 * A scheduler is the logical unit that coordinates all work associated with a subject.
 */
export interface SchedulerLike {
  /**
   * Adds work to a subject. Work is represented as promise-like objects.
   * A subject is considered "complete" when all of its work promises have resolved.
   * @param subject The observable or subscriber to add work to
   * @param promise The work to be added, represented as a promise
   */
  add(subject: SchedulerSubject, promise: PromiseLike<void>): void;

  /**
   * Schedules work to be executed for a subject. This may internally call `add()`
   * to add the work and orchestrate/defer/forward the work's execution if needed.
   * @param subject The observable or subscriber to schedule work for
   * @param action The scheduled action representing the work to be executed
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void;

  /**
   * Returns a promise that resolves when all work associated with the subject is complete.
   * This is what's called when you `await observable.drain()` or `await subscriber`.
   * @param subject The observable or subscriber to wait for completion
   * @returns A promise that resolves when all work is complete
   */
  promise(subject: SchedulerSubject): Promise<void>;

  /**
   * Disposes of a subject early, canceling any pending work.
   * This is what's called when you `await observable.cancel()` or `await subscriber.cancel()`.
   * @param subject The observable or subscriber to dispose
   * @returns A promise that resolves when disposal is complete
   */
  dispose(subject: SchedulerSubject): Promise<void>;
}

/** Observable Interfaces */

/**
 * Describes what types can be used as observable inputs in the {@link from} function
 *
 * @template T - The type of the values emitted by an AsyncObservable created from this input
 */
export type AsyncObservableInput<T> =
  | AsyncObservable<T>
  | InteropAsyncObservable<T>
  | ArrayLike<T>
  | PromiseLike<T>
  | AsyncIterable<T>
  | Iterable<T>
  | ReadableStreamLike<T>;

/** @ignore */
export interface InteropAsyncObservable<T> {
  [Symbol.asyncObservable](): AsyncIterable<T>;
}

/** Other Interfaces */

/**
 * Extracts the type from an `AsyncObservableInput<any>`. If you have
 * `O extends AsyncObservableInput<any>` and you pass in
 * `AsyncObservable<number>`, or `Promise<number>`, etc, it will type as
 * `number`.
 * @template O - The type thats emitted by the observable type
 */
export type ObservedValueOf<O> = O extends AsyncObservableInput<infer T> ? T : never;

/**
 * The base signature eventkit will look for to identify and use
 * a [ReadableStream](https://streams.spec.whatwg.org/#rs-class)
 * as an {@link AsyncObservableInput} source.
 */
export type ReadableStreamLike<T> = Pick<ReadableStream<T>, "getReader">;
