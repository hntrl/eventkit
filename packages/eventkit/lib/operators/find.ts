import { singletonFrom } from "../singleton";
import { type TruthyTypesOf, type SingletonOperatorFunction } from "../utils/types";

/**
 * Emits the first value emitted by the source observable that satisfies a specified condition.
 * If no such value is found, emits `undefined` when the source observable completes.
 *
 * @param predicate A function that evaluates each value emitted by the source observable.
 * Returns `true` if the value satisfies the condition, `false` otherwise.
 *
 * @group Operators
 */
export function find<T, S extends T>(
  predicate: (value: T, index: number) => value is S
): SingletonOperatorFunction<T, S | undefined>;
export function find<T>(
  predicate: (value: T, index: number) => boolean
): SingletonOperatorFunction<T, T | undefined>;
export function find<T>(
  predicate: BooleanConstructor
): SingletonOperatorFunction<T, TruthyTypesOf<T>>;
export function find<T>(
  predicate: ((value: T, index: number) => boolean) | BooleanConstructor
): SingletonOperatorFunction<T, any> {
  return (source) =>
    singletonFrom(
      new source.AsyncObservable(async function* () {
        let index = 0;
        for await (const value of source) {
          if (typeof predicate === "function" ? predicate(value, index++) : Boolean(value)) {
            yield value;
            return;
          }
        }
        yield undefined;
      })
    );
}
