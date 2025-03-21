import { type AsyncObservable } from "./observable";
import { CleanupAction, ScheduledAction } from "./scheduler";
import { type SubscriptionLike, type AsyncObserver, type SchedulerLike } from "./types";

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
        // When generators are initializing (i.e. before the first next() call returns), the return
        // call gets put up on a synchronous queue since the runtime doesn't know if the generator
        // will return without values or not. If we're waiting on the first next() call that never
        // comes, we'll never be able to break out of the generator and perform an early return
        // since the first next() call is perpertually blocked. To solve this, we race against the
        // cancel signal to see if the generator has been cancelled elsewhere, and if so we return a
        // done result.
        return Promise.race([
          this.generator.next(),
          this[kCancelSignal].then(() => ({ done: true as const, value: undefined })),
        ])
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

// Even though Subscriber only conditionally implements disposer symbols if it's
// available, we still need to declare it here so that TypeScript knows that it
// exists on the prototype when it is available.

export interface Subscriber<T> {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  Subscriber.prototype[Symbol.dispose] = Subscriber.prototype.cancel;
}

if (typeof Symbol.asyncDispose === "symbol") {
  Subscriber.prototype[Symbol.asyncDispose] = Subscriber.prototype.cancel;
}
