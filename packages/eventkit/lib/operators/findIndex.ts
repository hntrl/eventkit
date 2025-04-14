import { singletonFrom } from "../singleton";
import { type Falsy, type SingletonOperatorFunction } from "../utils/types";

/**
 * Emits the index of the first value emitted by the source observable that satisfies a specified
 * condition. If no such value is found, emits `-1` when the source observable completes.
 *
 * @param predicate A function that evaluates each value emitted by the source observable.
 * Returns `true` if the value satisfies the condition, `false` otherwise.
 *
 * @group Operators
 */
export function findIndex<T>(
  predicate: BooleanConstructor
): SingletonOperatorFunction<T, T extends Falsy ? -1 : number>;
export function findIndex<T>(
  predicate: (value: T, index: number) => boolean
): SingletonOperatorFunction<T, number>;
export function findIndex<T>(
  predicate: ((value: T, index: number) => boolean) | BooleanConstructor
): SingletonOperatorFunction<T, any> {
  return (source) =>
    singletonFrom(
      new source.AsyncObservable(async function* () {
        let index = 0;
        for await (const value of source) {
          if (typeof predicate === "function" ? predicate(value, index) : Boolean(value)) {
            yield index;
            return;
          }
          index++;
        }
        yield -1;
      })
    );
}
