import { ConsumerPromise, Subscriber } from "./subscriber";
import { type SchedulerSubject, type SchedulerLike, type PromiseOrValue } from "./types";
import { PromiseSet } from "./utils/promise";
import { Signal } from "./utils/signal";

/**
 * Represents an action that will be executed later. The callback that's passed in will be called
 * at most once whenever `execute()` is called.
 *
 * ScheduledAction implements PromiseLike, which means that when the action is used as a promise
 * (i.e. when calling `then()` or being the subject of an await statement), the action will wait
 * until `execute()` is called and then resolve or reject based on the callback's return value.
 * Multiple accesses of the action's promise will return the same promise, but the action will only
 * execute whenever `execute()` is called and the callback is resolved.
 */
export class ScheduledAction<T> implements PromiseLike<T> {
  /** @internal */
  _hasExecuted = false;
  /** @internal */
  _signal: Signal<T> | null = null;
  /** @internal */
  get signal() {
    if (!this._signal) {
      this._signal = new Signal<T>();
    }
    return this._signal;
  }

  /**
   * @template T The type of the value that will be returned by the callback.
   * @param callback The function that will be called when the action is executed.
   */
  constructor(private readonly callback: () => PromiseOrValue<T>) {}

  /**
   * Executes the action. This will call the callback and resolve or reject the action's promise
   * based on the callback's return value.
   */
  async execute() {
    if (this._hasExecuted) return;
    try {
      this._hasExecuted = true;
      const result = await this.callback();
      this.signal.resolve(result);
    } catch (err) {
      this.signal.reject(err);
    }
  }

  /**
   * Returns a promise that will resolve or reject based on the callback's return value.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.signal.then(onfulfilled, onrejected);
  }
}

/**
 * Represents an action that will be executed as a result of an observable yielding a value.
 */
export class CallbackAction<T> extends ScheduledAction<T> {}

/**
 * Represents an action that will be executed after some other work has been done.
 *
 * Internally, CleanupAction is no different than ScheduledAction, but it's a separate class
 * that can be identified by the scheduler to control when the action is executed. Classes that
 * utilize a scheduler will add CleanupAction's, and the scheduler is expected to execute them
 * when the subject's work has completed.
 */
export class CleanupAction extends ScheduledAction<any> {}

/**
 * Responsible for managing and observing any execution associated with a set of subjects
 * (like an AsyncObservable or Subscriber). This is largely what enables eventkit objects
 * to observe the asynchronous work that's performed as a result of creating a subscription.
 *
 * Dependents on this class are typed to accept `SchedulerLike` in it's prototype, which means
 * that any class that implements `SchedulerLike` can be used as a drop in replacement for
 * this class to alter the asynchronous behavior of eventkit objects. This implementation can be
 * considered what orchestrates the default behavior of eventkit's asynchronous operations.
 *
 * The default behavior of this class is to instantly execute the action passed to `schedule`, but
 * this method can be overridden in an extension of this class to provide a different behavior
 * (i.e. a callback queue or deferring execution).
 */
export class Scheduler implements SchedulerLike {
  /** @internal */
  _subjectPromises: Map<SchedulerSubject, PromiseSet> = new Map();
  /** @internal */
  _subjectCleanup: Map<SchedulerSubject, Set<CleanupAction>> = new Map();

  /**
   * Adds a promise that is "owned" by a subject. This means that the promise will be observed
   * by the scheduler and will be used to determine when the subject's work has completed.
   *
   * This method also handles the special case of a subscriber, since subscribers are
   * expected to be owned by an observable. If the subject is a subscriber, we also add
   * the promise to it's observable.
   *
   * @param subject - The subject that "owns" the promise.
   * @param promise - The promise to be added to the subject.
   */
  add(subject: SchedulerSubject, promise: PromiseLike<void>) {
    // If the subject is a subscriber, we also add the promise to it's observable
    if (subject instanceof Subscriber) {
      this.add(subject._observable, promise);
    }
    if (promise instanceof CleanupAction) {
      // we treat cleanup actions differently since they don't represent current
      // work, but instead work that should be executed after all remaining subject
      // work has completed
      this._addCleanup(subject, promise);
    } else {
      this._add(subject, promise);
    }
  }

