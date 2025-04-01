import { type OperatorFunction } from "@eventkit/async-observable";

/**
 * Applies a given predicate function to each value emitted by the source observable.
 * @group Operators
 */
export function map<T, R>(predicate: (value: T, index: number) => R): OperatorFunction<T, R> {
  return (source) =>
    new source.AsyncObservable<R>(async function* () {
      let index = 0;
      for await (const value of source) {
        yield predicate(value, index++);
      }
    });
}
