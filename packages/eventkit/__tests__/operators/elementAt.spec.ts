import { AsyncObservable } from "@eventkit/async-observable";
import { elementAt } from "../../lib/operators/elementAt";
import { ArgumentOutOfRangeError } from "../../lib/utils/errors";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("elementAt", () => {
  describe("when index is valid", () => {
    it("should emit value at specified index", async () => {
      const source = AsyncObservable.from(["a", "b", "c", "d"]);

      const result: string[] = [];
      await source.pipe(elementAt(2)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual(["c"]);
    });

    it("should complete after emitting value", async () => {
      const source = AsyncObservable.from([10, 20, 30, 40, 50]);

      const completionSpy = vi.fn();
      const sub = source.pipe(elementAt(2)).subscribe(() => {});
      sub.finally(completionSpy);

      await sub;
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not emit any other values", async () => {
      const source = AsyncObservable.from([10, 20, 30, 40, 50]);

      const nextSpy = vi.fn();
      await source.pipe(elementAt(2)).subscribe(nextSpy);

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).toHaveBeenCalledWith(30);
    });

    it("should emit value at specified index using singleton object", async () => {
      const source = AsyncObservable.from(["a", "b", "c", "d"]);
      expect(await source.pipe(elementAt(2))).toEqual("c");
    });
  });

  describe("when index is out of range", () => {
    it("should emit default value if provided", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const defaultValue = 999;

      const result: number[] = [];
      await source.pipe(elementAt(10, defaultValue)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([defaultValue]);
    });

    it("should throw ArgumentOutOfRangeError if no default value", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let capturedError: Error | null = null;
      try {
        await source.pipe(elementAt(10)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBeInstanceOf(ArgumentOutOfRangeError);
    });

    it("should emit default value if no default value is provided using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      await expect(source.pipe(elementAt(10))).rejects.toThrow(ArgumentOutOfRangeError);
    });
  });

  describe("when index is negative", () => {
    it("should throw ArgumentOutOfRangeError immediately", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      expect(() => {
        source.pipe(elementAt(-1));
      }).toThrow(ArgumentOutOfRangeError);
    });
  });

  describe("when source completes before reaching index", () => {
    it("should emit default value if provided", async () => {
      const source = AsyncObservable.from([1, 2]);
      const defaultValue = 999;

      const result: number[] = [];
      await source.pipe(elementAt(5, defaultValue)).subscribe((value) => {
        result.push(value);
      });

      expect(result).toEqual([defaultValue]);
    });

    it("should throw ArgumentOutOfRangeError if no default value", async () => {
      const source = AsyncObservable.from([1, 2]);

      let capturedError: Error | null = null;
      try {
        await source.pipe(elementAt(5)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBeInstanceOf(ArgumentOutOfRangeError);
    });

    it("should emit default value if no default value is provided using singleton object", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      await expect(source.pipe(elementAt(5))).rejects.toThrow(ArgumentOutOfRangeError);
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

      let capturedError: Error | null = null;
      try {
        await source.pipe(elementAt(3)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });

    it("should propagate error when using singleton object", async () => {
      const error = new Error("source error");
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        await delay(5);
        throw error;
      });
      await expect(source.pipe(elementAt(3))).rejects.toThrow(error);
    });
  });

  describe("when source emits multiple values", () => {
    it("should only emit the value at the specified index", async () => {
      const source = AsyncObservable.from(["a", "b", "c", "d", "e"]);

      const nextSpy = vi.fn();
      await source.pipe(elementAt(2)).subscribe(nextSpy);

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).toHaveBeenCalledWith("c");
    });

    it("should ignore values after the specified index", async () => {
      const source = new AsyncObservable(async function* () {
        yield "a";
        yield "b";
        yield "c"; // This is index 2
        yield "d"; // This should be ignored
        yield "e"; // This should be ignored
      });

      const nextSpy = vi.fn();
      await source.pipe(elementAt(2)).subscribe(nextSpy);

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).toHaveBeenCalledWith("c");
    });

    it("should emit value at specified index using singleton object", async () => {
      const source = AsyncObservable.from(["a", "b", "c", "d", "e"]);
      expect(await source.pipe(elementAt(2))).toEqual("c");
    });
  });
});
