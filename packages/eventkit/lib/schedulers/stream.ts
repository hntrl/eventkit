import {
  CleanupAction,
  ConsumerPromise,
  PromiseSet,
  type ScheduledAction,
  Scheduler,
  type SchedulerLike,
  type SchedulerSubject,
  Signal,
  type Subscriber,
  SubscriberReturnSignal,
} from "@eventkit/async-observable";

export class StreamScheduler extends Scheduler implements SchedulerLike {
  private deferred: SchedulerLike;
  private _subscriberTicks = new Map<Subscriber<any>, Set<Signal>>();

  constructor(schedulerCtor: SchedulerLike | (new () => SchedulerLike)) {
    super();
    if (typeof schedulerCtor === "function") {
      this.deferred = new schedulerCtor();
    } else {
      this.deferred = schedulerCtor;
    }
  }

  add(subject: SchedulerSubject, promise: PromiseLike<void>): void {
    if (promise instanceof ConsumerPromise) {
      // tracking the consumer promise will cause an infinite block
      // since as apart of disposing it, we're waiting for it to resolve
    } else if (promise instanceof SubscriberReturnSignal) {
      return super.add(subject, new CleanupAction(() => promise));
    } else {
      return super.add(subject, promise);
    }
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    super.add(subject, action);
    if (action instanceof CleanupAction) return;
    this.deferred.schedule(subject, action);
  }

  async promise(subject: SchedulerSubject): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    await promises;
  }

  // Subscriber ticks are a little bit of a hack way to inform the scheduler that
  // there is work to be done by the subject before the subscriber adds the action
  // to the scheduler. Since the values emitted by the internal generator come from
  // an internal "buffer" promise which won't do the work of yielding the buffer (and
  // subsequently schedule any work) until later in the call stack, we need to synchronously
  // inform the scheduler that the work of scheduling a different action still needs
  // to be done.
  //
  // Subscriber ticks are simply signals that get added synchronously for each subscriber
  // when push is called, and when the execution reaches the part where we know work
  // will be scheduled, we resolve the tick, effectively blocking the stream from
  // draining until we know all the values have been propagated to all subscribers.

  addSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const signal = new Signal();
    ticks.add(signal);
    this._subscriberTicks.set(subscriber, ticks);
    this.add(subscriber, signal);
  }

  resolveSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const [tick, ...rest] = ticks;
    this._subscriberTicks.set(subscriber, new Set(rest));
    if (!tick) return;
    tick.resolve();
  }
}
