import { from } from "./from";
import { CleanupAction, PassthroughScheduler, ScheduledAction, Scheduler } from "./scheduler";
import {
  type SubscriptionLike,
  type UnaryFunction,
  type OperatorFunction,
  type AsyncObserver,
  type SchedulerLike,
} from "./types";

export const kCancelSignal = Symbol("cancelSignal");

/**
 * Represents an active execution and consumer of an async generator (like
 * AsyncObservable).
 *
 * A Subscriber is both an AsyncIterable and a PromiseLike, allowing it to be
 * used in for-await-of loops and with await. When used as a Promise, it
 * resolves when the generator completes or errors. If any errors occur during
 * the execution or cleanup of the generator, they will always be sent to the
 * promise's rejection handler. This means that you should always `await` the
 * Subscriber somewhere to tack any errors that occur onto a different closure
 * as to avoid uncaught errors.
 *
 * The Subscriber also implements SubscriptionLike, providing an cancel()
 * method that can be used to cancel the execution of the generator. When
 * cancelled, the Subscriber will call the generator's return() method and
 * wait for any work associated with the Subscriber to complete.
 *
 * It's worth noting that when using Subscriber as an async iterator (i.e. in a
 * for-await-of loop), Subscriber does not attempt to clone the values of the
 * generator across multiple accesses of the iterator object. This means that
 * if you use Subscriber in multiple for-await-of loops that run in parallel
 * (i.e. by calling the [Symbol.asyncIterator]() method in multiple places),
 * the sequence of values returned by the `next()` method won't be consistent
 * with the sequence of values emitted by the generator.
 *
 * Subscribers are a common type in eventkit, but is rarely used as a public
 * interface. They should be initialized using the {@link
 * AsyncObservable.subscribe} method or by using the AsyncObservable like an
 * async iterator.
 */
