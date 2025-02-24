import { AsyncObserver, Disposer, PromiseOrValue, Subscribable, SubscriptionLike, UnaryFunction, Unsubscribable } from "./types";

export class ObservableError extends Error {
  constructor(public errors: any[]) {
    super(
      errors
        ? `${errors.length} errors occurred during unsubscription:
  ${errors.map((err, i) => `${i + 1}) ${err.toString()}`).join("\n  ")}`
        : ""
    );
    this.name = "ObservableError";
  }
}

/**
 * Represents a disposable resource, such as the execution of an Observable. A
 * Subscription has one important method, `unsubscribe`, that takes no argument
 * and just disposes any resources held by the subscription.
 *
 * Additionally, subscriptions may be grouped together through the `add()`
 * method, which will attach a child Subscription to the current Subscription.
 * When a Subscription is unsubscribed, all downstream subscriptions will be
 * unsubscribed as well.
 */
export class Subscription implements SubscriptionLike {
  /**
   * A promise that will resolve when all of the disposers have finished executing
   * once {@link #unsubscribe} is called. This promise will be created only one time
   * and acts as the return value of {@link #unsubscribe}. Any subsequent calls to
   * {@link #unsubscribe} will return the same promise. Errors that occur during
   * disposal will be collected and thrown in the promise's rejection handler.
   */
  private _cleanupPromise: Promise<void> | null = null;
  /**
   * The list of disposers to wait for or execute when unsubscribed. Adding and
   * removing disposers occurs in the {@link #add} and {@link #remove} methods.
   */
  private _disposers: Set<Exclude<Disposer, void>> | null = null;

  /**
   * A flag to indicate whether this subscription has been unsubscribed.
   */
  get closed(): boolean {
    return this._cleanupPromise !== null;
  }

  /**
   * @param initialDisposer A function that represents the first disposer
   * that should be executed when {@link #unsubscribe} is called.
   */
  constructor(private initialDisposer?: () => void) {}

  /**
   * Awaits and executes all disposers that have been added to this
   * subscription, including the promise that represents an ongoing
   * AsyncObservable execution, and any other type of work that will
   * dispose of resources held by this subscription.
   * @returns A promise that resolves when all disposers have finished executing.
   */
  unsubscribe(): Promise<void> {
    if (this._cleanupPromise) return this._cleanupPromise;
    this._cleanupPromise = new Promise(async (resolve, reject) => {
      let errors: any[] | undefined;
      const { _disposers, initialDisposer } = this;
      if (isFunction(initialDisposer)) {
        try {
          await initialDisposer();
        } catch (err) {
          errors = err instanceof ObservableError ? err.errors : [err];
        }
      }
      if (_disposers) {
        this._disposers = null;
        for (const disposer of _disposers) {
          try {
            await execDisposer(disposer);
          } catch (err) {
            errors ??= [];
            if (err instanceof ObservableError) errors.push(...err.errors);
            else if (isPromise(disposer)) return reject(err);
            else errors.push(err);
          }
        }
      }
      if (errors) reject(new ObservableError(errors));
      else resolve();
    });
    return this._cleanupPromise;
  }

  /**
   * Adds a disposer to this subscription, which will be unsubscribed/called when this
   * subscription has been unsubscribed. If this subscription is already {@link #closed},
   * because it has already been unsubscribed, then whatever disposer is passed to it
   * will automatically be executed (unless the disposer itself is also a closed subscription).
   *
   * Closed Subscriptions cannot be added as disposers to any subscription. Adding a closed
   * subscription will result in no operation. (A noop).
   *
   * Adding a subscription to itself, or adding `null` or `undefined` will not perform any
   * operation at all. (A noop).
   *
   * `Subscription` instances that are added to this instance will automatically remove themselves
   * if they are unsubscribed. Functions and {@link Unsubscribable} objects that you wish to remove
   * will need to be removed manually with {@link #remove}
   *
   * @param disposer The disposer to add to this subscription.
   */
  add(disposer: Disposer): void {
    // Only add the disposer if it's not undefined, and the disposer is not this subscription (we don't want to add it to itself)
    if (!disposer || disposer === this) return;
    // If the subscription is closed, execute whatever the disposer is automatically
    if (this.closed) execDisposer(disposer);
    // If the disposer is a subscription, we can make sure that if it unsubscribes first, it removes itself from the subscription
    if ("add" in disposer) disposer.add(() => this.remove(disposer));
    // If the disposer is a promise, we can make sure that if it resolves first, it removes itself from the subscription
    if (isPromise(disposer)) disposer.then(() => this.remove(disposer));
    this._disposers ??= new Set();
    this._disposers.add(disposer);
  }

