import { singletonFrom } from "../singleton";
import { type SingletonOperatorFunction } from "../utils/types";

/**
 * Emits `false` if the source observable emits any values, or emits `true` if the source observable
 * completes without emitting any values.
 *
 * @group Operators
 */
export function isEmpty<T>(): SingletonOperatorFunction<T, boolean> {
  return (source) =>
    singletonFrom(
      new source.AsyncObservable(async function* () {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of source) {
          yield false;
          return;
        }
        yield true;
      })
    );
}
