import { describe, expect, it, vi } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";
import { AsyncObservable } from "@eventkit/async-observable";
import { max } from "../../lib/operators/max";
import { NoValuesError } from "../../lib/utils/errors";

describe("max", () => {
  it("should return a SingletonOperatorFunction", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(max());
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when using default comparer", () => {
    it("should emit the maximum value from the source", async () => {
      const source = AsyncObservable.from([1, 5, 3, 9, 2]);
      const result = await source.pipe(max());
      expect(result).toBe(9);
    });

    describe("should handle numbers", () => {
      it("should handle positive numbers", async () => {
        const source = AsyncObservable.from([3, 1, 7, 5, 2]);
        const result = await source.pipe(max());
        expect(result).toBe(7);
      });

      it("should handle negative numbers", async () => {
        const source = AsyncObservable.from([-5, -2, -10, -1, -7]);
        const result = await source.pipe(max());
        expect(result).toBe(-1);
      });

      it("should handle zero", async () => {
        const source = AsyncObservable.from([-3, 0, -5, -2]);
        const result = await source.pipe(max());
        expect(result).toBe(0);
      });

      it("should handle mixed positive and negative", async () => {
        const source = AsyncObservable.from([-10, 5, -3, 8, 0, -7]);
        const result = await source.pipe(max());
        expect(result).toBe(8);
      });
    });

    it("should handle strings (lexicographical comparison)", async () => {
      const source = AsyncObservable.from(["apple", "banana", "orange", "cherry"]);
      const result = await source.pipe(max());
      expect(result).toBe("orange");
    });

    it("should handle dates", async () => {
      const date1 = new Date(2020, 1, 1);
      const date2 = new Date(2021, 1, 1);
      const date3 = new Date(2019, 1, 1);

      const source = AsyncObservable.from([date1, date2, date3]);
      const result = await source.pipe(max());
      expect(result).toBe(date2);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);

      await expect(async () => {
        await source.pipe(max());
      }).rejects.toThrow(NoValuesError);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([3, 1, 7, 5, 2]);
      const result = await source.pipe(max());
      expect(result).toBe(7);
    });
  });

  describe("when using custom comparer", () => {
    it("should use the provided comparer function", async () => {
      const source = AsyncObservable.from([5, 1, 7, 3]);
      const comparerSpy = vi.fn((a, b) => b - a); // Reverse order

      const result = await source.pipe(max(comparerSpy));

      expect(comparerSpy).toHaveBeenCalled();
      expect(result).toBe(1); // The "maximum" when using reverse comparer is the smallest value
    });

    describe("should handle complex objects", () => {
      it("should compare based on specific properties", async () => {
        const users = [
          { name: "Alice", age: 25 },
          { name: "Bob", age: 40 },
          { name: "Charlie", age: 30 },
        ];

        const source = AsyncObservable.from(users);
        const result = await source.pipe(max((a, b) => a.age - b.age));

        expect(result).toEqual({ name: "Bob", age: 40 });
      });

      it("should handle nested objects", async () => {
        const items = [
          { id: 1, data: { value: 5 } },
          { id: 2, data: { value: 10 } },
          { id: 3, data: { value: 3 } },
        ];

        const source = AsyncObservable.from(items);
        const result = await source.pipe(max((a, b) => a.data.value - b.data.value));

        expect(result).toEqual({ id: 2, data: { value: 10 } });
      });
    });

    it("should handle edge cases in comparison", async () => {
      // Test with a comparer that considers negative values as "higher"
      const source = AsyncObservable.from([5, -10, 3, -20, 1]);
      const result = await source.pipe(
        max((a, b) => (a < 0 && b >= 0 ? 1 : b < 0 && a >= 0 ? -1 : a - b))
      );

      expect(result).toBe(-10);
    });

    it("should throw NoValuesError when source is empty", async () => {
      const source = AsyncObservable.from([]);
      const customComparer = (a: number, b: number) => a - b;

      await expect(source.pipe(max(customComparer))).rejects.toThrow(NoValuesError);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([3, 1, 7, 5, 2]);
      const result = await source.pipe(max((a, b) => a - b));
      expect(result).toBe(7);
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
        await source.pipe(max());
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
        await source.pipe(max()).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("when comparer throws an error", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("comparer error");
      const source = AsyncObservable.from([1, 2, 3]);

      let caughtError: Error | null = null;
      try {
        await source.pipe(
          max(() => {
            throw error;
          })
        );
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should not emit any value", async () => {
      const error = new Error("comparer error");
      const source = AsyncObservable.from([1, 2, 3]);

      const nextSpy = vi.fn();
      try {
        await source
          .pipe(
            max(() => {
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
});
