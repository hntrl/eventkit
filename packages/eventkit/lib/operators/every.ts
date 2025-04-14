import { singletonFrom } from "../singleton";
import { type SingletonOperatorFunction, type Falsy } from "../utils/types";

/**
 * Determines whether all items emitted by the source observable satisfy a specified condition.
 * Emits `true` if all values pass the condition, or `false` immediately if any value fails.
 *
 * Note: If any value fails the predicate, the observable will be cancelled.
 *
 * @param predicate A function that evaluates each value emitted by the source observable.
 * Returns `true` if the value satisfies the condition, `false` otherwise.
 *
 * @group Operators
 */
export function every<T>(
  predicate: (value: T, index: number) => boolean
): SingletonOperatorFunction<T, boolean>;
export function every<T>(
  predicate: BooleanConstructor
): SingletonOperatorFunction<T, Exclude<T, Falsy> extends never ? false : boolean>;
export function every<T>(
  predicate: (value: T, index: number) => boolean
): SingletonOperatorFunction<T, boolean> {
  return (source) =>
    singletonFrom(
      new source.AsyncObservable(async function* () {
        let index = 0;
        for await (const value of source) {
          if (!predicate(value, index++)) {
            yield false;
            return;
          }
        }
        yield true;
      })
    );
}