export class Subscriber<T>
  implements SubscriptionLike, PromiseLike<void>, AsyncIterable<T, void, void>
{
  /** @internal */
  _generator: AsyncGenerator<T> | null = null;
  /** @internal */
  _observable: AsyncObservable<T>;
  /** @internal */
  _returnSignal: PromiseWithResolvers<void>;
  /** @internal */
  _cancelSignal: PromiseWithResolvers<typeof kCancelSignal>;

  /** @internal */
  protected get generator(): AsyncGenerator<T> {
    return (this._generator ??= this._observable._generator(this));
  }

  /** @internal */
  protected get scheduler(): SchedulerLike {
    return this._observable._scheduler;
  }

  constructor(observable: AsyncObservable<T>) {
    this._observable = observable;
    this._returnSignal = Promise.withResolvers<void>();
    this._cancelSignal = Promise.withResolvers<typeof kCancelSignal>();
    this.scheduler.add(this, this._returnSignal.promise);
  }

  /** SubscriptionLike */

  /**
   * Cancels the generator, meaning that the generator will be disposed of,
   * and any resources held by the generator will be released.
   *
   * Calling this method starts an immediate cleanup of the Subscriber. In the
   * case that you want to be notified of when the subscriber has closed
   * without causing an interrupt, you can use the {@link #then} method.
   *
   * Note that the promise returned by this method doesn't represent the actual
   * execution of the generator, meaning that any errors that occur during the
   * execution of the generator will not be reflected in the promise returned
   * by this method. You can observe the status of the current execution by
   * using the {@link #then} method or catching any errors using the {@link
   * #catch} method. Because this class implements PromiseLike, you can also
   * use the Subscriber in an await expression to yield the state of the
   * generator's execution.
   *
   * @returns A promise that resolves when the generator has been cleaned up.
   */
  cancel(): Promise<void> {
    // Generators have a synchronous queue of all the operations it receives
    // (next/throw/return) which if we're waiting on a next() call that never
    // comes, we'll never be able to break out of the generator and perform an
    // early return since the first next() call is perpertually blocked. To
    // solve this, we resolve the cancel signal which can be read off of the
    // Subscriber to indicate when the subscriber has been cancelled, and in
    // turn break out of the generator. This should only really be applicable to
    // generators that don't have an affixed execution context with potentially
    // never-ending operations like a Stream. In every other scenario we should
    // rely on the generator state to determine when the generator has
    // completed.
    this._cancelSignal.resolve(kCancelSignal);
    return this[Symbol.asyncIterator]()
      .return(null)
      .then(() => Promise.resolve())
      .finally(() => this.scheduler.promise(this));
  }

  get [kCancelSignal]() {
    return this._cancelSignal.promise;
  }

  /** PromiseLike<void> */

  /**
   * Returns a promise that resolves when the subscriber has completed execution
   * and cleaned up, or rejects if an error occurs during. This allows
   * Subscriber instances to be used with await expressions and Promise
   * methods like then(), catch(), and finally().
   *
   * It's worth noting that while the Promise returned by this object is
   * representative of the execution of the generator, that doesn't mean that
   * this is the only place where errors will be thrown. When using control
   * flow statements like `next()` or for-await-of loops, errors that occur
   * either in evaluating the next value or in the cleanup when there are no
   * more values will also be thrown there. In those cases, you can still use
   * the promise returned here as a "catch all" for any errors that occur
   * during the execution of the generator. This is helpful when you don't have
   * visibility into the logic that iterates over the generator, but you still
   * want to be notified of any errors that occur.
   *
   * @param onfulfilled Optional callback to execute when the promise resolves successfully
   * @param onrejected Optional callback to execute when the promise rejects with an error
   * @returns A promise that resolves with the result of the onfulfilled/onrejected handlers
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.scheduler.promise(this).then(onfulfilled, onrejected);
  }

  /**
   * Attaches a callback for only the rejection of the Promise returned by this
   * AsyncObservable. This is a shorthand for .then(undefined, onrejected).
   *
   * @param onrejected The callback to execute when the Promise is rejected. This callback takes
   * a reason parameter which contains the rejection reason.
   * @returns A Promise for the completion of the callback. If the callback returns a value or a
   * Promise that resolves, the returned Promise will resolve with that value. If the callback
   * throws or returns a rejected Promise, the returned Promise will reject with that reason.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TResult> {
    return this.then(undefined, onrejected);
  }

  /**
   * Returns a promise that resolves when all the work scheduled against the
   * subscriber has completed (i.e. subscriber callbacks or cleanup handlers).
   * Optionally, a callback can be provided to execute after all the work has
   * been completed, which adds a cleanup action to the scheduler.
   *
   * @param onfinally - Optional callback to execute after the subscriber has completed or errors
   * @returns A promise that resolves when all work scheduled against the subscriber has completed
   */
  finally(onfinally?: (() => void) | null): Promise<void> {
    if (onfinally) this.scheduler.schedule(this, new CleanupAction(onfinally));
    return this.then();
  }

  /** AsyncIterable<T, void, void> */

  next(): Promise<IteratorResult<T>> {
    return this[Symbol.asyncIterator]().next();
  }

  [Symbol.asyncIterator]() {
    // We return iterator methods like this so we don't expose those private
    // control flow methods to the outside world.
    return {
      next: (): Promise<IteratorResult<T>> => {
        return this.generator
          .next()
          .then((result) => {
            if (result.done) this._returnSignal.resolve();
            return result;
          })
          .catch((error) => {
            this._returnSignal.reject(error);
            throw error;
          });
      },
      throw: (error?: any): Promise<IteratorResult<T>> => {
        return this.generator.throw(error).then((value) => {
          this._returnSignal.reject(value);
          throw value;
        });
      },
      return: (value?: any): Promise<IteratorResult<T>> => {
        // We intentionally don't propagate the error back to the return
        // promise here; this is what lets us differentiate between an
        // "execution error" and a "cleanup error". Return will only be called
        // when the generator has a premature exit (i.e. .cancel() is called),
        // whereas any cleanup errors that occur as a result of the generator
        // completing will be thrown in the `next` method, and propagated to the
        // return promise. If we did propagate the error back to the return
        // promise here, and given that the subscriber isn't awaited anywhere,
        // we would always get an uncaught error since the return promise isn't
        // being handled anywhere.
        return this.generator.return(value).then((value) => {
          this._returnSignal.resolve();
          return value;
        });
      },
    };
  }
}

/**
 * A specialized Subscriber that invokes a callback function for each value emitted by the
 * observable.
 *
 * CallbackSubscriber extends the base Subscriber class to provide a convenient way to process
 * observable values through a callback function. When a value is emitted by the observable,
 * the callback is scheduled to be executed via the observable's scheduler.
 *
 * This class is typically used internally by the AsyncObservable.subscribe() method to create
 * a subscription that processes values through user-provided callbacks.
 *
 * @template T The type of values emitted by the observable
 */
export class CallbackSubscriber<T> extends Subscriber<T> {
  /**
   * Creates a new CallbackSubscriber instance.
   *
   * @param observable The AsyncObservable to subscribe to
   * @param callback The function to be called for each emitted value
   */
  constructor(
    observable: AsyncObservable<T>,
    protected callback: AsyncObserver<T>
  ) {
    super(observable);
    this.scheduler.add(this, this._tryIteratorWithCallback());
  }

  /** @internal */
  async _tryIteratorWithCallback() {
    for await (const value of this) {
      if (this.callback) {
        const action = new ScheduledAction(() => this.callback.bind(this)(value));
        this.scheduler.schedule(this, action);
      }
    }
  }
}

