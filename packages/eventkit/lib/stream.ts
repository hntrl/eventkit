import {
  AsyncObservable,
  CallbackSubscriber,
  Scheduler,
  type SchedulerLike,
  type Subscriber,
  kCancelSignal,
  CleanupAction,
  PromiseSet,
  type ScheduledAction,
  type SchedulerSubject,
  Signal,
  SubscriberReturnSignal,
  type SubscriberCallback,
  from,
} from "@eventkit/async-observable";

/**
 * A specialized scheduler for Stream objects that manages the flow of values to subscribers.
 *
 * The StreamScheduler extends the base Scheduler to handle the requirements of Stream objects:
 * - It manages deferred execution of scheduled actions through a wrapped scheduler
 * - It tracks "subscriber ticks" to ensure all values are properly propagated to subscribers
 * - It ignores the generator lifecycle since we know that the generator will always be running
 *   and will always yield values to the subscriber (until cancelled).
 *
 * This scheduler is crucial for the Stream implementation as it ensures that values pushed
 * to a Stream are properly delivered to all subscribers before the Stream is considered drained.
 *
 * @internal
 */
export class StreamScheduler extends Scheduler implements SchedulerLike {
  private deferred: SchedulerLike;
  private _subscriberTicks = new Map<Subscriber<any>, Set<Signal>>();

  constructor(schedulerCtor: SchedulerLike | (new () => SchedulerLike)) {
    super();
    if (typeof schedulerCtor === "function") {
      this.deferred = new schedulerCtor();
    } else {
      this.deferred = schedulerCtor;
    }
  }

  add(subject: SchedulerSubject, promise: PromiseLike<void>): void {
    if (promise instanceof SubscriberReturnSignal) {
      return super.add(subject, new CleanupAction(() => promise));
    } else {
      return super.add(subject, promise);
    }
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    super.add(subject, action);
    if (action instanceof CleanupAction) return;
    this.deferred.schedule(subject, action);
  }

  async promise(subject: SchedulerSubject): Promise<void> {
    // FIXME: this is a hack that has the same effect as a kids spiderman bandaid on a bullet wound
    // to the chest. The endemic problem with the stream/scheduler pattern is that we intentionally
    // dont track the status of the consumer of the generator, so if we call `drain` immediately
    // after we `push` a value, the work of "yielding" the value through an observable chain (that
    // will subsequently schedule more work, which normally is handled since we're awaiting the
    // ending generator to finish) gets added to the microtask queue **after** we await the work in
    // `drain`. This means that when we init the drain promise in the call stack, the scheduler
    // doesn't have any work, so it resolves as normal!
    // This is a hack that places a "resolve microtask" at the end of the queue, which hopefully
    // means that all the immediate values will be yielded through the chain before continuing this
    // function. My faith in this fix is not high, so if there's any trouble with draining stream
    // subjects this might be a good place to start looking.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    await promises;
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

  /** @internal */
  addSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const signal = new Signal();
    ticks.add(signal);
    this._subscriberTicks.set(subscriber, ticks);
    this.add(subscriber, signal);
  }

  /** @internal */
  resolveSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const [tick, ...rest] = ticks;
    this._subscriberTicks.set(subscriber, new Set(rest));
    if (!tick) return;
    tick.resolve();
  }
}

/**
 * Configuration options for creating a Stream.
 *
 * This type defines optional parameters that can be passed to the Stream constructor
 * to customize its behavior, including preprocessing of values and scheduler configuration.
 *
 * @template T - The type of values emitted by the Stream
 */
export type StreamInit<T> = {
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
  scheduler?: SchedulerLike | (new () => SchedulerLike);
};

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
  subscribe(callback?: SubscriberCallback<T>): Subscriber<T> {
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
    return this.stub();
  }

  /**
   * These are properties that exist on Stream because they're inherited from AsyncObservable. We
   * redefine here so we can hide them from the docs since they don't really make sense as stream
   * propertiess
   */

  /** @internal */
  static from = from;

  /** @internal */
  stub(): AsyncObservable<T> {
    return super.stub();
  }
}
