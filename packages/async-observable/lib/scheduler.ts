import { Signal } from "./signal";
import { Subscriber } from "./subscriber";
import { type SchedulerSubject, type SchedulerLike, type PromiseOrValue } from "./types";

/**
 * Represents the resolution of a set of promises that are not immediately known when the
 * PromiseSet is created. Whereas `Promise.all` tracks the resolution of promises that are
 * passed in the constructor, PromiseSet tracks the resolution of promises that are added
 * using the `add` method.
 *
 * When a PromiseSet is awaited, the promise being observed won't resolve until all of the
 * promises added to the set have resolved, including any promises that are added after the
 * set was awaited.
 */
export class PromiseSet implements PromiseLike<void> {
  /** @internal */
  _promiseChain: Promise<void> | null = null;
  /** @internal */
  _signal: Signal | null = null;

  /**
   * Adds a promise that will be tracked by the PromiseSet.
   */
  add(promise: PromiseLike<any>) {
    const currentPromise = this._promiseChain ?? Promise.resolve();
    const newPromise = Promise.all([currentPromise, promise]).then(() => Promise.resolve());
    this._promiseChain = newPromise;
    newPromise.then(
      () => this._resolveSignal(newPromise),
      (error) => this._rejectSignal(error)
    );
  }

  /** @internal */
  private _resolveSignal(current: Promise<void>) {
    // If the current promise is not the latest one, we shouldn't resolve the signal This is what
    // makes promise sets work -- This function will get called every time the promise created in
    // `add` is resolved, but we don't resolve the signal unless the latest version of the chain is
    // passed in.
    if (this._promiseChain !== current) return;

    // The promise chain is resolved, so we can reset the promise chain.
    this._promiseChain = null;

    // If there isn't a current signal, there's nothing to resolve
    if (!this._signal) return;

    // Resolve the signal
    this._signal.resolve();
    this._signal = null;
  }

  /** @internal */
  private _rejectSignal(error: any) {
    // Throw out the promise chain since it's been rejected
    this._promiseChain = null;

    // If there isn't a current signal, there's nothing to reject
    if (!this._signal) return;

    // Otherwise, reject the signal
    this._signal.reject(error);
    this._signal = null;
  }

  /**
   * Returns a promise that will resolve when all of the promises added to the set have resolved,
   * and reject if any of the promises added to the set have rejected. This method makes this object
   * a "custom thennable", which means that this is the logic that will be applied when the set is
   * used in an await statement.
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    // If there isn't any work being done, we can just resolve immediately
    if (!this._promiseChain) {
      return Promise.resolve().then(onfulfilled, onrejected);
    }
    // if there isn't an existing signal already, we need to create one
    if (!this._signal) {
      this._signal = new Signal();
    }
    return this._signal.then(onfulfilled, onrejected);
  }

  /**
   * Adds a catch handler that will get called if any of the promises added to the set have
   * rejected.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TResult> {
    return this.then(undefined, onrejected);
  }

  /**
   * Adds a handler that will get called when all of the promises added to the set have
   * resolved, or if any of the promises added to the set have rejected.
   */
  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.then().finally(onfinally);
  }
}

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
    if (promise instanceof CleanupAction) {
      // we treat cleanup actions differently since they don't represent current
      // work, but instead work that should be executed after all remaining subject
      // work has completed
      this._addCleanup(subject, promise);
    } else {
      this._add(subject, promise);
    }
  }

  /** @internal */
  private _add(subject: SchedulerSubject, promise: PromiseLike<void>) {
    // if the subject is a subscriber, we also add the promise to it's observable
    if (subject instanceof Subscriber) {
      this._add(subject._observable, promise);
    }
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    promises.add(promise);
    this._subjectPromises.set(subject, promises);
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

  /** @internal */
  private _addCleanup(subject: SchedulerSubject, cleanup: CleanupAction) {
    // if the subject is a subscriber, we also add the cleanup to it's observable
    if (subject instanceof Subscriber) {
      this._addCleanup(subject._observable, cleanup);
    }
    const existing = this._subjectCleanup.get(subject) ?? new Set();
    existing.add(cleanup);
    this._subjectCleanup.set(subject, existing);
  }

  /**
   * Returns a promise that will resolve when the subject's work has completed and all
   * scheduled work has been executed (including cleanup work).
   *
   * @param subject - The subject whose work is being awaited.
   */
  async promise(subject: SchedulerSubject): Promise<void> {
    const promises = this._subjectPromises.get(subject) ?? new PromiseSet();
    const cleanup = this._subjectCleanup.get(subject) ?? new Set();
    try {
      await promises;
    } finally {
      const cleanupPromises = Array.from(cleanup).map((action) => action.execute());
      await Promise.all(cleanupPromises);
      this._subjectPromises.delete(subject);
      this._subjectCleanup.delete(subject);
    }
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
export class PassthroughScheduler extends Scheduler implements SchedulerLike {
  constructor(
    protected readonly parent: SchedulerLike,
    protected readonly pinningSubject?: SchedulerSubject
  ) {
    super();
  }

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
    super.add(subject, promise);
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
    super.add(subject, action);
  }
}
