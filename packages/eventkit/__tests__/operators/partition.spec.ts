import { AsyncObservable } from "@eventkit/async-observable";
import { partition } from "../../lib/operators/partition";
import { vi, describe, it, expect } from "vitest";

describe("partition", () => {
  describe("when source emits values", () => {
    it("should emit matching values to first observable", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const [matches, nonMatches] = source.pipe(partition((value) => value % 2 === 0));

      const result: number[] = [];
      await matches.subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([2, 4]);
    });

    it("should emit non-matching values to second observable", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5]);

      const [matches, nonMatches] = source.pipe(partition((value) => value % 2 === 0));

      const result: number[] = [];
      await nonMatches.subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, 3, 5]);
    });

    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn().mockReturnValue(true);

      const [matches, nonMatches] = source.pipe(partition(predicateSpy));

      await matches.subscribe(() => {});

      expect(predicateSpy).toHaveBeenCalledTimes(3);
      expect(predicateSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(predicateSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(predicateSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });
  });

  describe("when predicate is a type predicate", () => {
    it("should narrow type of emitted values on first observable", async () => {
      type Item = string | number;
      const source = AsyncObservable.from<Item[]>(["a", 1, "b", 2, "c"]);

      const [strings, nonStrings] = source.pipe(
        partition((value): value is string => typeof value === "string")
      );

      const result: string[] = [];
      await strings.subscribe((value) => {
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

      const [dogs, nonDogs] = source.pipe(
        partition((animal): animal is Dog => animal.type === "dog")
      );

      await dogs.subscribe((animal) => {
        // TypeScript should recognize animal as Dog
        animal.bark();
        dogSpy();
      });

      expect(dogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source completes", () => {
    it("should complete both observables", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const [evens, odds] = source.pipe(partition((n) => n % 2 === 0));

      const firstCompletionSpy = vi.fn();
      const secondCompletionSpy = vi.fn();

      const sub1 = evens.subscribe(() => {});
      const sub2 = odds.subscribe(() => {});

      sub1.finally(firstCompletionSpy);
      sub2.finally(secondCompletionSpy);

      await Promise.all([sub1, sub2]);

      expect(firstCompletionSpy).toHaveBeenCalledTimes(1);
      expect(secondCompletionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source emits no values", () => {
    it("should complete both observables without emitting", async () => {
      const source = AsyncObservable.from<number[]>([]);

      const [evens, odds] = source.pipe(partition((n) => n % 2 === 0));

      const firstNextSpy = vi.fn();
      const secondNextSpy = vi.fn();
      const firstCompleteSpy = vi.fn();
      const secondCompleteSpy = vi.fn();

      const sub1 = evens.subscribe(firstNextSpy);
      const sub2 = odds.subscribe(secondNextSpy);

      sub1.finally(firstCompleteSpy);
      sub2.finally(secondCompleteSpy);

      await Promise.all([sub1, sub2]);

      expect(firstNextSpy).not.toHaveBeenCalled();
      expect(secondNextSpy).not.toHaveBeenCalled();
      expect(firstCompleteSpy).toHaveBeenCalledTimes(1);
      expect(secondCompleteSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when predicate returns true for all values", () => {
    it("should emit all values to first observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const [matches, nonMatches] = source.pipe(partition(() => true));

      const firstResult: number[] = [];
      await matches.subscribe((value) => {
        firstResult.push(value);
      });

      expect(firstResult).toEqual([1, 2, 3]);
    });

    it("should not emit to second observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const [matches, nonMatches] = source.pipe(partition(() => true));

      const secondResult: number[] = [];
      await nonMatches.subscribe((value) => {
        secondResult.push(value);
      });

      expect(secondResult).toEqual([]);
    });
  });

  describe("when predicate returns false for all values", () => {
    it("should not emit to first observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const [matches, nonMatches] = source.pipe(partition(() => false));

      const firstResult: number[] = [];
      await matches.subscribe((value) => {
        firstResult.push(value);
      });

      expect(firstResult).toEqual([]);
    });

    it("should emit all values to second observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const [matches, nonMatches] = source.pipe(partition(() => false));

      const secondResult: number[] = [];
      await nonMatches.subscribe((value) => {
        secondResult.push(value);
      });

      expect(secondResult).toEqual([1, 2, 3]);
    });
  });

  describe("when source emits multiple values", () => {
    it("should maintain order of emissions within each observable", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4, 5, 6]);

      const [evens, odds] = source.pipe(partition((n) => n % 2 === 0));

      const evenResults: number[] = [];
      const oddResults: number[] = [];

      await Promise.all([
        evens.subscribe((value) => evenResults.push(value)),
        odds.subscribe((value) => oddResults.push(value)),
      ]);

      expect(evenResults).toEqual([2, 4, 6]);
      expect(oddResults).toEqual([1, 3, 5]);
    });
  });
});
