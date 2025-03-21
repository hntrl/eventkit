import { type AsyncObservable, type UnaryFunction } from "@eventkit/async-observable";

import { not } from "../utils/operators";
import { filter } from "./filter";

/**
 * Returns an array with two observables that act as a split of the source observable; one with
 * values that satisfy the predicate, and another with values that don't satisfy the predicate.
 *
 * @param predicate A function that evaluates each value emitted by the source observable. If it
 * returns `true`, the value is emitted on the first observable in the returned array, if `false`
 * the value is emitted on the second observable in the array. The `index` parameter is the number
 * `i` for the i-th source emission that has happened since the subscription, starting from 0.
 */
export function partiton<T>(
  predicate: (value: T, index: number) => boolean
): UnaryFunction<AsyncObservable<T>, [AsyncObservable<T>, AsyncObservable<T>]> {
  return (source: AsyncObservable<T>) =>
    [source.pipe(filter(predicate)), source.pipe(filter(not(predicate)))] as [
      AsyncObservable<T>,
      AsyncObservable<T>,
    ];
}
