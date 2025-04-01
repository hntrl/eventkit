/**
 * ::: code-group
 * ```sh [npm]
 * npm install eventkit
 * ```
 * ```sh [yarn]
 * yarn add eventkit
 * ```
 * ```sh [pnpm]
 * pnpm add eventkit
 * ```
 * ```sh [bun]
 * bun add eventkit
 * ```
 * :::
 *
 * @packageDocumentation
 */

export * from "./operators";
export * from "./schedulers";
export * from "./stream";

export * from "./utils/errors";

export {
  // @eventkit/async-observable/from
  type AsyncObservableInputType,
  getAsyncObservableInputType,
  isAsyncObservable,
  from,

  // @eventkit/async-observable/observable
  AsyncObservable,

  // @eventkit/async-observable/subscriber
  Subscriber,
  CallbackSubscriber,
  kCancelSignal,
  ConsumerPromise,

  // @eventkit/async-observable/scheduler
  PromiseSet,
  ScheduledAction,
  CallbackAction,
  CleanupAction,
  Scheduler,
  PassthroughScheduler,

  // @eventkit/async-observable/types
  type UnaryFunction,
  type OperatorFunction,
  type MonoTypeOperatorFunction,
  type SubscriberCallback,
  type SubscriptionLike,
  type SchedulerSubject,
  type SchedulerLike,
  type AsyncObservableInput,
  type InteropAsyncObservable,
  type ObservedValueOf,
  type ReadableStreamLike,
} from "@eventkit/async-observable";
