import { type AsyncObservable, type OperatorFunction } from "@eventkit/async-observable";

import { arrRemove } from "../utils/array";
import { map } from "./map";
import { merge } from "./merge";

const kBufferNotifier = Symbol("bufferNotifier");
type BufferNotifier = typeof kBufferNotifier;

/**
 * Buffers the source observable until the `pushNotifier` observable emits a value.
 * Each time the `pushNotifier` observable emits a value, the current buffer is emitted and a new
 * buffer is started.
 *
 * @param pushNotifier An observable that emits a value when the buffer should be emitted and a new
 * buffer should be started.
 */
export function buffer<T>(pushNotifier: AsyncObservable<any>): OperatorFunction<T, T[]> {
  return (source) =>
    new source.AsyncObservable<T[]>(async function* () {
      let buffer: T[] = [];

      const notifier$ = pushNotifier.pipe(map<any, BufferNotifier>(() => kBufferNotifier));
      const merged$ = source.pipe(merge(notifier$));

      for await (const value of merged$) {
        if (value === kBufferNotifier) {
          yield buffer;
          buffer = [];
        } else {
          buffer.push(value);
        }
      }
      yield buffer;
    });
}

/**
 * Buffers the source observable until the size hits the maximum `bufferSize` given.
 *
 * @param bufferSize The maximum size of the buffer emitted.
 * @param startBufferEvery Interval at which to start a new buffer.
 * For example if `startBufferEvery` is `2`, then a new buffer will be started
 * on every other value from the source. A new buffer is started at the
 * beginning of the source by default.
 */
export function bufferCount<T>(
  bufferSize: number,
  startBufferEvery: number | null = null
): OperatorFunction<T, T[]> {
  startBufferEvery = startBufferEvery ?? bufferSize;
  return (source) =>
    new source.AsyncObservable<T[]>(async function* () {
      const buffers: T[][] = [];
      let count = 0;

      for await (const value of source) {
        let toEmit: T[][] | null = null;

        // Check to see if we need to start a buffer.
        // This will start one at the first value, and then
        // a new one every N after that.
        if (count++ % startBufferEvery! === 0) {
          buffers.push([]);
        }

        // Push our value into our active buffers.
        for (const buffer of buffers) {
          buffer.push(value);
          // Check to see if we're over the bufferSize
          // if we are, record it so we can emit it later.
          // If we emitted it now and removed it, it would
          // mutate the `buffers` array while we're looping
          // over it.
          if (bufferSize <= buffer.length) {
            toEmit = toEmit ?? [];
            toEmit.push(buffer);
          }
        }

        if (toEmit) {
          // We have found some buffers that are over the
          // `bufferSize`. Emit them, and remove them from our
          // buffers list.
          for (const buffer of toEmit) {
            arrRemove(buffers, buffer);
            yield buffer;
          }
        }
      }

      // When the source completes, emit all of our
      // active buffers.
      for (const buffer of buffers) {
        yield buffer;
      }
    });
}
