import { AsyncObservable } from "@eventkit/async-observable";
import { concat, concatAll, concatMap } from "../../lib/operators/concat";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("concat", () => {
  describe("when all sources complete successfully", () => {
    it("should emit values from each source in sequence", async () => {
      const source1 = AsyncObservable.from([1, 2]);
      const source2 = AsyncObservable.from(["a", "b"]);

      const results: any[] = [];
      await source1.pipe(concat(source2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, "a", "b"]);
    });

    it("should complete after all sources complete", async () => {
      const source1 = AsyncObservable.from([1, 2]);
      const source2 = AsyncObservable.from(["a", "b"]);

      const completionSpy = vi.fn();
      const sub = source1.pipe(concat(source2)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when a source errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("test error");
      const source1 = AsyncObservable.from([1, 2]);
      const source2 = new AsyncObservable(async function* () {
        yield "a";
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source1.pipe(concat(source2)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not subscribe to subsequent sources", async () => {
      const error = new Error("test error");
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const subscribeSpy = vi.fn();
      const source2 = new AsyncObservable(async function* () {
        yield "a";
        subscribeSpy();
      });

      try {
        await source1.pipe(concat(source2)).subscribe(() => {});
      } catch (e) {
        // Expected error
      }

      expect(subscribeSpy).not.toHaveBeenCalled();
    });
  });

  describe("when sources complete at different times", () => {
    it("should maintain order of emissions", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(20);
        yield 2;
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10);
        yield "b";
      });

      const results: any[] = [];
      await source1.pipe(concat(source2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, "a", "b"]);
    });

    it("should wait for each source to complete before starting next", async () => {
      const emissions: string[] = [];

      const source1 = new AsyncObservable(async function* () {
        emissions.push("source1-start");
        yield 1;
        await delay(30);
        yield 2;
        emissions.push("source1-end");
      });

      const source2 = new AsyncObservable(async function* () {
        emissions.push("source2-start");
        yield "a";
        yield "b";
        emissions.push("source2-end");
      });

      await source1.pipe(concat(source2)).subscribe(() => {});

      expect(emissions).toEqual(["source1-start", "source1-end", "source2-start", "source2-end"]);
    });
  });
});

