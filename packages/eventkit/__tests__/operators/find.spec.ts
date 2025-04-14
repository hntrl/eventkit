import { AsyncObservable } from "@eventkit/async-observable";
import { find } from "../../lib/operators/find";
import { vi, describe, it, expect } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";

describe("find", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(find((x: number) => x > 0));
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when using a function predicate", () => {
    it("should emit the first value that satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(find((x) => x > 3));
      expect(result).toBe(4);
    });

    it("should emit undefined if no value satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(find((x) => x > 10));
      expect(result).toBeUndefined();
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

      await source.pipe(find((x) => x === 3));
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(find((x) => x === 3));
      expect(result).toBe(3);
    });

    it("should pass the correct index to the predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn().mockReturnValue(false);

      await source.pipe(find(indexSpy));

      expect(indexSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from([10, 20, 30]);
      const indices: number[] = [];

      await source.pipe(
        find((_, index) => {
          indices.push(index);
          return false;
        })
      );

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should start index at 0", async () => {
      const source = AsyncObservable.from([5, 10, 15]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(find(indexSpy));

      expect(indexSpy).toHaveBeenCalledWith(5, 0);
    });
  });

  describe("when using BooleanConstructor", () => {
    it("should emit the first truthy value", async () => {
      const source = AsyncObservable.from([0, "", false, 42, null]);
      const result = await source.pipe(find(Boolean));
      expect(result).toBe(42);
    });

    it("should emit undefined if no truthy values exist", async () => {
      const source = AsyncObservable.from([0, "", false, null, undefined]);
      const result = await source.pipe(find(Boolean));
      expect(result).toBeUndefined();
    });

    describe("should handle various truthy/falsy values", () => {
      it("should handle numbers (0, 1, -1)", async () => {
        const source = AsyncObservable.from([0, 1, -1]);
        const result = await source.pipe(find(Boolean));
        expect(result).toBe(1); // 1 is the first truthy value
      });

      it('should handle strings ("", "hello")', async () => {
        const source = AsyncObservable.from(["", "hello"]);
        const result = await source.pipe(find(Boolean));
        expect(result).toBe("hello"); // "hello" is the first truthy value
      });

      it("should handle objects (null, {}, [])", async () => {
        const source = AsyncObservable.from([null, {}, []]);
        const result = await source.pipe(find(Boolean));
        expect(result).toEqual({}); // {} is the first truthy value
      });

      it("should handle booleans (false, true)", async () => {
        const source = AsyncObservable.from([false, true]);
        const result = await source.pipe(find(Boolean));
        expect(result).toBe(true); // true is the first truthy value
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
          find(() => {
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
          find(() => {
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
            find(() => {
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
        yield 2;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(find((x) => x > 1));
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
        await source.pipe(find((x) => x > 1)).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("type narrowing with predicate", () => {
    it("should narrow the type when using type predicate", async () => {
      type Item = string | number;
      const source = AsyncObservable.from<Item[]>([1, "a", 2, "b"]);

      const result = await source.pipe(find((x): x is string => typeof x === "string"));

      expect(typeof result).toBe("string");
      expect(result).toBe("a");
    });

    it("should maintain original type when using boolean predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const result = await source.pipe(find((x) => x > 2));

      expect(typeof result).toBe("number");
      expect(result).toBe(3);
    });
  });
});
