import { Signal } from "./signal";

/**
 * Represents the resolution of a set of promises that are not immediately known when the
 * PromiseSet is created. Whereas `Promise.all` tracks the resolution of promises that are
 * passed in the constructor, PromiseSet tracks the resolution of promises that are added
 * using the `add` method.
 *
 * When a PromiseSet is awaited, the promise being observed won't resolve until all of the
 * promises added to the set have resolved, including any promises that are added in the time it
 * takes for any previous promises to resolve.
 *
 * Note that a PromiseSet is primarily used to track the resolution of promises added to it, but
 * not necessarily the values that get returned since we can't yield that in a meaningful way
 */
export class PromiseSet implements PromiseLike<void> {
  /** @internal */
  _promises: Set<PromiseLike<any>> = new Set();
  /** @internal */
  _currentPromise: Promise<void> | null = null;
  /** @internal */
  _signal: Signal | null = null;

  /**
   * Adds a promise that will be tracked by the PromiseSet.
   */
  add(promise: PromiseLike<any>) {
    this._promises.add(promise);
    const nextPromise = Promise.all(this._promises).then(() => Promise.resolve());
    this._currentPromise = nextPromise;
    nextPromise.then(
      () => this._resolveSignal(nextPromise),
      (error) => this._rejectSignal(error)
    );
  }

  /** @internal */
  private _resolveSignal(current: Promise<void>) {
    // If the current promise is not the latest one, we shouldn't resolve the signal This is what
    // makes promise sets work -- This function will get called every time the promise created in
    // `add` is resolved, but we don't resolve the signal unless the latest version of the chain is
    // passed in.
    if (this._currentPromise !== current) return;

    // The promise chain is resolved, so we can reset the promise chain.
    this._currentPromise = null;

    // If there isn't a current signal, there's nothing to resolve
    if (!this._signal) return;

    // Resolve the signal
    this._signal.resolve();
    this._signal = null;
  }

  /** @internal */
  private _rejectSignal(error: any) {
    // Throw out the promise chain since it's been rejected
    this._currentPromise = null;

    // If there isn't a current signal, there's nothing to reject
    if (!this._signal) return;

    // Otherwise, reject the signal
    this._signal.reject(error);
    // We intentionally don't reset the signal here. Any error that occurs in the promise set is
    // meant to "error" the promise set, meaning that any subsequent calls to `then` or `catch` will
    // be rejected immediately.
  }

  /**
   * Returns a new PromiseSet that only contains promises that pass the filter function.
   */
  filter(predicate: (promise: PromiseLike<any>) => boolean) {
    const newSet = new PromiseSet();
    for (const promise of this._promises) {
      if (!predicate(promise)) continue;
      newSet.add(promise);
    }
    return newSet;
  }

  /**
   * Returns a promise that will resolve when all of the promises added to the set have resolved,
   * and reject if any of the promises added to the set have rejected. This method makes this object
   * a "custom thennable", which means that this is the logic that will be applied when the set is
   * used in an await statement.
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    // If there isn't any work being done, we can just resolve immediately
    if (!this._currentPromise) {
      return Promise.resolve().then(onfulfilled, onrejected);
    }
    // if there isn't an existing signal already, we need to create one
    if (!this._signal) {
      this._signal = new Signal();
    }
    return this._signal.then(onfulfilled, onrejected);
  }

  /**
   * Adds a catch handler that will get called if any of the promises added to the set have
   * rejected.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TResult> {
    return this.then(undefined, onrejected);
  }

  /**
   * Adds a handler that will get called when all of the promises added to the set have
   * resolved, or if any of the promises added to the set have rejected.
   */
  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.then().finally(onfinally);
  }
}
