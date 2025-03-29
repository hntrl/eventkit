import { AsyncObservable } from "@eventkit/async-observable";
import { buffer } from "../../lib/operators/buffer";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("buffer", () => {
  describe("when source completes", () => {
    it("should emit final buffer", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const notifier = new AsyncObservable(async function* () {
        // Empty notifier that doesn't emit
      });

      const result: number[][] = [];
      await source.pipe(buffer(notifier)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([[1, 2, 3]]);
    });

    it("should complete after emitting final buffer", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const notifier = new AsyncObservable(async function* () {
        // Empty notifier that doesn't emit
      });

      const completionSpy = vi.fn();
      const sub = source.pipe(buffer(notifier)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when pushNotifier emits", () => {
    it("should emit current buffer", async () => {
      // Create controlled source and notifier
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(10);
        yield 3;
        yield 4;
      });
      const notifier = new AsyncObservable(async function* () {
        await delay(5); // Wait for first two values
        yield;
        await delay(20); // Wait for remaining values
        yield;
      });
      const result: number[][] = [];
      await source.pipe(buffer(notifier)).subscribe((value) => {
        result.push(value);
      });
      expect(result.length).toBe(3);
      expect(result[0]).toEqual([1, 2]);
      expect(result[1]).toEqual([3, 4]);
      expect(result[2]).toEqual([]);
    });
    it("should start new empty buffer", async () => {
      // Create a source that we can control
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(50); // Wait a bit before emitting more
        yield 3;
      });
      const notifier = new AsyncObservable(async function* () {
        await delay(5); // Wait for first values to emit
        yield "notify"; // Should emit buffer [1, 2] and start empty buffer
      });
      const result: number[][] = [];
      await source.pipe(buffer(notifier)).subscribe((value) => {
        result.push(value);
      });
      expect(result.length).toBe(2);
      expect(result[0]).toEqual([1, 2]);
      expect(result[1]).toEqual([3]);
    });
  });
  describe("when source emits multiple values", () => {
    it("should accumulate values in buffer until notifier emits", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        yield 3;
        yield 4;
        await delay(10);
        yield 5;
      });
      const notifier = new AsyncObservable(async function* () {
        await delay(3); // After values 1,2 are emitted
        yield "first";
        await delay(7); // After values 3,4 are emitted
        yield "second";
      });
      const result: number[][] = [];
      await source.pipe(buffer(notifier)).subscribe((value) => {
        result.push(value);
      });
      expect(result.length).toBe(3);
      expect(result[0]).toEqual([1, 2]);
      expect(result[1]).toEqual([3, 4]);
      expect(result[2]).toEqual([5]);
    });
  });
  describe("when pushNotifier completes", () => {
    it("should continue buffering until source completes", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(5);
        yield 2;
        await delay(5);
        yield 3;
        await delay(5);
        yield 4;
      });
      // Notifier that completes immediately
      const notifier = AsyncObservable.from([]);
      const result: number[][] = [];
      await source.pipe(buffer(notifier)).subscribe((value) => {
        result.push(value);
      });
      expect(result).toEqual([[1, 2, 3, 4]]);
    });
  });
  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("test error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(5);
        throw error;
      });
      const notifier = new AsyncObservable(async function* () {
        yield 1;
        // Empty notifier
      });
      let capturedError: Error | null = null;
      try {
        await source.pipe(buffer(notifier)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }
      expect(capturedError).toBe(error);
    });
  });
});
// describe("bufferCount", () => {
//   describe("when source completes", () => {
//     it("should emit final buffer", async () => {});
//     it("should complete after emitting final buffer", async () => {});
//   });
//   describe("when buffer size is reached", () => {
//     it("should emit buffer", async () => {});
//     it("should start new buffer", async () => {});
//   });
//   describe("when startBufferEvery is specified", () => {
//     it("should start new buffer at specified intervals", async () => {});
//     it("should maintain correct buffer sizes", async () => {});
//   });
//   describe("when source emits fewer values than buffer size", () => {
//     it("should emit final buffer with remaining values", async () => {});
//   });
//   describe("when source errors", () => {
//     it("should propagate error", async () => {});
//   });
// });
