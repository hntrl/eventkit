import {
  from,
  type AsyncObservableInput,
  type ObservedValueOf,
  type OperatorFunction,
  type Subscriber,
} from "@eventkit/async-observable";

import { type AsyncObservableInputTuple } from "../utils/types";
import { map } from "./map";

/**
 * Merges the values from all provided observables into a single observable. When subscribed to, it
 * will subscribe to all provided observables and yield all values yielded by all of the provided
 * observables. The output observable will complete when all provided observables have completed,
 * and error when any provided observable errors.
 *
 * @group Operators
 */
export function merge<T, A extends readonly unknown[]>(
  ...otherSources: [...AsyncObservableInputTuple<A>]
): OperatorFunction<T, T | A[number]> {
  return (source) => from([source, ...otherSources]).pipe(mergeAll());
}

/**
 * Applies a predicate function to each value yielded by the source observable, which returns a
 * different observable that will be merged into the output observable using {@link mergeAll}.
 *
 * @group Operators
 */
export function mergeMap<T, O extends AsyncObservableInput<any>>(
  predicate: (value: T, index: number) => O,
  concurrency: number = Infinity
): OperatorFunction<T, ObservedValueOf<O>> {
  return (source) => source.pipe(map(predicate), mergeAll(concurrency));
}

/**
 * Converts an observable that yields observables (called a higher-order observable) into a
 * first-order observable which concurrently delivers all values that are yielded on the inner
 * observables. Each time an inner observable gets yielded, it subscribes to it and yields all the
 * values from the inner observable. The output observable only completes when all inner observables
 * have completed. Any error delivered by a inner observable will be immediately thrown on the
 * output observable.
 *
 * A concurrency limit can be provided to limit the number of inner observables that are subscribed
 * to at any given time. If an inner observable gets yielded when the concurrency limit is reached,
 * it will be added to a queue and subscribed to when a previous inner observable has completed.
 *
 * @group Operators
 */
export function mergeAll<O extends AsyncObservableInput<any>>(
  concurrency: number = Infinity
): OperatorFunction<O, ObservedValueOf<O>> {
  return (source) =>
    new source.AsyncObservable(async function* () {
      // Buffer for inner observables when we reach concurrency limit
      const observableBuffer: O[] = [];
      // Set to keep track of inner subscribers
      const innerSubscribers = new Set<Subscriber<any>>();
      // Buffer for values from inner observables
      let valueBuffer: ObservedValueOf<O>[] = [];
      // Track if the outer observable has completed
      let outerCompleted = false;
      // Track any errors
      let error: unknown = null;

      // Subscribe to the source (outer) observable
      const sourceSub = source.subscribe((inner) => {
        if (innerSubscribers.size < concurrency) {
          subscribeToInner(inner);
        } else {
          observableBuffer.push(inner);
        }
      });

      sourceSub.catch((err) => (error = err));
      sourceSub.finally(() => (outerCompleted = true));

      function subscribeToInner(innerSource: O) {
        // Convert the inner source to an AsyncObservable if it's not already
        const inner = from(innerSource);
        // Subscribe to the inner observable
        const innerSub = inner.subscribe((innerValue) => {
          valueBuffer.push(innerValue as ObservedValueOf<O>);
        });
        // Add the inner subscriber to the set
        innerSubscribers.add(innerSub);
        // If the inner subscriber completes, remove it from the set
        innerSub
          .then(() => {
            innerSubscribers.delete(innerSub);
            // If there are buffered inner observables, subscribe to the next one
            if (observableBuffer.length > 0 && !error) {
              subscribeToInner(observableBuffer.shift()!);
            }
          })
          .catch((err) => {
            // If the inner subscriber errors, set the error
            error = err;
          });
      }

      // Function to check if we should complete
      function checkComplete() {
        return (
          outerCompleted &&
          innerSubscribers.size === 0 &&
          observableBuffer.length === 0 &&
          valueBuffer.length === 0
        );
      }

      try {
        while (true) {
          if (error) throw error;
          if (checkComplete()) return;
          if (valueBuffer.length > 0) {
            const values = [...valueBuffer];
            valueBuffer = [];
            yield* values;
          } else {
            // Neat little trick to schedule the next iteration of the loop
            // at the end of the call stack, which gives a chance for the inner
            // observables to emit more values.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } finally {
        for (const sub of innerSubscribers.values()) {
          await sub.cancel();
        }
        await sourceSub.cancel();
      }
    });
}
