import { AsyncObservable } from "@eventkit/async-observable";
import { first } from "../../lib/operators/first";
import { vi, describe, it, expect } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";
import { NoValuesError } from "../../lib/utils/errors";

describe("first", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(first());
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when no predicate is provided", () => {
    it("should emit the first value from the source", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(first());
      expect(result).toBe(1);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);
      await expect(source.pipe(first())).rejects.toThrow(NoValuesError);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const result = await source.pipe(first());
      expect(result).toBe("a");
    });

    it("should cancel the source after emitting first value", async () => {
      const cancelSpy = vi.fn();
      const nextSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          nextSpy();
          yield 2;
          yield 3;
        } finally {
          cancelSpy();
        }
      });

      await source.pipe(first());
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("when using a function predicate", () => {
    it("should emit the first value that satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(first((x) => x > 3));
      expect(result).toBe(4);
    });

    it("should pass the correct index to the predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn().mockReturnValue(false);

      try {
        await source.pipe(first(indexSpy));
      } catch (e) {
        // Expected error
      }

      expect(indexSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from([10, 20, 30]);
      const indices: number[] = [];

      try {
        await source.pipe(
          first((_, index) => {
            indices.push(index);
            return false;
          })
        );
      } catch (e) {
        // Expected error
      }

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should start index at 0", async () => {
      const source = AsyncObservable.from([5, 10, 15]);
      const indexSpy = vi.fn().mockReturnValue(false);

      try {
        await source.pipe(first(indexSpy));
      } catch (e) {
        // Expected error
      }

      expect(indexSpy).toHaveBeenCalledWith(5, 0);
    });

    it("should cancel the source after finding a match", async () => {
      const cancelSpy = vi.fn();
      const nextSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
          nextSpy();
          yield 4;
          yield 5;
        } finally {
          cancelSpy();
        }
      });

      await source.pipe(first((x) => x === 3));
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(first((x) => x > 2));
      expect(result).toBe(3);
    });
  });

  describe("when using BooleanConstructor", () => {
    it("should emit the first truthy value", async () => {
      const source = AsyncObservable.from([0, "", false, 42, null]);
      const result = await source.pipe(first(Boolean));
      expect(result).toBe(42);
    });

    describe("should handle various truthy/falsy values", () => {
      it("should handle numbers (0, 1, -1)", async () => {
        const source = AsyncObservable.from([0, 1, -1]);
        const result = await source.pipe(first(Boolean));
        expect(result).toBe(1); // 1 is the first truthy value
      });

      it('should handle strings ("", "hello")', async () => {
        const source = AsyncObservable.from(["", "hello"]);
        const result = await source.pipe(first(Boolean));
        expect(result).toBe("hello"); // "hello" is the first truthy value
      });

      it("should handle objects (null, {}, [])", async () => {
        const source = AsyncObservable.from([null, {}, []]);
        const result = await source.pipe(first(Boolean));
        expect(result).toEqual({}); // {} is the first truthy value
      });

      it("should handle booleans (false, true)", async () => {
        const source = AsyncObservable.from([false, true]);
        const result = await source.pipe(first(Boolean));
        expect(result).toBe(true); // true is the first truthy value
      });
    });
  });

  describe("when using type predicate", () => {
    it("should narrow the type when using type predicate", async () => {
      type Item = string | number;
      const source = AsyncObservable.from<Item[]>([1, "a", 2, "b"]);

      const result = await source.pipe(first((x): x is string => typeof x === "string"));

      expect(typeof result).toBe("string");
      expect(result).toBe("a");
    });

    it("should maintain original type when using boolean predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const result = await source.pipe(first((x) => x > 2));

      expect(typeof result).toBe("number");
      expect(result).toBe(3);
    });
  });

  describe("when default value is provided", () => {
    it("should emit default value when no value satisfies predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(first((x) => x > 10, 999));
      expect(result).toBe(999);
    });

    it("should emit default value when source is empty", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(first(null, "default"));
      expect(result).toBe("default");
    });

    it("should not throw NoValuesError when default value is provided", async () => {
      const source = AsyncObservable.from([]);

      // Should not throw
      const result = await source.pipe(first(null, "default"));
      expect(result).toBe("default");
    });

    it("should work with different types for default value", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(first((x) => x > 10, "not found"));
      expect(result).toBe("not found");
    });
  });

  describe("when no default value is provided", () => {
    it("should throw NoValuesError when no value satisfies predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      await expect(async () => {
        await source.pipe(first((x) => x > 10));
      }).rejects.toThrow(NoValuesError);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);

      await expect(source.pipe(first())).rejects.toThrow(NoValuesError);
    });
  });

  describe("when predicate throws an error", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("predicate error");
      const source = AsyncObservable.from([1, 2, 3]);

      let caughtError: Error | null = null;
      try {
        await source.pipe(
          first(() => {
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
          first(() => {
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
            first(() => {
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
        await source.pipe(first((x) => x > 1));
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
        await source.pipe(first((x) => x > 1)).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });
});
