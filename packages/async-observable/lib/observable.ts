import { from } from "./from";
import { SubscriptionLike, PromiseOrValue, UnaryFunction } from "./types";

/**
 * Represents an active execution and consumer of an async generator (like AsyncObservable). A
 * Subscriber is both an AsyncIterable and a PromiseLike, allowing it to be used in for-await-of
 * loops and with await. When used as a Promise, it resolves when the generator
 * completes or errors.
 *
 * The Subscriber also implements SubscriptionLike, providing an unsubscribe() method that can
 * be used to cancel the execution of the generator. When unsubscribed, the Subscriber
 * will call the generator's return() method and resolve any pending promises associated with
 * the generator.
 *
 * It's worth noting that when using Subscriber as an async iterator (i.e. in a for-await-of
 * loop), Subscriber does not attempt to clone the values of the generator across multiple
 * accesses of the iterator object. This means that if you use Subscriber in multiple
 * for-await-of loops (or by calling the [Symbol.asyncIterator]() method in multiple places),
 * the sequence of values returned by the `next()` method won't be consistent with the sequence
 * of values emitted by the generator.
 *
 * Subscribers are a common type in eventkit, but is rarely used as a public interface. They
 * should be initialized using the {@link AsyncObservable.subscribe} method or by using
 * the AsyncObservable like an async iterator.
 */
export class Subscriber<T> implements SubscriptionLike, PromiseLike<void>, AsyncIterable<T> {
  /** @internal */
  _generator: AsyncGenerator<T>;
  /** @internal */
  _returnPromise: PromiseWithResolvers<void>;

  constructor(generator: AsyncGenerator<T>) {
    this._generator = generator;
    this._returnPromise = Promise.withResolvers<void>();
  }

  /** SubscriptionLike */

  /**
   * Unsubscribes from the generator, meaning that the generator will be disposed of,
   * and any resources held by the generator will be released.
   *
   * Calling this method starts an immediate cleanup of the Subscriber. In the case that you
   * want to be notified of when the subscriber has closed without causing an interrupt,
   * you can use the {@link #finally} method.
   *
   * Note that the promise returned by this method doesn't represent the actual execution
   * of the generator, meaning that any errors that occur during the execution of the generator
   * will not be reflected in the promise returned by this method. You can observe the status
   * of the current execution by using the {@link #then} method or catching any errors
   * using the {@link #catch} method. Because this class implements PromiseLike, you can also
   * use the Subscriber in an await expression to yield the result of the generator's execution.
   *
   * @returns A promise that resolves when the generator has been cleaned up.
   */
  unsubscribe(): Promise<void> {
    return this._generator
      .return(null)
      .then(() => this._returnPromise.resolve())
      .catch((error) => this._returnPromise.reject(error));
  }

  /** PromiseLike<void> */

  /**
   * Returns a promise that resolves when the generator has completed execution, or rejects
   * if an error occurs during execution. This allows AsyncObservable instances to be used
   * with await expressions and Promise methods like then(), catch(), and finally().
   *
   * @param onfulfilled Optional callback to execute when the promise resolves successfully
   * @param onrejected Optional callback to execute when the promise rejects with an error
   * @returns A promise that resolves with the result of the onfulfilled/onrejected handlers
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this._returnPromise.promise.then(onfulfilled, onrejected);
  }

  /**
   * Attaches a callback for only the rejection of the Promise returned by this AsyncObservable.
   * This is a shorthand for .then(undefined, onrejected).
   *
   * @param onrejected The callback to execute when the Promise is rejected. This callback takes
   * a reason parameter which contains the rejection reason.
   * @returns A Promise for the completion of the callback. If the callback returns a value or a
   * Promise that resolves, the returned Promise will resolve with that value. If the callback
   * throws or returns a rejected Promise, the returned Promise will reject with that reason.
   */
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult> {
    return this._returnPromise.promise.then(() => undefined as never, onrejected);
  }

  /**
   * Attaches a callback that will be invoked when the Promise returned by this AsyncObservable
   * settles (either resolves or rejects). The callback runs after the Promise is settled.
   * This is a shorthand for .then(onfinally, onfinally).
   *
   * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * This callback does not receive any arguments.
   * @returns A Promise that resolves with the value from the original Promise if it was fulfilled,
   * or rejects with the reason from the original Promise if it was rejected. The returned Promise
   * will be rejected if the callback throws an error or returns a rejected Promise.
   */
  finally(onfinally?: (() => void) | null): PromiseLike<void> {
    return this._returnPromise.promise.then(() => undefined).finally(onfinally);
  }