  /**
   * Removes a disposer from this subscription that was previously added with the {@link #add} method.
   *
   * Note that `Subscription` instances when unsubscribed will automatically remove themselves
   * from every other `Subscription` they have been added to. This means that using the `remove` method
   * is not a common thing and should be used thoughtfully.
   *
   * If you add the same disposer instance of a function or an unsubscribable object to a `Subscription`
   * more than once, you will need to call `remove` the same number of times to remove all instances.
   *
   * All disposer instances are removed to free up memory upon unsubscription.
   *
   * TIP: In instances you're adding and removing _Subscriptions from other Subscriptions_, you should
   * be sure to unsubscribe or otherwise get rid of the child subscription reference as soon as you
   * remove it. The child subscription has a reference to the parent it was added to via closure. In
   * most cases this is a non-issue as child subscriptions are rarely long-lived.
   *
   * @param disposer The disposer to remove from this subscription
   */
  remove(disposer: Exclude<Disposer, void>): void {
    this._disposers?.delete(disposer);
  }
}

// Even though Subscription only conditionally implements disposer symbols
// if it's available, we still need to declare it here so that TypeScript
// knows that it exists on the prototype when it is available.
export interface Subscription {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

if (typeof Symbol.dispose === "symbol") {
  Subscription.prototype[Symbol.dispose] = Subscription.prototype.unsubscribe;
}

if (typeof Symbol.asyncDispose === "symbol") {
  Subscription.prototype[Symbol.asyncDispose] = Subscription.prototype.unsubscribe;
}

async function execDisposer(disposer: Unsubscribable | Promise<any> | (() => void)) {
  if (isFunction(disposer)) return disposer();
  else if (isPromise(disposer)) return disposer;
  else return disposer.unsubscribe();
}

/**
 * Implements the {@link AsyncObserver} interface and extends the {@link Subscription} class.
 * While {@link AsyncObserver} is the public interface for consuming the values of an
 * {@link AsyncObservable}, all AsyncObservers get converted to a Subscriber in order to
 * return Subscription methods like `unsubscribe` back to the caller. Subscriber is a common
 * type in eventkit and is crucial for implementing operators, but is rarely used as a
 * public interface.
 */
export class Subscriber<T> extends Subscription implements AsyncObserver<T> {
  /** @internal */
  protected destination: AsyncObserver<T>;
  /** @internal */
  protected _stopped: boolean = false;
  /** @internal */
  protected readonly _pushOverride: ((value: T) => PromiseOrValue<any>) | null = null;
  /** @internal */
  protected _returnPromise: PromiseWithResolvers<void>;

  /** @internal */
  constructor(destination?: Subscriber<T> | Partial<AsyncObserver<T>> | ((value: T) => PromiseOrValue<any>) | null);

  /** @internal */
  constructor(
    destination: Subscriber<any> | AsyncObserver<any> | ((value: any) => PromiseOrValue<any>) | null,
    overrides: SubscriberOverrides<T>
  );

  /**
   * Creates an instance of a Subscriber. If another instance of Subscriber is passed in, it will
   * automatically wire up unsubscription as a disposer between this instance and the provided
   * Subscriber.
   *
   * If a push-handler function is passed in, it will be converted into a compatible observer object.
   *
   * @param destination A subscriber, observer, or push-handler function that receives the next value.
   * @deprecated Do not create instances of `Subscriber` directly. Use {@link operate} instead.
   */
  constructor(
    destination?: Subscriber<T> | AsyncObserver<T> | ((value: T) => PromiseOrValue<any>) | null,
    overrides?: SubscriberOverrides<T>
  ) {
    super();
    this.destination = destination instanceof Subscriber ? destination : createSafeAsyncObserver(destination);
    this._returnPromise = Promise.withResolvers<void>();

    this._pushOverride = overrides?.push ?? null;
    this._push = this._pushOverride ? overridePush : this._push;

    // Automatically chain subscriptions together here.
    // if destination appears to be one of our subscriptions, we'll chain it.
    if (isSubscriptionObject(this.destination)) {
      this.destination.add(this);
    }
  }

