import { AsyncObservable } from "@eventkit/async-observable";
import { dlq } from "../../lib/operators/dlq";
import { map, filter, merge } from "../../lib/operators";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("dlq", () => {
  describe("when subscriber callback throws an error", () => {
    it("should catch the error", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("test error");

      const completionSpy = vi.fn();
      const errorSpy = vi.fn();

      const sub = handled$.subscribe((value) => {
        if (value === 2) throw error;
      });
      sub.finally(completionSpy);

      errors$.subscribe(errorSpy);

      await sub;

      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(error);
    });

    it("should emit the error to the dlq observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("test error");
      const errorResults: Error[] = [];

      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.subscribe((value) => {
        if (value === 2) throw error;
      });

      expect(errorResults).toEqual([error]);
    });

    it("should continue processing subsequent values", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const results: number[] = [];

      await handled$.subscribe((value) => {
        if (value === 2) throw new Error("test error");
        results.push(value);
      });

      expect(results).toEqual([1, 3]);
    });

    it("should not propagate the error to the source", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      await handled$.subscribe((value) => {
        if (value === 2) throw new Error("test error");
      });

      await expect(source.drain()).resolves.not.toThrow();
    });
  });

  describe("when multiple subscribers throw errors", () => {
    it("should catch all errors", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error1 = new Error("error 1");
      const error2 = new Error("error 2");

      const errorSpy = vi.fn();
      errors$.subscribe(errorSpy);

      await Promise.all([
        handled$.subscribe((value) => {
          if (value === 2) throw error1;
        }),
        handled$.subscribe((value) => {
          if (value === 3) throw error2;
        }),
      ]);

      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(error1);
      expect(errorSpy).toHaveBeenCalledWith(error2);
    });

    it("should emit all errors to the dlq observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error1 = new Error("error 1");
      const error2 = new Error("error 2");

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await Promise.all([
        handled$.subscribe((value) => {
          if (value === 2) throw error1;
        }),
        handled$.subscribe((value) => {
          if (value === 3) throw error2;
        }),
      ]);

      expect(errorResults.length).toBe(2);
      expect(errorResults).toContain(error1);
      expect(errorResults).toContain(error2);
    });

    it("should maintain correct order of error emissions", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error1 = new Error("error 1");
      const error2 = new Error("error 2");
      const error3 = new Error("error 3");

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.subscribe(async (value) => {
        if (value === 1) {
          await delay(30); // Delay the first error
          throw error1;
        } else if (value === 2) {
          await delay(10); // Medium delay
          throw error2;
        } else if (value === 3) {
          // No delay
          throw error3;
        }
      });

      // Errors should be emitted in the order they occur
      expect(errorResults[0]).toBe(error3);
      expect(errorResults[1]).toBe(error2);
      expect(errorResults[2]).toBe(error1);
    });
  });

  describe("when error occurs in generator function", () => {
    it("should not catch the error", async () => {
      const error = new Error("generator error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const [handled$, errors$] = source.pipe(dlq());

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      let caughtError: Error | null = null;
      try {
        await handled$.subscribe((value) => {});
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
      expect(errorResults).toEqual([]);
    });

    it("should propagate the error to the source", async () => {
      const error = new Error("generator error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const [handled$, errors$] = source.pipe(dlq());

      let sourceError: Error | null = null;
      try {
        await handled$.subscribe(() => {});
      } catch (err) {
        sourceError = err as Error;
      }

      let handledError: Error | null = null;
      try {
        await handled$.subscribe(() => {});
      } catch (err) {
        handledError = err as Error;
      }

      expect(sourceError).toBe(error);
      expect(handledError).toBe(error);
    });
  });

  describe("when error occurs during cleanup", () => {
    it("should not catch the error", async () => {
      const error = new Error("cleanup error");
      const source = new AsyncObservable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          throw error;
        }
      });

      const [handled$, errors$] = source.pipe(dlq());

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      let caughtError: Error | null = null;
      try {
        await handled$.subscribe((value) => {});
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
      expect(errorResults).toEqual([]);
    });

    it("should propagate the error to the source", async () => {
      const error = new Error("cleanup error");
      const source = new AsyncObservable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          throw error;
        }
      });

      const [handled$, errors$] = source.pipe(dlq());

      let handledError: Error | null = null;
      try {
        await handled$.subscribe(() => {});
      } catch (err) {
        handledError = err as Error;
      }

      expect(handledError).toBe(error);
    });
  });

  describe("when dlq observable is subscribed to", () => {
    it("should handle multiple subscribers to the dlq observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("test error");

      const errorResults1: Error[] = [];
      const errorResults2: Error[] = [];

      errors$.subscribe((err) => {
        errorResults1.push(err);
      });

      errors$.subscribe((err) => {
        errorResults2.push(err);
      });

      await handled$.subscribe((value) => {
        if (value === 2) throw error;
      });

      expect(errorResults1).toEqual([error]);
      expect(errorResults2).toEqual([error]);
    });

    it("should not block source completion", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("test error");

      const completionSpy = vi.fn();
      const sub = handled$.subscribe((value) => {
        if (value === 2) throw error;
      });
      sub.finally(completionSpy);

      errors$.subscribe(() => {
        // Intentionally slow subscription
        return delay(50);
      });

      await sub;

      expect(completionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when handledObservable completes", () => {
    it("should complete normally", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const completionSpy = vi.fn();
      const sub = handled$.subscribe((value) => {
        // No errors
      });
      sub.finally(completionSpy);

      await sub;

      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not affect the dlq observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      await handled$.subscribe((value) => {
        // No errors
      });

      // After handled$ completes, errors$ should still be able to receive errors
      const error = new Error("late error");

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.subscribe((value) => {
        if (value === 2) throw error;
      });

      expect(errorResults).toEqual([error]);
    });
  });

  describe("when source is cancelled", () => {
    it("should cancel the handledObservable", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(100);
        yield 2;
        yield 3;
      });

      const [handled$, errors$] = source.pipe(dlq());

      const results: number[] = [];
      const sub = handled$.subscribe((value) => {
        results.push(value);
      });

      await delay(10); // Let the first value be emitted
      await sub.cancel();

      expect(results).toEqual([1]);
    });

    it("should not affect the dlq observable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const sub1 = handled$.subscribe((value) => {});
      await sub1.cancel();

      const error = new Error("error after cancel");

      const errorResults: Error[] = [];
      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.subscribe((value) => {
        if (value === 2) throw error;
      });

      expect(errorResults).toEqual([error]);
    });
  });

  describe("when using with other operators", () => {
    it("should work with map", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("map error");
      const results: number[] = [];
      const errorResults: Error[] = [];

      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.pipe(map((value) => value * 10)).subscribe((value) => {
        if (value === 20) throw error;
        results.push(value);
      });

      expect(results).toEqual([10, 30]);
      expect(errorResults).toEqual([error]);
    });

    it("should work with filter", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const [handled$, errors$] = source.pipe(dlq());

      const error = new Error("filter error");
      const results: number[] = [];
      const errorResults: Error[] = [];

      errors$.subscribe((err) => {
        errorResults.push(err);
      });

      await handled$.pipe(filter((value) => value % 2 === 0)).subscribe((value) => {
        if (value === 4) throw error;
        results.push(value);
      });

      expect(results).toEqual([2]);
      expect(errorResults).toEqual([error]);
    });
  });

  describe("when dlq subscriber throws an error", () => {
    it("should propagate the error", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      const dlqError = new Error("dlq error");

      let caughtError: Error | null = null;
      const sub = errors$
        .subscribe((err) => {
          throw dlqError;
        })
        .catch((err) => {
          caughtError = err;
        });

      await handled$.subscribe((value) => {
        if (value === 2) throw new Error("handled error");
      });

      await sub;
      expect(caughtError).toBe(dlqError);
    });

    it("should not affect the handledObservable", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const [handled$, errors$] = source.pipe(dlq());

      // This subscriber should throw but we'll ignore its error
      errors$.subscribe((err) => {
        throw new Error("dlq error");
      });

      try {
        // This is just to trigger an error, we don't care about its completion
        errors$.subscribe((err) => {
          throw new Error("another dlq error");
        });
      } catch (e) {
        // Ignore
      }

      // This should still work normally
      const results: number[] = [];
      await handled$.subscribe((value) => {
        results.push(value);
      });

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
