import {
  ConsumerPromise,
  type ScheduledAction,
  type SchedulerLike,
  type SchedulerSubject,
  Signal,
  type Subscriber,
} from "@eventkit/async-observable";

export class StreamScheduler implements SchedulerLike {
  private _callbackScheduler: SchedulerLike;
  private _subscriberTicks = new Map<Subscriber<any>, Set<Signal>>();

  constructor(callbackScheduler: SchedulerLike | (new () => SchedulerLike)) {
    if (typeof callbackScheduler === "function") {
      this._callbackScheduler = new callbackScheduler();
    } else {
      this._callbackScheduler = callbackScheduler;
    }
  }

  /** SchedulerLike */

  add(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    // If the action is a ConsumerPromise, we don't need to add it to the scheduler.
    // Since we know that the lifecycle of a stream subject is infinite until `cancel`
    // is called, and since we're only interested in observing the side effects of
    // pushing values (i.e. propagating values to observers and callback executions),
    // we can ignore the execution promise here.
    if (action instanceof ConsumerPromise) return;
    this._callbackScheduler.add(subject, action);
  }

  schedule(subject: SchedulerSubject, action: ScheduledAction<any>): void {
    this._callbackScheduler.schedule(subject, action);
  }

  promise(subject: SchedulerSubject): Promise<void> {
    return this._callbackScheduler.promise(subject);
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
    this._callbackScheduler.add(subscriber, signal.asPromise());
  }

  resolveSubscriberTick(subscriber: Subscriber<any>) {
    const ticks = this._subscriberTicks.get(subscriber) ?? new Set();
    const [tick, ...rest] = ticks;
    this._subscriberTicks.set(subscriber, new Set(rest));
    if (!tick) return;
    tick.resolve();
  }
}
