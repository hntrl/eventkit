import { type OperatorFunction } from "@eventkit/async-observable";

import { ArgumentOutOfRangeError } from "../utils/errors";

/**
 * Emits the single value at the specified `index` in the source observable, or a default value
 * provided in the `defaultValue` argument and if the index is out of range. If the index is out of
 * range and no default is given, an ArgumentOutOfRangeError is thrown.
 *
 * @throws {ArgumentOutOfRangeError} When using `elementAt(i)`, it throws an `ArgumentOutOfRangeError`
 * if `i < 0` or the observable has completed before yielding the i-th value.
 *
 * @param index Is the number `i` for the i-th source emission that has happened
 * since the subscription, starting from the number `0`.
 * @param defaultValue The default value returned for missing indices.
 * @group Operators
 * @category Filtering
 */
export function elementAt<T, D = T>(index: number, defaultValue?: D): OperatorFunction<T, T | D> {
  if (index < 0) {
    throw new ArgumentOutOfRangeError();
  }
  return (source) =>
    new source.AsyncObservable<T | D>(async function* () {
      let i = 0;
      for await (const value of source) {
        if (i++ === index) {
          yield value;
          return;
        }
      }
      if (defaultValue) yield defaultValue;
      else throw new ArgumentOutOfRangeError();
    });
}
