import {
  AsyncObservable,
  type AsyncObserver,
  CallbackSubscriber,
  type ScheduledAction,
  Scheduler,
  type SchedulerLike,
  type SchedulerSubject,
  type Subscriber,
  kCancelSignal,
} from "@eventkit/async-observable";

export class StreamScheduler implements SchedulerLike {
  private _callbackScheduler: SchedulerLike;
  private _subscriberTicks = new Map<Subscriber<any>, Set<PromiseWithResolvers<void>>>();

  constructor(callbackScheduler: new () => SchedulerLike | SchedulerLike) {
    if (typeof callbackScheduler === "function") {
      this._callbackScheduler = new callbackScheduler();
    } else {
      this._callbackScheduler = callbackScheduler;
    }
  }

  /** SchedulerLike */

  add(): void {
    // We can optimisitcally say that any direct calls to add should be treated as
    // a no-op since the execution passed here is representative of the subject's
    // lifecycle (i.e. the only native call to `add` is `_tryIteratorWithCallabck`).
    // Since we know that the lifecycle of a stream subject is infinite until `cancel`
    // is called, and since we're only interested in observing the side effects of
    // pushing values (i.e. propagating values to observers and callback executions),
    // we can ignore the execution promise here.
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    this._callbackScheduler.schedule(subject, action);
  }

  promise(subject: SchedulerSubject): Promise<void> {
    return this._callbackScheduler.promise(subject);
  }

  // Subscriber ticks are a little bit of a hack way to inform the scheduler that
  // there is work to be done by the subject before the subscriber adds the action
  // to the scheduler. Since the values emitted by the internal generator come from
  // an internal "buffer" promise which won't do the work of yielding the buffer (and
  // subsequently schedule any work) until later in the call stack, we need to synchronously
  // inform the scheduler that the work of scheduling a different action still needs
  // to be done.
  //
  // Subscriber ticks are simply signals that get added synchronously for each subscriber
  // when push is called, and when the execution reaches the part where we know work
  // will be scheduled, we resolve the tick, effectively blocking the stream from
  // draining until we know all the values have been propagated to all subscribers.

  addSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const promiseObject = Promise.withResolvers<void>();
    ticks.add(promiseObject);
    this._subscriberTicks.set(subscriber, ticks);
    this._callbackScheduler.add(subscriber, promiseObject.promise);
  }

  resolveSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const [tick, ...rest] = ticks;
    this._subscriberTicks.set(subscriber, new Set(rest));
    if (!tick) return;
    tick.resolve();
  }
}

export interface StreamInit<T> {
  /**
   * Function to preprocess values before they are pushed to observers.
   * This can be used to validate values before they are emitted.
   * @param value The raw value to be preprocessed
   * @returns The processed value that will be emitted to observers
   */
  preprocess?(value: unknown): T;
  /**
   * Scheduler to use for managing the execution of the inner observable.
   * Can be provided as either a constructor function or an instance.
   * If not provided, the default Scheduler will be used.
   */
  scheduler?: new () => SchedulerLike | SchedulerLike;
}

/**
 * A Stream is a special type of AsyncObservable that allows values to be
 * multicasted to many observers. Streams are like EventEmitters.
 *
 * Every Stream is an AsyncObservable and can be used as a value producer.
 * You can subscribe to a Stream, and you can call push to feed values
 * to all observers.
 */
export class Stream<T> extends AsyncObservable<T> {
  private _closed = false;
  private _observerCounter = 0;
  private _resolvers = new Map<number, (value: T) => void>();

  private get scheduler() {
    return this._scheduler as StreamScheduler;
  }

  /**
   * Creates a new Stream instance.
   */
  constructor(private init?: StreamInit<T>) {
    super();
    this._generator = this._generator.bind(this);
    this._scheduler = new StreamScheduler(init?.scheduler ?? Scheduler);
  }

  /** Returns true if this stream has been closed and is no longer accepting new values. */
  get closed(): boolean {
    return this._closed;
  }

  /** Returns true if this stream has any active observers. */
  get observed(): boolean {
    return this._resolvers.size > 0;
  }

