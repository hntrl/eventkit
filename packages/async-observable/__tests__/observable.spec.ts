import { describe, expect, it, vi } from "vitest";
import { AsyncObservable } from "../lib/observable";
import { Subscriber } from "../lib/subscriber";
import { ReadableStreamLike } from "../lib/types";
import { Scheduler } from "../lib/scheduler";

describe("AsyncObservable", () => {
  describe("constructor", () => {
    it("should create an observable with a generator function", async () => {
      const generatorFn = async function* () {
        yield 1;
        yield 2;
        yield 3;
      };

      const observable = new AsyncObservable(generatorFn);

      // Verify the observable works correctly
      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));

      expect(values).toEqual([1, 2, 3]);
    });

    it("should create an empty observable with no generator function", async () => {
      const observable = new AsyncObservable();

      // An empty observable should complete immediately without emitting values
      const values: unknown[] = [];
      await observable.subscribe((value) => values.push(value));

      expect(values).toEqual([]);
    });

    it("should bind the generator function to the observable instance", async () => {
      // Create a generator function that uses 'this'
      const generatorFn = async function* (this: AsyncObservable<string>) {
        // Use 'this' to demonstrate binding
        yield "The observable has";
        yield `${this.subscribers.length} subscriber(s)`;
      };

      const observable = new AsyncObservable<string>(generatorFn);

      const values: string[] = [];
      await observable.subscribe((value) => values.push(value));

      // If the generator is properly bound, 'this' will reference the observable
      // and this.subscribers.length will be 1
      expect(values[1]).toBe("1 subscriber(s)");
    });

    it("should call generator function for each new subscriber", async () => {
      // Create a mock generator function to track calls
      const mockGeneratorFn = vi.fn(async function* () {
        yield "value";
      });

      const observable = new AsyncObservable(mockGeneratorFn);

      // Subscribe multiple times
      await observable.subscribe();
      await observable.subscribe();
      await observable.subscribe();

      // Generator should be called once per subscription
      expect(mockGeneratorFn).toHaveBeenCalledTimes(3);

      // Create another observable to test with async iteration
      const iterObservable = new AsyncObservable(mockGeneratorFn);

      // Using for-await-of should also call the generator
      for await (const _ of iterObservable) {
        // Just iterate once
        break;
      }

      // Count should now be 4
      expect(mockGeneratorFn).toHaveBeenCalledTimes(4);
    });
  });
  describe("subscription behavior", () => {
    it("should execute the generator function when subscribed to", async () => {
      // Create an observable with a generator that tracks execution
      let executed = false;
      const observable = new AsyncObservable(async function* () {
        executed = true;
        yield "value";
      });

      // Before subscribing, the generator shouldn't be executed
      expect(executed).toBe(false);

      // After subscribing, the generator should be executed
      await observable.subscribe();
      expect(executed).toBe(true);
    });

    it("should deliver values from the generator to subscribers", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "first";
        yield "second";
        yield "third";
      });

      const values: string[] = [];
      await observable.subscribe((value) => values.push(value));

      expect(values).toEqual(["first", "second", "third"]);
    });

    it("should support multiple subscribers receiving the same values", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const values1: number[] = [];
      const values2: number[] = [];

      // Create two subscribers
      const sub1 = observable.subscribe((value) => values1.push(value));
      const sub2 = observable.subscribe((value) => values2.push(value));

      // Wait for both to complete
      await Promise.all([sub1, sub2]);

      // Both subscribers should receive the same values
      expect(values1).toEqual([1, 2, 3]);
      expect(values2).toEqual([1, 2, 3]);
    });

    it("should create a new execution for each subscription", async () => {
      // Create a counter that tracks how many times each value is yielded
      let firstYieldCount = 0;
      let secondYieldCount = 0;

      const observable = new AsyncObservable<string>(async function* () {
        firstYieldCount++;
        yield "first";
        secondYieldCount++;
        yield "second";
      });

      // First subscription
      await observable.subscribe();
      expect(firstYieldCount).toBe(1);
      expect(secondYieldCount).toBe(1);

      // Second subscription should run the generator again
      await observable.subscribe();
      expect(firstYieldCount).toBe(2);
      expect(secondYieldCount).toBe(2);

      // Third subscription
      await observable.subscribe();
      expect(firstYieldCount).toBe(3);
      expect(secondYieldCount).toBe(3);
    });

    it("should allow subscribing without a callback", async () => {
      let executed = false;
      const observable = new AsyncObservable(async function* () {
        executed = true;
        yield "test";
      });

      // Subscribe without a callback
      await observable.subscribe();

      // The generator should still execute
      expect(executed).toBe(true);
    });

    it("should track subscribers in a Set", async () => {
      const observable = new AsyncObservable(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Initially should have no subscribers
      expect(observable.subscribers.length).toBe(0);

      // Add a subscriber
      const sub1 = observable.subscribe();
      expect(observable.subscribers.length).toBe(1);
      expect(observable.subscribers).toContain(sub1);

      // Add another subscriber
      const sub2 = observable.subscribe();
      expect(observable.subscribers.length).toBe(2);
      expect(observable.subscribers).toContain(sub2);

      // Remove a subscriber by cancelling
      await sub1.cancel();
      expect(observable.subscribers.length).toBe(1);
      expect(observable.subscribers).not.toContain(sub1);

      // Remove the last subscriber
      await sub2.cancel();
      expect(observable.subscribers.length).toBe(0);
    });

    it("should execute callbacks via the observable's scheduler", async () => {
      // We'll spy on the scheduler's schedule method
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const scheduleSpy = vi.spyOn(observable._scheduler, "schedule");

      // Subscribe to trigger scheduling
      observable.subscribe();

      // The scheduler's schedule method should have been called
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("should return a Subscriber instance from subscribe()", async () => {
      const observable = new AsyncObservable();
      const subscriber = observable.subscribe();

      // Check subscriber has expected interface
      expect(subscriber).toBeDefined();
      expect(subscriber).toBeInstanceOf(Subscriber);
      expect(typeof subscriber.cancel).toBe("function");
      expect(typeof subscriber.then).toBe("function");
      expect(subscriber[Symbol.asyncIterator]).toBeDefined();
    });
  });
  describe("AsyncIterable implementation", () => {
    it("should be usable in for-await-of loops", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const values: number[] = [];

      // Use the observable directly in a for-await-of loop
      for await (const value of observable) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it("should emit the same values in for-await-of as with subscribe", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "a";
        yield "b";
        yield "c";
      });

      // Collect values using for-await-of
      const forAwaitValues: string[] = [];
      for await (const value of observable) {
        forAwaitValues.push(value);
      }

      // Collect values using subscribe
      const subscribeValues: string[] = [];
      await observable.subscribe((value) => subscribeValues.push(value));

      // Both methods should receive the same values
      expect(forAwaitValues).toEqual(subscribeValues);
      expect(forAwaitValues).toEqual(["a", "b", "c"]);
    });

    it("should allow early cancellation by breaking out of for-await-of loops", async () => {
      let yieldCount = 0;

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yieldCount++;
          yield 1;
          yieldCount++;
          yield 2;
          yieldCount++;
          yield 3;
        } finally {
          // This indicates the generator was properly terminated
          yieldCount = -1;
        }
      });

      // Break out of the loop after the first value
      for await (const value of observable) {
        expect(value).toBe(1);
        break;
      }

      // The finally block should have executed, setting yieldCount to -1
      expect(yieldCount).toBe(-1);
    });

    it("should clean up resources when the for-await-of loop exits", async () => {
      const cleanupSpy = vi.fn();

      const observable = new AsyncObservable(async function* () {
        try {
          yield "test";
        } finally {
          // This should be called when the loop exits
          cleanupSpy();
        }
      });

      // Complete the for-await-of loop normally
      for await (const _ of observable) {
        // Just iterate once
      }

      // The cleanup function should have been called
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Reset the spy
      cleanupSpy.mockReset();

      // Now test early termination
      for await (const _ of observable) {
        break; // Exit early
      }

      // The cleanup function should have been called again
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });

    it("should dispose of resources via scheduler when the iteration completes", async () => {
      // Create a spy to verify scheduler.dispose is called
      const schedulerSpy = vi.spyOn(Scheduler.prototype, "dispose");

      // Create an observable that emits a few values and completes
      const observable = new AsyncObservable<number>(async function* (sub) {
        yield 1;
        yield 2;
        yield 3;
        // Natural completion
      });

      // Consume all values
      for await (const value of observable) {
        // Just iterate through all values
      }

      // Verify scheduler.dispose was called for the subscriber
      expect(schedulerSpy).toHaveBeenCalled();

      // Clean up spy
      schedulerSpy.mockRestore();
    });

    it("should dispose of resources via scheduler when an error occurs", async () => {
      // Create a spy to verify scheduler.dispose is called
      const schedulerSpy = vi.spyOn(Scheduler.prototype, "dispose");

      // Create an observable that throws an error
      const observable = new AsyncObservable<number>(async function* (sub) {
        yield 1;
        throw new Error("Test error");
      });

      // Try to consume values, but expect an error
      try {
        for await (const value of observable) {
          // This should throw after the first value
        }
      } catch (error) {
        // Expected error
        expect(error.message).toBe("Test error");
      }

      // Verify scheduler.dispose was called for the subscriber
      expect(schedulerSpy).toHaveBeenCalled();

      // Clean up spy
      schedulerSpy.mockRestore();
    });

    it("should dispose of resources via scheduler when early termination occurs", async () => {
      // Create a spy to verify scheduler.dispose is called
      const schedulerSpy = vi.spyOn(Scheduler.prototype, "dispose");

      // Create an observable that would emit multiple values
      const observable = new AsyncObservable<number>(async function* (sub) {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      });

      // Break early after the second value
      for await (const value of observable) {
        if (value >= 2) {
          break; // Early termination
        }
      }

      // Verify scheduler.dispose was called for the subscriber
      expect(schedulerSpy).toHaveBeenCalled();

      // Clean up spy
      schedulerSpy.mockRestore();
    });
  });
  describe("cancellation", () => {
    it("should cancel all subscribers when cancel() is called", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create multiple subscribers
      const sub1 = observable.subscribe();
      const sub2 = observable.subscribe();
      const sub3 = observable.subscribe();

      // Spy on each subscriber's cancel method
      const spy1 = vi.spyOn(sub1, "cancel");
      const spy2 = vi.spyOn(sub2, "cancel");
      const spy3 = vi.spyOn(sub3, "cancel");

      // Cancel the observable
      await observable.cancel();

      // All subscriber return signals should be resolved
      await expect(sub1._returnSignal).resolves.toBe(undefined);
      await expect(sub2._returnSignal).resolves.toBe(undefined);
      await expect(sub3._returnSignal).resolves.toBe(undefined);
    });

    it("should remove subscribers from internal tracking when cancelled", async () => {
      const observable = new AsyncObservable();

      // Add multiple subscribers
      observable.subscribe();
      observable.subscribe();
      observable.subscribe();

      expect(observable.subscribers.length).toBe(3);

      // Cancel the observable
      await observable.cancel();

      // All subscribers should be removed
      expect(observable.subscribers.length).toBe(0);
    });

    it("should stop emitting values after cancellation", async () => {
      let allowYield = true;

      // Create an observable that yields values slowly to allow for cancellation
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          // This should not run if cancelled promptly
          if (allowYield) yield 2;

          await new Promise((resolve) => setTimeout(resolve, 20));

          // This should not run if cancelled promptly
          if (allowYield) yield 3;
        } finally {
          // Mark that we shouldn't yield anymore in case the finally runs
          // between yield statements
          allowYield = false;
        }
      });

      const values: number[] = [];
      const subscriber = observable.subscribe((value) => values.push(value));

      // Wait a bit for the first value to be yielded
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel the subscription
      await subscriber.cancel();

      // Wait to ensure no more values are emitted
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only have received the first value
      expect(values).toEqual([1]);
    });

    it("should resolve the cancel promise when all subscribers are cancelled", async () => {
      let cancelResolved = false;

      const observable = new AsyncObservable(async function* () {
        yield "test";
        // Add a delay to ensure the generator is still running when cancel is called
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield "this should never be yielded";
      });

      // Add multiple subscribers
      observable.subscribe();
      observable.subscribe();

      // Cancel the observable and track when the promise resolves
      observable.cancel().then(() => {
        cancelResolved = true;
      });

      // Initially, the cancel promise should not be resolved
      expect(cancelResolved).toBe(false);

      // Wait for the cancellation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The cancel promise should now be resolved
      expect(cancelResolved).toBe(true);
      // All subscribers should be removed
      expect(observable.subscribers.length).toBe(0);
    });

    it("should send an early interrupt signal to all subscribers", async () => {
      let completed = false;
      let interrupted = false;

      const observable = new AsyncObservable<number>(async function* (sub) {
        try {
          yield 1;
          // This long delay would normally prevent completion
          await new Promise((resolve) => setTimeout(resolve, 100));
          yield 2;
          completed = true;
        } finally {
          // If we got here, it means the generator was interrupted
          interrupted = true;
        }
      });

      // Subscribe to the observable
      const values: number[] = [];
      observable.subscribe((value) => values.push(value));

      // Wait a bit for the first value to be yielded
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Cancel the observable
      await observable.cancel();

      // The generator should have been interrupted before completion
      expect(completed).toBe(false);
      expect(interrupted).toBe(true);
      expect(values).toEqual([1]);
    });

    it("should trigger generator's return() method for cleanup", async () => {
      // The return() method is called implicitly when a generator is cancelled
      // We can detect this by using a finally block
      const cleanupSpy = vi.fn();

      const observable = new AsyncObservable(async function* () {
        try {
          yield "value";
          // Add a delay to ensure we can cancel before natural completion
          await new Promise((resolve) => setTimeout(resolve, 100));
          yield "never yielded";
        } finally {
          cleanupSpy();
        }
      });

      // Subscribe and immediately cancel
      const subscriber = observable.subscribe();
      await subscriber.cancel();

      // The cleanup function should have been called
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it("should execute direct cleanup actions when cancel() is called", async () => {
      // Create a spy for cleanup action execution
      const cleanupSpy = vi.fn();

      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Add a cleanup action directly to the scheduler
      observable.finally(cleanupSpy);

      // Subscribe to start the observable execution
      observable.subscribe();

      // Initially the cleanup action should not have been called
      expect(cleanupSpy).not.toHaveBeenCalled();

      // Call cancel() which should trigger cleanup actions
      await observable.cancel();

      // Verify the cleanup action was executed
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Verify that all subscribers have been removed
      expect(observable.subscribers.length).toBe(0);
    });
  });
  describe("Promise-like behavior", () => {
    it("should allow awaiting completion with drain()", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      let completed = false;

      // Start a subscription
      observable.subscribe();

      // Initially, it shouldn't be completed
      expect(completed).toBe(false);

      // Wait for the drain promise to resolve
      await observable.drain().then(() => {
        completed = true;
      });

      // Now it should be completed
      expect(completed).toBe(true);
    });

    it("should wait for all scheduled work to complete when drained", async () => {
      const workComplete: boolean[] = [false, false, false];

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create subscribers with async callbacks
      observable.subscribe(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        workComplete[value - 1] = true;
      });

      // Start a second subscriber
      observable.subscribe(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        // Just to add more concurrent work
      });

      // Initially, no work should be complete
      expect(workComplete).toEqual([false, false, false]);

      // Wait for all work to complete
      await observable.drain();

      // All work should now be complete
      expect(workComplete).toEqual([true, true, true]);
    });

    it("should catch errors with catch() method", async () => {
      const errorMessage = "Test error";
      let caughtError: Error | null = null;

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error(errorMessage);
        yield 2; // This should never be reached
      });

      // Add error handler with catch
      observable.subscribe();

      // Wait for the observable to complete or error
      await observable.drain().catch((error) => {
        caughtError = error;
      });

      // Error should have been caught
      expect(caughtError).toBeInstanceOf(Error);
      // @ts-expect-error
      expect(caughtError?.message).toBe(errorMessage);
    });

    it("should support cleanup with finally() method", async () => {
      const cleanupSpy = vi.fn();

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      observable.subscribe();

      // Add cleanup handler with finally
      observable.finally(cleanupSpy);

      // Wait for the observable to complete
      await observable.drain();

      // Cleanup should have been called
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Test with error
      const errorObservable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error("Test error");
        yield 2; // This should never be reached
      });

      const errorCleanupSpy = vi.fn();

      // Add cleanup handler with finally, which should run even on error
      errorObservable.subscribe();

      errorObservable.finally(errorCleanupSpy);

      // Wait for the observable to complete or error
      try {
        await errorObservable.drain();
      } catch (err) {
        // Ignore the error, we're testing the finally
      }

      // Cleanup should have been called even though there was an error
      expect(errorCleanupSpy).toHaveBeenCalledTimes(1);
    });

    it("should execute cleanup actions after all work completes", async () => {
      const executionOrder: string[] = [];

      const observable = new AsyncObservable<string>(async function* () {
        executionOrder.push("generator start");
        yield "test";
        executionOrder.push("generator end");
      });

      observable.subscribe(async (value) => {
        executionOrder.push("subscriber start");
        await new Promise((resolve) => setTimeout(resolve, 10)); // Add some async work
        executionOrder.push("subscriber end");
      });

      observable.finally(() => {
        executionOrder.push("finally cleanup");
      });

      // Wait for everything to complete
      await observable.drain();

      // The cleanup action (finally) should be executed last, after all work is done
      expect(executionOrder).toEqual([
        "generator start",
        "subscriber start",
        "generator end",
        "subscriber end",
        "finally cleanup",
      ]);
    });
  });
  describe("pipe and operators", () => {
    it("should return a stub observable when pipe() is called with no arguments", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Call pipe with no arguments
      const result = source.pipe();

      // Result should be a new AsyncObservable instance
      expect(result).toBeInstanceOf(AsyncObservable);
      expect(result).not.toBe(source); // Should be a different instance

      // The values should be the same as the source
      const values: number[] = [];
      await result.subscribe((value) => values.push(value));

      expect(values).toEqual([1, 2, 3]);
    });

    it("should apply operators in sequence when piped", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      });

      // Create a simple map operator
      const double = (source: AsyncObservable<number>) =>
        new source.AsyncObservable<number>(async function* () {
          for await (const value of source) {
            yield value * 2;
          }
        });

      // Create a simple filter operator
      const evenOnly = (source: AsyncObservable<number>) =>
        new source.AsyncObservable<number>(async function* () {
          for await (const value of source) {
            if (value % 2 === 0) {
              yield value;
            }
          }
        });

      // Apply operators in sequence: double, then filter even
      const result = source.pipe(double, evenOnly);

      // Collect the values
      const values: number[] = [];
      await result.subscribe((value) => values.push(value));

      // Should have doubled each value, then kept only even results
      // [1, 2, 3, 4, 5] -> [2, 4, 6, 8, 10] -> [2, 4, 6, 8, 10]
      expect(values).toEqual([2, 4, 6, 8, 10]);

      // Try in the opposite order to verify sequence matters
      const oppositeOrder = source.pipe(evenOnly, double);

      const oppositeValues: number[] = [];
      await oppositeOrder.subscribe((value) => oppositeValues.push(value));

      // Should have filtered for even numbers, then doubled them
      // [1, 2, 3, 4, 5] -> [2, 4] -> [4, 8]
      expect(oppositeValues).toEqual([4, 8]);
    });

    it("should maintain proper types through the pipe chain", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create operators that transform the type
      const numberToString = (source: AsyncObservable<number>) =>
        new source.AsyncObservable<string>(async function* () {
          for await (const value of source) {
            yield value.toString();
          }
        });

      const stringToLength = (source: AsyncObservable<string>) =>
        new source.AsyncObservable<number>(async function* () {
          for await (const value of source) {
            yield value.length;
          }
        });

      // Apply operators with type transformations
      const result = source.pipe(numberToString, stringToLength);

      // Collect the values
      const values: number[] = [];
      await result.subscribe((value) => {
        // TypeScript should recognize value as number
        const num: number = value;
        values.push(num);
      });

      // Values 1 and 2 become strings "1" and "2", which have length 1
      expect(values).toEqual([1, 1]);
    });

    it("should support various numbers of operators in pipe()", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      // Create a simple operator that adds a constant
      const addN = (n: number) => (source: AsyncObservable<number>) =>
        new source.AsyncObservable<number>(async function* () {
          for await (const value of source) {
            yield value + n;
          }
        });

      // Test with 1 operator
      const result1 = source.pipe(addN(1));
      const values1: number[] = [];
      await result1.subscribe((value) => values1.push(value));
      expect(values1).toEqual([2]);

      // Test with 3 operators
      const result3 = source.pipe(addN(1), addN(2), addN(3));
      const values3: number[] = [];
      await result3.subscribe((value) => values3.push(value));
      expect(values3).toEqual([7]); // 1 + 1 + 2 + 3 = 7

      // Test with 5 operators
      const result5 = source.pipe(addN(1), addN(2), addN(3), addN(4), addN(5));
      const values5: number[] = [];
      await result5.subscribe((value) => values5.push(value));
      expect(values5).toEqual([16]); // 1 + 1 + 2 + 3 + 4 + 5 = 16
    });

    it("should stitch together functional operators into a chain", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      });

      // Test a more complex transformation pipeline
      const result = source.pipe(
        // First, map each number to its square
        (source) =>
          new source.AsyncObservable<number>(async function* () {
            for await (const value of source) {
              yield value * value;
            }
          }),

        // Then, filter to keep only values > 10
        (source) =>
          new source.AsyncObservable<number>(async function* () {
            for await (const value of source) {
              if (value > 10) {
                yield value;
              }
            }
          }),

        // Finally, add 1 to each value
        (source) =>
          new source.AsyncObservable<number>(async function* () {
            for await (const value of source) {
              yield value + 1;
            }
          })
      );

      // Collect the results
      const values: number[] = [];
      await result.subscribe((value) => values.push(value));

      // Squares: [1, 4, 9, 16, 25]
      // Filtered: [16, 25]
      // Plus 1: [17, 26]
      expect(values).toEqual([17, 26]);
    });
  });
  describe("from static method", () => {
    it("should create observables from various input types", async () => {
      // Test array input
      const arrayObservable = AsyncObservable.from([1, 2, 3]);
      const arrayValues: number[] = [];
      await arrayObservable.subscribe((value) => arrayValues.push(value));
      expect(arrayValues).toEqual([1, 2, 3]);

      // Test Promise input
      const promiseObservable = AsyncObservable.from(Promise.resolve("test"));
      const promiseValues: string[] = [];
      await promiseObservable.subscribe((value) => promiseValues.push(value));
      expect(promiseValues).toEqual(["test"]);

      // Test AsyncIterable input
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield "a";
          yield "b";
        },
      };
      const asyncIterableValues: string[] = [];
      await AsyncObservable.from(asyncIterable).subscribe((value) =>
        asyncIterableValues.push(value)
      );
      expect(asyncIterableValues).toEqual(["a", "b"]);

      // Test with another AsyncObservable
      const sourceObservable = new AsyncObservable<string>(async function* () {
        yield "original";
      });
      const fromObservable = AsyncObservable.from(sourceObservable);

      // Should be the same instance, not a copy
      expect(fromObservable).toBe(sourceObservable);
    });

    it("should respect input type conversion rules", async () => {
      // Test with arrays - should convert to sequence of values
      const arrayObservable = AsyncObservable.from(["a", "b", "c"]);
      const values: string[] = [];
      await arrayObservable.subscribe((value) => values.push(value));
      expect(values).toEqual(["a", "b", "c"]);

      // Test with Promise - should convert to a single value
      const promiseObservable = AsyncObservable.from(Promise.resolve(42));
      const promiseValues: number[] = [];
      await promiseObservable.subscribe((value) => promiseValues.push(value));
      expect(promiseValues).toEqual([42]);

      // Test nested arrays are not automatically flattened
      const nestedArrayObservable = AsyncObservable.from([1, [2, 3], 4]);
      const nestedValues: any[] = [];
      await nestedArrayObservable.subscribe((value) => nestedValues.push(value));
      expect(nestedValues).toEqual([1, [2, 3], 4]);

      // Test null/undefined handling (should throw)
      expect(() => AsyncObservable.from(null as any)).toThrow();
      expect(() => AsyncObservable.from(undefined as any)).toThrow();
    });

    it("should convert common iterable and stream-like types", async () => {
      // Test with Iterable (Set)
      const set = new Set(["a", "b", "c"]);
      const setValues: string[] = [];
      await AsyncObservable.from(set).subscribe((value) => setValues.push(value));
      expect(setValues).toEqual(["a", "b", "c"]);

      // Test with Map
      const map = new Map([
        ["key1", "value1"],
        ["key2", "value2"],
      ]);
      const mapEntries: [string, string][] = [];
      await AsyncObservable.from(map).subscribe((entry) => mapEntries.push(entry));
      expect(mapEntries).toEqual([
        ["key1", "value1"],
        ["key2", "value2"],
      ]);

      // Test with ReadableStream-like object if available in the environment
      if (typeof ReadableStream !== "undefined") {
        // Create a mock ReadableStream-like object
        const mockStream = {
          getReader: () => ({
            read: async () => ({ value: "stream-value", done: false }),
            releaseLock: () => {},
          }),
        };

        const streamObservable = AsyncObservable.from(mockStream as ReadableStreamLike<string>);
        let streamValue: string | undefined;

        // Just read the first value
        const sub = streamObservable.subscribe((value) => {
          streamValue = value;
          sub.cancel(); // Cancel after first value
        });

        await sub;
        expect(streamValue).toBe("stream-value");
      }

      // Test with a custom AsyncIterable
      const customAsyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield "custom1";
          yield "custom2";
        },
      };

      const customValues: string[] = [];
      await AsyncObservable.from(customAsyncIterable).subscribe((value) =>
        customValues.push(value)
      );
      expect(customValues).toEqual(["custom1", "custom2"]);
    });
  });
  describe("AsyncObservable getter", () => {
    it("should return a bound AsyncObservable class", async () => {
      const parent = new AsyncObservable<number>();

      // Access the getter
      const BoundAsyncObservable = parent.AsyncObservable;

      // Should be a constructor function
      expect(typeof BoundAsyncObservable).toBe("function");

      // Create an instance of the bound class
      const child = new BoundAsyncObservable<string>();

      // Should be an instance of AsyncObservable
      expect(child).toBeInstanceOf(AsyncObservable);

      // Should be a different instance than the parent
      expect(child).not.toBe(parent);

      // Should have different type parameters
      await child.subscribe((value) => {
        // TypeScript should recognize value as string
        const str: string = value;
      });
    });

    it("should use PassthroughScheduler bound to current instance", async () => {
      const parent = new AsyncObservable<number>();
      const BoundAsyncObservable = parent.AsyncObservable;

      // Create a child observable
      const child = new BoundAsyncObservable();

      // Verify the child uses a PassthroughScheduler
      expect(child._scheduler.constructor.name).toBe("PassthroughScheduler");

      // Spy on the parent scheduler's add method
      const addSpy = vi.spyOn(parent._scheduler, "add");

      // Create a subscription on the child
      const subscriber = child.subscribe();

      // The work from the child's subscriber should be forwarded to the parent's scheduler
      expect(addSpy).toHaveBeenCalled();

      // The call should include the subscriber
      expect(addSpy).toHaveBeenCalledWith(subscriber, expect.anything());
    });

    it("should maintain parent-child relationship in scheduler hierarchy", async () => {
      const root = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create a chain of observables: root -> level1 -> level2
      const level1 = new root.AsyncObservable<string>(async function* () {
        for await (const value of root) {
          yield `Level 1: ${value}`;
        }
      });

      const level2 = new level1.AsyncObservable<string>(async function* () {
        for await (const value of level1) {
          yield `Level 2: ${value}`;
        }
      });

      const results: string[] = [];
      await level2.subscribe((value) => results.push(value));

      // Verify the values flow through the entire chain
      expect(results).toEqual(["Level 2: Level 1: 1", "Level 2: Level 1: 2"]);

      // Spy on root's scheduler
      const level2DrainSpy = vi.spyOn(level2._scheduler, "promise");

      // Drain level2
      await level2.drain();

      // Should have called promise on root's scheduler, indicating work is tracked at the root
      expect(level2DrainSpy).toHaveBeenCalled();
    });

    it("should propagate cancellation from parent to child observables", async () => {
      const parent = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Track whether the child generator was properly terminated
      let childCleanupCalled = false;

      // Create a child observable with the bound constructor
      const child = new parent.AsyncObservable<string>(async function* () {
        try {
          for await (const value of parent) {
            yield `Child: ${value}`;
          }
        } finally {
          // This should run when the generator is terminated due to cancellation
          childCleanupCalled = true;
        }
      });

      child.subscribe();

      // Wait a bit to allow for some processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel the parent
      await parent.cancel();

      // The child cleanup should have been called
      expect(childCleanupCalled).toBe(true);

      // The child should no longer have any subscribers
      expect(child.subscribers.length).toBe(0);
    });
  });
  describe("stub method", () => {
    it("should create a new observable that emits the same values", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a stub observable
      const stub = source.stub();

      // Collect values from both observables
      const sourceValues: number[] = [];
      const stubValues: number[] = [];

      await source.subscribe((value) => sourceValues.push(value));
      await stub.subscribe((value) => stubValues.push(value));

      // The stub should emit the same values as the source
      expect(stubValues).toEqual(sourceValues);
      expect(stubValues).toEqual([1, 2, 3]);
    });

    it("should use a bound AsyncObservable internally", async () => {
      const source = new AsyncObservable<string>();
      const stub = source.stub();

      // The stub should use the bound AsyncObservable constructor
      // which will set up a PassthroughScheduler
      expect(stub._scheduler.constructor.name).toBe("PassthroughScheduler");

      // Check that the scheduler is properly bound to the source
      const addSpy = vi.spyOn(source._scheduler, "add");

      // Create a subscription on the stub
      const subscriber = stub.subscribe();

      // The work should be forwarded to the source scheduler
      expect(addSpy).toHaveBeenCalled();
    });

    it("should maintain parent-child relationship with original observable", async () => {
      // Create a source observable that tracks when it's being iterated
      let sourceIterated = false;
      const source = new AsyncObservable<number>(async function* () {
        sourceIterated = true;
        yield 1;
        yield 2;
      });

      // Create a stub
      const stub = source.stub();

      // Before subscribing to the stub, the source shouldn't be iterated
      expect(sourceIterated).toBe(false);

      // Subscribe to the stub
      await stub.subscribe();

      // The source should now have been iterated
      expect(sourceIterated).toBe(true);

      // Test that cancellation propagates properly
      const observableToCancelFrom = new AsyncObservable<number>(async function* () {
        yield 42;
      });

      const stubThatGetsInterrupted = observableToCancelFrom.stub();

      // Subscribe to the stub with a generator that we'll check
      await stubThatGetsInterrupted.subscribe();

      // Now cancel the source
      await observableToCancelFrom.cancel();

      // The stub should no longer have any subscribers
      expect(stubThatGetsInterrupted.subscribers.length).toBe(0);
    });

    it("should create a 'dummy' observable wrapping the current AsyncObservable", async () => {
      const counter = { count: 0 };

      // Create a source observable
      const source = new AsyncObservable<number>(async function* () {
        counter.count++;
        yield 1;
        counter.count++;
        yield 2;
      });

      // Create multiple stubs
      const stub1 = source.stub();
      const stub2 = source.stub();

      // Subscribe to both stubs
      await Promise.all([stub1.subscribe(), stub2.subscribe()]);

      // The source generator should have been called twice (once for each stub subscription)
      expect(counter.count).toBe(4); // Generator ran twice, yielding 2 values each time

      // Stubs should be different instances
      expect(stub1).not.toBe(stub2);
      expect(stub1).not.toBe(source);
      expect(stub2).not.toBe(source);

      // But they should all be instances of AsyncObservable
      expect(stub1).toBeInstanceOf(AsyncObservable);
      expect(stub2).toBeInstanceOf(AsyncObservable);
    });
  });
  describe("execution model", () => {
    it("should execute in a non-blocking manner", async () => {
      let blockingCompleted = false;

      // Create an observable with a generator that has a delay
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;

        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 50));
        blockingCompleted = true;

        yield 2;
      });

      // Start subscription but don't await it
      const subscription = observable.subscribe();

      // Subscription should have started but the blocking work should not be complete
      expect(blockingCompleted).toBe(false);

      // Now await the subscription
      await subscription;

      // After awaiting, the blocking work should be completed
      expect(blockingCompleted).toBe(true);
    });

    it("should support parallel execution of callbacks", async () => {
      // Create timestamps to check execution order
      const timestamps: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create subscribers with callbacks that take different times to complete
      await Promise.all([
        observable.subscribe(async (value) => {
          if (value === 1) {
            // First value takes longer
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          timestamps.push(value);
        }),

        observable.subscribe(async (value) => {
          // Second subscriber processes values quickly
          timestamps.push(value + 10);
        }),
      ]);

      // If callbacks executed in parallel, the faster ones from the second subscriber
      // should be interleaved with the slower ones from the first subscriber
      // Not checking exact order since it could vary, but should not be in sequential order by subscriber
      expect(timestamps).not.toEqual([1, 2, 3, 11, 12, 13]);
    });

    it("should not execute sequentially by default", async () => {
      const executionOrder: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a subscriber with callbacks that take different amounts of time
      await observable.subscribe(async (value) => {
        if (value === 1) {
          // Make the first value take longer to process
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        executionOrder.push(value);
      });

      // If execution is non-sequential, the values might complete out of order
      // In particular, if the scheduler doesn't force sequential execution,
      // value 2 and 3 callbacks could complete before value 1
      expect(executionOrder).not.toEqual([1, 2, 3]);
    });

    it("should allow awaiting all values via subscriber or drain()", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Test awaiting via subscriber
      const values1: number[] = [];
      const subscriber = observable.subscribe((value) => {
        values1.push(value);
      });

      // Await the subscriber promise
      await subscriber;

      expect(values1).toEqual([1, 2, 3]);

      // Test awaiting via drain
      const values2: number[] = [];
      observable.subscribe((value) => {
        values2.push(value);
      });

      // Await the drain promise
      await observable.drain();

      expect(values2).toEqual([1, 2, 3]);
    });
  });
  describe("error handling", () => {
    it("should propagate errors from generators to awaiting promises", async () => {
      const errorMessage = "Test error in generator";

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error(errorMessage);
        yield 2; // This should never be reached
      });

      // Create a subscription and await it
      let error: Error | null = null;
      try {
        await observable.subscribe();
      } catch (err) {
        error = err as Error;
      }

      // The error should have been propagated
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe(errorMessage);
    });

    it("should propagate errors to Promise rejection handler", async () => {
      const errorMessage = "Test error for rejection";

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error(errorMessage);
      });

      // Test with Promise rejection handling
      let caughtError: Error | null = null;

      await observable.subscribe().catch((err) => {
        caughtError = err as Error;
      });

      // Error should have been caught
      expect(caughtError).toBeInstanceOf(Error);
      // @ts-expect-error
      expect(caughtError?.message).toBe(errorMessage);
    });

    it("should add a handler for errors with catch() method", async () => {
      const errorMessage = "Test error for catch method";
      let caughtError: Error | null = null;

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error(errorMessage);
      });

      observable.subscribe();

      await observable.drain().catch((err) => {
        caughtError = err as Error;
      });

      // The catch handler should have received the error
      expect(caughtError).toBeInstanceOf(Error);
      // @ts-expect-error
      expect(caughtError?.message).toBe(errorMessage);
    });
  });
  describe("disposable pattern", () => {
    it("should implement Symbol.dispose when available", async () => {
      // Skip this test if Symbol.dispose is not available
      if (typeof Symbol.dispose === "undefined") {
        return;
      }

      const observable = new AsyncObservable<number>();

      // Check that dispose method exists
      expect(typeof (observable as any)[Symbol.dispose]).toBe("function");

      observable.subscribe();
      expect(observable.subscribers.length).toBe(1);

      // Call dispose
      await (observable as any)[Symbol.dispose]();

      // Verify that cancel was called
      expect(observable.subscribers.length).toBe(0);
    });

    it("should implement Symbol.asyncDispose when available", async () => {
      // Skip this test if Symbol.asyncDispose is not available
      if (typeof Symbol.asyncDispose === "undefined") {
        return;
      }

      const observable = new AsyncObservable<number>();

      // Check that asyncDispose method exists
      expect(typeof (observable as any)[Symbol.asyncDispose]).toBe("function");

      observable.subscribe();
      expect(observable.subscribers.length).toBe(1);

      // Call asyncDispose
      await (observable as any)[Symbol.asyncDispose]();

      // Verify that cancel was called
      expect(observable.subscribers.length).toBe(0);
    });

    it("should call cancel() when disposed", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create subscribers
      observable.subscribe();
      observable.subscribe();

      expect(observable.subscribers.length).toBe(2);

      // Call cancel directly (simulating dispose)
      await observable[Symbol.asyncDispose]();

      // All subscribers should be removed
      expect(observable.subscribers.length).toBe(0);
    });
  });
});
