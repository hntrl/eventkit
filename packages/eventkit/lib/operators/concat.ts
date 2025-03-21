import {
  from,
  type AsyncObservableInput,
  type ObservedValueOf,
  type OperatorFunction,
} from "@eventkit/async-observable";

import { type AsyncObservableInputTuple } from "../utils/types";
import { mergeAll, mergeMap } from "./merge";

/**
 * Merges the values from all provided observables into a single observable. When subscribed to, it
 * will subscribe to the provided observables in a serial fashion, emitting the observables values,
 * and waiting for each one to complete before subscribing to the next. The output observable will
 * complete when all provided observables have completed, and error when any provided observable
 * errors.
 */
export function concat<T, A extends readonly unknown[]>(
  ...otherSources: [...AsyncObservableInputTuple<A>]
): OperatorFunction<T, T | A[number]> {
  return (source) => from([source, ...otherSources]).pipe(concatAll());
}

/**
 * Converts an observable that yields observables (called a higher-order observable) into a
 * first-order observable which delivers all the values from the inner observables in order. It
 * only subscribes to an inner observable only after the previous inner observable has completed.
 * All values emitted by the inner observables are emitted in order.
 *
 * Note: If the source observable emits observables quickly and endlessly, and the inner observables
 * it emits generally complete slower than the source emits, you can run into memory issues as
 * the incoming observables collect in an unbounded buffer.
 *
 * Note: `concatAll` is equivalent to `mergeAll` with the concurrency parameter set to `1`.
 */
export function concatAll<O extends AsyncObservableInput<any>>(): OperatorFunction<
  O,
  ObservedValueOf<O>
> {
  return mergeAll(1);
}

/**
 * Applies a predicate function to each value yielded by the source observable, which returns a
 * different observable that will be merged in a serialized fashion, waiting for each one to
 * complete before subscribing to the next.
 *
 * Note: If the source observable emits observables quickly and endlessly, and the inner observables
 * it emits generally complete slower than the source emits, you can run into memory issues as
 * the incoming observables collect in an unbounded buffer.
 *
 * Note: `concatMap` is equivalent to `mergeMap` with the concurrency parameter set to `1`.
 */
export function concatMap<T, O extends AsyncObservableInput<any>>(
  predicate: (value: T, index: number) => O
): OperatorFunction<T, ObservedValueOf<O>> {
  return mergeMap(predicate, 1);
}
