import { AsyncObservable } from "@eventkit/async-observable";
import { map } from "../../lib/operators/map";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("map", () => {
  describe("when source emits values", () => {
    it("should transform each value using predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: number[] = [];
      await source.pipe(map((value) => value * 2)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([2, 4, 6]);
    });

    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn((val, idx) => `${val}-${idx}`);

      const result: string[] = [];
      await source.pipe(map(predicateSpy)).subscribe((value) => {
        result.push(value);
      });

      expect(predicateSpy).toHaveBeenCalledTimes(3);
      expect(predicateSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(predicateSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(predicateSpy).toHaveBeenNthCalledWith(3, "c", 2);
      expect(result).toEqual(["a-0", "b-1", "c-2"]);
    });

    it("should maintain order of emissions", async () => {
      const source = AsyncObservable.from([3, 1, 4, 2]);

      const result: string[] = [];
      await source.pipe(map((value) => `value-${value}`)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual(["value-3", "value-1", "value-4", "value-2"]);
    });
  });

  describe("when predicate returns different types", () => {
    it("should handle type transformations correctly", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: string[] = [];
      await source.pipe(map((value) => `number-${value}`)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual(["number-1", "number-2", "number-3"]);
    });

    it("should maintain type safety", async () => {
      interface Person {
        name: string;
        age: number;
      }

      const source = AsyncObservable.from<Person[]>([
        { name: "Alice", age: 25 },
        { name: "Bob", age: 30 },
      ]);

      const result: string[] = [];
      await source.pipe(map((person) => person.name)).subscribe((name) => {
        result.push(name);
      });

      expect(result).toEqual(["Alice", "Bob"]);
    });
  });

  describe("when predicate throws error", () => {
    it("should propagate error", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const error = new Error("predicate error");

      let capturedError: Error | null = null;
      try {
        await source
          .pipe(
            map((value) => {
              if (value === 2) throw error;
              return value;
            })
          )
          .subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not process subsequent values", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const error = new Error("predicate error");
      const predicateSpy = vi.fn((value) => {
        if (value === 2) throw error;
        return value;
      });

      try {
        await source.pipe(map(predicateSpy)).subscribe(() => {});
      } catch (e) {
        // Expected error
      }

      expect(predicateSpy).toHaveBeenCalledTimes(2);
      expect(predicateSpy).toHaveBeenNthCalledWith(1, 1, 0);
      expect(predicateSpy).toHaveBeenNthCalledWith(2, 2, 1);
    });
  });

  describe("when source completes", () => {
    it("should complete after all values are processed", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const completionSpy = vi.fn();
      const sub = source.pipe(map((value) => value * 2)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(5);
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(map((value) => value * 2)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });
  });

  describe("when source emits no values", () => {
    it("should complete without emitting", async () => {
      const source = AsyncObservable.from([]);
      const mapSpy = vi.fn((value) => value);
      const nextSpy = vi.fn();

      await source.pipe(map(mapSpy)).subscribe(nextSpy);

      expect(mapSpy).not.toHaveBeenCalled();
      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("when predicate returns undefined", () => {
    it("should emit undefined values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: any[] = [];
      await source.pipe(map(() => undefined)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([undefined, undefined, undefined]);
    });
  });

  describe("when predicate returns null", () => {
    it("should emit null values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: any[] = [];
      await source.pipe(map(() => null)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([null, null, null]);
    });
  });
});
