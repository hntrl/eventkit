import { singletonFrom } from "../singleton";
import { NoValuesError } from "../utils/errors";
import { type SingletonOperatorFunction } from "../utils/types";

const kUndefinedReducerValue = Symbol("undefinedReducerValue");
type UndefinedReducerValue = typeof kUndefinedReducerValue;

/**
 * Applies an accumulator function over the source generator, and returns the
 * accumulated result when the source completes, given an optional seed value.
 *
 * Like
 * [Array.prototype.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce),
 * `reduce` applies an `accumulator` function against an accumulation and each
 * value emitted by the source generator to reduce it to a single value, emitted
 * on the output generator. This operator also behaves similarly to the reduce method in terms of
 * how it handles the seed value (or initialValue):
 *
 * * If no seed value is provided and the observable emits more than one value, the accumulator
 * function will be called for each value starting with the second value, where the first value is
 * used as the initial accumulator value. This means that the accumulator function will be called
 * N-1 times where N is the number of values emitted by the source generator.
 *
 * * If the seed value is provided and the observable emits any values, then the accumulator
 * function will always be called starting with the first emission from the source generator.
 *
 * * If the observable only emits one value and no seed value is provided, or if the seed value is
 * provided but the observable doesn't emit any values, the solo value will be emitted without
 * any calls to the accumulator function.
 *
 * * If the observable emits no values and a seed value is provided, the seed value will be emitted
 * without any calls to the accumulator function.
 *
 * * If the observable emits no values and no seed value is provided, the operator will throw a
 * `NoValuesError` on completion.
 *
 * @throws {NoValuesError} If the observable emits no values and no seed value is provided.
 *
 * @param accumulator The accumulator function called on each source value.
 * @param seed The initial accumulation value.
 *
 * @group Operators
 */
export function reduce<V, A = V>(
  accumulator: (acc: A | V, value: V, index: number) => A
): SingletonOperatorFunction<V, A | V>;
export function reduce<V, A>(
  accumulator: (acc: A, value: V, index: number) => A,
  seed: A
): SingletonOperatorFunction<V, A>;
export function reduce<V, A, S = A>(
  accumulator: (acc: A | S, value: V, index: number) => A,
  seed: S
): SingletonOperatorFunction<V, A>;
export function reduce<V, A>(
  accumulator: (acc: A | V, value: V, index: number) => A,
  seed?: A
): SingletonOperatorFunction<V, A | V> {
  return (source) =>
    singletonFrom(
      new source.AsyncObservable<V | A>(async function* () {
        let acc: A | V | UndefinedReducerValue = seed ?? kUndefinedReducerValue;
        let index = 0;
        for await (const value of source) {
          if (acc === kUndefinedReducerValue) acc = value;
          else acc = accumulator(acc, value, index);
          index++;
        }
        if (acc === kUndefinedReducerValue) throw new NoValuesError();
        yield acc;
      })
    );
}
