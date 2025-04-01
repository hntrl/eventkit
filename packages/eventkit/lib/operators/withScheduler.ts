import {
  type SchedulerLike,
  type OperatorFunction,
  type SchedulerSubject,
  type ScheduledAction,
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
 * @group Scheduling
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
   * @group Operators
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    // we defer to the deferred scheduler to create the execution.
    this.deferred.schedule(subject, action);
    super.add(subject, action);
  }
}

/**
 * Applies a scheduler to an observable that passes side effects to the source observable, but
 * defers the execution to the scheduler provided in the parameters. Use this when you want to
 * control the execution of side effects independently of the source observable.
 *
 * @param scheduler - The scheduler to defer execution to.
 * @group Operators
 */
export function withScheduler<T>(scheduler: SchedulerLike): OperatorFunction<T, T> {
  return (source) => {
    const obs = new source.AsyncObservable<T>(async function* () {
      yield* source;
    });
    obs._scheduler = new DeferredPassthroughScheduler(source._scheduler, scheduler, source);
    return obs;
  };
}

/**
 * Applies this to an independent Scheduler to an observable. Use this when you want to separate
 * side effects from the source observable entirely.
 *
 * @param scheduler - The scheduler to apply to the observable.
 * @group Operators
 */
export function withOwnScheduler<T>(scheduler: SchedulerLike): OperatorFunction<T, T> {
  return (source) => {
    const obs = new source.AsyncObservable<T>(async function* () {
      yield* source;
    });
    obs._scheduler = scheduler;
    return obs;
  };
}
