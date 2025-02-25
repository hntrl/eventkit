import { describe, it, expect, vi, beforeEach } from "vitest";
import { Subscriber } from "../lib/observable";

describe("Subscriber", () => {
  // Helper to create a mock async generator
  async function* createMockGenerator() {
    yield 1;
    yield 2;
    yield 3;
  }

  const consume = async (subscriber: Subscriber<number>) => {
    const values: number[] = [];
    for await (const value of subscriber) {
      values.push(value);
    }
    return values;
  };

  describe("AsyncIterable behavior", () => {
    it("should yield all values from the generator in order", async () => {
      const values: number[] = [];
      const subscriber = new Subscriber(createMockGenerator());

      for await (const value of subscriber) {
        values.push(value);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it("should handle early termination via break in for-await-of", async () => {
      const values: number[] = [];
      const subscriber = new Subscriber(createMockGenerator());

      for await (const value of subscriber) {
        values.push(value);
        if (value === 2) break;
      }

      expect(values).toEqual([1, 2]);
    });

    it("should handle early termination via return in for-await-of", async () => {
      const values: number[] = [];
      const subscriber = new Subscriber(createMockGenerator());

      const loopPromise = (async () => {
        for await (const value of subscriber) {
          values.push(value);
          if (value === 2) return;
        }
      })();

      await loopPromise;
      expect(values).toEqual([1, 2]);
    });

    it("should handle early termination via throw in for-await-of", async () => {
      const values: number[] = [];
      const subscriber = new Subscriber(createMockGenerator());

      try {
        for await (const value of subscriber) {
          values.push(value);
          if (value === 2) throw new Error("Test error");
        }
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      expect(values).toEqual([1, 2]);
    });

    it("should properly cleanup resources when iterator is done", async () => {
      const mockReturn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          mockReturn();
        }
      }

      const subscriber = new Subscriber(generator());
      await consume(subscriber);

      expect(mockReturn).toHaveBeenCalled();
    });

    it("should maintain value sequence integrity across multiple iterations", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      const iterations: number[][] = [];

      // First iteration
      const values1 = await consume(subscriber);
      iterations.push(values1);

      // Second iteration (should be independent)
      const values2 = await consume(subscriber);
      iterations.push(values2);

      expect(iterations[0]).toEqual([1, 2, 3]);
      expect(iterations[1]).toEqual([]);
    });
  });

  describe("PromiseLike behavior", () => {
    it("should resolve when generator completes normally", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      await consume(subscriber);
      await expect(subscriber).resolves.toBeUndefined();
    });

    it("should reject when generator throws an error", async () => {
      async function* errorGenerator() {
        throw new Error("Test error");
      }

      const subscriber = new Subscriber(errorGenerator());
      await expect(consume(subscriber)).rejects.toThrow("Test error");
      await expect(subscriber).rejects.toThrow("Test error");
    });

    it("should support chaining with .then()", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      const result = subscriber.then(() => "done");
      await consume(subscriber);
      await expect(result).resolves.toBe("done");
    });

    it("should support error handling with .catch()", async () => {
      async function* errorGenerator() {
        throw new Error("Test error");
      }

      const subscriber = new Subscriber(errorGenerator());
      await expect(consume(subscriber)).rejects.toThrowError("Test error");
      const error = subscriber.catch((err) => err.message);
      await expect(error).resolves.toBe("Test error");
    });

    it("should support cleanup with .finally()", async () => {
      const finallyFn = vi.fn();
      const subscriber = new Subscriber(createMockGenerator());

      const finallyPm = subscriber.finally(finallyFn);
      await consume(subscriber);
      await finallyPm;
      expect(finallyFn).toHaveBeenCalled();
    });

    it("should maintain proper state after promise resolution", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      await consume(subscriber);

      // Should be safe to await multiple times
      await expect(subscriber).resolves.toBeUndefined();
    });
  });

  describe("SubscriptionLike behavior", () => {
    it("should resolve cleanup promise after unsubscribe", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      await expect(subscriber.unsubscribe()).resolves.toBeUndefined();
    });

    it("should handle errors during unsubscribe gracefully", async () => {
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          throw new Error("Cleanup error");
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.next();
      // subscriber.unsubscribe();
      // console.log(await subscriber.unsubscribe());
      await expect(subscriber.unsubscribe()).rejects.toThrow("Cleanup error");
    });

    it("should prevent further value emission after unsubscribe", async () => {
      const values: number[] = [];
      const subscriber = new Subscriber(createMockGenerator());

      const iterationPromise = (async () => {
        for await (const value of subscriber) {
          values.push(value);
          if (value === 2) {
            await subscriber.unsubscribe();
          }
        }
      })();

      await iterationPromise;
      expect(values).toEqual([1, 2]);
    });

    it("should properly cleanup resources after unsubscribe", async () => {
      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.next();
      await subscriber.unsubscribe();
      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe("Disposable behavior (when symbols available)", () => {
    it("should implement Symbol.dispose when available", () => {
      const subscriber = new Subscriber(createMockGenerator());
      if (typeof Symbol.dispose === "symbol") {
        expect(subscriber[Symbol.dispose]).toBeDefined();
        expect(typeof subscriber[Symbol.dispose]).toBe("function");
      }
    });

    it("should implement Symbol.asyncDispose when available", () => {
      const subscriber = new Subscriber(createMockGenerator());
      if (typeof Symbol.asyncDispose === "symbol") {
        expect(subscriber[Symbol.asyncDispose]).toBeDefined();
        expect(typeof subscriber[Symbol.asyncDispose]).toBe("function");
      }
    });

    it("should properly dispose resources via Symbol.dispose", async () => {
      if (typeof Symbol.dispose !== "symbol") {
        return;
      }

      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.next();
      await subscriber[Symbol.dispose]();
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should properly dispose resources via Symbol.asyncDispose", async () => {
      if (typeof Symbol.asyncDispose !== "symbol") {
        return;
      }

      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.next();
      await subscriber[Symbol.asyncDispose]();
      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should properly propagate generator errors", async () => {
      async function* errorGenerator() {
        yield 1;
        throw new Error("Generator error");
      }

      const subscriber = new Subscriber(errorGenerator());
      const values: number[] = [];

      try {
        for await (const value of subscriber) {
          values.push(value);
        }
      } catch (error) {
        expect(error.message).toBe("Generator error");
        expect(values).toEqual([1]);
      }

      await expect(subscriber).rejects.toThrow("Generator error");
    });

    it("should properly handle errors in user callbacks", async () => {
      const subscriber = new Subscriber(createMockGenerator());
      const error = new Error("Callback error");

      const promise = subscriber.then(() => {
        throw error;
      });

      await consume(subscriber);

      await expect(promise).rejects.toThrow("Callback error");
    });

    it("should maintain consistent state after error", async () => {
      async function* errorGenerator() {
        yield 1;
        throw new Error("Test error");
      }

      const subscriber = new Subscriber(errorGenerator());
      const values: number[] = [];

      try {
        for await (const value of subscriber) {
          values.push(value);
        }
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      // Should not be able to get more values
      for await (const value of subscriber) {
        values.push(value);
      }

      expect(values).toEqual([1]);
      await expect(subscriber).rejects.toThrow("Test error");
    });

    it("should cleanup resources after error", async () => {
      const cleanupFn = vi.fn();
      async function* errorGenerator() {
        try {
          yield 1;
          throw new Error("Test error");
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(errorGenerator());

      try {
        await consume(subscriber);
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      expect(cleanupFn).toHaveBeenCalled();
      await expect(subscriber).rejects.toThrow("Test error");
    });
  });

  describe("Resource management", () => {
    it("should not leak memory on normal completion", async () => {
      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await consume(subscriber);

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("should not leak memory on error", async () => {
      const cleanupFn = vi.fn();
      async function* errorGenerator() {
        try {
          yield 1;
          throw new Error("Test error");
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(errorGenerator());

      try {
        await consume(subscriber);
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      expect(cleanupFn).toHaveBeenCalledTimes(1);
      await expect(subscriber).rejects.toThrow("Test error");
    });

    it("should not leak memory on unsubscribe", async () => {
      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.next();
      await subscriber.unsubscribe();

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("should not need to cleanup resources if generator has not been called", async () => {
      const cleanupFn = vi.fn();
      async function* generator() {
        try {
          yield* createMockGenerator();
        } finally {
          cleanupFn();
        }
      }

      const subscriber = new Subscriber(generator());
      await subscriber.unsubscribe();

      expect(cleanupFn).not.toHaveBeenCalled();
    });

    it("should not continue execution after unsubscribe", async () => {
      const executionPoints: string[] = [];
      async function* generator() {
        try {
          executionPoints.push("start");
          yield 1;
          executionPoints.push("after-yield-1");
          yield 2;
          executionPoints.push("after-yield-2");
          yield 3;
          executionPoints.push("after-yield-3");
        } finally {
          executionPoints.push("cleanup");
        }
      }

      const subscriber = new Subscriber(generator());
      const values: number[] = [];

      for await (const value of subscriber) {
        values.push(value);
        if (value === 2) {
          await subscriber.unsubscribe();
          break;
        }
      }

      expect(values).toEqual([1, 2]);
      expect(executionPoints).toEqual(["start", "after-yield-1", "cleanup"]);
    });

    it("should handle concurrent operations safely", async () => {
      const subscriber = new Subscriber(createMockGenerator());

      // Create multiple concurrent operations
      const operations = [subscriber[Symbol.asyncIterator]().next(), subscriber.unsubscribe(), subscriber[Symbol.asyncIterator]().next()];

      // All operations should complete without throwing
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });
});
