import {
  CleanupAction,
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
    if (promise instanceof SubscriberReturnSignal) {
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
    // FIXME: this is a hack that has the same effect as a kids spiderman bandaid on a bullet wound
    // to the chest. The endemic problem with the stream/scheduler pattern is that we intentionally
    // dont track the status of the consumer of the generator, so if we call `drain` immediately
    // after we `push` a value, the work of "yielding" the value through an observable chain (that
    // will subsequently schedule more work, which normally is handled since we're awaiting the
    // ending generator to finish) gets added to the microtask queue **after** we await the work in
    // `drain`. This means that when we init the drain promise in the call stack, the scheduler
    // doesn't have any work, so it resolves as normal!
    // This is a hack that places a "resolve microtask" at the end of the queue, which hopefully
    // means that all the immediate values will be yielded through the chain before continuing this
    // function. My faith in this fix is not high, so if there's any trouble with draining stream
    // subjects this might be a good place to start looking.
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