  /**
   * Registers and returns a new Subscriber that will call the provided callback for each value
   * emitted by the Stream. The callback will be passed the value emitted to the Stream as an
   * argument.
   *
   * While this method is similar to AsyncObservable's subscribe method, the key
   * difference is that the generator that is passed to the Subscriber is a unique
   * implementation that emulates the desired behavior of the Stream.
   *
   * You can still use the returned Subscriber object like a Promise which can
   * be awaited to wait for the Stream to be closed.
   */
  subscribe(callback?: AsyncObserver<T>): Subscriber<T> {
    const scheduler = this.scheduler;
    return super.subscribe(function (this: Subscriber<T>, value: T) {
      // By this point, the work of resolving the tick is in itself inside of a
      // scheduler execution, so we can delegate the "completion of work" to the
      // promise yielded by the callback.
      scheduler.resolveSubscriberTick(this);
      if (callback) return callback.bind(this)(value);
    });
  }

  /**
   * Feeds a new value to all observers of this stream.
   * @param value The value to emit to all observers
   * @returns A Promise that resolves when all observers have processed the value
   */
  push(value: T): void {
    if (!this._closed) {
      value = this.init?.preprocess?.(value) ?? value;
      for (const subscriber of this._subscribers) {
        this.scheduler.addSubscriberTick(subscriber);
      }
      for (const resolver of this._resolvers.values()) {
        resolver(value);
      }
    }
  }

  /**
   * Signals completion to all observers and closes the stream.
   */
  cancel(): Promise<void> {
    this._closed = true;
    this._clearObservers();
    return super.cancel();
  }

  /** @internal */
  protected _clearObservers(): void {
    this._resolvers.clear();
  }

  /** @internal */
  _generator(sub: Subscriber<T>): AsyncGenerator<T> {
    // Defining _generator as a function rather than an outright generator function
    // let's us perform additional setup work synchronously, that way we don't have
    // to rely on the event loop to run the generator to perform setup.
    const observerId = this._observerCounter++;

    const buffer = (): Promise<T[]> => {
      const deferred: T[] = [];
      return new Promise<T[]>((resolve) => {
        this._resolvers.set(observerId, (value: T) => {
          deferred.push(value);
          // When we receive the first value, we're signalling that the buffer is
          // ready to be yielded. Since V8 isn't truly asynchronous, additional
          // messages may be pushed in the call stack before the generator
          // is scheduled to run (and consequently yield the next value). As such,
          // we resolve the promise with an array, and since arrays are passed by
          // reference, we can continue to push values to the array before the
          // runtime makes it to the next yield statement.
          if (deferred.length === 1) {
            resolve(deferred);
          }
        });
      });
    };

    async function* generator(this: Stream<T>): AsyncGenerator<T> {
      try {
        do {
          // We have to involve a Promise.race here because we need to be able to
          // break out of the generator when the stream is canceled. Generators have
          // a synchronous queue of all the operations it receives (next/throw/return)
          // which, if return gets called and we're waiting on a buffer that doesn't come
          // (i.e. no messages are pushed to the stream), we'll never be able to break
          // out of the generator since the first next() call will be perpetually blocked.
          const output = await Promise.race([buffer(), sub[kCancelSignal]]);
          if (output === kCancelSignal) break;
          else {
            // If the subscriber is not a callback. we adopt a "fire and forget" strategy
            // where we should resolve the work of pushing values to the subscriber as soon
            // as possible. This is because we don't have visibility into the work of
            // non-callback subscribers (i.e. for-await-of), so we can resolve the tick immediately.
            if (!(sub instanceof CallbackSubscriber)) {
              for (let i = 0; i < output.length; i++) {
                this.scheduler.resolveSubscriberTick(sub);
              }
            }
            yield* output;
          }
        } while (!this._closed);
      } finally {
        this._resolvers.delete(observerId);
      }
    }

    return generator.bind(this)();
  }

  /**
   * Creates a new AsyncObservable with this Stream as the source. You can do this
   * to create custom observer-side logic of the Stream and conceal it from
   * code that uses the AsyncObservable.
   * @returns AsyncObservable that this Stream casts to
   */
  asObservable(): AsyncObservable<T> {
    const generator = this._generator.bind(this);
    return new AsyncObservable(async function* (sub: Subscriber<T>) {
      yield* generator(sub);
    });
  }
}
