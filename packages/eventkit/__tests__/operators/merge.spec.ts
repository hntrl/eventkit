import { AsyncObservable } from "@eventkit/async-observable";
import { merge, mergeAll, mergeMap } from "../../lib/operators/merge";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("merge", () => {
  describe("when all sources complete successfully", () => {
    it("should emit values from all sources concurrently", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(10);
        yield 2;
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(15);
        yield "b";
      });

      const results: any[] = [];
      await source1.pipe(merge(source2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain("a");
      expect(results).toContain("b");
      expect(results.length).toBe(4);
    });

    it("should complete after all sources complete", async () => {
      const source1 = AsyncObservable.from([1, 2]);
      const source2 = AsyncObservable.from(["a", "b"]);

      const completionSpy = vi.fn();
      const results: any[] = [];
      const sub = source1.pipe(merge(source2)).subscribe((value) => {
        results.push(value);
      });
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, 2, "a", "b"]);
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
        await source1.pipe(merge(source2)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not emit values from other sources after error", async () => {
      const error = new Error("test error");
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(20);
        yield 2; // This should not be emitted due to error
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10);
        throw error;
      });

      const results: any[] = [];
      try {
        await source1.pipe(merge(source2)).subscribe((value) => {
          results.push(value);
        });
      } catch (e) {
        // Expected error
      }

      expect(results).toContain(1);
      expect(results).toContain("a");
      expect(results).not.toContain(2);
      expect(results.length).toBe(2);
    });
  });

  describe("when sources complete at different times", () => {
    it("should maintain concurrent emissions", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(10);
        yield 2;
        await delay(30);
        yield 3;
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(20);
        yield "b";
      });

      const results: any[] = [];
      await source1.pipe(merge(source2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, "a", 2, "b", 3]);
    });

    it("should complete when all sources complete", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(10);
        // Completes quickly
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(50);
        yield "b";
        // Completes later
      });

      const completionSpy = vi.fn();
      const results: any[] = [];
      const sub = source1.pipe(merge(source2)).subscribe((value) => {
        results.push(value);
      });
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, "a", "b"]);
    });
  });

  describe("when sources emit at different rates", () => {
    it("should interleave values from all sources", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(30); // Slow
        yield 2;
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10); // Fast
        yield "b";
        await delay(10); // Fast
        yield "c";
      });

      const results: any[] = [];
      await source1.pipe(merge(source2)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, "a", "b", "c", 2]);
    });

    it("should block on slower sources", async () => {
      const source1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(100); // Very slow
        yield 2;
      });

      const source2 = new AsyncObservable(async function* () {
        yield "a";
        yield "b";
        yield "c";
      });

      const results: any[] = [];
      const startTime = Date.now();

      await source1.pipe(merge(source2)).subscribe((value) => {
        if (typeof value === "string") {
          results.push(value);
        }
      });

      const timeToEmitStrings = Date.now() - startTime;

      // Source 1 is slow, so it should block the other source from emitting
      expect(results).toEqual(["a", "b", "c"]);
      expect(timeToEmitStrings).toBeLessThan(110); // 10ms tolerance
    });
  });
});

