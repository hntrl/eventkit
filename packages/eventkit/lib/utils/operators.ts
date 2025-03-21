/**
 * Creates a function that returns the logical negation of the provided predicate function.
 * This is useful for inverting the logic of a predicate function for use with operators
 * like `filter`.
 *
 * @param pred - The predicate function to negate
 * @returns A new function that returns the opposite boolean value of the original predicate
 *
 * @example
 * // Filter out even numbers
 * observable.pipe(filter(not(isEven)))
 */
export function not<T>(
  pred: (value: T, index: number) => boolean
): (value: T, index: number) => boolean {
  return (value: T, index: number) => !pred(value, index);
}
