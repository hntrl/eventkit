import { AsyncObservable } from "@eventkit/async-observable";
import { count } from "../../lib/operators/count";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("count", () => {
  describe("when source completes", () => {
    it("should emit final count", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source.pipe(count()).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([5]);
    });

    it("should complete after emitting count", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const completionSpy = vi.fn();
      const sub = source.pipe(count()).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source emits no values", () => {
    it("should emit 0", async () => {
      const source = AsyncObservable.from([]);

      const result: number[] = [];
      await source.pipe(count()).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([0]);
    });
  });

  describe("when source emits multiple values", () => {
    it("should count all values when no predicate is provided", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source.pipe(count()).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([5]);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn();

      await source
        .pipe(
          count((value, index) => {
            indexSpy(index);
            return true;
          })
        )
        .subscribe(() => {});

      expect(indexSpy).toHaveBeenCalledTimes(3);
      expect(indexSpy).toHaveBeenNthCalledWith(1, 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, 2);
    });
  });

  describe("when predicate is provided", () => {
    it("should only count values that satisfy predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source
        .pipe(
          count((value) => value % 2 === 0) // Only count even numbers
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual([2]); // Only 2 and 4 are even
    });

    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn().mockReturnValue(true);

      await source.pipe(count(predicateSpy)).subscribe(() => {});

      expect(predicateSpy).toHaveBeenCalledTimes(3);
      expect(predicateSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(predicateSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(predicateSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should handle predicate returning false for all values", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source
        .pipe(
          count(() => false) // Predicate always returns false
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual([0]); // No values counted
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("test error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(5);
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(count()).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });
  });
});
