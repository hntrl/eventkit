import { describe, expect, it, vi } from "vitest";
import { AsyncObservable } from "@eventkit/async-observable";
import { pairwise } from "../../lib/operators/pairwise";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("pairwise", () => {
  describe("when source emits values", () => {
    it("should emit pairs of consecutive values", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const results: [number, number][] = [];

      await source.pipe(pairwise()).subscribe((pair) => {
        results.push(pair);
      });

      expect(results).toEqual([
        [1, 2],
        [2, 3],
        [3, 4],
      ]);
    });

    it("should skip the first value (no previous value)", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const results: [string, string][] = [];

      await source.pipe(pairwise()).subscribe((pair) => {
        results.push(pair);
      });

      // First value "a" is skipped, only pairs ["a", "b"] and ["b", "c"] are emitted
      expect(results.length).toBe(2);
      expect(results[0][0]).toBe("a");
      expect(results[0][1]).toBe("b");
    });

    it("should handle any type of value", async () => {
      const numSource = AsyncObservable.from([1, 2, 3]);
      const strSource = AsyncObservable.from(["a", "b", "c"]);
      const objSource = AsyncObservable.from([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const numResults: [number, number][] = [];
      const strResults: [string, string][] = [];
      const objResults: [{ id: number }, { id: number }][] = [];

      await numSource.pipe(pairwise()).subscribe((pair) => numResults.push(pair));
      await strSource.pipe(pairwise()).subscribe((pair) => strResults.push(pair));
      await objSource.pipe(pairwise()).subscribe((pair) => objResults.push(pair));

      expect(numResults).toEqual([
        [1, 2],
        [2, 3],
      ]);
      expect(strResults).toEqual([
        ["a", "b"],
        ["b", "c"],
      ]);
      expect(objResults[0][0]).toEqual({ id: 1 });
      expect(objResults[0][1]).toEqual({ id: 2 });
      expect(objResults[1][0]).toEqual({ id: 2 });
      expect(objResults[1][1]).toEqual({ id: 3 });
    });

    it("should maintain value order in pairs", async () => {
      const source = AsyncObservable.from([5, 10, 15, 20]);
      const results: [number, number][] = [];

      await source.pipe(pairwise()).subscribe((pair) => {
        results.push(pair);
      });

      expect(results[0][0]).toBe(5); // First in first pair is 5
      expect(results[0][1]).toBe(10); // Second in first pair is 10
      expect(results[1][0]).toBe(10); // First in second pair is 10
      expect(results[1][1]).toBe(15); // Second in second pair is 15
    });

    it("should handle multiple emissions", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(10);
        yield 2;
        await delay(10);
        yield 3;
        await delay(10);
        yield 4;
      });

      const results: [number, number][] = [];
      await source.pipe(pairwise()).subscribe((pair) => {
        results.push(pair);
      });

      expect(results).toEqual([
        [1, 2],
        [2, 3],
        [3, 4],
      ]);
    });

    it("should complete when source completes", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const completionSpy = vi.fn();

      const sub = source.pipe(pairwise()).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source is empty", () => {
    it("should complete without emitting any values", async () => {
      const source = AsyncObservable.from([]);
      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(pairwise()).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw any errors", async () => {
      const source = AsyncObservable.from([]);

      let error: Error | null = null;
      try {
        await source.pipe(pairwise()).subscribe(() => {});
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull();
    });
  });

  describe("when source emits only one value", () => {
    it("should complete without emitting any values", async () => {
      const source = AsyncObservable.from([42]);
      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(pairwise()).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw any errors", async () => {
      const source = AsyncObservable.from([42]);

      let error: Error | null = null;
      try {
        await source.pipe(pairwise()).subscribe(() => {});
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
        await source.pipe(pairwise()).subscribe(() => {});
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should not emit any value after error", async () => {
      const error = new Error("source error");
      const emittedValues: [number, number][] = [];

      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        throw error;
        yield 4; // Should not be emitted
        yield 5; // Should not be emitted
      });

      try {
        await source.pipe(pairwise()).subscribe((pair) => {
          emittedValues.push(pair);
        });
      } catch (e) {
        // Expected error
      }

      expect(emittedValues).toEqual([
        [1, 2],
        [2, 3],
      ]);
    });
  });

  describe("performance characteristics", () => {
    it("should not buffer values unnecessarily", async () => {
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 0; i < 1000; i++) {
          yield i;
        }
      });

      let emitCount = 0;
      await source.pipe(pairwise()).subscribe(() => {
        emitCount++;
      });

      // One less than source emissions
      expect(emitCount).toBe(999);
    });

    it("should maintain memory efficiency", async () => {
      const memorySpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        let prev: number | null = null;
        for (let i = 0; i < 100; i++) {
          yield i;
          // Check that only one previous value is stored
          memorySpy(prev);
          prev = i;
        }
      });

      await source.pipe(pairwise()).subscribe(() => {});

      // Memory spy should have been called with null initially
      expect(memorySpy).toHaveBeenCalledWith(null);

      // And then with increasing values as they're processed
      for (let i = 0; i < 99; i++) {
        expect(memorySpy).toHaveBeenCalledWith(i);
      }
    });
  });
});
