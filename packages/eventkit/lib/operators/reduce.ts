import { type OperatorFunction } from "@eventkit/async-observable";

/**
 * Applies an accumulator function over the source generator, and returns the
 * accumulated result when the source completes, given an optional seed value.
 *
 * Like
 * [Array.prototype.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce),
 * `reduce` applies an `accumulator` function against an accumulation and each
 * value emitted by the source generator to reduce it to a single value, emitted
 * on the output generator. Note that `reduce` will only emit one value, only
 * when the source generator completes.
 *
 * @param accumulator The accumulator function called on each source value.
 * @param seed The initial accumulation value.
 * @group Operators
 */
export function reduce<V, A>(
  accumulator: (acc: A, value: V, index: number) => A,
  seed: A
): OperatorFunction<V, A>;
export function reduce<V, A>(
  accumulator: (acc: A | undefined, value: V, index: number) => A,
  seed?: A
): OperatorFunction<V, A>;
export function reduce<V, A>(
  accumulator: (acc: A | undefined, value: V, index: number) => A,
  seed?: A
): OperatorFunction<V, A> {
  const hasSeed = arguments.length >= 2;
  return (source) =>
    new source.AsyncObservable<A>(async function* (this: any) {
      let acc = hasSeed ? seed : undefined;
      let index = 0;
      for await (const value of source) {
        acc = accumulator(acc as A | undefined, value, index++);
      }
      yield acc as A;
    });
}
