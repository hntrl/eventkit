import { AsyncObservable } from "@eventkit/async-observable";
import { findIndex } from "../../lib/operators/findIndex";
import { vi, describe, it, expect } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";

describe("findIndex", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(findIndex((x: number) => x > 2));
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when using a function predicate", () => {
    it("should emit the index of the first value that satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(findIndex((x) => x > 3));
      expect(result).toBe(3);
    });

    it("should emit -1 if no value satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(findIndex((x) => x > 10));
      expect(result).toBe(-1);
    });

    it("should cancel the source after finding a match", async () => {
      const cancelSpy = vi.fn();
      const nextSpy = vi.fn();
      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
          yield 4;
          nextSpy();
          yield 5;
        } finally {
          cancelSpy();
        }
      });

      await source.pipe(findIndex((x) => x === 3));
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const index = await source.pipe(findIndex((x) => x === 3));
      expect(index).toBe(2);
    });

    it("should pass the correct index to the predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn().mockReturnValue(false);

      await source.pipe(findIndex(indexSpy));

      expect(indexSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from([10, 20, 30]);
      const indices: number[] = [];

      await source.pipe(
        findIndex((_, index) => {
          indices.push(index);
          return false;
        })
      );

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should start index at 0", async () => {
      const source = AsyncObservable.from([5, 10, 15]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(findIndex(indexSpy));

      expect(indexSpy).toHaveBeenCalledWith(5, 0);
    });

    it("should handle empty observables (emit -1)", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(findIndex((x) => !!x));
      expect(result).toBe(-1);
    });
  });

  describe("when using BooleanConstructor", () => {
    it("should emit the index of the first truthy value", async () => {
      const source = AsyncObservable.from([0, "", false, 42, null]);
      const result = await source.pipe(findIndex(Boolean));
      expect(result).toBe(3);
    });

    it("should emit -1 if no truthy values exist", async () => {
      const source = AsyncObservable.from([0, "", false, null, undefined]);
      const result = await source.pipe(findIndex(Boolean));
      expect(result).toBe(-1);
    });

    describe("should handle various truthy/falsy values", () => {
      it("should handle numbers (0, 1, -1)", async () => {
        const source = AsyncObservable.from([0, 1, -1]);
        const result = await source.pipe(findIndex(Boolean));
        expect(result).toBe(1); // 1 is the first truthy value
      });

      it('should handle strings ("", "hello")', async () => {
        const source = AsyncObservable.from(["", "hello"]);
        const result = await source.pipe(findIndex(Boolean));
        expect(result).toBe(1); // "hello" is the first truthy value
      });

      it("should handle objects (null, {}, [])", async () => {
        const source = AsyncObservable.from([null, {}, []]);
        const result = await source.pipe(findIndex(Boolean));
        expect(result).toBe(1); // {} is the first truthy value
      });

      it("should handle booleans (false, true)", async () => {
        const source = AsyncObservable.from([false, true]);
        const result = await source.pipe(findIndex(Boolean));
        expect(result).toBe(1); // true is the first truthy value
      });
    });
  });

  describe("when predicate throws an error", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("predicate error");
      const source = AsyncObservable.from([1, 2, 3]);

      let caughtError: Error | null = null;
      try {
        await source.pipe(
          findIndex(() => {
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
          findIndex(() => {
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
            findIndex(() => {
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
        await source.pipe(findIndex((x) => x > 1));
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
        await source.pipe(findIndex((x) => x > 1)).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("type narrowing with predicate", () => {
    it("should return number when using function predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(findIndex((x) => x > 1));
      expect(typeof result).toBe("number");
    });

    it("should return -1 | number when using BooleanConstructor", async () => {
      const source = AsyncObservable.from([false, null, undefined]);
      const result = await source.pipe(findIndex(Boolean));
      expect(result).toBe(-1);

      const source2 = AsyncObservable.from([false, true]);
      const result2 = await source2.pipe(findIndex(Boolean));
      expect(typeof result2).toBe("number");
      expect(result2).toBe(1);
    });
  });
});
