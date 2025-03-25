import {
  type ScheduledAction,
  type SchedulerSubject,
  type SchedulerLike,
  Scheduler,
  CleanupAction,
} from "@eventkit/async-observable";

/**
 * Configuration options for initializing queue schedulers.
 */
export interface QueueSchedulerInit {
  /**
   * The maximum number of actions that can be executing at the same time.
   * Defaults to 1, which means actions will be executed sequentially.
   */
  concurrency?: number;
}

/**
 * A scheduler that limits the number of actions that can execute concurrently.
 *
 * The `QueueScheduler` maintains a global queue of actions waiting to be executed and
 * ensures that no more than a specified number of actions are executing at any
 * given time. When an action completes, the next action in the queue is executed
 * if there's room under the concurrency limit.
 *
 * This scheduler is useful when you want to control the processing order of side
 * effects, especially when they involve asynchronous operations that might otherwise
 * complete out of order.
 *
 * @extends Scheduler
 * @implements SchedulerLike
 */
export class QueueScheduler extends Scheduler implements SchedulerLike {
  /** @internal */
  private _queue: Array<[SchedulerSubject, ScheduledAction<any>]> = [];
  /** @internal */
  private _running = 0;
  /** @internal */
  private readonly concurrency: number;

  /**
   * Creates a new QueueScheduler.
   *
   * @param init - Configuration options for the scheduler.
   */
  constructor(init: QueueSchedulerInit = {}) {
    super();

    this.concurrency = init.concurrency ?? 1;
    if (this.concurrency < 1) {
      throw new Error("Concurrency must be at least 1");
    }
  }

  /**
   * Schedules an action for execution. The action will be queued and executed when there's room
   * under the concurrency limit.
   *
   * @param subject - The subject that "owns" the action.
   * @param action - The action to be scheduled.
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    // Add the action to the subject's work set
    this.add(subject, action);
    // CleanupAction's are handled separately by the base class
    if (action instanceof CleanupAction) return;

    // Add to global queue
    this._queue.push([subject, action]);
    this._processQueue();
  }

  /** @internal */
  private async _processQueue() {
    // If we've reached the concurrency limit, we'll wait for an action to complete
    if (this._running >= this.concurrency) return;

    // Take the next action from the queue
    const next = this._queue.shift();
    if (!next) return; // No more actions to process

    // Mark that we're executing an action
    this._running++;

    try {
      const [, action] = next;
      // Execute the action
      await action.execute();
    } finally {
      // Mark that we're done executing this action
      this._running--;
      // Process the next action in the queue if there is one
      this._processQueue();
    }
  }
}
