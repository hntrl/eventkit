import { AsyncObservable } from "@eventkit/async-observable";
import { last } from "../../lib/operators/last";
import { vi, describe, it, expect } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";
import { NoValuesError } from "../../lib/utils/errors";

describe("last", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(last());
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when no predicate is provided", () => {
    it("should emit the last value from the source", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(last());
      expect(result).toBe(3);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);

      await expect(source.pipe(last())).rejects.toThrow(NoValuesError);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const result = await source.pipe(last());
      expect(result).toBe("c");
    });

    it("should process all values before emitting", async () => {
      const processSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        processSpy(1);
        yield 2;
        processSpy(2);
        yield 3;
        processSpy(3);
      });

      await source.pipe(last());
      expect(processSpy).toHaveBeenCalledTimes(3);
      expect(processSpy).toHaveBeenNthCalledWith(1, 1);
      expect(processSpy).toHaveBeenNthCalledWith(2, 2);
      expect(processSpy).toHaveBeenNthCalledWith(3, 3);
    });
  });

  describe("when using a function predicate", () => {
    it("should emit the last value that satisfies the predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(last((x) => x % 2 === 0));
      expect(result).toBe(4);
    });

    it("should pass the correct index to the predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(last(indexSpy));

      expect(indexSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should increment index for each value", async () => {
      const source = AsyncObservable.from([10, 20, 30]);
      const indices: number[] = [];

      await source.pipe(
        last((_, index) => {
          indices.push(index);
          return true;
        })
      );

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should start index at 0", async () => {
      const source = AsyncObservable.from([5, 10, 15]);
      const indexSpy = vi.fn().mockReturnValue(true);

      await source.pipe(last(indexSpy));

      expect(indexSpy).toHaveBeenCalledWith(5, 0);
    });

    it("should process all values before emitting", async () => {
      const processSpy = vi.fn();
      const matchingValueSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        yield 2; // Matches
        matchingValueSpy(2);
        processSpy(1);
        yield 3; // Doesn't match
        processSpy(2);
        yield 4; // Matches - should be the result
        matchingValueSpy(4);
        processSpy(3);
      });

      const result = await source.pipe(last((x) => x % 2 === 0));
      expect(result).toBe(4);
      expect(processSpy).toHaveBeenCalledTimes(3);
      expect(matchingValueSpy).toHaveBeenCalledTimes(2);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const result = await source.pipe(last((x) => x < 4));
      expect(result).toBe(3);
    });
  });

  describe("when using BooleanConstructor", () => {
    it("should emit the last truthy value", async () => {
      const source = AsyncObservable.from([42, 0, "", false, "last"]);
      const result = await source.pipe(last(Boolean));
      expect(result).toBe("last");
    });

    describe("should handle various truthy/falsy values", () => {
      it("should handle numbers (0, 1, -1)", async () => {
        const source = AsyncObservable.from([1, 0, 2]);
        const result = await source.pipe(last(Boolean));
        expect(result).toBe(2); // 2 is the last truthy value
      });

      it('should handle strings ("", "hello")', async () => {
        const source = AsyncObservable.from(["hello", "", "world"]);
        const result = await source.pipe(last(Boolean));
        expect(result).toBe("world"); // "world" is the last truthy value
      });

      it("should handle objects (null, {}, [])", async () => {
        const source = AsyncObservable.from([{}, null, []]);
        const result = await source.pipe(last(Boolean));
        expect(result).toEqual([]); // [] is the last truthy value
      });

      it("should handle booleans (false, true)", async () => {
        const source = AsyncObservable.from([true, false, true]);
        const result = await source.pipe(last(Boolean));
        expect(result).toBe(true); // true is the last truthy value
      });
    });
  });

  describe("when using type predicate", () => {
    it("should narrow the type when using type predicate", async () => {
      type Item = string | number;
      const source = AsyncObservable.from<Item[]>([1, "a", 2, "b"]);

      const result = await source.pipe(last((x): x is string => typeof x === "string"));

      expect(typeof result).toBe("string");
      expect(result).toBe("b");
    });

    it("should maintain original type when using boolean predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const result = await source.pipe(last((x) => x > 2));

      expect(typeof result).toBe("number");
      expect(result).toBe(4);
    });
  });

  describe("when default value is provided", () => {
    it("should emit default value when no value satisfies predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(last((x) => x > 10, 999));
      expect(result).toBe(999);
    });

    it("should emit default value when source is empty", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(last(null, "default"));
      expect(result).toBe("default");
    });

    it("should not throw NoValuesError when default value is provided", async () => {
      const source = AsyncObservable.from([]);

      // Should not throw
      const result = await source.pipe(last(null, "default"));
      expect(result).toBe("default");
    });

    it("should work with different types for default value", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(last((x) => x > 10, "not found"));
      expect(result).toBe("not found");
    });
  });

  describe("when no default value is provided", () => {
    it("should throw NoValuesError when no value satisfies predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      await expect(source.pipe(last((x) => x > 10))).rejects.toThrow(NoValuesError);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);
      await expect(source.pipe(last())).rejects.toThrow(NoValuesError);
    });
  });

  describe("when predicate throws an error", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("predicate error");
      const source = AsyncObservable.from([1, 2, 3]);

      let caughtError: Error | null = null;
      try {
        await source.pipe(
          last(() => {
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
          last(() => {
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
            last(() => {
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
        await source.pipe(last());
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
        await source.pipe(last()).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });
});
