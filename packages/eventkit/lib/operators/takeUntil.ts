import { type OperatorFunction, type AsyncObservable } from "@eventkit/async-observable";

import { map } from "./map";
import { merge } from "./merge";

const kStopNotification = Symbol("stopNotification");
type StopNotification = typeof kStopNotification;

/**
 * Emits values from the source observable until the `stopNotifier` observable emits a value.
 * Once the `stopNotifier` emits, the resulting observable completes and no more values will be
 * emitted.
 *
 * @param stopNotifier An observable that signals when to stop taking values from the source.
 * @group Operators
 * @category Filtering
 */
export function takeUntil<T>(stopNotifier: AsyncObservable<any>): OperatorFunction<T, T> {
  return (source) =>
    new source.AsyncObservable<T>(async function* () {
      const notifier$ = stopNotifier.pipe(map<any, StopNotification>(() => kStopNotification));
      const merged$ = source.pipe(merge(notifier$));
      for await (const value of merged$) {
        if (value === kStopNotification) break;
        yield value;
      }
    });
}
