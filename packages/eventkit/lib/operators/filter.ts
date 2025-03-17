import { type OperatorFunction } from "@eventkit/async-observable";

import { type TruthyTypesOf } from "../utils/types";

/**
 * Filters items emitted by the source observable by only emitting those that
 * satisfy a specified predicate.
 *
 * @param predicate A function that evaluates each value emitted by the source Observable.
 * Returns true to keep the value, false to drop it.
 */
export function filter<T>(predicate?: (value: T, index: number) => boolean): OperatorFunction<T, T>;
export function filter<T, S extends T>(
  predicate?: (value: T, index: number) => value is S
): OperatorFunction<T, S>;
export function filter<T>(predicate?: BooleanConstructor): OperatorFunction<T, TruthyTypesOf<T>>;
export function filter<T>(
  predicate?: ((value: T, index: number) => boolean) | BooleanConstructor
): OperatorFunction<T, any> {
  return (source) =>
    new source.AsyncObservable<T>(async function* () {
      let index = 0;
      for await (const value of source) {
        if (typeof predicate === "function" ? predicate(value, index++) : Boolean(value)) {
          yield value;
        }
      }
    });
}
