import { describe, expect, it, vi } from "vitest";
import { SingletonAsyncObservable } from "../../lib/singleton";
import { AsyncObservable } from "@eventkit/async-observable";
import { isEmpty } from "../../lib/operators/isEmpty";

describe("isEmpty", () => {
  it("should return a SingletonAsyncObservable", async () => {
    const obs = AsyncObservable.from([1, 2, 3]);
    const result = obs.pipe(isEmpty());
    expect(result).toBeInstanceOf(SingletonAsyncObservable);
  });

  describe("when source emits values", () => {
    it("should emit false immediately when first value is emitted", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const result = await source.pipe(isEmpty());
      expect(result).toBe(false);
    });

    it("should cancel the source after emitting false", async () => {
      const cancelSpy = vi.fn();
      const nextSpy = vi.fn();

      const source = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          nextSpy();
          yield 2;
          yield 3;
        } finally {
          cancelSpy();
        }
      });

      await source.pipe(isEmpty());
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).not.toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from(["a", "b", "c"]);
      const result = await source.pipe(isEmpty());
      expect(result).toBe(false);
    });

    it("should handle any type of value", async () => {
      const numSource = AsyncObservable.from([1]);
      const strSource = AsyncObservable.from(["string"]);
      const objSource = AsyncObservable.from([{}]);
      const boolSource = AsyncObservable.from([true]);

      expect(await numSource.pipe(isEmpty())).toBe(false);
      expect(await strSource.pipe(isEmpty())).toBe(false);
      expect(await objSource.pipe(isEmpty())).toBe(false);
      expect(await boolSource.pipe(isEmpty())).toBe(false);
    });
  });

  describe("when source is empty", () => {
    it("should emit true when source completes without values", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(isEmpty());
      expect(result).toBe(true);
    });

    it("should work with await syntax", async () => {
      const source = AsyncObservable.from([]);
      const result = await source.pipe(isEmpty());
      expect(result).toBe(true);
    });

    it("should handle empty observables", async () => {
      const source = new AsyncObservable(async function* () {
        // Empty generator that just completes
      });

      const result = await source.pipe(isEmpty());
      expect(result).toBe(true);
    });
  });

  describe("when source errors", () => {
    it("should propagate the error to the subscriber", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        throw error;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(isEmpty());
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should not emit any value", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        throw error;
      });

      const nextSpy = vi.fn();
      try {
        await source.pipe(isEmpty()).subscribe(nextSpy);
      } catch (e) {
        // Expected error
      }

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe("performance characteristics", () => {
    it("should not process values after emitting false", async () => {
      const processSpy = vi.fn();
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        processSpy();
        yield 2;
        processSpy();
        yield 3;
      });

      await source.pipe(isEmpty());
      expect(processSpy).not.toHaveBeenCalled();
    });

    it("should complete quickly when source is empty", async () => {
      const source = AsyncObservable.from([]);

      const startTime = performance.now();
      await source.pipe(isEmpty());
      const endTime = performance.now();

      // Should complete very quickly (under 50ms)
      expect(endTime - startTime).toBeLessThan(50);
    });
  });
});
