import { AsyncObservable, Subscriber } from "@eventkit/async-observable";

import { NoValuesError } from "./utils/errors";

/**
 * An extension of AsyncObservable that implements PromiseLike, allowing it to be used with
 * await syntax.
 *
 * This class is designed for observables that are expected to emit exactly one value, such as
 * those created by operators like `reduce` or `count`. It provides a convenient way to await
 * the single emitted value without having to manually set up a subscription.
 *
 * @example
 * ```ts
 * // instead of
 * let value: T | undefined;
 * await observable.subscribe((v) => {
 *   // this observable only emits one value, so this will only be called once
 *   value = v;
 * });
 *
 * // you can do
 * const value: T = await observable;
 *
 * // like with `reduce` for instance
 * const result = await from([1, 2, 3]).pipe(reduce((acc, val) => acc + val, 0));
 * console.log(result); // 6
 * ```
 *
 * @template T - The type of the value emitted by the observable
 */
export class SingletonAsyncObservable<T> extends AsyncObservable<T> implements PromiseLike<T> {
  /**
   * Returns a promise that will subscribe to the observable and resolve when the subscriber emits
   * its first value. This is useful in cases where you know the observable will emit one and only
   * one value (like the result of a `reduce` or `count` operator), but you want to wait for the
   * value to be emitted using `await` syntax instead of a subscription callback.
   *
   * When the first value is emitted, the subscriber will immediately be cancelled and all cleanup
   * work will be performed before the promise resolves.
   *
   * @throws {NoValuesError} If the observable completes without emitting any values.
   *
   * @param onfulfilled Optional callback to execute when the promise resolves successfully
   * @param onrejected Optional callback to execute when the promise rejects with an error
   * @returns A promise that resolves with the result of the onfulfilled/onrejected handlers
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const sub = new Subscriber(this);
    return Promise.race([
      // Race against the return signal to see if the observable completed without emitting any
      // values.
      sub._returnSignal.then(() => {
        throw new NoValuesError();
      }),
      // Race against the first value to be emitted by the observable.
      sub.next(),
    ])
      .then(async (result) => {
        await sub.cancel();
        return result.value;
      })
      .then(onfulfilled, onrejected);
  }
}

/**
 * Reconstructs a SingletonAsyncObservable from an existing AsyncObservable. We use this in
 * operators to intrinsically return singletons that retains the operator behavior of the source
 * without introducing the concept of a singleton to async-observable
 *
 * @param source The AsyncObservable to reconstruct
 * @returns A SingletonAsyncObservable that is a composition of the source and the provided operator
 * @internal
 */
export function singletonFrom<T>(source: AsyncObservable<T>): SingletonAsyncObservable<T> {
  const observable = new SingletonAsyncObservable<T>(source._generator);
  observable._scheduler = source._scheduler;
  return observable;
}