  /**
   * Schedules an action that is "owned" by the subject that will be executed later.
   *
   * @param subject - The subject that "owns" the action.
   * @param action - The action to be scheduled.
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    this.add(subject, action);
    if (action instanceof CleanupAction) return;
    action.execute();
  }

  /**
   * Returns a promise that will resolve when the subject's work has completed and all
   * scheduled work has been executed (including cleanup work).
   *
   * @param subject - The subject whose work is being awaited.
   */
  async promise(subject: SchedulerSubject): Promise<void> {
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    try {
      await promises;
    } finally {
      await this.dispose(subject);
    }
  }

  /**
   * Disposes of a subject by executing all cleanup actions and waiting for all promises to resolve.
   *
   * This method executes all cleanup actions associated with the subject and waits for both
   * regular promises and cleanup actions to complete before removing the subject from the
   * scheduler. Unlike the `promise()` method which waits for work to complete before disposing,
   * this method immediately executes cleanup work and can be called independently.
   *
   * When a subject is disposed:
   * 1. All cleanup actions are executed immediately
   * 2. The method waits for all promises and cleanup actions to resolve
   * 3. The subject is removed from the scheduler's tracking collections
   *
   * @param subject - The subject to dispose of and remove from the scheduler
   * @returns A promise that resolves when the subject has been fully disposed
   */
  async dispose(subject: SchedulerSubject): Promise<void> {
    let promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    // We want to intentionally ignore consumer promises here since `dispose` gets awaited in the
    // generator methods. The consumer promise is often times the reader of the generator itself, so
    // if we're waiting for dispose we'll be waiting for the last value to be yielded which in turn
    // is waiting for dispose to finish, which causes a circular promise.
    promises = promises.filter((promise) => !(promise instanceof ConsumerPromise));
    const cleanup = this._subjectCleanup.get(subject) ?? new Set();
    for (const action of cleanup) {
      action.execute();
    }
    await Promise.all([...cleanup, promises]);
    // Once all promises have settled, we can remove the subject from the scheduler.
    this._subjectCleanup.delete(subject);
    this._subjectPromises.delete(subject);
  }

  /** @internal */
  private _add(subject: SchedulerSubject, promise: PromiseLike<void>) {
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    promises.add(promise);
    this._subjectPromises.set(subject, promises);
  }

  /** @internal */
  private _addCleanup(subject: SchedulerSubject, cleanup: CleanupAction) {
    const existing = this._subjectCleanup.get(subject) ?? new Set();
    existing.add(cleanup);
    this._subjectCleanup.set(subject, existing);
  }
}

/**
 * A scheduler that passes through all of it's work to a parent scheduler, and also defers the
 * execution of scheduled actions to the parent scheduler. Optionally, a subject can be passed in
 * the constructor to attach any work given to this scheduler to the subject in the parent
 * scheduler.
 *
 * This is helpful to isolate and independently observe subsets of the work of a parent scheduler.
 * Work that is pinned to a subject here will also be observed by the parent scheduler, but this
 * scheduler won't have any visibility into any other work that's being done by the parent
 * scheduler. (i.e. we can independently await three distinct observable's that are observing a
 * parent observable, or we can await the parent observable directly)
 */
export class PassthroughScheduler implements SchedulerLike {
  constructor(
    protected readonly parent: SchedulerLike,
    protected readonly pinningSubject?: SchedulerSubject
  ) {}

  /**
   * Adds a promise that is "owned" by a subject. This means that the promise will be observed
   * by the scheduler and will be used to determine when the subject's work has completed. If a
   * pinning subject is provided in the constructor, the promise will also be added to that subject
   * in the parent scheduler
   *
   * @param subject - The subject that "owns" the promise.
   * @param promise - The promise to be added to the subject.
   */
  add(subject: SchedulerSubject, promise: PromiseLike<void>) {
    if (this.pinningSubject) {
      this.parent.add(this.pinningSubject, promise);
    }
    // Track the promise in both the parent and the child scheduler
    this.parent.add(subject, promise);
  }

  /**
   * Schedules an action that is "owned" by the subject that will be executed by the parent
   * scheduler.
   *
   * @param subject - The subject that "owns" the action.
   * @param action - The action to be scheduled.
   */
  schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
    if (this.pinningSubject) {
      this.parent.add(this.pinningSubject, action);
    }
    // Instead of immediately executing the action, we defer to the parent
    // scheduler to create the execution (hence a pass through scheduler).
    this.parent.schedule(subject, action);
  }

  promise(subject: SchedulerSubject): Promise<void> {
    return this.parent.promise(subject);
  }

  dispose(subject: SchedulerSubject): Promise<void> {
    return this.parent.dispose(subject);
  }
}
