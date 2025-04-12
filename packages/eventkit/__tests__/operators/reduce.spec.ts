import { AsyncObservable } from "@eventkit/async-observable";
import { reduce } from "../../lib/operators/reduce";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("reduce", () => {
  describe("when source completes successfully", () => {
    it("should emit final accumulated value", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);

      const result: number[] = [];
      await source.pipe(reduce((acc, value) => acc + value, 0)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([10]); // 0 + 1 + 2 + 3 + 4 = 10
    });

    it("should complete after emitting final value", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const completionSpy = vi.fn();
      const sub = source.pipe(reduce((acc, value) => acc + value, 0)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should emit final accumulated value using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      expect(await source.pipe(reduce((acc, value) => acc + value, 0))).toEqual(10);
    });
  });

  describe("when seed value is provided", () => {
    it("should use seed as initial accumulator value", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const seed = 10;

      const result: number[] = [];
      await source.pipe(reduce((acc, value) => acc + value, seed)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([16]); // 10 + 1 + 2 + 3 = 16
    });

    it("should pass seed to first accumulator call", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const seed = 5;
      const accumulatorSpy = vi.fn((acc, value) => acc + value);

      await source.pipe(reduce(accumulatorSpy, seed)).subscribe(() => {});

      expect(accumulatorSpy).toHaveBeenCalledTimes(3);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(1, 5, 1, 0);
    });

    it("should emit final accumulated value using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      expect(await source.pipe(reduce((acc, value) => acc + value, 5))).toEqual(11);
    });
  });

  describe("when no seed value is provided", () => {
    it("should use first value as initial accumulator value", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const accumulatorSpy = vi.fn((acc, value) => (acc || 0) + value);

      await source.pipe(reduce(accumulatorSpy)).subscribe(() => {});

      expect(accumulatorSpy).toHaveBeenCalledTimes(4);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(1, undefined, 1, 0);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(2, 1, 2, 1);
    });

    it("should handle undefined initial value", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);

      const result: string[] = [];
      await source
        .pipe(
          // The accumulator handles an initially undefined acc
          reduce<string, string>((acc, value) => (acc || "") + value)
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual(["abc"]);
    });

    it("should emit final accumulated value using singleton object", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      expect(
        await source.pipe(reduce<string, string>((acc, value) => (acc || "") + value))
      ).toEqual("abc");
    });
  });

  describe("when source emits multiple values", () => {
    it("should accumulate values in correct order", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);

      // Using an array to track the accumulated values
      const intermediateValues: number[] = [];

      await source
        .pipe(
          reduce((acc, value) => {
            const newAcc = acc + value;
            intermediateValues.push(newAcc);
            return newAcc;
          }, 0)
        )
        .subscribe(() => {});

      expect(intermediateValues).toEqual([1, 3, 6, 10]);
    });

    it("should pass correct index to accumulator", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const indexSpy = vi.fn();

      await source
        .pipe(
          reduce((acc, value, index) => {
            indexSpy(index);
            return (acc || "") + value;
          })
        )
        .subscribe(() => {});

      expect(indexSpy).toHaveBeenCalledTimes(3);
      expect(indexSpy).toHaveBeenNthCalledWith(1, 0);
      expect(indexSpy).toHaveBeenNthCalledWith(2, 1);
      expect(indexSpy).toHaveBeenNthCalledWith(3, 2);
    });

    it("should emit final accumulated value using singleton object", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      expect(
        await source.pipe(reduce<string, string>((acc, value) => (acc || "") + value))
      ).toEqual("abc");
    });
  });

  describe("when source emits no values", () => {
    it("should emit seed value if provided", async () => {
      const source = AsyncObservable.from([]);
      const seed = 42;

      const result: number[] = [];
      await source.pipe(reduce((acc, value) => acc + value, seed)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([seed]);
    });

    it("should not call predicate if no seed value", async () => {
      const source = AsyncObservable.from([]);
      const accumulatorSpy = vi.fn((acc, value) => (acc ?? 0) + value);

      await source.pipe(reduce(accumulatorSpy)).subscribe(() => {});
      expect(accumulatorSpy).not.toHaveBeenCalled();
    });

    it("should emit seed value using singleton object", async () => {
      const source = AsyncObservable.from([]);
      expect(await source.pipe(reduce((acc, value) => acc + value, 42))).toEqual(42);
    });
  });

  describe("when accumulator throws error", () => {
    it("should propagate error", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const error = new Error("accumulator error");

      let capturedError: Error | null = null;
      try {
        await source
          .pipe(
            reduce((acc, value) => {
              if (value === 2) throw error;
              return acc + value;
            }, 0)
          )
          .subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not emit partial result", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const error = new Error("accumulator error");

      const nextSpy = vi.fn();
      try {
        await source
          .pipe(
            reduce((acc, value) => {
              if (value === 2) throw error;
              return acc + value;
            }, 0)
          )
          .subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should propagate error when using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const error = new Error("accumulator error");
      await expect(
        source.pipe(
          reduce((acc, value) => {
            if (value === 2) throw error;
            return acc + value;
          }, 0)
        )
      ).rejects.toThrow(error);
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(reduce((acc, value) => acc + value, 0)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not emit partial result", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        throw error;
      });

      const nextSpy = vi.fn();
      try {
        await source.pipe(reduce((acc, value) => acc + value, 0)).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should propagate error when using singleton object", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        throw error;
      });
      await expect(source.pipe(reduce((acc, value) => acc + value, 0))).rejects.toThrow(error);
    });
  });

  describe("when accumulator returns undefined", () => {
    it("should handle undefined as valid result", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: any[] = [];
      await source.pipe(reduce(() => undefined)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([undefined]);
    });

    it("should pass undefined to next accumulator call", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const accumulatorSpy = vi.fn(() => undefined);

      await source.pipe(reduce(accumulatorSpy)).subscribe(() => {});

      expect(accumulatorSpy).toHaveBeenCalledTimes(3);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(1, undefined, 1, 0);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(2, undefined, 2, 1);
      expect(accumulatorSpy).toHaveBeenNthCalledWith(3, undefined, 3, 2);
    });

    it("should handle undefined as valid result using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      expect(await source.pipe(reduce(() => undefined))).toEqual(undefined);
    });
  });
});
