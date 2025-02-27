import { describe, it, expect, vi } from "vitest";
import { AsyncObservable } from "../lib/observable";

describe("AsyncObservable", () => {
  describe("Construction and basic behavior", () => {
    it("should construct with generator function", () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });
      expect(observable).toBeInstanceOf(AsyncObservable);
    });

    it("should create new generator for each subscription", async () => {
      const generatorCalls = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        generatorCalls();
        yield 1;
      });

      await observable.subscribe();
      await observable.subscribe();
      expect(generatorCalls).toHaveBeenCalledTimes(2);
    });

    it("should maintain independence between subscribers", async () => {
      const results: Array<number[]> = [];
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create two subscribers and collect their values
      const collect = async () => {
        const values: number[] = [];
        await observable.subscribe((value) => values.push(value));
        return values;
      };

      const [result1, result2] = await Promise.all([collect(), collect()]);
      expect(result1).toEqual([1, 2, 3]);
      expect(result2).toEqual([1, 2, 3]);
    });

    it("should handle empty/no-op generators", async () => {
      const observable = new AsyncObservable<number>(async function* () {});
      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));
      expect(values).toEqual([]);
    });
  });

  describe("Subscription management", () => {
    it("should track active subscribers", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const sub1 = observable.subscribe();
      const sub2 = observable.subscribe();

      expect(observable._subscribers.size).toBe(2);

      await sub1.cancel();
      expect(observable._subscribers.size).toBe(1);

      await sub2.cancel();
      expect(observable._subscribers.size).toBe(0);
    });

    it("should remove completed subscribers", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const subscriber = observable.subscribe();
      expect(observable._subscribers.size).toBe(1);

      await subscriber;
      expect(observable._subscribers.size).toBe(0);
    });

    it("should remove errored subscribers", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        throw new Error("Test error");
      });

      const subscriber = observable.subscribe();
      expect(observable._subscribers.size).toBe(1);

      await expect(observable).rejects.toThrow("Test error");
      await expect(subscriber).rejects.toThrow("Test error");
      expect(observable._subscribers.size).toBe(0);
    });

    it("should remove cancelled subscribers", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        await new Promise((resolve) => setTimeout(resolve, 0)); // Force async
        yield 2;
      });

      const subscriber = observable.subscribe();
      expect(observable._subscribers.size).toBe(1);

      await subscriber.cancel();
      expect(observable._subscribers.size).toBe(0);
    });

    it("should handle multiple concurrent subscribers", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield 2;
      });

      const collect = async () => {
        const values: number[] = [];
        await observable.subscribe((value) => values.push(value));
        return values;
      };

      const [result1, result2, result3] = await Promise.all([collect(), collect(), collect()]);

      expect(result1).toEqual([1, 2]);
      expect(result2).toEqual([1, 2]);
      expect(result3).toEqual([1, 2]);
    });
  });

  describe("AsyncIterable behavior", () => {
    it("should support for-await-of iteration", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const values: number[] = [];
      for await (const value of observable) {
        values.push(value);
      }
      expect(values).toEqual([1, 2, 3]);
    });

    it("should cleanup after for-await-of completion", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          cleanupFn();
        }
      });

      for await (const _ of observable) {
        // consume
      }
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should handle early break from for-await-of", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
        } finally {
          cleanupFn();
        }
      });

      const values: number[] = [];
      for await (const value of observable) {
        values.push(value);
        if (value === 2) break;
      }

      expect(values).toEqual([1, 2]);
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should handle errors during iteration", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw new Error("Test error");
      });

      const values: number[] = [];
      try {
        for await (const value of observable) {
          values.push(value);
        }
      } catch (error) {
        expect(error.message).toBe("Test error");
      }
      expect(values).toEqual([1]);

      await expect(observable).rejects.toThrow("Test error");
    });

    it("should support Symbol.asyncDispose in iterator", async () => {
      if (typeof Symbol.asyncDispose !== "symbol") {
        return;
      }

      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
        } finally {
          cleanupFn();
        }
      });

      const sub = observable.subscribe();
      await sub.next();
      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe("PromiseLike behavior", () => {
    it("should resolve when all subscribers complete", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const sub1 = observable.subscribe();
      const sub2 = observable.subscribe();
      await expect(observable).resolves.toBeUndefined();
      expect([sub1, sub2]).toBeDefined();
    });

    it("should reject if any subscriber errors", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        throw new Error("Test error");
      });

      const sub = observable.subscribe();
      const next = sub.next();
      await expect(observable).rejects.toThrow("Test error");
      await expect(next).resolves.toBeDefined();
    });

    it("should support .then() chaining", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const result = await observable.then(() => "done");
      expect(result).toBe("done");
    });

    it("should support .catch() error handling", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        throw new Error("Test error");
      });

      const sub = observable.subscribe();
      const error = observable.catch((err) => err.message);
      await sub.next();
      await expect(error).resolves.toBe("Test error");
    });

    it("should support .finally() cleanup", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      await observable.finally(cleanupFn);
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should track multiple subscriber states correctly", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield 2;
      });

      const sub1 = observable.subscribe();
      const sub2 = observable.subscribe();

      await Promise.all([sub1, sub2]);
      await expect(observable).resolves.toBeUndefined();
    });
  });

  describe("Pipe operator", () => {
    it("should support empty pipe() call", () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const result = observable.pipe();
      expect(result).toBe(observable);
    });

    it("should support single operator", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const doubled = observable.pipe(
        (source) =>
          new AsyncObservable<number>(async function* () {
            for await (const value of source) {
              yield value * 2;
            }
          })
      );

      const values: number[] = [];
      await doubled.subscribe((value) => values.push(value));
      expect(values).toEqual([2]);
    });

    it("should support operator chaining", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const result = observable.pipe(
        (source) =>
          new AsyncObservable<number>(async function* () {
            for await (const value of source) {
              yield value * 2;
            }
          }),
        (source) =>
          new AsyncObservable<number>(async function* () {
            for await (const value of source) {
              yield value + 1;
            }
          })
      );

      const values: number[] = [];
      await result.subscribe((value) => values.push(value));
      expect(values).toEqual([3]);
    });

    it("should maintain type safety through pipe", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const result = observable.pipe(
        (source) =>
          new AsyncObservable<string>(async function* () {
            for await (const value of source) {
              yield value.toString();
            }
          })
      );

      const values: string[] = [];
      await result.subscribe((value) => values.push(value));
      expect(values).toEqual(["1"]);
    });

    it("should handle errors in operators", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const result = observable.pipe(
        (source) =>
          new AsyncObservable<number>(async function* () {
            throw new Error("Operator error");
          })
      );

      await expect(result.subscribe()).rejects.toThrow("Operator error");
    });
  });

  describe("Static from() method", () => {
    it("should create observable from AsyncIterable", async () => {
      async function* source() {
        yield 1;
        yield 2;
      }

      const observable = AsyncObservable.from(source());
      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));
      expect(values).toEqual([1, 2]);
    });

    it("should create observable from Promise", async () => {
      const promise = Promise.resolve(1);
      const observable = AsyncObservable.from(promise);

      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));
      expect(values).toEqual([1]);
    });

    it("should create observable from array", async () => {
      const array = [1, 2, 3];
      const observable = AsyncObservable.from(array);

      const values: number[] = [];
      await observable.subscribe((value) => values.push(value));
      expect(values).toEqual([1, 2, 3]);
    });

    it("should handle errors from source", async () => {
      const errorPromise = Promise.reject(new Error("Source error"));
      const observable = AsyncObservable.from(errorPromise);

      await expect(observable.subscribe()).rejects.toThrow("Source error");
    });
  });

  describe("Disposable behavior (when symbols available)", () => {
    it("should implement Symbol.dispose when available", () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });
      if (typeof Symbol.dispose === "symbol") {
        expect(observable[Symbol.dispose]).toBeDefined();
        expect(typeof observable[Symbol.dispose]).toBe("function");
      }
    });

    it("should implement Symbol.asyncDispose when available", () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });
      if (typeof Symbol.asyncDispose === "symbol") {
        expect(observable[Symbol.asyncDispose]).toBeDefined();
        expect(typeof observable[Symbol.asyncDispose]).toBe("function");
      }
    });

    it("should properly dispose resources via Symbol.dispose", async () => {
      if (typeof Symbol.dispose !== "symbol") {
        return;
      }

      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          cleanupFn();
        }
      });

      const collect = async () => {
        const sub = observable.subscribe();
        await sub.next();
      };

      await Promise.all([collect(), collect()]);
      await observable[Symbol.dispose]();
      expect(cleanupFn).toHaveBeenCalledTimes(2);
    });

    it("should properly dispose resources via Symbol.asyncDispose", async () => {
      if (typeof Symbol.asyncDispose !== "symbol") {
        return;
      }

      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
        } finally {
          cleanupFn();
        }
      });

      const collect = async () => {
        const sub = observable.subscribe();
        await sub.next();
      };

      await Promise.all([collect(), collect()]);
      await observable[Symbol.asyncDispose]();
      expect(cleanupFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error handling", () => {
    it("should propagate generator errors", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        throw new Error("Generator error");
      });

      await expect(observable.subscribe()).rejects.toThrow("Generator error");
    });

    it("should propagate subscriber errors", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const error = new Error("Subscriber error");
      await expect(
        observable.subscribe(() => {
          throw error;
        })
      ).rejects.toThrow("Subscriber error");
    });

    it("should maintain consistent state after errors", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        throw new Error("Test error");
      });

      try {
        await observable.subscribe();
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      expect(observable._subscribers.size).toBe(0);
    });

    it("should cleanup resources after errors", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          throw new Error("Test error");
        } finally {
          cleanupFn();
        }
      });

      try {
        await observable.subscribe();
      } catch (error) {
        expect(error.message).toBe("Test error");
      }
      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe("Resource management", () => {
    it("should cleanup completed subscribers", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
        } finally {
          cleanupFn();
        }
      });

      await observable.subscribe();
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should cleanup errored subscribers", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          throw new Error("Test error");
        } finally {
          cleanupFn();
        }
      });

      try {
        await observable.subscribe();
      } catch (error) {
        expect(error.message).toBe("Test error");
      }
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should cleanup cancelled subscribers", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          await new Promise((resolve) => setTimeout(resolve, 0));
          yield 2;
        } finally {
          cleanupFn();
        }
      });

      const subscriber = observable.subscribe();
      await subscriber.cancel();
      expect(cleanupFn).toHaveBeenCalled();
    });

    it("should handle concurrent cleanup operations", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          await new Promise((resolve) => setTimeout(resolve, 0));
          yield 2;
        } finally {
          cleanupFn();
        }
      });

      const subscribers = [observable.subscribe(), observable.subscribe(), observable.subscribe()];

      await Promise.all(subscribers.map((s) => s.cancel()));
      expect(cleanupFn).toHaveBeenCalledTimes(3);
    });

    it("should not leak memory in any termination scenario", async () => {
      const cleanupFn = vi.fn();
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
        } finally {
          cleanupFn();
        }
      });

      // Complete normally
      await observable.subscribe();

      // Error
      try {
        await observable.subscribe(() => {
          throw new Error("Test error");
        });
      } catch {}

      // Unsubscribe
      const sub = observable.subscribe();
      await sub.cancel();

      expect(cleanupFn).toHaveBeenCalledTimes(3);
      expect(observable._subscribers.size).toBe(0);
    });
  });
});
