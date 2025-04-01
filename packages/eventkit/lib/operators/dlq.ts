import {
  PassthroughScheduler,
  type SchedulerLike,
  type AsyncObservable,
  type UnaryFunction,
  type SchedulerSubject,
  type ScheduledAction,
  CallbackAction,
} from "@eventkit/async-observable";

import { Stream } from "../stream";
import { withOwnScheduler } from "./withScheduler";

/**
 * A scheduler that catches errors from callback actions and redirects them to a handler function.
 *
 * This scheduler is used by the `dlq()` operator to implement a dead letter queue pattern for
 * handling errors in subscriber callbacks without interrupting the observable chain.
 *
 * When a callback action is scheduled, it wraps the action in a new one that catches any errors
 * and passes them to the `onError` handler while resolving the original action successfully.
 * This allows the observable chain to continue processing values even when errors occur in
 * subscriber callbacks.
 *
 * @see {@link dlq} for usage with observables
 * @internal
 */
export class DLQScheduler extends PassthroughScheduler implements SchedulerLike {
  constructor(
    protected readonly onError: (err: any) => void,
    protected readonly parent: SchedulerLike,
    protected readonly pinningSubject?: SchedulerSubject
  ) {
    super(parent, pinningSubject);
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    if (action instanceof CallbackAction) {
      // DLQ works by hijacking any callback action and wrapping it in a new one that catches
      // any errors and passes them to the onError handler. That way the status of the action is
      // still consistent with the rest of the observable chain, but errors are caught before the
      // action gets executed by the parent.
      super.schedule(
        subject,
        new CallbackAction(async () => {
          action._hasExecuted = true;
          try {
            const result = await action.callback();
            action.signal.resolve(result);
          } catch (err) {
            this.onError(err);
            action.signal.resolve(undefined);
          }
        })
      );
    } else {
      super.schedule(subject, action);
    }
  }
}

/**
 * Returns an array with two observables with the purpose of imposing a dead letter queue on the
 * source observable; the first observable being the values that are emitted on the source, and the
 * second one representing errors that were thrown when executing callback actions.
 *
 * Since the execution of an observable is arbitrary (subscribers will start/stop at any time), a
 * subscription to the errors observable is indefinitely active, but will only yield errors that
 * come from active subscribers. This also means that any active subscriptions against the errors
 * observable won't schedule blocking work against the parent scheduler (i.e. awaiting the source
 * observable won't wait for the errors observable to complete).
 *
 * Note: this will only yield errors that happen in subscriber callbacks. If an error occurs
 * elsewhere (like in cleanup or in the observable's generator), that implies a cancellation
 * and the error will be raised as normal.
 *
 * @group Operators
 */
export function dlq<T>(): UnaryFunction<
  AsyncObservable<T>,
  [AsyncObservable<T>, AsyncObservable<any>]
> {
  return (source) => {
    const errors$ = new Stream<any>({ scheduler: source._scheduler });
    // Scheduler that catches errors and buffers them
    const scheduler = new DLQScheduler((err) => errors$.push(err), source._scheduler, source);
    // Observable that uses the scheduler
    const handled$ = source.pipe(withOwnScheduler(scheduler));
    // Return the original observable and the errors observable
    return [handled$, errors$.asObservable()];
  };
}
