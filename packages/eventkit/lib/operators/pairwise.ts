import { type OperatorFunction } from "@eventkit/async-observable";

/**
 * Groups pairs of consecutive emissions together and emits them as a tuple of two values. In other
 * words, it will take the current value and the previous value and emit them as a pair.
 *
 * Note: Because pairwise only emits complete pairs, the first emission from the source observable
 * will be "skipped" since there is no previous value. This means that the output observable will
 * always have one less emission than the source observable.
 *
 * @group Operators
 */
export function pairwise<T>(): OperatorFunction<T, [T, T]> {
  return (source) =>
    new source.AsyncObservable(async function* () {
      let prev: T | undefined;
      for await (const value of source) {
        if (prev === undefined) {
          prev = value;
          continue;
        }
        yield [prev, value];
        prev = value;
      }
    });
}