  /** AsyncIterable<T> */

  [Symbol.asyncIterator]() {
    const generator = this._generator;
    const returnPromise = this._returnPromise;

    const resolveWithIteratorResult = (value: IteratorResult<T>) => {
      returnPromise.resolve();
      return value;
    };
    const rejectWithIteratorResult = (error: any) => {
      returnPromise.reject(error);
      return { done: true as const, value: undefined };
    };

    return {
      next: () => {
        return generator.next().catch(rejectWithIteratorResult);
      },
      throw: (err?: any) => {
        return generator.throw(err).then(rejectWithIteratorResult).catch(rejectWithIteratorResult);
      },
      return: () => {
        return generator.return(null).then(resolveWithIteratorResult).catch(rejectWithIteratorResult);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}

// Even though Subscriber only conditionally implements disposer symbols
// if it's available, we still need to declare it here so that TypeScript
// knows that it exists on the prototype when it is available.
export interface Subscriber<T> {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  Subscriber.prototype[Symbol.dispose] = Subscriber.prototype.unsubscribe;
}

if (typeof Symbol.asyncDispose === "symbol") {
  Subscriber.prototype[Symbol.asyncDispose] = Subscriber.prototype.unsubscribe;
}

/**
 * Represents any number of values over any amount of time by way of an async generator
 * that can be subscribed to and unsubscribed from.
 *
 * AsyncObservable implements PromiseLike<void>, which means it can used in await expressions.
 * When awaited, it will resolve once all current subscribers have completed or unsubscribed.
 * This makes it useful for waiting for all current executions of an AsyncObservable to complete,
 * for instance making sure that all subscribers have finished before continuing with some other work.
 *
 * AsyncObservable also implements AsyncIterable<T>, which means it can be used in for-await-of loops.
 * Doing so will create a new Subscriber and register it with the AsyncObservable. The Subscriber will
 * be unregistered (and have `unsubscribe()` called) from the AsyncObservable once the for-await-of
 * loop has returned (either by a terminating statement like return or throw), or once the observable
 * generator has completed. While you can't access the internal Subscriber object that gets created
 * when using this syntax, you can still 'unsubscribe' by exiting the loop early, and you can still
 * wait for the loop to complete externally by awaiting the AsyncObservable.
 *
 * AsyncObservable instances can be created from common iterable and stream-like types
 * by using the {@link AsyncObservable.from} method.
 */
export class AsyncObservable<T> implements AsyncIterable<T>, PromiseLike<void> {
  /** @internal */
  _subscribers: Map<Subscriber<T>, Promise<void>> = new Map();

  /**
   * @param generator The function that returns the async generator that will be used to emit
   * values. This function will be called every time a new subscriber is created.
   */
  constructor(generator: (this: AsyncObservable<T>) => AsyncGenerator<T>) {
    if (generator) this._generator = generator;
  }

  /**
   * Invokes an execution of an AsyncObservable and registers a new Subscriber that will call
   * the provided callback for each value emitted by the generator. The callback will be passed
   * the value of the current value as an argument.
   *
   * `subscribe` is not a regular operator, but a method that calls AsyncObservable's internal
   * generator function and returns a new Subscriber. It might be misinterpreted that AsyncObservable
   * works like an event emitter where the callback is the event handler that is called any time a
   * hypothetical `push` method is called on an instance. This is not the case (but this can be achieved
   * using a {@link Stream}). It is a library implementation which defines what will be emitted by an
   * AsyncObservable, and when it will be emitted. This means that calling `subscribe` is actually the
   * moment when AsyncObservable starts its work, not when it is created, as it is often the thought.
   *
   * Apart from starting the execution of an AsyncObservable, this method allows you to listen for values
   * that an AsyncObservable emits, as well as waiting for the execution of the AsyncObservable to complete
   * by using the returned `Subscriber` instance like you would with a Promise.
   *
   * You can also subscribe without providing a callback. This may be the case where you're not interested
   * in the values emitted by the generator, but you want to wait for the execution of the AsyncObservable to
   * complete.
   *
   * The returned Subscriber object also acts like a Promise which can be awaited to wait for the
   * AsyncObservable's execution to complete. Any errors that are thrown by this function will be propagated
   * to the promise's rejection handler.
   *
   * @param callback The callback to execute for each value emitted by the generator. This callback
   * will be passed the value as an argument.
   * @returns A new Subscriber that can be used to unsubscribe from the AsyncObservable.
   */
  subscribe(callback: (value: T) => PromiseOrValue<any>): Subscriber<T> {
    const subscriber = new Subscriber(this._generator());
    this._subscribers.set(subscriber, this._tryGeneratorWithCallback(subscriber, callback));
    return subscriber;
  }

  /** @internal */
  protected async _tryGeneratorWithCallback(subscriber: Subscriber<T>, callback: (value: T) => PromiseOrValue<any>): Promise<void> {
    try {
      for await (const value of subscriber) {
        await callback(value);
      }
    } finally {
      this._subscribers.delete(subscriber);
    }
  }

  /** @internal */
  protected async *_generator(): AsyncGenerator<T> {
    return;
  }

  /** AsyncGenerator<T> */
  [Symbol.asyncIterator](): AsyncGenerator<T> {
    const subscriber = new Subscriber(this._generator());
    const iter = subscriber[Symbol.asyncIterator]();
    this._subscribers.set(subscriber, subscriber._returnPromise.promise);

    return {
      next: iter.next,
      throw: (error?: any) => {
        return iter.throw(error).finally(() => {
          this._subscribers.delete(subscriber);
        });
      },
      return: () => {
        return iter.return().finally(() => {
          this._subscribers.delete(subscriber);
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
      [Symbol.asyncDispose]: async () => {
        await subscriber.unsubscribe();
        this._subscribers.delete(subscriber);
      },
    };
  }

  /** PromiseLike<void> */

  /**
   * Implements the PromiseLike interface to allow using AsyncObservable with
   * Promise-based APIs or await statements. When used as a Promise, the
   * AsyncObservable will resolve when all active subscribers complete, reject
   * if any subscriber errors, and can be chained with .then(), .catch(),
   * and .finally().
   *
   * @param onfulfilled - Optional callback to execute when all subscribers complete successfully
   * @param onrejected - Optional callback to execute if any subscriber errors
   * @returns A Promise that resolves when all subscribers complete or rejects if any error
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.all(Array.from(this._subscribers.values()))
      .then(() => onfulfilled?.() as any)
      .catch(onrejected);
  }

  /**
   * Implements the catch method of the PromiseLike interface. This allows handling errors
   * from the AsyncObservable when used as a Promise. The catch handler will be called if
   * any subscriber errors.
   *
   * @param onrejected - Optional callback to execute if any subscriber errors
   * @returns A Promise that resolves with the result of the catch handler or rejects if the handler throws
   */
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult> {
    return Promise.all(Array.from(this._subscribers.values()))
      .then(() => undefined as any)
      .catch(onrejected);
  }

  /**
   * Implements the finally method of the PromiseLike interface. This allows executing cleanup
   * logic when the AsyncObservable completes or errors when used as a Promise. The finally
   * handler will be called after all subscribers complete or error.
   *
   * @param onfinally - Optional callback to execute after subscribers complete or error
   * @returns A Promise that resolves when all subscribers and the finally handler complete
   */
  finally(onfinally?: (() => void) | null): PromiseLike<void> {
    return Promise.all(Array.from(this._subscribers.values()))
      .then(() => undefined)
      .finally(onfinally);
  }

  /** Pipe utility */
  pipe(): AsyncObservable<T>;
  pipe<A>(op1: UnaryFunction<AsyncObservable<T>, A>): A;
  pipe<A, B>(op1: UnaryFunction<AsyncObservable<T>, A>, op2: UnaryFunction<A, B>): B;
  pipe<A, B, C>(op1: UnaryFunction<AsyncObservable<T>, A>, op2: UnaryFunction<A, B>, op3: UnaryFunction<B, C>): C;
  pipe<A, B, C, D>(
    op1: UnaryFunction<AsyncObservable<T>, A>,
    op2: UnaryFunction<A, B>,
    op3: UnaryFunction<B, C>,
    op4: UnaryFunction<C, D>
  ): D;

  /**
   * Used to stitch together functional operators into a chain.
   *
   * @returns The AsyncObservable of all the operators having been called
   * in the order they were passed in.
   */
  pipe(...operations: UnaryFunction<any, any>[]): unknown {
    return operations.reduce(pipeReducer, this as any);
  }

  /** Static Methods */

  /**
   * Method to expose the utility function {@link #from} as a static method on AsyncObservable.
   * This is useful for creating an AsyncObservable from a common iterable or stream-like type.
   *
   * @param source The source to create an AsyncObservable from
   * @returns An AsyncObservable that emits the values from the source
   */
  static from = from;
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>) {
  return fn(prev);
}
