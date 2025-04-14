import { singletonFrom } from "../singleton";
import { NoValuesError } from "../utils/errors";
import { iife } from "../utils/operators";
import { type TruthyTypesOf, type SingletonOperatorFunction } from "../utils/types";

/**
 * Emits the first value emitted by the source observable that satisfies a specified condition. If
 * no such value is found when the source observable completes, the `defaultValue` is emitted if
 * it's provided. If it isn't, a NoValuesError is thrown.
 *
 * @throws {NoValuesError} Will throw a `NoValuesError` if no value is found and no default value is provided.
 *
 * @param predicate A function that evaluates each value emitted by the source observable.
 * Returns `true` if the value satisfies the condition, `false` otherwise.
 * @param defaultValue The default value returned when no value matches the predicate.
 *
 * @group Operators
 */
export function first<T, D = T>(
  predicate?: null,
  defaultValue?: D
): SingletonOperatorFunction<T, T | D>;
export function first<T>(
  predicate: BooleanConstructor
): SingletonOperatorFunction<T, TruthyTypesOf<T>>;
export function first<T, D>(
  predicate: BooleanConstructor,
  defaultValue: D
): SingletonOperatorFunction<T, TruthyTypesOf<T> | D>;
export function first<T, S extends T>(
  predicate: (value: T, index: number) => value is S,
  defaultValue?: S
): SingletonOperatorFunction<T, S>;
export function first<T, S extends T, D>(
  predicate: (value: T, index: number) => value is S,
  defaultValue: D
): SingletonOperatorFunction<T, S | D>;
export function first<T, D = T>(
  predicate: (value: T, index: number) => boolean,
  defaultValue?: D
): SingletonOperatorFunction<T, T | D>;
export function first<T>(
  predicate?: ((value: T, index: number) => boolean) | BooleanConstructor | null,
  defaultValue?: T
): SingletonOperatorFunction<T, any> {
  const hasDefaultValue = arguments.length >= 2;
  return (source) =>
    singletonFrom(
      new source.AsyncObservable(async function* () {
        let index = 0;
        for await (const value of source) {
          const passed = iife(() => {
            if (predicate === null || predicate === undefined) return true;
            else if (typeof predicate === "function") return predicate(value, index++);
            else return Boolean(value);
          });
          if (passed) {
            yield value;
            return;
          }
        }
        if (hasDefaultValue) yield defaultValue;
        else throw new NoValuesError();
      })
    );
}
