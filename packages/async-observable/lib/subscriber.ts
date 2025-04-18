import { type AsyncObservable } from "./observable";
import { CallbackAction, CleanupAction } from "./scheduler";
import { type SubscriptionLike, type SchedulerLike, type SubscriberCallback } from "./types";
import { Signal } from "./utils/signal";

/**
 * Unique symbol thats used to identify the cancellation of a subscriber.
 * @internal
 */
export const kCancelSignal = Symbol("cancelSignal");

/**
 * A signal that is resolved when the subscriber has completed execution and cleaned up,
 * or rejects if an error occurs during the execution of the generator.
 *
 * This signal is used internally to manage the asynchronous processing of observable values,
 * providing better introspection into the work associated with a subscriber. Since we can't
 * provide a generator as a "promise-like object" to the scheduler, we thread a signal through
 * the subscriber that's representative of the state of the generator. This class exists to
 * make it possible to identify this unit of work, so in implementations of the scheduler
 * we can treat the work of a "subscriber execution" differently than other work.
 */
export class SubscriberReturnSignal extends Signal<void> {}

/**
 * Represents an active execution of an observable.
 *
 * Subscribers are a common type in eventkit, but is rarely used as a public
 * interface. They should be initialized using the {@link
 * AsyncObservable.subscribe} method or by using the AsyncObservable like an
 * async iterator.
 *
 * @template T - The type of values being handled by the subscriber
 */
export class Subscriber<T>
  implements SubscriptionLike, PromiseLike<void>, AsyncIterable<T, void, void>
{
  /** @internal */
  _generator: AsyncGenerator<T> | null = null;
  /** @internal */
  _observable: AsyncObservable<T>;
  /** @internal */
  _returnSignal: SubscriberReturnSignal;
  /** @internal */
  _cancelSignal: Signal<typeof kCancelSignal>;

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
    this._returnSignal = new SubscriberReturnSignal();
    this._cancelSignal = new Signal<typeof kCancelSignal>();
    // Add the subscriber to the observable's tracking.
    this._observable._subscribers.add(this);
    // Add a cleanup action to remove the subscriber from the observable's tracking.
    this.scheduler.schedule(
      this,
      new CleanupAction(() => this._observable._subscribers.delete(this))
    );
    // Add the return signal that's representative of the state of the generator.
    this.scheduler.add(this, this._returnSignal);
    // Add a cleanup action that resolves the cancel signal when the subscriber is disposed of.
    this.scheduler.schedule(
      this,
      new CleanupAction(() => this._cancelSignal.resolve(kCancelSignal))
    );
  }

  /** SubscriptionLike */

  /**
   * Cancels the subscriber, meaning that the generator will be disposed of,
   * and any resources held by the subscriber will be released.
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
   * @returns A promise that resolves when the subscriber has been cleaned up.
   */
  cancel(): Promise<void> {
    return this[Symbol.asyncIterator]()
      .return(null)
      .then(() => Promise.resolve());
  }

  /** @internal */
  get [kCancelSignal]() {
    return this._cancelSignal.asPromise();
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
   * Schedules a cleanup action that gets executed when the subscriber is disposed of.
   * Optionally, a callback can be provided to inform the behavior of the created action.
   *
   * @param onfinally - Optional callback to execute after completion or error
   * @returns A promise that resolves when the action has completed
   */
  finally(onfinally?: (() => void) | null) {
    onfinally ??= () => {};
    const action = new CleanupAction(onfinally);
    this.scheduler.schedule(this, action);
    return action.signal.asPromise();
  }

  /** AsyncIterable<T, void, void> */

  /**
   * Returns a promise that resolves with the next iterator result from the generator. You should
   * only use this method if you constructed a Subscriber independently of {@link
   * AsyncObservable.subscribe} or {@link CallbackSubscriber}. Using this method in that instance
   * will hijack the execution of the generator which can cause unexpected behavior.
   *
   * @returns A promise that resolves with the next iterator result from the generator.
   */
  next(): Promise<IteratorResult<T>> {
    return this[Symbol.asyncIterator]().next();
  }

  /** @internal */
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
          .then(async (result) => {
            if (result.done) {
              this._returnSignal.resolve();
              await this.scheduler.dispose(this);
            }
            return result;
          })
          .catch(async (error) => {
            this._returnSignal.reject(error);
            await this.scheduler.dispose(this);
            throw error;
          });
      },
      throw: (error?: any): Promise<IteratorResult<T>> => {
        return this.generator.throw(error).then(async (value) => {
          this._returnSignal.reject(value);
          await this.scheduler.dispose(this);
          throw value;
        });
      },
      return: (value?: any): Promise<IteratorResult<T>> => {
        const disposePromise = this.scheduler.dispose(this);
        return this.generator
          .return(value)
          .then((value) => {
            this._returnSignal.resolve();
            return value;
          })
          .catch((error) => {
            this._returnSignal.reject(error);
            throw error;
          })
          .finally(() => disposePromise);
      },
    };
  }
}

/**
 * A wrapper around a Promise that identifies the work associated with "consuming" an observable.
 *
 * This class is used internally to manage the asynchronous processing of observable values,
 * providing better introspection into the work associated with a subscriber. Wrapping a promise in
 * this way allows us to discern between the work of reading the observable and the work of
 * processing its values. This class exists to make it possible to identify this unit of work,
 * so in implementations of the scheduler can treat the work of "consuming an observable"
 * differently than other work.
 *
 * ConsumerPromise implements the PromiseLike interface, allowing it to be used in async/await
 * contexts and with Promise chaining. Unlike a regular Promise, ConsumerPromise accepts a getter
 * function that returns a Promise, which is only executed when the ConsumerPromise is created.
 *
 * @template T The type of value that the wrapped Promise resolves to
 * @internal
 */
export class ConsumerPromise<T> implements PromiseLike<T> {
  private _promise: Promise<T>;

  /**
   * Creates a new ConsumerPromise instance.
   *
   * @param getter A function that returns a Promise to be wrapped. This function is
   * executed immediately upon construction of the ConsumerPromise.
   */
  constructor(getter: () => Promise<T>) {
    this._promise = getter();
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   *
   * @param onfulfilled The callback to execute when the Promise is resolved.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
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
 * This class is typically used internally by the {@link AsyncObservable.subscribe} method to create
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
    protected callback: SubscriberCallback<T>
  ) {
    super(observable);
    this.scheduler.add(this, this._tryIteratorWithCallback());
  }

  /** @internal */
  _tryIteratorWithCallback() {
    return new ConsumerPromise(async () => {
      for await (const value of this) {
        if (this.callback) {
          const action = new CallbackAction(() => this.callback.bind(this)(value));
          this.scheduler.schedule(this, action);
        }
      }
    });
  }

  /** @ignore */
  next() {
    return super.next();
  }
}

// Even though Subscriber only conditionally implements disposer symbols if it's
// available, we still need to declare it here so that TypeScript knows that it
// exists on the prototype when it is available.

export interface Subscriber<T> {
  /** @ignore */
  [Symbol.dispose](): void;
  /** @ignore */
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  Subscriber.prototype[Symbol.dispose] = Subscriber.prototype.cancel;
}

if (typeof Symbol.asyncDispose === "symbol") {
  Subscriber.prototype[Symbol.asyncDispose] = Subscriber.prototype.cancel;
}
