import { SubscriptionLike, PromiseOrValue, UnaryFunction } from "./types";

export class Subscriber<T> implements SubscriptionLike, AsyncIterable<T>, PromiseLike<void> {
  /** @internal */
  _generator: AsyncGenerator<T>;
  /** @internal */
  _returnPromise: PromiseWithResolvers<void>;

  constructor(generator: AsyncGenerator<T>) {
    this._generator = generator;
    this._returnPromise = Promise.withResolvers<void>();
  }

  unsubscribe(): Promise<void> {
    return this._generator
      .return(null)
      .then(() => this._returnPromise.resolve())
      .catch((error) => this._returnPromise.reject(error));
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

  /** PromiseLike<void> */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this._returnPromise.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult> {
    return this._returnPromise.promise.then(() => undefined as never, onrejected);
  }

  finally(onfinally?: (() => void) | null): PromiseLike<void> {
    return this._returnPromise.promise.then(() => undefined).finally(onfinally);
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

export class AsyncObservable<T> implements AsyncIterable<T>, PromiseLike<void> {
  /** @internal */
  _subscribers: Map<Subscriber<T>, Promise<void>> = new Map();

  constructor(generator: (this: AsyncObservable<T>) => AsyncGenerator<T>) {
    if (generator) this._generator = generator;
  }

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
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.all(Array.from(this._subscribers.values()))
      .then(() => onfulfilled?.() as any)
      .catch(onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult> {
    return Promise.all(Array.from(this._subscribers.values()))
      .then(() => undefined as any)
      .catch(onrejected);
  }

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
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>) {
  return fn(prev);
}
