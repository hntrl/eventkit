import { AsyncObservable } from "@eventkit/async-observable";
import { filter } from "../../lib/operators/filter";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("filter", () => {
  describe("when predicate is provided", () => {
    it("should emit only values that satisfy predicate", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source
        .pipe(
          filter((value) => value % 2 === 0) // Only emit even numbers
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual([2, 4]);
    });

    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn().mockReturnValue(true);

      await source.pipe(filter(predicateSpy)).subscribe(() => {});

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
          filter(() => false) // Filter out everything
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual([]);
    });

    it("should handle predicate returning true for all values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const result: number[] = [];
      await source
        .pipe(
          filter(() => true) // Keep everything
        )
        .subscribe((value) => {
          result.push(value);
        });

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("when predicate is a type predicate", () => {
    it("should narrow type of emitted values", async () => {
      type Item = string | number;
      const source = AsyncObservable.from<Item[]>(["a", 1, "b", 2, "c"]);

      const result: string[] = [];
      await source
        .pipe(filter((value): value is string => typeof value === "string"))
        .subscribe((value) => {
          // TypeScript should recognize value as string, not Item
          result.push(value);
        });

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should maintain type safety", async () => {
      interface Animal {
        type: string;
      }
      interface Dog extends Animal {
        bark(): void;
      }
      interface Cat extends Animal {
        meow(): void;
      }

      const dog: Dog = { type: "dog", bark: () => {} };
      const cat: Cat = { type: "cat", meow: () => {} };

      const source = AsyncObservable.from<Animal[]>([dog, cat]);
      const dogSpy = vi.fn();

      await source
        .pipe(filter((animal): animal is Dog => animal.type === "dog"))
        .subscribe((animal) => {
          // TypeScript should recognize animal as Dog
          animal.bark();
          dogSpy();
        });

      expect(dogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when predicate is Boolean constructor", () => {
    it("should emit only truthy values", async () => {
      const source = AsyncObservable.from([0, 1, false, true, "", "test", null, undefined, {}, []]);

      const result: any[] = [];
      await source.pipe(filter(Boolean)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, true, "test", {}, []]);
    });

    it("should handle falsy values correctly", async () => {
      const source = AsyncObservable.from([0, false, "", null, undefined]);

      const result: any[] = [];
      await source.pipe(filter(Boolean)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([]);
    });
  });

  describe("when no predicate is provided", () => {
    it("should emit only truthy values", async () => {
      const source = AsyncObservable.from([0, 1, false, true, "", "test", null, undefined, {}, []]);

      const result: any[] = [];
      await source.pipe(filter()).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, true, "test", {}, []]);
    });

    it("should handle falsy values correctly", async () => {
      const source = AsyncObservable.from([0, false, "", null, undefined]);

      const result: any[] = [];
      await source.pipe(filter()).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([]);
    });
  });

  describe("when source completes", () => {
    it("should complete after all values are processed", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const completionSpy = vi.fn();
      const sub = source.pipe(filter((value) => value % 2 === 0)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("test error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(filter((value) => value % 2 === 0)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });
  });

  describe("when source emits multiple values", () => {
    it("should process all values in sequence", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);
      const processSpy = vi.fn();

      await source
        .pipe(
          filter((value) => {
            processSpy(value);
            return value % 2 === 0;
          })
        )
        .subscribe(() => {});

      expect(processSpy).toHaveBeenCalledTimes(5);
      expect(processSpy).toHaveBeenNthCalledWith(1, 1);
      expect(processSpy).toHaveBeenNthCalledWith(2, 2);
      expect(processSpy).toHaveBeenNthCalledWith(3, 3);
      expect(processSpy).toHaveBeenNthCalledWith(4, 4);
      expect(processSpy).toHaveBeenNthCalledWith(5, 5);
    });

    it("should maintain order of emissions", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const result: number[] = [];
      await source.pipe(filter((value) => value % 2 === 0)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([2, 4]);
    });
  });
});
