import {
  type ScheduledAction,
  type SchedulerSubject,
  type SchedulerLike,
  PassthroughScheduler,
} from "@eventkit/async-observable";

/**
 * A scheduler that defers the execution of scheduled actions to a specified deferred scheduler,
 * while still passing through work to a parent scheduler for tracking purposes.
 *
 * The `DeferredPassthroughScheduler` is useful in scenarios where you want to control the
 * execution timing of actions separately from the parent scheduler, but still want to track
 * the work within the parent scheduler's context. This is the direct scheduler that's imposed
 * when using the {@link #withScheduler} operator.
 *
 * This scheduler extends the `PassthroughScheduler`, inheriting its ability to pass work
 * through to a parent scheduler, but overrides the scheduling behavior to use a different
 * scheduler for execution.
 *
 * @extends PassthroughScheduler
 * @implements SchedulerLike
 */
export class DeferredPassthroughScheduler extends PassthroughScheduler implements SchedulerLike {
  constructor(
    protected readonly parent: SchedulerLike,
    protected readonly deferred: SchedulerLike,
    protected readonly pinningSubject?: SchedulerSubject
  ) {
    super(parent, pinningSubject);
  }

  /**
   * Schedules an action that is "owned" by the subject that will be executed by the deferred
   * scheduler instead of the parent scheduler.
   *
   * @param subject - The subject that "owns" the action.
   * @param action - The action to be scheduled.
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    if (this.pinningSubject) {
      this.parent.add(this.pinningSubject, action);
    }
    // we defer to the deferred scheduler to create the execution.
    this.deferred.schedule(subject, action);
    super.add(subject, action);
  }
}