  /**
   * Adds the promise that will resolve the return of the subscriber, which
   * is likely the promise representing the execution of the AsyncObservable.
   * `await` or `then` calls on this subscription will be resolved by any
   * promises that are added using this method.
   * @internal
   */
  addReturnPromise(promise: Promise<any>): void {
    this.add(promise.then(this._returnPromise.resolve).catch(this._returnPromise.reject));
  }

  /**
   * The {@link AsyncObserver} callback to receive any values emitted from the
   * AsyncObservable, with a value. The AsyncObservable may call this method 0
   * or more times.
   * @param value The value emitted by the source AsyncObservable.
   */
  push(value: T): Promise<void> {
    if (this._stopped) {
      // ?: rxjs handles this by calling a globally defined stop notification handler. should we do the same?
      return Promise.resolve();
    } else {
      return this._push(value);
    }
  }

  protected _push(value: T): Promise<void> {
    const ex = this.destination.push(value);
    return isPromise(ex) ? ex : Promise.resolve(ex);
  }

  unsubscribe(): Promise<void> {
    this._stopped = true;
    return super.unsubscribe();
  }

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

function isSubscriptionObject(value: any): value is Subscription {
  return value && isFunction(value.unsubscribe) && isFunction(value.add);
}

function createSafeAsyncObserver<T>(observerOrPush?: AsyncObserver<T> | ((value: T) => PromiseOrValue<any>) | null): AsyncObserver<T> {
  return !observerOrPush || isFunction(observerOrPush) ? { push: observerOrPush ?? (() => {}) } : observerOrPush;
}

async function overridePush<T>(this: Subscriber<T>, value: T): Promise<void> {
  try {
    return this._pushOverride!(value);
  } catch (error) {
    return this._returnPromise.reject(error);
  }
}

export interface SubscriberOverrides<T> {
  /**
   * If provided, this function will be called whenever the {@link Subscriber}'s
   * `push` method is called, with the value that was passed to that call.
   * @param value The value that is being observed from the source.
   */
  push?: (value: T) => PromiseOrValue<void>;
}

export interface OperateConfig<In, Out> extends SubscriberOverrides<In> {
  destination: Subscriber<Out>;
}

/**
 * Creates a new {@link Subscriber} instance that passes events on to the
 * supplied `destination`. The returned `Subscriber` will be "chained" to the
 * `destination` such that when `unsubscribe` is called on the `destination`,
 * the returned `Subscriber` will also be unsubscribed.
 *
 * Advanced: This ensures that subscriptions are properly wired up prior to starting the
 * subscription logic. This prevents "synchronous firehose" scenarios where an
 * inner observable from a flattening operation cannot be stopped by a downstream
 * terminal operator like `take`.
 *
 * This is a utility designed to be used to create new operators for observables.
 *
 * @param config The configuration for creating a new subscriber for an operator.
 * @returns A new subscriber that is chained to the destination.
 */
export function operate<In, Out>({ destination, ...overrides }: OperateConfig<In, Out>) {
  return new Subscriber(destination, overrides);
}

/**
 * Represents any number of values over any amount of time.
 */
export class AsyncObservable<T> implements Subscribable<T>, PromiseLike<void> {
  private _subscribers: Set<Subscriber<T>> = new Set();

  /**
   * @param subscribe The function that gets called when the AsyncObservable is subscribed to.
   * This function is passed a {@link Subscriber} instance that is used to push values to a
   * downstream destination.
   */
  constructor(subscribe?: (this: AsyncObservable<T>, subscriber: Subscriber<T>) => PromiseOrValue<void>) {
    if (subscribe) this._subscribe = subscribe;
  }