describe("concatAll", () => {
  describe("when all inner observables complete successfully", () => {
    it("should emit values from each inner observable in sequence", async () => {
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = AsyncObservable.from(["a", "b"]);
      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      await source.pipe(concatAll()).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, "a", "b"]);
    });

    it("should complete after all inner observables complete", async () => {
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = AsyncObservable.from(["a", "b"]);
      const source = AsyncObservable.from([inner1, inner2]);

      const completionSpy = vi.fn();
      const sub = source.pipe(concatAll()).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when an inner observable errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("inner error");
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        throw error;
      });
      const source = AsyncObservable.from([inner1, inner2]);

      let capturedError: Error | null = null;
      try {
        await source.pipe(concatAll()).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not subscribe to subsequent inner observables", async () => {
      const error = new Error("inner error");
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const subscribeSpy = vi.fn();
      const inner2 = new AsyncObservable(async function* () {
        subscribeSpy();
        yield "a";
      });

      const source = AsyncObservable.from([inner1, inner2]);

      try {
        await source.pipe(concatAll()).subscribe();
      } catch (e) {
        // Expected error
      }

      expect(subscribeSpy).not.toHaveBeenCalled();
    });
  });

  describe("when inner observables complete at different times", () => {
    it("should maintain order of emissions", async () => {
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(20);
        yield 2;
      });

      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10);
        yield "b";
      });

      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      await source.pipe(concatAll()).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, "a", "b"]);
    });

    it("should wait for each inner observable to complete before starting next", async () => {
      const emissions: string[] = [];

      const inner1 = new AsyncObservable(async function* () {
        emissions.push("inner1-start");
        yield 1;
        await delay(30);
        yield 2;
        emissions.push("inner1-end");
      });

      const inner2 = new AsyncObservable(async function* () {
        emissions.push("inner2-start");
        yield "a";
        yield "b";
        emissions.push("inner2-end");
      });

      const source = AsyncObservable.from([inner1, inner2]);

      await source.pipe(concatAll()).subscribe(() => {});

      expect(emissions).toEqual(["inner1-start", "inner1-end", "inner2-start", "inner2-end"]);
    });
  });

  describe("when source emits observables quickly", () => {
    it("should handle backpressure correctly", async () => {
      const createInner = (id: number) =>
        new AsyncObservable<string>(async function* () {
          yield `${id}-1`;
          await delay(20); // Each inner takes some time to complete
          yield `${id}-2`;
        });

      // Source emits inners quickly without waiting
      const source = new AsyncObservable<AsyncObservable<string>>(async function* () {
        yield createInner(1);
        yield createInner(2);
        yield createInner(3);
      });

      const results: string[] = [];
      await source.pipe(concatAll()).subscribe((value) => {
        results.push(value);
      });

      // Should process all inners in sequence
      expect(results).toEqual(["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"]);
    });

    it("should not cause memory issues", async () => {
      // This test is more about demonstrating the pattern
      // We can't easily test for actual memory usage in a unit test

      const processingOrder: number[] = [];

      const createInner = (id: number) =>
        new AsyncObservable<number>(async function* () {
          processingOrder.push(id);
          yield id;
        });

      // Create a source with many inner observables
      const source = new AsyncObservable<AsyncObservable<number>>(async function* () {
        for (let i = 1; i <= 10; i++) {
          yield createInner(i);
        }
      });

      await source.pipe(concatAll()).subscribe(() => {});

      // Should process all inners in sequence
      expect(processingOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
});

describe("concatMap", () => {
  describe("when all mapped observables complete successfully", () => {
    it("should emit values from each mapped observable in sequence", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) => AsyncObservable.from([value * 10, value * 100]);

      const results: number[] = [];
      await source.pipe(concatMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([10, 100, 20, 200]);
    });

    it("should complete after all mapped observables complete", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) => AsyncObservable.from([value, value * 10]);

      const completionSpy = vi.fn();
      const sub = source.pipe(concatMap(mappedObservable)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when a mapped observable errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("mapped error");
      const source = AsyncObservable.from([1, 2, 3]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          if (value === 2) {
            throw error;
          }
          yield value;
        });

      let capturedError: Error | null = null;
      try {
        await source.pipe(concatMap(mappedObservable)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not process subsequent source values", async () => {
      const error = new Error("mapped error");
      const processingSpy = vi.fn();

      const source = AsyncObservable.from([1, 2, 3]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          processingSpy(value);
          if (value === 2) {
            throw error;
          }
          yield value;
        });

      try {
        await source.pipe(concatMap(mappedObservable)).subscribe(() => {});
      } catch (e) {
        // Expected error
      }

      expect(processingSpy).toHaveBeenCalledWith(1);
      expect(processingSpy).toHaveBeenCalledWith(2);
      expect(processingSpy).not.toHaveBeenCalledWith(3);
    });
  });

  describe("when mapped observables complete at different times", () => {
    it("should maintain order of emissions", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          yield value * 10;
          await delay(value === 1 ? 50 : 10); // First takes longer
          yield value * 100;
        });

      const results: number[] = [];
      await source.pipe(concatMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([10, 100, 20, 200]);
    });

    it("should wait for each mapped observable to complete before processing next source value", async () => {
      const emissions: string[] = [];

      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          emissions.push(`start-${value}`);
          yield value;
          await delay(value === 1 ? 30 : 10);
          yield value * 10;
          emissions.push(`end-${value}`);
        });

      await source.pipe(concatMap(mappedObservable)).subscribe(() => {});

      expect(emissions).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });
  });

  describe("when source emits values quickly", () => {
    it("should handle backpressure correctly", async () => {
      // Source emits values quickly
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 1; i <= 3; i++) {
          yield i;
        }
      });

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          yield value;
          await delay(30); // Each mapped observable takes time to complete
          yield value * 10;
        });

      const results: number[] = [];
      await source.pipe(concatMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      // Should process all values in sequence
      expect(results).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it("should not cause memory issues", async () => {
      const processedValues: number[] = [];

      // Source emits many values
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 1; i <= 10; i++) {
          yield i;
        }
      });

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          processedValues.push(value);
          yield value;
        });

      await source.pipe(concatMap(mappedObservable)).subscribe(() => {});

      // Should process all values in sequence
      expect(processedValues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe("when predicate function is called", () => {
    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn().mockImplementation((value) => AsyncObservable.from([value]));

      await source.pipe(concatMap(predicateSpy)).subscribe(() => {});

      expect(predicateSpy).toHaveBeenCalledTimes(3);
      expect(predicateSpy).toHaveBeenNthCalledWith(1, "a", 0);
      expect(predicateSpy).toHaveBeenNthCalledWith(2, "b", 1);
      expect(predicateSpy).toHaveBeenNthCalledWith(3, "c", 2);
    });

    it("should use returned observable for mapping", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const mappedObservable: (value: number) => AsyncObservable<number> = vi
        .fn()
        .mockImplementation((value: number) => AsyncObservable.from([value * 10]));

      const results: number[] = [];
      await source.pipe(concatMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([10, 20, 30]);
      expect(mappedObservable).toHaveBeenCalledTimes(3);
    });
  });
});
