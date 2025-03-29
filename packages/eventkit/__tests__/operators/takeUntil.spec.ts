import { AsyncObservable } from "@eventkit/async-observable";
import { takeUntil } from "../../lib/operators/takeUntil";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("takeUntil", () => {
  describe("when stopNotifier emits", () => {
    it("should complete immediately", async () => {
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(50);
        yield 2; // This should not be emitted
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(20);
        yield "stop";
      });

      const completionSpy = vi.fn();
      const sub = source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not emit any more values after stopNotifier emits", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(20);
        yield 2;
        await delay(20);
        yield 3; // This should not be emitted
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(30);
        yield "stop";
      });

      const result: number[] = [];
      await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, 2]);
      expect(result).not.toContain(3);
    });

    it("should emit values received before stopNotifier emits", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(50);
        yield 3; // This should not be emitted
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(20);
        yield "stop";
      });

      const result: number[] = [];
      await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, 2]);
    });
  });

  describe("when stopNotifier completes without emitting", () => {
    it("should continue emitting source values", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(20);
        yield 2;
        await delay(20);
        yield 3;
      });

      const stopNotifier = new AsyncObservable(async function* () {
        // Completes without emitting
      });

      const result: number[] = [];
      await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, 2, 3]);
    });

    it("should complete when source completes", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Source completes
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(100); // Takes longer than source
        // Completes without emitting
      });

      const completionSpy = vi.fn();
      const sub = source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when stopNotifier errors", () => {
    it("should propagate error", async () => {
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(50);
        yield 2;
      });

      const error = new Error("stop notifier error");
      const stopNotifier = new AsyncObservable(async function* () {
        await delay(20);
        throw error;
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not emit any more values", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(30);
        yield 2; // This should not be emitted
      });

      const error = new Error("stop notifier error");
      const stopNotifier = new AsyncObservable(async function* () {
        await delay(20);
        throw error;
      });

      const result: number[] = [];
      try {
        await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
          result.push(value);
        });
      } catch (e) {
        // Expected error
      }

      expect(result).toEqual([1]);
      expect(result).not.toContain(2);
    });
  });

  describe("when source completes before stopNotifier", () => {
    it("should complete after emitting all source values", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        // Source completes quickly
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(100); // Takes longer than source
        yield "stop";
      });

      const result: number[] = [];
      await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([1, 2, 3]);
    });

    it("should not wait for stopNotifier", async () => {
      const source = new AsyncObservable(async function* () {
        yield 1;
        yield 2;
        // Source completes quickly
      });

      const notifierSpy = vi.fn();
      const stopNotifier = new AsyncObservable(async function* () {
        await delay(100); // Takes longer than source
        yield;
        await delay(100);
        yield;
        notifierSpy();
      });

      const completionSpy = vi.fn();
      const sub = source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).not.toHaveBeenCalled();
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(100);
        yield "stop";
      });

      let capturedError: Error | null = null;
      try {
        await source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should not wait for stopNotifier", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(20);
        throw error;
      });

      const notifierSpy = vi.fn();
      const stopNotifier = new AsyncObservable(async function* () {
        await delay(100);
        yield "stop";
        notifierSpy();
      });

      try {
        await source.pipe(takeUntil(stopNotifier)).subscribe(() => {});
      } catch (e) {
        // Expected error
      }

      expect(notifierSpy).not.toHaveBeenCalled();
    });
  });

  describe("when source emits multiple values", () => {
    it("should maintain order of emissions", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(20);
        yield "stop";
      });

      const result: number[] = [];
      await source.pipe(takeUntil(stopNotifier)).subscribe((value) => {
        result.push(value);
      });

      // The exact number of values emitted might vary due to timing,
      // but the order should be preserved
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.every((v, i) => v === i + 1)).toBe(true);
    });

    it("should handle backpressure correctly", async () => {
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 1; i <= 10; i++) {
          yield i;
          await delay(10); // Emit values at regular intervals
        }
      });

      const stopNotifier = new AsyncObservable(async function* () {
        await delay(55); // Stop after approximately 5 values
        yield "stop";
      });

      const processingDelay = 15; // Processing takes longer than emission rate
      const result: number[] = [];

      await source.pipe(takeUntil(stopNotifier)).subscribe(async (value) => {
        await delay(processingDelay);
        result.push(value);
      });

      // Even with slow processing, we should get approximately 5 values
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.length).toBeLessThanOrEqual(7); // Allow some timing tolerance
      expect(result).toEqual(result.sort((a, b) => a - b));
    });
  });

  describe("when stopNotifier emits immediately", () => {
    it("should complete without emitting any values", async () => {
      const source = new AsyncObservable(async function* () {
        await delay(10); // Small delay before first emission
        yield 1;
        yield 2;
      });

      const stopNotifier = new AsyncObservable(async function* () {
        yield "stop"; // Immediate emission
      });

      const nextSpy = vi.fn();
      const completionSpy = vi.fn();

      const sub = source.pipe(takeUntil(stopNotifier)).subscribe(nextSpy);
      sub.finally(completionSpy);

      await sub;
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });
});
