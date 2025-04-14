import { type SingletonOperatorFunction } from "../utils/types";
import { reduce } from "./reduce";

/**
 * Emits the minimum value emitted by the source observable. The source observable must emit a
 * comparable type (numbers, strings, dates, etc.), or any type when a comparer function is
 * provided.
 *
 * @param comparer A function that compares two values and returns a number; a positive number if the
 * first value is greater than the second, a negative number if the first value is less than the
 * second, or 0 if they are equal.
 * @group Operators
 */
export function min<T>(comparer?: (x: T, y: T) => number): SingletonOperatorFunction<T, T> {
  comparer ??= (x: T, y: T) => (x > y ? 1 : -1);
  return reduce((x, y) => (comparer(x, y) < 0 ? x : y));
}
