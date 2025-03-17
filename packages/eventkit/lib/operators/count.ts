import { type OperatorFunction } from "@eventkit/async-observable";

/**
 * Counts the number of items emitted by the source observable, and emits that
 * number when the source observable completes.
 *
 * @param predicate A function that is used to analyze the value and the index and
 * determine whether or not to increment the count. Return `true` to increment the count,
 * and return `false` to keep the count the same. If the predicate is not provided, every value
 * will be counted.
 */
export function count<T>(
  predicate?: (value: T, index: number) => boolean
): OperatorFunction<T, number> {
  predicate = predicate ?? (() => true);
  return (source) =>
    new source.AsyncObservable<number>(async function* () {
      let index = 0;
      let count = 0;
      for await (const value of source) {
        if (predicate(value, index++)) {
          count++;
        }
      }
      yield count;
    });
}
