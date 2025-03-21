import { type SchedulerLike, type OperatorFunction } from "@eventkit/async-observable";

import { DeferredPassthroughScheduler } from "../schedulers";

/**
 * Applies a scheduler to an observable that passes side effects to the source observable, but
 * defers the execution to the scheduler provided in the parameters. Use this when you want to
 * control the execution of side effects independently of the source observable.
 *
 * @param scheduler - The scheduler to defer execution to.
 */
export function withScheduler<T>(scheduler: SchedulerLike): OperatorFunction<T, T> {
  return (source) => {
    const obs = new source.AsyncObservable<T>(async function* () {
      yield* source;
    });
    obs._scheduler = new DeferredPassthroughScheduler(source._scheduler, scheduler);
    return obs;
  };
}

/**
 * Applies this to an independent Scheduler to an observable. Use this when you want to separate
 * side effects from the source observable entirely.
 *
 * @param scheduler - The scheduler to apply to the observable.
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
