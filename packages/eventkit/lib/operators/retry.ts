import {
  type SchedulerSubject,
  type SchedulerLike,
  PassthroughScheduler,
  type OperatorFunction,
  type ScheduledAction,
  CallbackAction,
} from "@eventkit/async-observable";

import { withOwnScheduler } from "./withScheduler";

/**
 * Configuration options for the retry operator.
 *
 * This type defines the parameters that control retry behavior when an error occurs
 * in an observable chain. It allows configuring the number of retry attempts,
 * delay between retries, and the backoff strategy for increasing delays.
 */
export type RetryStrategy = {
  /**
   * Maximum number of retry attempts before giving up.
   * If not specified, defaults to 1.
   */
  limit?: number;
  /**
   * Time in milliseconds to wait before each retry attempt.
   * Required when using a backoff strategy.
   */
  delay?: number;
  /**
   * Strategy for increasing delay between retry attempts.
   */
  backoff?: RetryBackoff;
};

/**
 * Defines how the delay between retry attempts increases.
 *
 * - `constant`: The delay remains the same for all retry attempts
 * - `linear`: The delay increases linearly with each retry (delay * retryCount)
 * - `exponential`: The delay increases exponentially with each retry (delay * (2^retryCount))
 */
export type RetryBackoff = "constant" | "linear" | "exponential";

/**
 * A scheduler that implements retry logic for callback actions.
 *
 * This scheduler wraps callback actions with retry logic that will catch errors
 * and retry the callback according to the specified retry strategy. The retry
 * strategy can include a limit on the number of retries, a delay between retries,
 * and a backoff strategy for increasing the delay between retries.
 *
 * When an error occurs in a callback action, the scheduler will:
 * 1. Catch the error
 * 2. If retries are not exhausted, wait for the specified delay
 * 3. Retry the callback
 * 4. If all retries are exhausted, reject the action's signal with the error
 *
 * Note that this only affects callback actions (subscriber callbacks). Other types
 * of actions like generator execution or cleanup work are passed through to the
 * parent scheduler without retry logic.
 *
 * @see {@link retry} for usage with observables
 * @internal
 */
export class RetryScheduler extends PassthroughScheduler implements SchedulerLike {
  private readonly limit: number;
  private readonly delay: number;
  private readonly backoff: RetryBackoff;

  constructor(
    protected readonly strategy: RetryStrategy,
    protected readonly parent: SchedulerLike,
    protected readonly pinningSubject?: SchedulerSubject
  ) {
    super(parent, pinningSubject);
    this.limit = strategy.limit ?? 1;
    this.delay = strategy.delay ?? 0;
    this.backoff = strategy.backoff ?? "constant";
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    if (action instanceof CallbackAction) {
      // Retry works by hijacking any callback action and wrapping it in a new one that catches
      // any errors and retries the callback according to the retry strategy. Because of the way
      // that scheduled actions work (an action's callback is guaranteed to only be called
      // once), the status of the provided action will be reflectively updated based on the status
      // of the retry instead of in its own execution.
      super.schedule(
        subject,
        new CallbackAction(async () => {
          let retryCount = 0;
          let currentDelay = this.delay;
          action._hasExecuted = true;

          while (retryCount <= this.limit) {
            try {
              const result = await action.callback();
              action.signal.resolve(result);
              break;
            } catch (err) {
              // All retries exhausted, let the error propagate
              if (retryCount === this.limit) {
                // Avoids unhandled promise rejection for the signal, since the error is re-thrown
                // here it shouldn't be an issue
                action.signal.then(null, () => {});
                action.signal.reject(err);
                throw err;
              }
              retryCount++;
              if (this.delay > 0) {
                await new Promise((resolve) => setTimeout(resolve, currentDelay));
                // Calculate the next delay based on the backoff strategy
                if (this.backoff === "linear") currentDelay += this.delay;
                else if (this.backoff === "exponential") currentDelay *= 2;
                else if (this.backoff === "constant") currentDelay = this.delay;
              }
            }
          }
        })
      );
    } else {
      super.schedule(subject, action);
    }
  }
}

/**
 * Returns an observable that will retry a callback action according to the provided retry strategy
 * if an error occurs.
 *
 * Note: this will only retry errors that happen in subscriber callbacks. If an error occurs
 * elsewhere (like in cleanup or in the observable's generator), that implies a cancellation and
 * the error will be raised as normal.
 *
 * @param strategy - The strategy for the retry scheduler.
 * @group Operators
 * @category Error Handling
 */
export function retry<T>(strategy?: RetryStrategy): OperatorFunction<T, T> {
  return (source) => {
    const scheduler = new RetryScheduler(strategy ?? {}, source._scheduler, source);
    return source.pipe(withOwnScheduler(scheduler));
  };
}