/**
 * Represents any number of values over any amount of time by way of an async
 * generator that can be subscribed to and cancelled from.
 *
 * AsyncObservable implements AsyncIterable<T>, which means it can be used
 * in for-await-of loops. Doing so will create a new Subscriber and register it
 * with the AsyncObservable. The Subscriber will be unregistered (and have
 * `cancel()` called) from the AsyncObservable once the for-await-of loop has
 * returned (either by a terminating statement like return or throw), or once
 * the observable generator has completed. While you can't access the internal
 * Subscriber object that gets created when using this syntax, you can still
 * 'cancel' by exiting the loop early, and you can still wait for the loop to
 * complete externally by awaiting the AsyncObservable.
 *
 * AsyncObservable also implements SubscriptionLike, providing a cancel() method
 * that can be used to cancel all subscribers at once. When cancelled, all subscribers
 * will be notified and their resources will be released.
 *
 * The class supports functional composition through the pipe() method, allowing
 * operators to be chained together to transform the stream of values. This enables
 * powerful data transformation pipelines with async/await semantics.
 *
 * AsyncObservable provides Promise-like behavior through methods such as drain(),
 * catch(), and finally(), making it easy to handle completion and errors. It also
 * implements the disposable pattern when Symbol.dispose or Symbol.asyncDispose are
 * available in the runtime.
 *
 * AsyncObservable instances can be created from common iterable and
 * stream-like types by using the {@link from} method.
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
   * Returns a class that uses a passthrough scheduler that is bound to the
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
   * AsyncObservable (i.e. any operator function).
   *
   * @returns A new AsyncObservable that is bound to the current instance.
   */
  get AsyncObservable() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const source = this;
    return class<BT> extends AsyncObservable<BT> {
      constructor(
        generator: (this: AsyncObservable<BT>, sub: Subscriber<BT>) => AsyncGenerator<BT>
      ) {
        super(generator);
        this._scheduler = new PassthroughScheduler(source._scheduler, source);
      }
    };
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
  subscribe(callback?: AsyncObserver<T>): Subscriber<T> {
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
   * subscriber list. While {@link #then} will resolve when all subscribers
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
      .finally(() => this._scheduler.promise(this));
  }

  /** @internal */
  // eslint-disable-next-line require-yield
  async *_generator(_: Subscriber<T>): AsyncGenerator<T> {
    return;
  }

  /**
   * Used to stitch together functional operators into a chain.
   *
   * @returns The AsyncObservable of all the operators having been called
   * in the order they were passed in.
   */
  pipe(...operations: UnaryFunction<any, any>[]): unknown {
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

  /** AsyncGenerator<T> */
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
   * Adds a handler for any errors that occur in the work scheduled against the
   * observable.
   *
   * @param onrejected - Optional callback to execute if the observable errors
   * @returns A promise that resolves when all work scheduled against the observable has
   * completed, or if any error occurs
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): PromiseLike<TResult> {
    return this.drain().then(undefined, onrejected);
  }

  /**
   * Returns a promise that resolves when all the work scheduled against the
   * observable has completed (i.e. subscriber callbacks or cleanup handlers).
   * Optionally, a callback can be provided to execute after all the work has
   * been completed, which adds a cleanup action to the scheduler.
   *
   * @param onfinally - Optional callback to execute after subscribers complete or error
   * @returns A promise that resolves when all work scheduled against the observable has completed
   */
  finally(onfinally?: (() => void) | null) {
    if (onfinally) this._scheduler.schedule(this, new CleanupAction(onfinally));
    return this.drain();
  }
}

// Even though Subscriber and AsyncObservable only conditionally implements
// disposer symbols if it's available, we still need to declare it here so
// that TypeScript knows that it exists on the prototype when it is available.

export interface Subscriber<T> {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface AsyncObservable<T> {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  Subscriber.prototype[Symbol.dispose] = Subscriber.prototype.cancel;
  AsyncObservable.prototype[Symbol.dispose] = AsyncObservable.prototype.cancel;
}

if (typeof Symbol.asyncDispose === "symbol") {
  Subscriber.prototype[Symbol.asyncDispose] = Subscriber.prototype.cancel;
  AsyncObservable.prototype[Symbol.asyncDispose] = AsyncObservable.prototype.cancel;
}

export interface AsyncObservable<T> {
  pipe(): AsyncObservable<T>;
  pipe<A>(op1: UnaryFunction<AsyncObservable<T>, A>): A;
  pipe<A, B>(op1: UnaryFunction<AsyncObservable<T>, A>, op2: UnaryFunction<A, B>): B;
  pipe<A, B, C>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>
  ): C;
  pipe<A, B, C, D>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>
  ): D;
  pipe<A, B, C, D, E>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>
  ): E;
  pipe<A, B, C, D, E, F>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>
  ): F;
  pipe<A, B, C, D, E, F, G>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>,
    op5: UnaryFunction<D, E>,
    op6: UnaryFunction<E, F>,
    op7: UnaryFunction<F, G>
  ): G;
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
