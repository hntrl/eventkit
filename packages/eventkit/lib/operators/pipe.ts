import type { UnaryFunction } from "@eventkit/async-observable";

export function pipe(): <T>(x: T) => T;
/** @ignore */
export function pipe<T, A>(fn1: UnaryFunction<T, A>): UnaryFunction<T, A>;
/** @ignore */
export function pipe<T, A, B>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>
): UnaryFunction<T, B>;
/** @ignore */
export function pipe<T, A, B, C>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>
): UnaryFunction<T, C>;
/** @ignore */
export function pipe<T, A, B, C, D>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>
): UnaryFunction<T, D>;
/** @ignore */
export function pipe<T, A, B, C, D, E>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>
): UnaryFunction<T, E>;
/** @ignore */
export function pipe<T, A, B, C, D, E, F>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>,
  fn6: UnaryFunction<E, F>
): UnaryFunction<T, F>;
/** @ignore */
export function pipe<T, A, B, C, D, E, F, G>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>,
  fn6: UnaryFunction<E, F>,
  fn7: UnaryFunction<F, G>
): UnaryFunction<T, G>;
/** @ignore */
export function pipe<T, A, B, C, D, E, F, G, H>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>,
  fn6: UnaryFunction<E, F>,
  fn7: UnaryFunction<F, G>,
  fn8: UnaryFunction<G, H>
): UnaryFunction<T, H>;
/** @ignore */
export function pipe<T, A, B, C, D, E, F, G, H, I>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>,
  fn6: UnaryFunction<E, F>,
  fn7: UnaryFunction<F, G>,
  fn8: UnaryFunction<G, H>,
  fn9: UnaryFunction<H, I>
): UnaryFunction<T, I>;
/** @ignore */
export function pipe<T, A, B, C, D, E, F, G, H, I>(
  fn1: UnaryFunction<T, A>,
  fn2: UnaryFunction<A, B>,
  fn3: UnaryFunction<B, C>,
  fn4: UnaryFunction<C, D>,
  fn5: UnaryFunction<D, E>,
  fn6: UnaryFunction<E, F>,
  fn7: UnaryFunction<F, G>,
  fn8: UnaryFunction<G, H>,
  fn9: UnaryFunction<H, I>,
  ...fns: UnaryFunction<any, any>[]
): UnaryFunction<T, unknown>;

/**
 * Creates a new function that pipes the value through a series of functions.
 *
 * The `pipe()` function is used to create custom operators by combining multiple
 * existing operators. It takes a sequence of operators and returns a new operator
 * that applies each function in sequence, passing the result of one function as
 * input to the next.
 *
 * This is particularly useful for creating reusable sequences of operators that
 * can be applied to observables.
 *
 * @example
 * ```ts
 * // Create a custom operator that filters even numbers and doubles them
 * function doubleEvens() {
 *   return pipe<number>(
 *     filter((num) => num % 2 === 0),
 *     map((num) => num * 2)
 *   );
 * }
 *
 * // Use the custom operator
 * const result = AsyncObservable.from([1, 2, 3, 4])
 *   .pipe(doubleEvens())
 *   .subscribe(console.log);
 * // Outputs: 4, 8
 * ```
 *
 * @param fns - A series of functions to be composed together
 * @returns A function that represents the composition of all input functions
 * @group Utilities
 */
export function pipe(...fns: Array<UnaryFunction<any, any>>): UnaryFunction<any, any> {
  return fns.length === 1 ? fns[0] : (input: any) => fns.reduce(pipeReducer, input);
}

function pipeReducer(prev: any, fn: UnaryFunction<any, any>): any {
  return fn(prev);
}
