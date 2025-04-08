import { from } from "./from";
import { CleanupAction, PassthroughScheduler, Scheduler } from "./scheduler";
import { CallbackSubscriber, Subscriber } from "./subscriber";
import {
  type SubscriptionLike,
  type UnaryFunction,
  type OperatorFunction,
  type SchedulerLike,
  type SubscriberCallback,
} from "./types";

/**
 * Represents any number of values over any amount of time by way of an async
 * generator that can be subscribed to and cancelled from.
 *
 * AsyncObservable instances can be created from common iterable and
 * stream-like types by using the {@link from} method.
 *
 * @example
 * ```ts
 * const observable = new AsyncObservable(async function* () {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * });
 * ```
 *
 * @template T - The type of the values emitted by the AsyncObservable.
 * @see [Observable Pattern](/guide/concepts/observable-pattern)
 * @hideconstructor
 */
export class AsyncObservable<T> implements SubscriptionLike, AsyncIterable<T> {
  /** @internal */
  _subscribers: Set<Subscriber<T>> = new Set();
  /** @internal */
  _scheduler: SchedulerLike = new Scheduler();

  get subscribers(): Subscriber<T>[] {
    return Array.from(this._subscribers.values());
  }

  /**
   * @param generator The function that returns the async generator that will be used to emit
   * values. This function will be called every time a new subscriber is created.
   */
  constructor(generator?: (this: AsyncObservable<T>, sub: Subscriber<T>) => AsyncGenerator<T>) {
    if (generator) this._generator = generator.bind(this);
  }

  /**
   * Returns a class that uses a PassthroughScheduler that is bound to the
   * current instance. Any work done by subscribers created from this class
   * will be pinned to the scheduler of the current instance. This is useful
   * for creating a new AsyncObservable that is a composition of the current
   * AsyncObservable (i.e. any operator function).
   *
   * The returned class maintains the parent-child relationship in the scheduler
   * hierarchy, ensuring that cancellation of the parent observable properly
   * propagates to all derived observables.
   *
   * @returns A new AsyncObservable that is bound to the current instance.
   * @ignore
   */
  get AsyncObservable() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const source = this;
    return class<BT> extends AsyncObservable<BT> {
      constructor(
        generator?: (this: AsyncObservable<BT>, sub: Subscriber<BT>) => AsyncGenerator<BT>
      ) {
        super(generator);
        this._scheduler = new PassthroughScheduler(source._scheduler, source);
      }
    };
  }

  /**
   * Returns a bound AsyncObservable that will emit values from this AsyncObservable in order.
   * This effectively creates a distinct "dummy" observable that acts as a generic wrapper
   * around the current AsyncObservable.
   *
   * @returns A new AsyncObservable that wraps this AsyncObservable and emits the same values.
   */
  stub(): AsyncObservable<T> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const source = this;
    return new this.AsyncObservable<T>(async function* () {
      for await (const value of source) {
        yield value;
      }
    });
  }

  /**
   * Invokes an execution of an AsyncObservable and registers a new Subscriber
   * that will call the provided callback for each value emitted by the
   * generator. The callback will be passed the value of the current value as
   * an argument.
   *
   * `subscribe` is not a regular operator, but a method that calls
   * AsyncObservable's internal generator function and returns a new
   * Subscriber. It might be misinterpreted that AsyncObservable works like an
   * event emitter where the callback is the event handler that is called any
   * time a hypothetical `push` method is called on an instance. This is not
   * the case (but this can be achieved using a {@link Stream}). It is a
   * library implementation which defines what will be emitted by an
   * AsyncObservable, and when it will be emitted. This means that calling
   * `subscribe` is actually the moment when AsyncObservable starts its work,
   * not when it is created, as it is often the thought.
   *
   * Apart from starting the execution of an AsyncObservable, this method
   * allows you to listen for values that an AsyncObservable emits, as well as
   * waiting for the execution of the AsyncObservable to complete by using the
   * returned `Subscriber` instance like you would with a Promise.
   *
   * You can also subscribe without providing a callback. This may be the case
   * where you're not interested in the values emitted by the generator, but
   * you want to wait for the execution of the AsyncObservable to complete.
   *
   * The returned Subscriber object also acts like a Promise which can be
   * awaited to wait for the AsyncObservable's execution to complete. Any
   * errors that are thrown by this function will be propagated to the
   * promise's rejection handler.
   *
   * @param callback The callback to execute for each value emitted by the generator. This callback
   * will be passed the value as an argument.
   * @returns A new Subscriber that can be used to unsubscribe from the AsyncObservable.
   */
  subscribe(callback?: SubscriberCallback<T>): Subscriber<T> {
    if (!callback) callback = () => {};
    const subscriber = new CallbackSubscriber(this, callback);
    this._subscribers.add(subscriber);
    this._scheduler.schedule(
      subscriber,
      new CleanupAction(() => this._subscribers.delete(subscriber))
    );
    return subscriber;
  }

  /**
   * Cancels all subscribers from this AsyncObservable. This will stop the
   * execution of all active subscribers and remove them from the internal
   * subscriber list. While {@link drain} will resolve when all subscribers
   * have completed, this method will send an early interrupt signal to all
   * subscribers, causing them to exit their generator prematurely.
   *
   * This is useful when you want to clean up all subscriptions at once, rather
   * than cancelling from each subscriber individually. This method is also the
   * implementation of the standard disposer symbols, which means that it will
   * be called when the AsyncObservable is disposed either by calling the
   * dispose method directly or using explicit resource management.
   *
   * @returns A Promise that resolves when all subscribers have been cancelled.
   */
  cancel(): Promise<void> {
    const cancelPromises = Array.from(this.subscribers).map((subscriber) => subscriber.cancel());
    return Promise.all(cancelPromises)
      .then(() => undefined)
      .finally(() => this._scheduler.dispose(this));
  }

  /** @internal */
  // eslint-disable-next-line require-yield
  async *_generator(_: Subscriber<T>): AsyncGenerator<T> {
    return;
  }

  /**
   * Used to stitch together functional operators into a chain.
   *
   * @returns {any} The output of all the operators having been called in the order they were
   * passed in with the AsyncObservable as the first argument.
   */
  pipe(...operations: UnaryFunction<any, any>[]): unknown {
    // we still want to return a dummy observable if no operations are provided
    if (operations.length === 0) return this.stub();
    return operations.reduce(pipeReducer, this as any);
  }

  /**
   * Method to expose the utility function {@link #from} as a static method on
   * AsyncObservable. This is useful for creating an AsyncObservable from a
   * common iterable or stream-like type.
   *
   * @param source The source to create an AsyncObservable from
   * @returns An AsyncObservable that emits the values from the source
   */
  static from = from;

  /** AsyncGenerator<T> @ignore */
  [Symbol.asyncIterator](): AsyncGenerator<T> {
    const subscriber = new Subscriber(this);
    this._subscribers.add(subscriber);
    this._scheduler.schedule(
      subscriber,
      new CleanupAction(() => this._subscribers.delete(subscriber))
    );
    const iter = subscriber[Symbol.asyncIterator]();
    return {
      ...iter,
      [Symbol.asyncIterator]() {
        return this;
      },
      [Symbol.asyncDispose]: async () => {
        await subscriber.cancel();
      },
    };
  }

  /**
   * Returns a promise that resolves when all the work scheduled against the
   * observable has completed (i.e. subscriber callbacks or cleanup handlers).
   */
  drain(): Promise<void> {
    return this._scheduler.promise(this);
  }

  /**
   * Schedules a cleanup action that gets executed when the observable is disposed of.
   * Optionally, a callback can be provided to inform the behavior of the created action.
   *
   * @param onfinally - Optional callback to execute after completion or error
   * @returns A promise that resolves when the action has completed
   */
  finally(onfinally?: (() => void) | null) {
    onfinally ??= () => {};
    const action = new CleanupAction(onfinally);
    this._scheduler.schedule(this, action);
    return action.signal.asPromise();
  }
}

