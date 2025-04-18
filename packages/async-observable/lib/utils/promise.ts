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
 *
 * @internal
 */
export class PromiseSet implements PromiseLike<void> {
  /** @internal */
  _currentPromise: Promise<void> | null = null;
  /** @internal */
  _signal: Signal | null = null;
  /** @internal */
  _error: any | null = null;

  /**
   * Adds a promise that will be tracked by the PromiseSet.
   */
  add(promise: PromiseLike<any>) {
    const nextPromise = Promise.all([this._currentPromise, promise]).then(() => Promise.resolve());
    this._currentPromise = nextPromise;
    nextPromise.then(
      () => this._resolve(nextPromise),
      (error) => this._reject(error)
    );
  }

  private _resolve(nextPromise: Promise<void>) {
    // If the current promise is not the latest one, we shouldn't resolve the signal. This is what
    // makes promise sets work -- This function will get called every time the promise created in
    // `add` is resolved, but we don't resolve the signal unless the latest version of the chain is
    // passed in.
    if (this._currentPromise !== nextPromise) return;

    // The promise chain is resolved, so we can reset the promise chain.
    this._currentPromise = null;

    // If there isn't a current signal, there's nothing to resolve
    if (!this._signal) return;

    // Resolve the signal
    this._signal.resolve();
    this._signal = null;
  }

  /** @internal */
  private _reject(error: any) {
    // Throw out the promise chain since it's been rejected
    this._currentPromise = null;

    // Set the error state of this promise set
    this._error = error;

    // If there isn't a current signal, there's nothing to reject
    if (!this._signal) return;

    // Otherwise, reject the signal
    this._signal.reject(error);
    this._signal = null;
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
    // If there is an error, we can just reject immediately
    if (this._error) {
      return Promise.reject(this._error).then(onfulfilled, onrejected);
    }
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
