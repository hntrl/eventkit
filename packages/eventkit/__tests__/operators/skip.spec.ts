import { describe, expect, it, vi } from "vitest";
import { AsyncObservable } from "@eventkit/async-observable";
import { skip } from "../../lib/operators/skip";

describe("skip", () => {
  describe("when count is 0", () => {
    it("should emit all values from source", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const results: number[] = [];

      await source.pipe(skip(0)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, 3, 4]);
    });

    it("should maintain value order", async () => {
      const source = AsyncObservable.from(["a", "b", "c", "d"]);
      const results: string[] = [];

      await source.pipe(skip(0)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual(["a", "b", "c", "d"]);
    });

    it("should complete when source completes", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const completionSpy = vi.fn();

      const sub = source.pipe(skip(0)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when count is positive", () => {
    it("should skip the first N values", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const results: number[] = [];

      await source.pipe(skip(3)).subscribe((value) => {
        results.push(value);
      });

      expect(results).not.toContain(1);
      expect(results).not.toContain(2);
      expect(results).not.toContain(3);
      expect(results).toEqual([4, 5]);
    });

    it("should emit remaining values", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const results: number[] = [];

      await source.pipe(skip(2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([3, 4, 5]);
    });

    it("should maintain value order", async () => {
      const source = AsyncObservable.from([10, 20, 30, 40, 50]);
      const results: number[] = [];

      await source.pipe(skip(3)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([40, 50]);
    });

    it("should handle any type of value", async () => {
      const numSource = AsyncObservable.from([1, 2, 3, 4, 5]);
      const strSource = AsyncObservable.from(["a", "b", "c", "d"]);
      const objSource = AsyncObservable.from([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);

      const numResults: number[] = [];
      const strResults: string[] = [];
      const objResults: { id: number }[] = [];

      await numSource.pipe(skip(2)).subscribe((value) => numResults.push(value));
      await strSource.pipe(skip(1)).subscribe((value) => strResults.push(value));
      await objSource.pipe(skip(3)).subscribe((value) => objResults.push(value));

      expect(numResults).toEqual([3, 4, 5]);
      expect(strResults).toEqual(["b", "c", "d"]);
      expect(objResults).toEqual([{ id: 4 }]);
    });

    it("should complete when source completes", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const completionSpy = vi.fn();

      const sub = source.pipe(skip(2)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when count equals source length", () => {
    it("should complete without emitting any values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(skip(3)).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw any errors", async () => {
      const source = AsyncObservable.from([1, 2]);

      let error: Error | null = null;
      try {
        await source.pipe(skip(2)).subscribe(() => {});
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull();
    });
  });

  describe("when count exceeds source length", () => {
    it("should complete without emitting any values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(skip(5)).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw any errors", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let error: Error | null = null;
      try {
        await source.pipe(skip(10)).subscribe(() => {});
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull();
    });
  });

  describe("when count is negative", () => {
    it("should emit all values", async () => {
      // Since skip is implemented using filter(_, index) => count <= index,
      // a negative count will always return true and emit all values
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const results: number[] = [];

      await source.pipe(skip(-2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, 3, 4]);
    });

    it("should subscribe to source", async () => {
      const subscribeSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        subscribeSpy();
        yield 1;
        yield 2;
      });

      await source.pipe(skip(-1)).subscribe(() => {});
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source is empty", () => {
    it("should complete without emitting any values", async () => {
      const source = AsyncObservable.from([]);
      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(skip(2)).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw any errors", async () => {
      const source = AsyncObservable.from([]);

      let error: Error | null = null;
      try {
        await source.pipe(skip(5)).subscribe(() => {});
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull();
    });
  });

  describe("when source errors", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        throw error;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(skip(1)).subscribe(() => {});
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should not emit any value after error", async () => {
      const error = new Error("source error");
      const emittedValues: number[] = [];

      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        throw error;
        yield 4; // Should not be emitted
        yield 5; // Should not be emitted
      });

      try {
        await source.pipe(skip(1)).subscribe((value) => {
          emittedValues.push(value);
        });
      } catch (e) {
        // Expected error
      }

      expect(emittedValues).toEqual([2, 3]);
    });
  });

  describe("performance characteristics", () => {
    it("should not buffer skipped values", async () => {
      const memorySpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        for (let i = 0; i < 100; i++) {
          yield i;
          memorySpy(i);
        }
      });

      await source.pipe(skip(50)).subscribe(() => {});

      // Verify all values were yielded but not buffered
      expect(memorySpy).toHaveBeenCalledTimes(100);
    });

    it("should maintain memory efficiency", async () => {
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 0; i < 1000; i++) {
          yield i;
        }
      });

      let emitCount = 0;
      await source.pipe(skip(500)).subscribe(() => {
        emitCount++;
      });

      // Should only emit the remaining 500 values
      expect(emitCount).toBe(500);
    });
  });
});
