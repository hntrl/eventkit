/**
 * A class that wraps a Promise with explicit resolve and reject methods.
 *
 * Signal implements the PromiseLike interface, allowing it to be used in async/await
 * contexts and with Promise chaining. Unlike a regular Promise, Signal exposes the
 * resolve and reject methods as instance methods, making it easier to control when
 * and how the underlying promise resolves or rejects.
 *
 * This class is useful for creating deferred promises where the resolution is controlled
 * externally from the promise creation.
 *
 * @template T The type of value that the wrapped Promise resolves to, defaults to void
 */
export class Signal<T = void> implements PromiseLike<T> {
  /** @internal */
  _status: "pending" | "resolved" | "rejected" = "pending";
  /** @internal */
  _promise: Promise<T>;

  /** Creates a new Signal instance with resolve and reject methods bound to the instance. */
  constructor() {
    this._promise = new Promise((resolve, reject) => {
      this.resolve = (value: T) => {
        this._status = "resolved";
        resolve(value);
      };
      this.reject = (reason: any) => {
        this._status = "rejected";
        reject(reason);
      };
    });
  }

  /** Resolves the underlying promise with the given value. */
  resolve(value: T | PromiseLike<T>) {
    this._status = "resolved";
    this._promise = Promise.resolve(value);
  }

  /** Rejects the underlying promise with the given reason. */
  reject(reason?: any) {
    this._status = "rejected";
    this._promise = Promise.reject(reason);
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   *
   * @param onfulfilled The callback to execute when the Promise is resolved
   * @param onrejected The callback to execute when the Promise is rejected
   * @returns A Promise for the completion of which ever callback is executed
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  /** Returns the underlying promise. */
  asPromise(): Promise<T> {
    return this._promise;
  }
}
