import {
  type ScheduledAction,
  type SchedulerSubject,
  type SchedulerLike,
  Scheduler,
  CleanupAction,
} from "@eventkit/async-observable";

import { type QueueSchedulerInit } from "../schedulers";
import { InvalidConcurrencyLimitError } from "../utils/errors";

/**
 * A scheduler that maintains separate queues for each subject with a concurrency limit applied
 * independently to each queue.
 *
 * The `SubjectQueueScheduler` ensures that actions from the same subject are processed in order,
 * with a maximum number of concurrent actions per subject. This allows multiple subjects to have
 * their actions processed in parallel, while maintaining order within each subject's actions.
 *
 * This is useful when you want to process actions from different subjects concurrently,
 * but need to ensure that actions belonging to the same subject are processed in sequence
 * or with limited concurrency.
 *
 * @extends Scheduler
 * @implements SchedulerLike
 */
export class SubjectQueueScheduler extends Scheduler implements SchedulerLike {
  /** @internal */
  private _subjectQueues = new Map<SchedulerSubject, Array<ScheduledAction<any>>>();
  /** @internal */
  private _runningBySubject = new Map<SchedulerSubject, number>();
  /** @internal */
  private readonly concurrency: number;

  /**
   * Creates a new SubjectQueueScheduler.
   *
   * @param init - Configuration options for the scheduler.
   */
  constructor(init: QueueSchedulerInit = {}) {
    super();

    this.concurrency = init.concurrency ?? 1;
    if (this.concurrency < 1) {
      throw new InvalidConcurrencyLimitError();
    }
  }

  /**
   * Schedules an action for execution. The action will be queued in its subject's queue
   * and executed when there's room under that subject's concurrency limit.
   *
   * @param subject - The subject that "owns" the action.
   * @param action - The action to be scheduled.
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    // Add the action to the subject's work set
    this.add(subject, action);
    // CleanupAction's are handled separately by the base class
    if (action instanceof CleanupAction) return;

    // Add to subject-specific queue
    const queue = this._subjectQueues.get(subject) || [];
    if (!this._subjectQueues.has(subject)) {
      this._subjectQueues.set(subject, queue);
    }
    queue.push(action);
    this._processSubjectQueue(subject);
  }

  /** @internal */
  private async _processSubjectQueue(subject: SchedulerSubject) {
    // Get or initialize the running count for this subject
    const runningCount = this._runningBySubject.get(subject) || 0;

    // If we've reached the concurrency limit for this subject, we'll wait
    if (runningCount >= this.concurrency) return;

    // Get the queue for this subject
    const queue = this._subjectQueues.get(subject);
    if (!queue || queue.length === 0) return; // No actions to process

    // Take the next action from the queue
    const action = queue.shift();
    if (!action) return;

    // Mark that we're executing an action for this subject
    this._runningBySubject.set(subject, runningCount + 1);

    try {
      // Execute the action
      await action.execute();
    } finally {
      // Mark that we're done executing this action
      const newRunningCount = (this._runningBySubject.get(subject) || 0) - 1;
      if (newRunningCount <= 0) {
        this._runningBySubject.delete(subject);
      } else {
        this._runningBySubject.set(subject, newRunningCount);
      }

      // Process the next action in this subject's queue if there is one
      this._processSubjectQueue(subject);
    }
  }
}