  /**
   * Invokes an execution of an AsyncObservable and registers Observer handlers for notifications it will emit.
   *
   * `subscribe` is not a regular operator, but a method that calls AsyncObservable's internal `subscribe` function. It
   * might be for example a function that you passed to AsyncObservable's constructor, but most of the time it is
   * a library implementation, which defines what will be emitted by an AsyncObservable, and when it be will emitted. This means
   * that calling `subscribe` is actually the moment when AsyncObservable starts its work, not when it is created, as it is often
   * the thought.
   *
   * Apart from starting the execution of an AsyncObservable, this method allows you to listen for values that
   * an AsyncObservable emits, as well as waiting for the execution of the AsyncObservable to complete by using
   * the returned `Subscriber` instance like you would with a Promise.
   *
   * You can do this by creating an object that implements {@link AsyncObserver} interface. It should have methods
   * defined by that interface, but note that it should be just a regular JavaScript object, which you can create
   * yourself in any way you want (ES6 class, classic function constructor, object literal etc.). In particular, do
   * not attempt to use any eventkit implementation details to create AsyncObservers - you don't need them. Remember also
   * that your object does not have to implement all methods. If you find yourself creating a method that doesn't
   * do anything, you can simply omit it.
   *
   * You can also subscribe with no parameters at all. This may be the case where you're not interested in terminal events
   * and you also handled emissions internally by using operators (e.g. using `tap`).
   *
   * However you decide to pass in an AsyncObserver, in any case it returns a Subscriber object. This object allows you to
   * call `unsubscribe` on it, which in turn will stop the work that an `AsyncObservable` does and will clean up all the
   * resources that an AsyncObservable holds. Note that cancelling a subscription does not inherently interrupt the promise
   * that represents the execution of the AsyncObservable. It is up to the AsyncObservable's implementation to decide what
   * to do when a subscription is cancelled, and resolve the promise if needed by adding a listener using {@link add} on the
   * returned Subscriber.
   *
   * The returned Subscriber object also acts like a Promise which can be awaited to wait for the AsyncObservable's
   * execution to complete. Any errors that are thrown by this function will be propagated to the promise's rejection
   * handler.
   *
   * AsyncObservable also acts like a Promise which can be awaited to listen for when all current Subscriber instances have
   * completed execution and cleanup. Any errors that are thrown by any subscriber will be propogated to the promise's rejection
   * handler. This is useful for when you want to wait for all subscribers to finish before continuing, for instance making
   * sure that all subscribers have finished before you continue with some other work.
   *
   * @param observerOrPush An AsyncObserver or a push-handler function that receives the next value.
   * @returns A Subscriber that allows you to cancel the AsyncObservable's execution.
   */
  subscribe(observerOrPush?: AsyncObserver<T> | ((value: T) => PromiseOrValue<any>)): Subscriber<T> {
    const subscriber = observerOrPush instanceof Subscriber ? observerOrPush : new Subscriber<T>(observerOrPush);
    subscriber.addReturnPromise(this._trySubscribe(subscriber));
    subscriber.add(() => this._subscribers.delete(subscriber));
    this._subscribers.add(subscriber);
    return subscriber;
  }

  /** @internal */
  protected _trySubscribe(sink: Subscriber<T>): Promise<void> {
    try {
      const ex = this._subscribe(sink);
      return isPromise(ex) ? ex : Promise.resolve(ex);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** @internal */
  protected _subscribe(_subscriber: Subscriber<T>): PromiseOrValue<void> {
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

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.all(Array.from(this._subscribers))
      .then(() => onfulfilled?.() as any)
      .catch(onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult> {
    return Promise.all(Array.from(this._subscribers))
      .then(() => undefined as any)
      .catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): PromiseLike<void> {
    return Promise.all(Array.from(this._subscribers))
      .then(() => undefined)
      .finally(onfinally);
  }
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>) {
  return fn(prev);
}

/**
 * Returns true if the object is a function.
 * @param value The value to check
 */
function isFunction(value: any): value is (...args: any[]) => any {
  return typeof value === "function";
}

/**
 * Returns true if the object is "thennable".
 * @param value the object to test
 */
function isPromise(value: any): value is Promise<any> {
  return isFunction(value?.then) && isFunction(value?.catch);
}