// Even though AsyncObservable only conditionally implements disposer symbols
// if it's available, we still need to declare it here so that TypeScript knows
// that it exists on the prototype when it is available.

export interface AsyncObservable<T> {
  /** @ignore */
  [Symbol.dispose](): void;
  /** @ignore */
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  AsyncObservable.prototype[Symbol.dispose] = AsyncObservable.prototype.cancel;
}

if (typeof Symbol.asyncDispose === "symbol") {
  AsyncObservable.prototype[Symbol.asyncDispose] = AsyncObservable.prototype.cancel;
}

export interface AsyncObservable<T> {
  /** @ignore */
  pipe(): AsyncObservable<T>;
  /** @ignore */
  pipe<A>(op1: UnaryFunction<AsyncObservable<T>, A>): A;
  /** @ignore */
  pipe<A, B>(op1: UnaryFunction<AsyncObservable<T>, A>, op2: UnaryFunction<A, B>): B;
  /** @ignore */
  pipe<A, B, C>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>
  ): C;
  /** @ignore */
  pipe<A, B, C, D>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>
  ): D;
  /** @ignore */
  pipe<A, B, C, D, E>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>
  ): E;
  /** @ignore */
  pipe<A, B, C, D, E, F>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>
  ): F;
  /** @ignore */
  pipe<A, B, C, D, E, F, G>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>
  ): G;
  /** @ignore */
  pipe<A, B, C, D, E, F, G, H>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>,
    op8: UnaryFunction<G, H>
  ): H;
  /** @ignore */
  pipe<A, B, C, D, E, F, G, H, I>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>,
    op8: UnaryFunction<G, H>,
    op9: UnaryFunction<H, I>
  ): I;
  /** @ignore */
  pipe<A, B, C, D, E, F, G, H, I>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>,
    op8: UnaryFunction<G, H>,
    op9: UnaryFunction<H, I>,
    ...operations: OperatorFunction<any, any>[]
  ): AsyncObservable<unknown>;
  /** @ignore */
  pipe<A, B, C, D, E, F, G, H, I>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>,
    op8: UnaryFunction<G, H>,
    op9: UnaryFunction<H, I>,
    ...operations: UnaryFunction<any, any>[]
  ): unknown;
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>) {
  return fn(prev);
}

Object.defineProperty(Symbol, "asyncObservable", { value: Symbol("asyncObservable") });
