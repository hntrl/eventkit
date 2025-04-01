import { type AsyncObservable, type UnaryFunction } from "@eventkit/async-observable";

import { not } from "../utils/operators";
import { type TruthyTypesOf } from "../utils/types";
import { filter } from "./filter";

type PartitionOperatorFunction<T, L = T, R = Exclude<T, L>> = UnaryFunction<
  AsyncObservable<T>,
  [AsyncObservable<L>, AsyncObservable<R>]
>;

/**
 * Returns an array with two observables that act as a split of the source observable; one with
 * values that satisfy the predicate, and another with values that don't satisfy the predicate.
 *
 * @param predicate A function that evaluates each value emitted by the source observable. If it
 * returns `true`, the value is emitted on the first observable in the returned array, if `false`
 * the value is emitted on the second observable in the array. The `index` parameter is the number
 * `i` for the i-th source emission that has happened since the subscription, starting from 0.
 * @group Operators
 * @category Transformation
 */
export function partition<T, S extends T>(
  predicate: (value: T, index: number) => value is S
): PartitionOperatorFunction<T, S>;
export function partition<T>(
  predicate: (value: T, index: number) => boolean
): PartitionOperatorFunction<T>;
export function partition<T>(
  predicate: BooleanConstructor
): PartitionOperatorFunction<T, TruthyTypesOf<T>>;
export function partition<T>(
  predicate: ((value: T, index: number) => boolean) | BooleanConstructor
): PartitionOperatorFunction<T, any, any> {
  return (source: AsyncObservable<T>) => [
    source.pipe(filter(predicate)) as AsyncObservable<any>,
    source.pipe(filter(not(predicate))) as AsyncObservable<any>,
  ];
}
