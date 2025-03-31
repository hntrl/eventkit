import { AsyncObservable } from "@eventkit/async-observable";
import { retry } from "../../lib/operators/retry";
import { map, filter, dlq } from "../../lib/operators";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("retry", () => {
  describe("when subscriber callback throws an error", () => {
    it("should retry the callback", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      let errorThrown = false;

      try {
        await source.pipe(retry()).subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            if (attemptCount <= 1) {
              errorThrown = true;
              throw new Error("test error");
            }
          }
        });
      } catch (err) {
        // Should not reach here if retry succeeds
      }

      expect(attemptCount).toBe(2);
      expect(errorThrown).toBe(true);
    });

    it("should succeed if retry succeeds", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const results: number[] = [];

      let attemptCount = 0;

      await source.pipe(retry()).subscribe((value) => {
        if (value === 2) {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("test error");
          }
        }
        results.push(value);
      });

      expect(attemptCount).toBe(2);
      expect(results).toEqual([1, 2, 3]);
    });

    it("should propagate error after all retries fail", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const results: number[] = [];

      let attemptCount = 0;

      let error: Error | null = null;
      try {
        await source.pipe(retry({ limit: 2 })).subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            throw new Error("persistent error");
          }
          results.push(value);
        });
      } catch (err) {
        error = err as Error;
      }

      expect(attemptCount).toBe(3);
      expect(error).not.toBeNull();
      expect(error?.message).toBe("persistent error");
      expect(results).toEqual([1, 3]);
    });

    it("should use default limit of 1 retry when not specified", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      let error: Error | null = null;

      try {
        await source.pipe(retry()).subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            throw new Error("test error");
          }
        });
      } catch (err) {
        error = err as Error;
      }

      expect(attemptCount).toBe(2); // Original + 1 retry
      expect(error).not.toBeNull();
    });
  });

  describe("when using retry limit", () => {
    it("should retry exact number of times specified", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      let error: Error | null = null;

      try {
        await source.pipe(retry({ limit: 3 })).subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            throw new Error("test error");
          }
        });
      } catch (err) {
        error = err as Error;
      }

      expect(attemptCount).toBe(4); // Original + 3 retries
      expect(error).not.toBeNull();
    });

    it("should succeed on last retry if successful", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const results: number[] = [];

      let attemptCount = 0;

      await source.pipe(retry({ limit: 3 })).subscribe((value) => {
        if (value === 2) {
          attemptCount++;
          if (attemptCount < 3) {
            // Succeed on the 3rd attempt (2 failures)
            throw new Error("test error");
          }
        }
        results.push(value);
      });

      expect(attemptCount).toBe(3);
      expect(results).toEqual([1, 2, 3]);
    });

    it("should propagate error after limit is reached", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      let error: Error | null = null;

      try {
        await source.pipe(retry({ limit: 2 })).subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            throw new Error("persistent error");
          }
        });
      } catch (err) {
        error = err as Error;
      }

      expect(attemptCount).toBe(3); // Original + 2 retries
      expect(error?.message).toBe("persistent error");
    });

    it("should handle unlimited retries when limit is not specified", async () => {
      vi.useFakeTimers();

      const source = AsyncObservable.from([1, 2, 3]);
      const errorSpy = vi.fn();
      const completionSpy = vi.fn();

      let attemptCount = 0;
      const MAX_ATTEMPTS = 10; // Arbitrary limit for the test

      const promise = source
        .pipe(retry({ limit: Infinity }))
        .subscribe((value) => {
          if (value === 2) {
            attemptCount++;
            if (attemptCount < MAX_ATTEMPTS) {
              throw new Error("test error");
            }
          }
        })
        .catch(errorSpy)
        .finally(completionSpy);

      // Fast-forward time to simulate all retries
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await vi.runAllTimersAsync();
      }

      await promise;

      expect(attemptCount).toBe(MAX_ATTEMPTS);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("when using delay", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should wait specified time before retrying", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      const startTime = Date.now();
      let retriedAt = 0;

      const promise = source.pipe(retry({ delay: 1000 })).subscribe((value) => {
        if (value === 2) {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("test error");
          } else {
            retriedAt = Date.now() - startTime;
          }
        }
      });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(attemptCount).toBe(2);
      expect(retriedAt).toBeGreaterThanOrEqual(1000);
    });

    it("should not delay when delay is not specified", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;
      const timeSpy = vi.fn();

      const mockSetTimeout = vi.spyOn(global, "setTimeout");

      await source.pipe(retry()).subscribe((value) => {
        if (value === 2) {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("test error");
          }
        }
      });

      // setTimeout should be called with 0 or not at all for the retry
      const timeoutCalls = mockSetTimeout.mock.calls.filter((call) => call[1] === 0);
      expect(timeoutCalls.length).toBe(0);

      mockSetTimeout.mockRestore();
    });

    it("should handle zero delay", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      let attemptCount = 0;

      await source.pipe(retry({ delay: 0 })).subscribe((value) => {
        if (value === 2) {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("test error");
          }
        }
      });

      expect(attemptCount).toBe(2);
    });
  });

  describe("when using backoff strategies", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should maintain constant delay with 'constant' strategy", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const baseDelay = 100;

      const mockSetTimeout = vi.spyOn(global, "setTimeout");

      let attemptCount = 0;

      try {
        const promise = source
          .pipe(
            retry({
              limit: 3,
              delay: baseDelay,
              backoff: "constant",
            })
          )
          .subscribe((value) => {
            if (value === 2) {
              attemptCount++;
              throw new Error("test error");
            }
          });

        // Fast-forward time for each retry
        const promiseResult = promise.catch(() => {});
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(baseDelay);
        }
        await promiseResult;
      } catch (err) {
        // Expected to throw after all retries
      }

      // Check all setTimeout calls used the same delay
      const timeoutCalls = mockSetTimeout.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] >= baseDelay
      );

      expect(timeoutCalls.length).toBe(3); // 3 retries
      timeoutCalls.forEach((call) => {
        expect(call[1]).toBe(baseDelay);
      });

      mockSetTimeout.mockRestore();
    });

    it("should increase delay linearly with 'linear' strategy", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const baseDelay = 100;

      const mockSetTimeout = vi.spyOn(global, "setTimeout");

      let attemptCount = 0;

      try {
        const promise = source
          .pipe(
            retry({
              limit: 3,
              delay: baseDelay,
              backoff: "linear",
            })
          )
          .subscribe((value) => {
            if (value === 2) {
              attemptCount++;
              throw new Error("test error");
            }
          });

        // Fast-forward time for each retry with increasing delays
        const promiseResult = promise.catch(() => {});
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(baseDelay * (i + 1));
        }
        await promiseResult;
      } catch (err) {
        // Expected to throw after all retries
      }

      // Check setTimeout calls used increasing delays
      const timeoutCalls = mockSetTimeout.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] >= baseDelay
      );

      expect(timeoutCalls.length).toBe(3); // 3 retries
      expect(timeoutCalls[0][1]).toBe(baseDelay);
      expect(timeoutCalls[1][1]).toBe(baseDelay * 2);
      expect(timeoutCalls[2][1]).toBe(baseDelay * 3);

      mockSetTimeout.mockRestore();
    });

    it("should increase delay exponentially with 'exponential' strategy", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const baseDelay = 100;

      const mockSetTimeout = vi.spyOn(global, "setTimeout");

      let attemptCount = 0;

      try {
        const promise = source
          .pipe(
            retry({
              limit: 3,
              delay: baseDelay,
              backoff: "exponential",
            })
          )
          .subscribe((value) => {
            if (value === 2) {
              attemptCount++;
              throw new Error("test error");
            }
          });

        // Fast-forward time for each retry with exponentially increasing delays
        let currentDelay = baseDelay;
        const promiseResult = promise.catch(() => {});
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(currentDelay);
          currentDelay *= 2;
        }
        await promiseResult;
      } catch (err) {
        // Expected to throw after all retries
      }

      // Check setTimeout calls used exponentially increasing delays
      const timeoutCalls = mockSetTimeout.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] >= baseDelay
      );

      expect(timeoutCalls.length).toBe(3); // 3 retries
      expect(timeoutCalls[0][1]).toBe(baseDelay);
      expect(timeoutCalls[1][1]).toBe(baseDelay * 2);
      expect(timeoutCalls[2][1]).toBe(baseDelay * 4);

      mockSetTimeout.mockRestore();
    });
  });

  describe("when error occurs in generator function", () => {
    it("should not retry", async () => {
      const error = new Error("generator error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(retry({ limit: 3 })).subscribe((value) => {
          // This shouldn't be retried
        });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should propagate error immediately", async () => {
      const error = new Error("generator error");
      let generatorExecutionCount = 0;

      const source = new AsyncObservable(async function* () {
        generatorExecutionCount++;
        yield 1;
        throw error;
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(retry({ limit: 3 })).subscribe((value) => {
          // This shouldn't be retried
        });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
      expect(generatorExecutionCount).toBe(1); // Generator should only run once
    });
  });

  describe("when error occurs during cleanup", () => {
    it("should not retry", async () => {
      const error = new Error("cleanup error");
      const source = new AsyncObservable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          throw error;
        }
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(retry({ limit: 3 })).subscribe((value) => {
          // This shouldn't be retried
        });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
    });

    it("should propagate error immediately", async () => {
      const error = new Error("cleanup error");
      let cleanupCount = 0;

      const source = new AsyncObservable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          cleanupCount++;
          throw error;
        }
      });

      let caughtError: Error | null = null;
      try {
        await source.pipe(retry({ limit: 3 })).subscribe((value) => {
          // This shouldn't be retried
        });
      } catch (err) {
        caughtError = err as Error;
      }

      expect(caughtError).toBe(error);
      expect(cleanupCount).toBe(1); // Cleanup should only run once
    });
  });

  describe("when multiple subscribers throw errors", () => {
    it("should retry each independently", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const results1: number[] = [];
      const results2: number[] = [];

      let attemptCount1 = 0;
      let attemptCount2 = 0;

      await Promise.all([
        source.pipe(retry()).subscribe((value) => {
          if (value === 2) {
            attemptCount1++;
            if (attemptCount1 === 1) {
              throw new Error("error in first subscriber");
            }
          }
          results1.push(value);
        }),
        source.pipe(retry()).subscribe((value) => {
          if (value === 3) {
            attemptCount2++;
            if (attemptCount2 === 1) {
              throw new Error("error in second subscriber");
            }
          }
          results2.push(value);
        }),
      ]);

      expect(attemptCount1).toBe(2);
      expect(attemptCount2).toBe(2);
      expect(results1).toEqual([1, 2, 3]);
      expect(results2).toEqual([1, 2, 3]);
    });

    it("should not affect other subscribers", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const results1: number[] = [];
      const results2: number[] = [];

      // First subscriber will always fail
      const sub1Promise = source
        .pipe(retry({ limit: 1 }))
        .subscribe((value) => {
          if (value === 2) {
            throw new Error("persistent error");
          }
          results1.push(value);
        })
        .catch(() => {
          // Ignore the error
        });

      // Second subscriber should complete normally
      const sub2Promise = source.pipe(retry()).subscribe((value) => {
        results2.push(value);
      });

      await Promise.all([sub1Promise, sub2Promise]);

      expect(results1).toEqual([1, 3]);
      expect(results2).toEqual([1, 2, 3]);
    });
  });

  describe("when combining with other operators", () => {
    it("should work with map", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const results: number[] = [];

      let attemptCount = 0;

      await source
        .pipe(
          map((value) => value * 10),
          retry()
        )
        .subscribe((value) => {
          if (value === 20) {
            attemptCount++;
            if (attemptCount === 1) {
              throw new Error("test error");
            }
          }
          results.push(value);
        });

      expect(attemptCount).toBe(2);
      expect(results).toEqual([10, 20, 30]);
    });

    it("should work with filter", async () => {
      const source = AsyncObservable.from([1, 2, 3, 4]);
      const results: number[] = [];

      let attemptCount = 0;

      await source
        .pipe(
          filter((value) => value % 2 === 0),
          retry()
        )
        .subscribe((value) => {
          if (value === 4) {
            attemptCount++;
            if (attemptCount === 1) {
              throw new Error("test error");
            }
          }
          results.push(value);
        });

      expect(attemptCount).toBe(2);
      expect(results).toEqual([2, 4]);
    });

    it("should work correctly with dlq", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      // Apply retry first, then dlq
      const [handled$, errors$] = source.pipe(retry({ limit: 1 }), dlq());

      const results: number[] = [];
      const errorResults: Error[] = [];

      errors$.subscribe((err) => {
        errorResults.push(err as Error);
      });

      await handled$.subscribe((value) => {
        if (value === 2) {
          throw new Error("persistent error");
        }
        results.push(value);
      });

      // Should have tried the value 2 twice (original + 1 retry) before giving up
      expect(results).toEqual([1, 3]);
      expect(errorResults.length).toBe(1);
      expect(errorResults[0].message).toBe("persistent error");
    });
  });

  describe("when source completes", () => {
    it("should complete normally", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const completionSpy = vi.fn();
      const sub = source.pipe(retry()).subscribe((value) => {
        // No errors
      });
      sub.finally(completionSpy);

      await sub;

      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not affect completed callbacks", async () => {
      const source = AsyncObservable.from([1, 2, 3]);

      const results: number[] = [];
      const completionOrder: string[] = [];

      const sub = source.pipe(retry()).subscribe((value) => {
        results.push(value);
      });

      sub.finally(() => {
        completionOrder.push("complete called");
      });

      await sub;

      completionOrder.push("subscribe promise resolved");

      expect(results).toEqual([1, 2, 3]);
      expect(completionOrder).toEqual(["complete called", "subscribe promise resolved"]);
    });
  });
});
