import { AsyncObservable } from "@eventkit/async-observable";
import { every } from "../../lib/operators/every";
import { vi, describe, it, expect } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";

describe("every", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(every((x: number) => x > 0));
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when all values satisfy the predicate", () => {
    it("should emit true when all values pass", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(every((x) => x > 0));
      expect(result).toBe(true);
    });

    it("should complete after emitting true", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const completionSpy = vi.fn();

      const sub = source.pipe(every((x) => x > 0)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([2, 4, 6, 8]);
      const result = await source.pipe(every((x) => x % 2 === 0));
      expect(result).toBe(true);
    });

    it("should handle empty observables (emit true)", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(every((x) => !!x));
      expect(result).toBe(true);
    });
  });

  describe("when any value fails the predicate", () => {
    it("should emit false immediately when a value fails", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(every((x) => x <= 3));
      expect(result).toBe(false);
    });

    it("should cancel the source observable after emitting false", async () => {
      const cancelSpy = vi.fn();
      const nextSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 4; // This fails the predicate
          yield 3;
          nextSpy();
          yield 5;
        } finally {
          cancelSpy();
        }
      });

      await source.pipe(every((x) => x <= 3));
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([2, 4, 5, 8]);
      const result = await source.pipe(every((x) => x % 2 === 0));
      expect(result).toBe(false);
    });

    it("should handle the first value failing", async () => {
      const source = AsyncObservable.from([0, 2, 4, 6]);
      const result = await source.pipe(every((x) => x > 0));
      expect(result).toBe(false);
    });

    it("should handle a middle value failing", async () => {
      const source = AsyncObservable.from([2, 4, 5, 6, 8]);
      const result = await source.pipe(every((x) => x % 2 === 0));
      expect(result).toBe(false);
    });

    it("should handle the last value failing", async () => {
      const source = AsyncObservable.from([2, 4, 6, 7]);
      const result = await source.pipe(every((x) => x % 2 === 0));
      expect(result).toBe(false);
    });
  });

  describe("when predicate throws an error", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("predicate error");
      const source = AsyncObservable.from([1, 2, 3]);

      let caughtError: Error | null = null;
      try {
        await source.pipe(
          every(() => {
            throw error;
          })
        );
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should cancel the source observable", async () => {
      const error = new Error("predicate error");
      const cancelSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
        } finally {
          cancelSpy();
        }
      });

      try {
        await source.pipe(
          every(() => {
            throw error;
          })
        );
      } catch (e) {
        // Expected error
      }

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it("should not emit any value", async () => {
      const error = new Error("predicate error");
      const source = AsyncObservable.from([1, 2, 3]);

      const nextSpy = vi.fn();
      try {
        await source
          .pipe(
            every(() => {
              throw error;
            })
          )
          .subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("when source observable errors", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        throw error;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(every((x) => x > 0));
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should not emit any value", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        throw error;
      });

      const nextSpy = vi.fn();
      try {
        await source.pipe(every((x) => x > 0)).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("when predicate uses the index parameter", () => {
    it("should pass the correct index to the predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(every(indexSpy));

      expect(indexSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from([10, 20, 30]);
      const indices: number[] = [];

      await source.pipe(
        every((_, index) => {
          indices.push(index);
          return true;
        })
      );

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should start index at 0", async () => {
      const source = AsyncObservable.from([5, 10, 15]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(every(indexSpy));

      expect(indexSpy).toHaveBeenCalledWith(5, 0);
    });
  });
});