describe("mergeAll", () => {
  describe("when all inner observables complete successfully", () => {
    it("should emit values from all inner observables concurrently", async () => {
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = AsyncObservable.from(["a", "b"]);
      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      await source.pipe(mergeAll()).subscribe((value) => {
        results.push(value);
      });

      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain("a");
      expect(results).toContain("b");
      expect(results.length).toBe(4);
    });

    it("should complete after all inner observables complete", async () => {
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = AsyncObservable.from(["a", "b"]);
      const source = AsyncObservable.from([inner1, inner2]);

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeAll()).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when an inner observable errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("test error");
      const inner1 = AsyncObservable.from([1, 2]);
      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        throw error;
      });
      const source = AsyncObservable.from([inner1, inner2]);

      let capturedError: Error | null = null;
      try {
        await source.pipe(mergeAll()).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not emit values from other inner observables after error", async () => {
      const error = new Error("test error");
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(30);
        yield 2; // This should not be emitted due to error
      });

      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10);
        throw error;
      });

      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      try {
        await source.pipe(mergeAll()).subscribe((value) => {
          results.push(value);
        });
      } catch (e) {
        // Expected error
      }

      expect(results).toContain(1);
      expect(results).toContain("a");
      expect(results).not.toContain(2);
    });
  });

  describe("when inner observables complete at different times", () => {
    it("should maintain concurrent emissions", async () => {
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(30);
        yield 2;
      });

      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(10);
        yield "b";
      });

      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      await source.pipe(mergeAll()).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, "a", "b", 2]);
    });

    it("should complete when all inner observables complete", async () => {
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        // Completes quickly
      });

      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(50);
        yield "b";
        // Completes later
      });

      const source = AsyncObservable.from([inner1, inner2]);

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeAll()).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when concurrency limit is specified", () => {
    it("should limit number of concurrent subscriptions", async () => {
      const subscriptionSpy = vi.fn();

      const createInner = (id: number) =>
        new AsyncObservable<number>(async function* () {
          subscriptionSpy(id);
          yield id;
          await delay(30);
        });

      const source = AsyncObservable.from([
        createInner(1),
        createInner(2),
        createInner(3),
        createInner(4),
      ]);

      const results: number[] = [];
      await source
        .pipe(
          mergeAll(2) // Concurrency limit of 2
        )
        .subscribe((value) => {
          results.push(value);
        });

      // Only 2 subscriptions should be active at first
      expect(subscriptionSpy).toHaveBeenNthCalledWith(1, 1);
      expect(subscriptionSpy).toHaveBeenNthCalledWith(2, 2);

      // Then inner3 should be subscribed after inner1 or inner2 completes
      expect(subscriptionSpy).toHaveBeenNthCalledWith(3, 3);

      // Then inner4 should be subscribed after another inner completes
      expect(subscriptionSpy).toHaveBeenNthCalledWith(4, 4);
    });

    it("should queue additional inner observables", async () => {
      const processingOrder: number[] = [];

      const createInner = (id: number) =>
        new AsyncObservable(async function* () {
          processingOrder.push(id);
          yield id;
          await delay(id * 10); // Each takes progressively longer
        });

      const source = AsyncObservable.from([
        createInner(1),
        createInner(2),
        createInner(3),
        createInner(4),
      ]);

      await source
        .pipe(
          mergeAll(2) // Concurrency limit of 2
        )
        .subscribe(() => {});

      // First two should be processed immediately
      expect(processingOrder[0]).toBe(1);
      expect(processingOrder[1]).toBe(2);

      // Then the next ones should be queued
      expect(processingOrder.length).toBe(4);
    });

    it("should process queued observables when slots become available", async () => {
      const startTimes: Record<number, number> = {};
      const endTimes: Record<number, number> = {};
      const start = Date.now();

      const createInner = (id: number, delay: number) =>
        new AsyncObservable(async function* () {
          startTimes[id] = Date.now() - start;
          yield id;
          await new Promise((resolve) => setTimeout(resolve, delay));
          endTimes[id] = Date.now() - start;
        });

      const source = AsyncObservable.from([
        createInner(1, 50), // Completes after 50ms
        createInner(2, 100), // Completes after 100ms
        createInner(3, 30), // Should start after inner1 completes
      ]);

      await source
        .pipe(
          mergeAll(2) // Concurrency limit of 2
        )
        .subscribe(() => {});

      // Inner3 should start after inner1 completes
      expect(startTimes[3]).toBeGreaterThan(endTimes[1] - 10); // Allow some execution time variance
    });
  });

  describe("when source completes before inner observables", () => {
    it("should continue processing inner observables", async () => {
      const inner1 = new AsyncObservable(async function* () {
        yield 1;
        await delay(50); // Takes longer to complete
        yield 2;
      });

      const inner2 = new AsyncObservable(async function* () {
        yield "a";
        await delay(30);
        yield "b";
      });

      // Source completes immediately after emitting both inners
      const source = AsyncObservable.from([inner1, inner2]);

      const results: any[] = [];
      await source.pipe(mergeAll()).subscribe((value) => {
        results.push(value);
      });

      // Should contain all values from inner observables
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain("a");
      expect(results).toContain("b");
      expect(results.length).toBe(4);
    });

    it("should complete after all inner observables complete", async () => {
      const inner1 = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(50);
        yield 2;
      });

      const inner2 = new AsyncObservable<string>(async function* () {
        yield "a";
        await delay(20);
        yield "b";
      });

      // Source completes immediately after emitting both inners
      const source = AsyncObservable.from([inner1, inner2]);

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeAll()).subscribe(() => {});
      sub.finally(completionSpy);

      // Before the delay completes
      expect(completionSpy).not.toHaveBeenCalled();

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("source error");
      const inner = AsyncObservable.from([1, 2]);

      const source = new AsyncObservable<AsyncObservable<number>>(async function* () {
        yield inner;
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(mergeAll()).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should cancel all inner subscriptions", async () => {
      const error = new Error("source error");
      const cancelSpy = vi.fn();

      const inner = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          await delay(100); // This should be interrupted
          yield 2;
        } finally {
          cancelSpy();
        }
      });

      const source = new AsyncObservable<AsyncObservable<number>>(async function* () {
        yield inner;
        await delay(50);
        throw error;
      });

      try {
        await source.pipe(mergeAll()).subscribe();
      } catch (e) {
        // Expected error
      }

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe("mergeMap", () => {
  describe("when all mapped observables complete successfully", () => {
    it("should emit values from all mapped observables concurrently", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) => AsyncObservable.from([value * 10, value * 100]);

      const results: number[] = [];
      await source.pipe(mergeMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toContain(10);
      expect(results).toContain(100);
      expect(results).toContain(20);
      expect(results).toContain(200);
      expect(results.length).toBe(4);
    });

    it("should complete after all mapped observables complete", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          yield value;
          await delay(value * 20);
          yield value * 2;
        });

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeMap(mappedObservable)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when a mapped observable errors", () => {
    it("should propagate error immediately", async () => {
      const error = new Error("mapped error");
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          if (value === 2) {
            throw error;
          }
          yield value;
        });

      let capturedError: Error | null = null;
      try {
        await source.pipe(mergeMap(mappedObservable)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not process subsequent source values", async () => {
      const error = new Error("mapped error");
      const processSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          if (value === 2) {
            throw error;
          }
          yield value;
        });

      try {
        await source.pipe(mergeMap(mappedObservable)).subscribe(processSpy);
      } catch (e) {
        // Expected error
      }

      expect(processSpy).not.toHaveBeenCalledWith(3);
    });
  });

  describe("when mapped observables complete at different times", () => {
    it("should maintain concurrent emissions", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          yield value * 10;
          await delay(value === 1 ? 50 : 10); // First observable takes longer
          yield value * 100;
        });

      const results: number[] = [];
      await source.pipe(mergeMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      // 20, 200 should come before 100 due to timing
      expect(results).toEqual([10, 20, 200, 100]);
    });

    it("should complete when all mapped observables complete", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          yield value;
          await delay(value * 30); // Second observable takes longer
        });

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeMap(mappedObservable)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when concurrency limit is specified", () => {
    it("should limit number of concurrent subscriptions", async () => {
      const subscriptionSpy = vi.fn();
      const source = AsyncObservable.from([1, 2, 3, 4]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          subscriptionSpy(value);
          yield value;
          await delay(40);
        });

      await source
        .pipe(
          mergeMap(mappedObservable, 2) // Concurrency limit of 2
        )
        .subscribe(() => {});

      // Only 2 subscriptions should be active at first
      expect(subscriptionSpy).toHaveBeenNthCalledWith(1, 1);
      expect(subscriptionSpy).toHaveBeenNthCalledWith(2, 2);

      // Then the rest should be called later
      expect(subscriptionSpy).toHaveBeenNthCalledWith(3, 3);
      expect(subscriptionSpy).toHaveBeenNthCalledWith(4, 4);
    });

    it("should queue additional mapped observables", async () => {
      const processingOrder: number[] = [];
      const source = AsyncObservable.from([1, 2, 3, 4]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          processingOrder.push(value);
          yield value;
          await delay(20);
        });

      await source
        .pipe(
          mergeMap(mappedObservable, 2) // Concurrency limit of 2
        )
        .subscribe(() => {});

      // First two should be processed immediately
      expect(processingOrder[0]).toBe(1);
      expect(processingOrder[1]).toBe(2);

      // The rest should follow
      expect(processingOrder.length).toBe(4);
    });

    it("should process queued observables when slots become available", async () => {
      const startTimes: Record<number, number> = {};
      const endTimes: Record<number, number> = {};
      const start = Date.now();

      const source = AsyncObservable.from([1, 2, 3]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          startTimes[value] = Date.now() - start;
          yield value;
          await delay(value === 1 ? 30 : 60); // First completes quickly
          endTimes[value] = Date.now() - start;
        });

      await source
        .pipe(
          mergeMap(mappedObservable, 2) // Concurrency limit of 2
        )
        .subscribe(() => {});

      // Observable 3 should start after observable 1 completes
      expect(startTimes[3]).toBeGreaterThan(endTimes[1] - 10); // Allow some timing variance
    });
  });

  describe("when predicate function is called", () => {
    it("should pass correct value and index to predicate", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const predicateSpy = vi.fn().mockImplementation((value) => AsyncObservable.from([value]));

      await source.pipe(mergeMap(predicateSpy)).subscribe(() => {});

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
      await source.pipe(mergeMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([10, 20, 30]);
      expect(mappedObservable).toHaveBeenCalledTimes(3);
    });
  });

  describe("when source completes before mapped observables", () => {
    it("should continue processing mapped observables", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable<number>(async function* () {
          yield value * 10;
          await delay(50); // Takes longer than source to complete
          yield value * 100;
        });

      const results: number[] = [];
      await source.pipe(mergeMap(mappedObservable)).subscribe((value) => {
        results.push(value);
      });

      // Should have all values including those emitted after delay
      expect(results.sort()).toEqual([10, 100, 20, 200]);
    });

    it("should complete after all mapped observables complete", async () => {
      const source = AsyncObservable.from([1, 2]);

      const mappedObservable = (value: number) =>
        new AsyncObservable(async function* () {
          yield value;
          await delay(value * 30); // Takes longer than source to complete
        });

      const completionSpy = vi.fn();
      const sub = source.pipe(mergeMap(mappedObservable)).subscribe(() => {});
      sub.finally(completionSpy);

      // Before all mapped observables complete
      expect(completionSpy).not.toHaveBeenCalled();

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });
});
