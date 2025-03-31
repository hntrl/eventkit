import {
  type SchedulerSubject,
  type SchedulerLike,
  PassthroughScheduler,
  type OperatorFunction,
  type ScheduledAction,
  CallbackAction,
} from "@eventkit/async-observable";

import { withOwnScheduler } from "./withScheduler";

export type RetryStrategy =
  | {
      limit?: number;
      // if a backoff is provided, delay must be provided
      delay: number;
      backoff: RetryBackoff;
    }
  | {
      limit?: number;
      delay?: number;
      backoff?: never;
    };

export type RetryBackoff = "constant" | "linear" | "exponential";

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

          while (retryCount < this.limit) {
            try {
              const result = await action.callback();
              action.signal.resolve(result);
            } catch (err) {
              retryCount++;
              if (retryCount >= this.limit) {
                // All retries exhausted, let the error propagate
                action.signal.reject(err);
                throw err;
              }
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
 */
export function retry<T>(strategy?: RetryStrategy): OperatorFunction<T, T> {
  return (source) => {
    const scheduler = new RetryScheduler(strategy ?? {}, source._scheduler, source);
    return source.pipe(withOwnScheduler(scheduler));
  };
}
