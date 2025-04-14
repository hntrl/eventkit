import { type OperatorFunction } from "@eventkit/async-observable";

import { filter } from "./filter";

/**
 * Returns an observable that skips the first `count` values emitted by the source observable.
 *
 * @param count The number of values to skip.
 *
 * @group Operators
 */
export function skip<T>(count: number): OperatorFunction<T, T> {
  return filter((_, index) => count <= index);
}
