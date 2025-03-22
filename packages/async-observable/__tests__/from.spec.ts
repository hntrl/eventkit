import { describe, it, expect, vi } from "vitest";
import { from } from "../lib/from";
import { AsyncObservable } from "../lib/observable";
import { ReadableStreamLike } from "../lib/types";
import { isAsyncObservable } from "../lib/from";

describe("from()", () => {
  describe("AsyncObservable handling", () => {
    it("should return the same instance when given an AsyncObservable", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const result = from(source);

      expect(result).toBe(source); // Should be the exact same instance

      // Verify the observable still works as expected
      const values: number[] = [];
      for await (const value of result) {
        values.push(value);
      }
      expect(values).toEqual([1, 2, 3]);
    });

    it("should create a new AsyncObservable from an interoperable AsyncObservable", async () => {
      // Create an interoperable AsyncObservable (not an actual AsyncObservable instance)
      const interopObservable = {
        [Symbol.asyncObservable]: () => ({
          [Symbol.asyncIterator]: async function* () {
            yield "a";
            yield "b";
            yield "c";
          },
        }),
      };

      const result = from(interopObservable);

      // Should create a new instance
      expect(result).toBeInstanceOf(AsyncObservable);
      expect(result).not.toBe(interopObservable);

      // Verify the new observable works correctly
      const values: string[] = [];
      for await (const value of result) {
        values.push(value);
      }
      expect(values).toEqual(["a", "b", "c"]);
    });

    it("should always return an AsyncObservable instance", async () => {
      const array = [1, 2, 3];
      const promise = Promise.resolve("value");
      const iterable = new Set(["a", "b", "c"]);
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield "x";
          yield "y";
          yield "z";
        },
      };

      // Test different input types
      expect(from(array)).toBeInstanceOf(AsyncObservable);
      expect(from(promise)).toBeInstanceOf(AsyncObservable);
      expect(from(iterable)).toBeInstanceOf(AsyncObservable);
      expect(from(asyncIterable)).toBeInstanceOf(AsyncObservable);

      // Create a simple mock of ReadableStreamLike
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ value: "one", done: false })
          .mockResolvedValueOnce({ value: "two", done: false })
          .mockResolvedValueOnce({ value: "three", done: false })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn(),
      };
      const mockReadableStream = {
        getReader: () => mockReader,
      };

      expect(from(mockReadableStream as unknown as ReadableStreamLike<any>)).toBeInstanceOf(
        AsyncObservable
      );
    });
  });
  describe("Array and array-like object handling", () => {
    it("should convert an array-like object to an AsyncObservable", async () => {
      // Test with a regular array
      const array = [1, 2, 3];
      expect(from(array)).toBeInstanceOf(AsyncObservable);

      // Test with array-like object (has length property but is not an array)
      const arrayLike = {
        0: "a",
        1: "b",
        2: "c",
        length: 3,
      };
      expect(from(arrayLike)).toBeInstanceOf(AsyncObservable);
    });

    it("should emit each item in the array in order", async () => {
      // Test with a regular array
      const array = ["first", "second", "third"];
      const observable = from(array);

      const emittedValues: string[] = [];
      for await (const value of observable) {
        emittedValues.push(value);
      }

      expect(emittedValues).toEqual(array);

      // Test with array-like object
      const arrayLike = {
        0: 10,
        1: 20,
        2: 30,
        length: 3,
      };
      const observable2 = from(arrayLike);

      const emittedValues2: number[] = [];
      for await (const value of observable2) {
        emittedValues2.push(value);
      }

      expect(emittedValues2).toEqual([10, 20, 30]);
    });

    it("should complete after emitting all items", async () => {
      const array = ["a", "b", "c"];
      const observable = from(array);

      const emittedValues: string[] = [];

      // Using a subscriber to detect completion
      await observable.subscribe((value) => emittedValues.push(value));
      expect(emittedValues).toEqual(array);

      // Also test with an empty array to ensure it completes immediately
      const emptyArray: never[] = [];
      const emptyObservable = from(emptyArray);

      await emptyObservable.subscribe();
    });
  });
  describe("Promise handling", () => {
    it("should convert a Promise to an AsyncObservable", async () => {
      const promise = Promise.resolve(42);
      const observable = from(promise);

      expect(observable).toBeInstanceOf(AsyncObservable);
    });

    it("should emit the resolved value of the promise", async () => {
      const testValue = { data: "test data" };
      const promise = Promise.resolve(testValue);
      const observable = from(promise);

      const emittedValues: Array<typeof testValue> = [];
      await observable.subscribe((value) => emittedValues.push(value));

      expect(emittedValues).toHaveLength(1);
      expect(emittedValues[0]).toBe(testValue);
    });

    it("should complete after emitting the resolved value", async () => {
      const promise = Promise.resolve("done");
      const observable = from(promise);

      const emittedValues: string[] = [];

      // The subscribe promise resolves when the observable completes
      await observable.subscribe((value) => emittedValues.push(value));

      // We should have exactly one value and the observable should be complete
      expect(emittedValues).toEqual(["done"]);
    });

    it("should propagate promise rejection as an error", async () => {
      const error = new Error("Test error");
      const promise = Promise.reject(error);
      const observable = from(promise);

      // The subscribe call should reject with the same error
      await expect(observable.subscribe(() => {})).rejects.toThrow(error);

      // Alternative approach using try/catch
      let caughtError: Error | undefined;
      try {
        await observable.subscribe();
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
    });
  });
  describe("AsyncIterable handling", () => {
    it("should convert an AsyncIterable to an AsyncObservable", async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield 1;
        },
      };

      const observable = from(asyncIterable);

      expect(observable).toBeInstanceOf(AsyncObservable);
    });

    it("should emit each yielded value in order", async () => {
      const values = [10, 20, 30, 40, 50];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const val of values) {
            yield val;
          }
        },
      };

      const observable = from(asyncIterable);

      const emittedValues: number[] = [];
      await observable.subscribe((value) => emittedValues.push(value));

      expect(emittedValues).toEqual(values);
    });

    it("should complete after the AsyncIterable is exhausted", async () => {
      // Create an async iterable that yields a few values with delays
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield "first";
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield "second";
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield "third";
        },
      };

      const observable = from(asyncIterable);

      const emittedValues: string[] = [];
      await observable.subscribe((value) => emittedValues.push(value));

      // The subscribe promise should only resolve after all values have been emitted
      expect(emittedValues).toEqual(["first", "second", "third"]);
    });

    it("should propagate errors from the AsyncIterable", async () => {
      const testError = new Error("AsyncIterable error");

      // Create an async iterable that throws an error after yielding a value
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield "before error";
          throw testError;
          // This should never be reached
          yield "after error";
        },
      };

      const observable = from(asyncIterable);

      const emittedValues: string[] = [];

      // The subscribe should reject with the same error
      await expect(observable.subscribe((value) => emittedValues.push(value))).rejects.toThrow(
        testError
      );

      // It should have emitted values before the error
      expect(emittedValues).toEqual(["before error"]);
    });
  });
  describe("Iterable handling", () => {
    it("should convert an Iterable to an AsyncObservable", async () => {
      // Test with different types of iterables
      const array = [1, 2, 3]; // Arrays are iterables
      const set = new Set(["a", "b", "c"]);
      const map = new Map([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);

      // Custom iterable
      const customIterable = {
        [Symbol.iterator]: function* () {
          yield "test1";
          yield "test2";
        },
      };

      // All should return AsyncObservable instances
      expect(from(array)).toBeInstanceOf(AsyncObservable);
      expect(from(set)).toBeInstanceOf(AsyncObservable);
      expect(from(map)).toBeInstanceOf(AsyncObservable);
      expect(from(customIterable)).toBeInstanceOf(AsyncObservable);
    });

    it("should emit each item from the iterator in order", async () => {
      // Test with Set iterable
      const set = new Set(["first", "second", "third"]);
      const setObservable = from(set);

      const setValues: string[] = [];
      await setObservable.subscribe((value) => setValues.push(value));

      expect(setValues).toEqual(["first", "second", "third"]);

      // Test with Map iterable (should emit key-value pair entries)
      const map = new Map([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);
      const mapObservable = from(map);

      const mapEntries: Array<[number, string]> = [];
      await mapObservable.subscribe((entry) => mapEntries.push(entry));

      expect(mapEntries).toEqual([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);

      // Test with custom generator-based iterable
      const customIterable = {
        [Symbol.iterator]: function* () {
          yield "a";
          yield "b";
          yield "c";
        },
      };

      const customValues: string[] = [];
      await from(customIterable).subscribe((v) => customValues.push(v));

      expect(customValues).toEqual(["a", "b", "c"]);
    });

    it("should complete after the Iterable is exhausted", async () => {
      // Generator iterable that produces a finite sequence
      const finiteGenerator = {
        [Symbol.iterator]: function* () {
          yield 1;
          yield 2;
          yield 3;
        },
      };

      const observable = from(finiteGenerator);

      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));

      // If we get here, it means the observable completed
      expect(values).toEqual([1, 2, 3]);

      // Also test with an empty iterable
      const emptySet = new Set<never>();
      await from(emptySet).subscribe();
      // If we reach here, it means the observable completed successfully
    });
  });
  describe("ReadableStreamLike handling", () => {
    it("should convert a ReadableStreamLike to an AsyncObservable", async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ value: "data", done: false })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as unknown as ReadableStreamLike<string>;

      const observable = from(mockStream);

      expect(observable).toBeInstanceOf(AsyncObservable);
    });

    it("should emit each chunk from the stream", async () => {
      const mockChunks = ["chunk1", "chunk2", "chunk3"];

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ value: mockChunks[0], done: false })
          .mockResolvedValueOnce({ value: mockChunks[1], done: false })
          .mockResolvedValueOnce({ value: mockChunks[2], done: false })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as unknown as ReadableStreamLike<string>;

      const observable = from(mockStream);

      const emittedValues: string[] = [];
      await observable.subscribe((chunk) => emittedValues.push(chunk));

      expect(emittedValues).toEqual(mockChunks);
      expect(mockReader.read).toHaveBeenCalledTimes(4); // 3 chunks + 1 done signal
    });

    it("should complete when the stream is done", async () => {
      // Create a stream that immediately signals done
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as unknown as ReadableStreamLike<never>;

      const observable = from(mockStream);

      // If the observable completes, the await will resolve
      await observable.subscribe();

      expect(mockReader.read).toHaveBeenCalledTimes(1);
      expect(mockReader.releaseLock).toHaveBeenCalledTimes(1);
    });

    it("should properly release the reader lock when unsubscribed", async () => {
      // Create a stream with a read method that never resolves
      const pendingRead = new Promise<never>(() => {}); // Never resolves
      const mockReader = {
        read: vi.fn().mockReturnValueOnce(pendingRead),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as unknown as ReadableStreamLike<string>;

      const observable = from(mockStream);

      // Start consuming the observable
      const subscriber = observable.subscribe(() => {});

      // Cancel the subscription before it completes
      await subscriber.cancel();

      // The lock should be released even though read never completed
      expect(mockReader.releaseLock).toHaveBeenCalledTimes(1);
    });
  });
  describe("Error handling", () => {
    it("should throw a TypeError for invalid inputs", async () => {
      // Test that the error is a TypeError with the right message format
      expect(() => from({} as any)).toThrow(TypeError);
      expect(() => from({} as any)).toThrow(
        "You provided an invalid object where an observable-like object was expected"
      );
    });

    it("should throw for null and undefined values", async () => {
      // Test null
      expect(() => from(null as any)).toThrow(TypeError);
      expect(() => from(null as any)).toThrow(
        "You provided 'null' where an observable-like object was expected"
      );

      // Test undefined
      expect(() => from(undefined as any)).toThrow(TypeError);
      expect(() => from(undefined as any)).toThrow(
        "You provided 'undefined' where an observable-like object was expected"
      );
    });

    it("should throw for primitive values (number, boolean)", async () => {
      // Test number
      expect(() => from(42 as any)).toThrow(TypeError);
      expect(() => from(42 as any)).toThrow(
        "You provided '42' where an observable-like object was expected"
      );

      // Test boolean
      expect(() => from(true as any)).toThrow(TypeError);
      expect(() => from(true as any)).toThrow(
        "You provided 'true' where an observable-like object was expected"
      );
    });

    it("should throw for objects without proper interfaces", async () => {
      // Test object with no supported interfaces
      const invalidObject = { foo: "bar" };
      expect(() => from(invalidObject as any)).toThrow(TypeError);

      // Test object with methods but not the right ones
      const objectWithWrongMethods = {
        subscribe: 123, // Not a function
        [Symbol.iterator]: "not a function",
      };
      expect(() => from(objectWithWrongMethods as any)).toThrow(TypeError);
    });
  });
});
describe("isAsyncObservable()", () => {
  it("should return true for eventkit AsyncObservable instances", async () => {
    const observable = new AsyncObservable();

    expect(isAsyncObservable(observable)).toBe(true);

    // Test with an observable created from various sources
    expect(isAsyncObservable(from([1, 2, 3]))).toBe(true);
    expect(isAsyncObservable(from(Promise.resolve("test")))).toBe(true);
  });

  it("should return false for null or falsy values", async () => {
    // Test various falsy values
    expect(isAsyncObservable(null)).toBe(false);
    expect(isAsyncObservable(undefined)).toBe(false);
    expect(isAsyncObservable(0)).toBe(false);
    expect(isAsyncObservable(false)).toBe(false);
    expect(isAsyncObservable("")).toBe(false);

    // Test non-observable objects
    expect(isAsyncObservable({})).toBe(false);
    expect(isAsyncObservable([])).toBe(false);
    expect(isAsyncObservable(new Map())).toBe(false);
    expect(isAsyncObservable(() => {})).toBe(false);

    // Test objects with non-function subscribe property
    expect(isAsyncObservable({ subscribe: "not a function" })).toBe(false);
    expect(isAsyncObservable({ subscribe: 123 })).toBe(false);
  });
});
