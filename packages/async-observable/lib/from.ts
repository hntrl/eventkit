import { AsyncObservable } from "./observable";
import { kCancelSignal } from "./subscriber";
import {
  type InteropAsyncObservable,
  type AsyncObservableInput,
  type ObservedValueOf,
  type ReadableStreamLike,
} from "./types";

/** @internal */
export enum AsyncObservableInputType {
  Own,
  InteropAsyncObservable,
  ArrayLike,
  Promise,
  AsyncIterable,
  Iterable,
  ReadableStreamLike,
}

/** @internal */
export function getAsyncObservableInputType(input: unknown): AsyncObservableInputType {
  if (input instanceof AsyncObservable) {
    return AsyncObservableInputType.Own;
  }
  if (isInteropAsyncObservable(input)) {
    return AsyncObservableInputType.InteropAsyncObservable;
  }
  if (isArrayLike(input)) {
    return AsyncObservableInputType.ArrayLike;
  }
  if (isPromise(input)) {
    return AsyncObservableInputType.Promise;
  }
  if (isAsyncIterable(input)) {
    return AsyncObservableInputType.AsyncIterable;
  }
  if (isIterable(input)) {
    return AsyncObservableInputType.Iterable;
  }
  if (isReadableStreamLike(input)) {
    return AsyncObservableInputType.ReadableStreamLike;
  }
  throw new TypeError(
    `You provided ${
      input !== null && typeof input === "object" ? "an invalid object" : `'${input}'`
    } where an observable-like object was expected. You can provide an AsyncObservable, Promise, ReadableStream, Array, AsyncIterable, or Iterable.`
  );
}

/**
 * Returns true if the object is a function.
 * @param value The value to check
 */
export function isFunction(value: any): value is (...args: any[]) => any {
  return typeof value === "function";
}

function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
  return Symbol.asyncIterator && isFunction(obj?.[Symbol.asyncIterator]);
}

function isReadableStreamLike<T>(obj: any): obj is ReadableStreamLike<T> {
  // We don't want to use instanceof checks because they would return
  // false for instances from another Realm, like an <iframe>.
  return isFunction(obj?.getReader);
}

/**
 * Tests to see if the object is "thennable".
 * @param value the object to test
 */
export function isPromise(value: any): value is PromiseLike<any> {
  return isFunction(value?.then);
}

/** Identifies an input as being Observable (but not necessary an Observable) */
function isInteropAsyncObservable(input: any): input is InteropAsyncObservable<any> {
  input ??= {};
  return isFunction(input[Symbol.asyncObservable ?? "@@asyncObservable"]);
}

/** Identifies an input as being an Iterable */
function isIterable(input: any): input is Iterable<any> {
  return isFunction(input?.[Symbol.iterator]);
}

export function isArrayLike<T>(x: any): x is ArrayLike<T> {
  return x && typeof x.length === "number" && !isFunction(x);
}

/**
 * Tests to see if the object is an eventkit {@link Observable}
 * @param obj The object to test
 */
export function isAsyncObservable(obj: any): obj is AsyncObservable<unknown> {
  // The !! is to ensure that this publicly exposed function returns
  // `false` if something like `null` or `0` is passed.
  return !!obj && (obj instanceof AsyncObservable || isFunction(obj.subscribe));
}

/**
 * Creates an AsyncObservable from an Array, an array-like object, a Promise,
 * an iterable object, or an AsyncObservable-like object.
 *
 * @param input The source to create an AsyncObservable from
 * @returns An AsyncObservable that emits the values from the source
 */
export function from<O extends AsyncObservableInput<any>>(
  input: O
): AsyncObservable<ObservedValueOf<O>>;
export function from<T>(input: AsyncObservableInput<T>): AsyncObservable<T> {
  const type = getAsyncObservableInputType(input);
  switch (type) {
    case AsyncObservableInputType.Own:
      return input as AsyncObservable<T>;
    case AsyncObservableInputType.InteropAsyncObservable:
      return fromInteropAsyncObservable(input);
    case AsyncObservableInputType.ArrayLike:
      return fromArrayLike(input as ArrayLike<T>);
    case AsyncObservableInputType.Promise:
      return fromPromise(input as PromiseLike<T>);
    case AsyncObservableInputType.AsyncIterable:
      return fromAsyncIterable(input as AsyncIterable<T>);
    case AsyncObservableInputType.Iterable:
      return fromIterable(input as Iterable<T>);
    case AsyncObservableInputType.ReadableStreamLike:
      return fromReadableStreamLike(input as unknown as ReadableStreamLike<T>);
  }
}

/**
 * Creates an eventkit AsyncObservable from an object that implements `Symbol.asyncObservable`.
 * @param obj An object that properly implements `Symbol.asyncObservable`.
 */
function fromInteropAsyncObservable<T>(obj: any) {
  return new AsyncObservable<T>(async function* () {
    const obs = obj[Symbol.asyncObservable ?? "@@asyncObservable"]();
    if (isFunction(obs[Symbol.asyncIterator])) {
      for await (const value of obs) {
        yield value;
      }
      return;
    }
    // Should be caught by observable subscribe function error handling.
    throw new TypeError("Provided object does not correctly implement Symbol.asyncObservable");
  });
}

/**
 * Emits the values of an array like and completes.
 *
 * This is exported because there are creation functions and operators that
 * need to make direct use of the same logic, and there's no reason to make
 * them run through `from` conditionals because we *know* they're dealing with
 * an array.
 *
 * @param array The array to emit values from
 */
export function fromArrayLike<T>(array: ArrayLike<T>) {
  return new AsyncObservable<T>(async function* () {
    for (let i = 0; i < array.length; i++) {
      yield array[i]!;
    }
  });
}

export function fromPromise<T>(promise: PromiseLike<T>) {
  return new AsyncObservable<T>(async function* () {
    const value = await promise;
    yield value;
  });
}

function fromIterable<T>(iterable: Iterable<T>) {
  return new AsyncObservable<T>(async function* () {
    for (const value of iterable) {
      yield value;
    }
  });
}

function fromAsyncIterable<T>(asyncIterable: AsyncIterable<T>) {
  return new AsyncObservable<T>(async function* () {
    for await (const value of asyncIterable) {
      yield value;
    }
  });
}

function fromReadableStreamLike<T>(readableStream: ReadableStreamLike<T>) {
  return new AsyncObservable<T>(async function* (sub) {
    const reader = readableStream.getReader();
    try {
      while (true) {
        const { value, done } = await Promise.race([
          reader.read(),
          sub[kCancelSignal].then(() => ({ value: undefined, done: true as const })),
        ]);
        if (done) return;
        yield value!;
      }
    } finally {
      reader.releaseLock();
    }
  });
}
