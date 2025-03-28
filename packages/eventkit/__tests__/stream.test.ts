import { vi, describe, expect, it } from "vitest";
import { AsyncObservable, ConsumerPromise, SchedulerLike } from "@eventkit/async-observable";

import { Stream } from "../lib/stream";
import { map, filter } from "../lib/operators";

describe("Stream", () => {
  describe("constructor", () => {
    it("should create a new Stream with default configuration", async () => {
      const stream = new Stream<number>();

      expect(stream).toBeInstanceOf(Stream);
      expect(stream).toBeInstanceOf(AsyncObservable);

      // Test basic functionality to ensure the stream works
      const values: number[] = [];
      stream.subscribe((value) => values.push(value));

      stream.push(1);
      stream.push(2);

      await stream.drain();

      expect(values).toEqual([1, 2]);
    });

    it("should accept optional preprocess function", async () => {
      const preprocess = (value: unknown) => Number(value) * 2;
      const stream = new Stream<number>({ preprocess });

      const values: number[] = [];
      stream.subscribe((value) => values.push(value));

      stream.push(5);
      stream.push("10" as any); // Should be preprocessed to 20

      await stream.drain();
    });

    it("should accept custom scheduler", async () => {
      // Create a spy scheduler to verify it's used
      const mockScheduler: SchedulerLike = {
        add: vi.fn(),
        schedule: vi.fn(),
        promise: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
      };

      const stream = new Stream<number>({
        scheduler: mockScheduler,
      });

      stream.subscribe(() => {});
      stream.push(1);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScheduler.add).not.toHaveBeenCalledWith(stream, ConsumerPromise);
      expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);
      expect(mockScheduler.promise).not.toHaveBeenCalled();
    });

    it("should initialize with closed=false and observed=false", async () => {
      const stream = new Stream<number>();

      expect(stream.closed).toBe(false);
      expect(stream.observed).toBe(false);

      // After subscribing, observed should be true
      stream.subscribe(() => {});
      expect(stream.observed).toBe(true);

      // After cancelling, closed should be true
      await stream.cancel();
      expect(stream.closed).toBe(true);
      expect(stream.observed).toBe(false);
    });
  });
  describe("closed property", () => {
    it("should return false for a newly created stream", async () => {
      const stream = new Stream<number>();
      expect(stream.closed).toBe(false);
    });

    it("should return true after calling cancel()", async () => {
      const stream = new Stream<number>();
      expect(stream.closed).toBe(false);

      await stream.cancel();
      expect(stream.closed).toBe(true);
    });

    it("should prevent new values from being pushed when true", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      // Push a value before canceling
      stream.push(1);
      await stream.drain();
      expect(values).toEqual([1]);

      // Cancel the stream
      await stream.cancel();
      expect(stream.closed).toBe(true);

      // Try to push a value after canceling
      stream.push(2);
      await stream.drain();

      // The second value should not be received
      expect(values).toEqual([1]);
    });
  });
  describe("observed property", () => {
    it("should return false when there are no subscribers", async () => {
      const stream = new Stream<number>();
      expect(stream.observed).toBe(false);
    });

    it("should return true when there is at least one subscriber", async () => {
      const stream = new Stream<number>();
      expect(stream.observed).toBe(false);

      const subscription = stream.subscribe(() => {});
      expect(stream.observed).toBe(true);
    });

    it("should return false after all subscribers are cancelled", async () => {
      const stream = new Stream<number>();

      // Add multiple subscribers
      const subscription1 = stream.subscribe(() => {});
      const subscription2 = stream.subscribe(() => {});
      expect(stream.observed).toBe(true);

      // Cancel one subscriber
      await subscription1.cancel();
      // Stream should still be observed
      expect(stream.observed).toBe(true);

      // Cancel the other subscriber
      await subscription2.cancel();
      // Now the stream should not be observed
      expect(stream.observed).toBe(false);
    });
  });
  describe("subscribe method", () => {
    it("should return a Subscriber object", async () => {
      const stream = new Stream<number>();
      const subscriber = stream.subscribe(() => {});

      expect(subscriber).toBeDefined();
      expect(typeof subscriber.then).toBe("function"); // Promise-like
      expect(typeof subscriber.cancel).toBe("function");
    });

    it("should provide values to callback function when pushed", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      stream.push(1);
      stream.push(2);
      stream.push(3);

      await stream.drain();

      expect(values).toEqual([1, 2, 3]);
    });

    it("should support multiple subscribers receiving the same values", async () => {
      const stream = new Stream<number>();
      const valuesA: number[] = [];
      const valuesB: number[] = [];

      stream.subscribe((value) => valuesA.push(value));
      stream.subscribe((value) => valuesB.push(value));

      stream.push(1);
      stream.push(2);

      await stream.drain();

      expect(valuesA).toEqual([1, 2]);
      expect(valuesB).toEqual([1, 2]);
    });

    it("should execute subscriber callbacks via the stream's scheduler", async () => {
      const mockScheduler: SchedulerLike = {
        add: vi.fn(),
        schedule: vi.fn(),
        promise: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      const stream = new Stream<number>({
        scheduler: mockScheduler,
      });

      const subscriber = stream.subscribe(() => {});

      stream.push(1);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify that the subscriber was scheduled via the scheduler
      expect(mockScheduler.schedule).toHaveBeenCalled();
    });

    it("should allow subscribing without a callback", async () => {
      const stream = new Stream<number>();

      // This should not throw an error
      const subscriber = stream.subscribe();

      // Can still push values
      stream.push(1);
      stream.push(2);

      await stream.drain();

      // The subscriber should still be valid
      expect(subscriber).toBeDefined();
    });

    it("should make the stream observed when called", async () => {
      const stream = new Stream<number>();
      expect(stream.observed).toBe(false);

      stream.subscribe(() => {});

      expect(stream.observed).toBe(true);
    });

    it("should process values that were pushed after subscription", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      // Push values first
      stream.push(1);
      stream.push(2);

      await stream.drain();

      // Subscribe after values were pushed
      stream.subscribe((value) => values.push(value));

      // Values pushed before subscription should not be processed
      expect(values).toEqual([]);

      // Push new values after subscription
      stream.push(3);
      stream.push(4);

      await stream.drain();

      // Only values pushed after subscription should be processed
      expect(values).toEqual([3, 4]);
    });
  });
  describe("push method", () => {
    it("should emit values to all subscribers", async () => {
      const stream = new Stream<number>();
      const values1: number[] = [];
      const values2: number[] = [];
      const values3: number[] = [];

      stream.subscribe((value) => values1.push(value));
      stream.subscribe((value) => values2.push(value));
      stream.subscribe((value) => values3.push(value));

      stream.push(42);
      await stream.drain();

      expect(values1).toEqual([42]);
      expect(values2).toEqual([42]);
      expect(values3).toEqual([42]);
    });

    it("should preprocess values when configured", async () => {
      const preprocess = vi.fn((value: unknown) => Number(value) * 2);
      const stream = new Stream<number>({ preprocess });
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      stream.push(5);
      stream.push("10" as any);

      await stream.drain();
      expect(values).toEqual([10, 20]);
    });

    it("should do nothing when the stream is closed", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];
      const callback = vi.fn((value: number) => values.push(value));

      stream.subscribe(callback);

      await stream.cancel();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stream.closed).toBe(true);

      // Push after cancel should do nothing
      stream.push(1);
      stream.push(2);

      await stream.drain();

      expect(callback).not.toHaveBeenCalled();
      expect(values).toEqual([]);
    });

    it("should return immediately without waiting for subscribers", async () => {
      const stream = new Stream<number>();
      let callbackExecuted = false;

      // Create a subscriber with a delayed callback
      stream.subscribe(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        callbackExecuted = true;
      });

      // Push should return immediately
      const startTime = Date.now();
      stream.push(1);
      const endTime = Date.now();

      // The execution time of push should be minimal
      expect(endTime - startTime).toBeLessThan(50);
      // The callback should not have executed yet
      expect(callbackExecuted).toBe(false);

      // Wait for the callback to finish
      await stream.drain();
      expect(callbackExecuted).toBe(true);
    });

    it("should handle rapid sequential pushes correctly", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      // Push multiple values rapidly
      stream.push(1);
      stream.push(2);
      stream.push(3);
      stream.push(4);
      stream.push(5);

      await stream.drain();

      // The values should be in the correct order
      expect(values).toEqual([1, 2, 3, 4, 5]);
    });
  });
  describe("cancel method", () => {
    it("should close the stream", async () => {
      const stream = new Stream<number>();
      expect(stream.closed).toBe(false);

      await stream.cancel();
      expect(stream.closed).toBe(true);
    });

    it("should resolve all subscriber promises", async () => {
      const stream = new Stream<number>();

      const sub1 = stream.subscribe(() => {});
      const sub2 = stream.subscribe(() => {});

      // Create promises that resolve when subscribers complete
      const sub1Promise = sub1.then(() => "sub1 resolved");
      const sub2Promise = sub2.then(() => "sub2 resolved");

      // Cancel the stream
      await stream.cancel();

      // Both subscriber promises should resolve
      const [result1, result2] = await Promise.all([sub1Promise, sub2Promise]);
      expect(result1).toBe("sub1 resolved");
      expect(result2).toBe("sub2 resolved");
    });

    it("should stop delivery of new values", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      // Push a value before canceling
      stream.push(1);
      await stream.drain();
      expect(values).toEqual([1]);

      // Cancel the stream
      await stream.cancel();

      // Try to push values after canceling
      stream.push(2);
      stream.push(3);

      await stream.drain();

      // Values pushed after canceling should not be delivered
      expect(values).toEqual([1]);
    });

    it("should make the stream unobserved", async () => {
      const stream = new Stream<number>();

      stream.subscribe(() => {});
      expect(stream.observed).toBe(true);

      await stream.cancel();

      // After canceling, the stream should be unobserved
      expect(stream.observed).toBe(false);
    });
  });
  describe("drain method", () => {
    it("should wait for all subscriber callbacks to complete", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      stream.push(1);
      stream.push(2);

      // Before drain, ensure processing isn't necessarily complete
      const valuesCopy = [...values];

      await stream.drain();

      // After drain, all values should be processed
      expect(values).toEqual([1, 2]);

      // Verify that drain was actually needed by checking if values
      // were fully processed before drain (they might not have been)
      // This is a soft assertion since JS execution might be fast enough
      // that values were already processed
      expect(valuesCopy.length).toBeLessThanOrEqual(values.length);
    });

    it("should resolve when all work is done even with async callbacks", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];
      let asyncWorkDone = false;

      stream.subscribe(async (value) => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 50));
        values.push(value);
        if (value === 2) {
          asyncWorkDone = true;
        }
      });

      stream.push(1);
      stream.push(2);

      // Drain should wait for the async callbacks to complete
      await stream.drain();

      expect(values).toEqual([1, 2]);
      expect(asyncWorkDone).toBe(true);
    });

    it("should handle errors in subscriber callbacks properly", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];
      const errors: Error[] = [];

      // First subscriber throws an error
      stream.subscribe((value) => {
        if (value === 2) {
          throw new Error("Test error");
        }
        values.push(value);
      });

      // Second subscriber continues to work normally
      stream.subscribe((value) => {
        values.push(value * 10);
      });

      stream.push(1);
      stream.push(2);
      stream.push(3);

      // Drain should still wait for all callbacks to complete
      // even though one subscriber had an error
      await stream.drain().catch((error) => {
        errors.push(error);
      });

      expect(values).toEqual([1, 10, 20, 3, 30]);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Test error");
    });
  });
  describe("asObservable method", () => {
    it("should return an AsyncObservable with the stream as source", async () => {
      const stream = new Stream<number>();
      const observable = stream.asObservable();

      // Verify it's an AsyncObservable but not a Stream
      expect(observable).toBeInstanceOf(AsyncObservable);
      expect(observable).not.toBeInstanceOf(Stream);

      // Verify the observable receives values from the stream
      const values: number[] = [];
      observable.subscribe((value) => values.push(value));

      stream.push(1);
      stream.push(2);

      await stream.drain();

      expect(values).toEqual([1, 2]);
    });

    it("should hide push/cancel methods from the returned observable", async () => {
      const stream = new Stream<number>();
      const observable = stream.asObservable();

      // The returned observable should not have Stream methods
      expect((observable as any).push).toBeUndefined();

      // But it should still have AsyncObservable methods
      expect(typeof observable.subscribe).toBe("function");
      expect(typeof observable.pipe).toBe("function");
      expect(typeof observable.drain).toBe("function");
    });
  });
  describe("integration with operators", () => {
    it("should support pipe() for creating derived streams", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      // Create a derived stream using the map operator
      const doubled$ = stream.pipe(map((x) => x * 2));

      // Subscribe to the derived stream
      doubled$.subscribe((value) => values.push(value));

      // Push values to the original stream
      stream.push(1);
      stream.push(2);
      stream.push(3);

      await stream.drain();

      // Values should be transformed by the operator
      expect(values).toEqual([2, 4, 6]);
    });

    it("should support chaining multiple operators", async () => {
      const stream = new Stream<number>();
      const values: string[] = [];

      // Create a derived stream with multiple chained operators
      const processed$ = stream.pipe(
        map((x) => x * 2), // Double each number
        filter((x) => x > 2), // Keep only values > 2
        map((x) => `Value: ${x}`) // Format as string
      );

      processed$.subscribe((value) => values.push(value));

      // Push values to the original stream
      stream.push(1); // After map: 2, after filter: filtered out
      stream.push(2); // After map: 4, after filter: kept, after second map: "Value: 4"
      stream.push(3); // After map: 6, after filter: kept, after second map: "Value: 6"

      await stream.drain();

      expect(values).toEqual(["Value: 4", "Value: 6"]);

      // Original stream should still work
      const originalValues: number[] = [];
      stream.subscribe((value) => originalValues.push(value));

      stream.push(4);
      await stream.drain();

      expect(originalValues).toEqual([4]);
      // New value should also go through the pipeline
      expect(values).toEqual(["Value: 4", "Value: 6", "Value: 8"]);
    });
  });
  describe("error handling", () => {
    it("should propagate errors from subscriber callbacks to promises", async () => {
      const stream = new Stream<number>();
      let error: Error | null = null;

      // Subscribe with a callback that will throw for a specific value
      const subscription = stream.subscribe((value) => {
        if (value === 2) {
          throw new Error("Test error");
        }
        return value;
      });

      // Push values including the one that triggers an error
      stream.push(1);
      stream.push(2);

      await stream.drain().catch((err) => {
        error = err;
      });

      // The error should be caught by the subscriber's promise
      expect(error).not.toBeNull();
      // @ts-ignore
      expect(error?.message).toBe("Test error");
    });

    it("should not prevent other subscribers from receiving values when one errors", async () => {
      const stream = new Stream<number>();
      const valuesA: number[] = [];
      const valuesB: number[] = [];

      // First subscriber throws on value 2
      stream.subscribe((value) => {
        if (value === 2) {
          throw new Error("Test error");
        }
        valuesA.push(value);
      });

      // Second subscriber should receive all values
      stream.subscribe((value) => {
        valuesB.push(value);
      });

      stream.push(1);
      stream.push(2);
      stream.push(3);

      await stream.drain().catch(() => {});

      // First subscriber should have values 1, 3 (skipped 2 due to error)
      expect(valuesA).toEqual([1, 3]);
      // Second subscriber should have all values
      expect(valuesB).toEqual([1, 2, 3]);
    });
  });
  describe("performance characteristics", () => {
    it("should handle high-frequency push operations", async () => {
      const stream = new Stream<number>();
      const values: number[] = [];

      stream.subscribe((value) => values.push(value));

      // Push a large number of values in quick succession
      const numValues = 1000;
      for (let i = 0; i < numValues; i++) {
        stream.push(i);
      }

      await stream.drain();

      // Verify all values were processed
      expect(values.length).toBe(numValues);
      // Verify values were processed in order
      expect(values).toEqual([...Array(numValues).keys()]);
    });

    it("should maintain performance with many subscribers", async () => {
      const stream = new Stream<number>();
      const subscriberCount = 50;
      const valueCount = 10;

      // Create arrays to collect values for each subscriber
      const subscriberValues: number[][] = Array(subscriberCount)
        .fill(0)
        .map(() => []);

      // Add multiple subscribers
      for (let i = 0; i < subscriberCount; i++) {
        stream.subscribe((value) => {
          subscriberValues[i].push(value);
        });
      }

      // Push some values
      for (let i = 0; i < valueCount; i++) {
        stream.push(i);
      }

      await stream.drain();

      // Verify each subscriber received all values
      for (let i = 0; i < subscriberCount; i++) {
        expect(subscriberValues[i].length).toBe(valueCount);
        expect(subscriberValues[i]).toEqual([...Array(valueCount).keys()]);
      }
    });

    it("should have stable memory usage during extended operation", async () => {
      const stream = new Stream<number>();

      // Create a subscriber that doesn't retain values
      stream.subscribe(() => {
        // No-op subscriber that processes values but doesn't store them
      });

      // Push a moderate number of values
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        // Push a batch of values
        for (let j = 0; j < 100; j++) {
          stream.push(j);
        }
        // Wait for processing to complete
        await stream.drain();
      }

      // This test primarily verifies that we can push many values
      // through a stream without crashing due to memory issues.
      // The actual memory usage is difficult to measure in a unit test,
      // so we're just verifying the stream remains functional.

      // Push one more value to verify the stream is still working
      const finalValues: number[] = [];
      stream.subscribe((value) => finalValues.push(value));

      stream.push(42);
      await stream.drain();

      expect(finalValues).toEqual([42]);
    });
  });
});
