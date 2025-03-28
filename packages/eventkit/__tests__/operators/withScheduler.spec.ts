import { AsyncObservable, Scheduler, CallbackAction } from "@eventkit/async-observable";
import { QueueScheduler } from "../../lib/schedulers";
import { withScheduler, withOwnScheduler } from "../../lib/operators/withScheduler";
import { vi, describe, it, expect } from "vitest";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("withScheduler", () => {
  describe("when using QueueScheduler", () => {
    it("should process values sequentially", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const queueScheduler = new QueueScheduler();
      const processOrder: number[] = [];

      await source.pipe(withScheduler(queueScheduler)).subscribe(async (value) => {
        // Process in reverse order (3 completes first, then 2, then 1)
        await delay(100 - value * 30);
        processOrder.push(value);
      });

      // With queue scheduler, values should be processed in order
      // regardless of how long each value takes to process
      expect(processOrder).toEqual([1, 2, 3]);
    });

    it("should maintain order of emissions", async () => {
      const source = AsyncObservable.from([3, 1, 4, 2]);
      const queueScheduler = new QueueScheduler();
      const results: number[] = [];

      await source.pipe(withScheduler(queueScheduler)).subscribe((value) => {
        results.push(value);
      });

      // Order of emissions should be preserved
      expect(results).toEqual([3, 1, 4, 2]);
    });

    it("should wait for each value to be processed before next", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const queueScheduler = new QueueScheduler();
      const processingStarts: number[] = [];

      await source.pipe(withScheduler(queueScheduler)).subscribe(async (value) => {
        processingStarts.push(value);
        await delay(50); // Each value takes 50ms to process
      });

      // With queue scheduler, each value should start processing only after
      // the previous value's processing has completed
      expect(processingStarts).toEqual([1, 2, 3]);
    });

    it("should handle backpressure correctly", async () => {
      const source = new AsyncObservable<number>(async function* () {
        for (let i = 1; i <= 5; i++) {
          yield i;
          // In non-queue scheduler, this would allow all values to be emitted quickly
          await delay(10);
        }
      });

      const queueScheduler = new QueueScheduler();
      const processingTimes: { value: number; startTime: number }[] = [];
      const startTime = Date.now();

      await source.pipe(withScheduler(queueScheduler)).subscribe(async (value) => {
        processingTimes.push({ value, startTime: Date.now() - startTime });
        await delay(50); // Each value takes 50ms to process
      });

      // Verify that each value starts processing after the previous one finishes
      for (let i = 1; i < processingTimes.length; i++) {
        const prevProcessingEndTime = processingTimes[i - 1].startTime + 50;
        expect(processingTimes[i].startTime).toBeGreaterThanOrEqual(prevProcessingEndTime - 5); // Allow 5ms tolerance
      }
    });
  });

  describe("when using custom scheduler", () => {
    it("should use provided scheduler for execution", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const customScheduler = new Scheduler();
      const scheduleSpy = vi.spyOn(customScheduler, "schedule");

      await source.pipe(withScheduler(customScheduler)).subscribe((value) => {});

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("should forward work to parent scheduler", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const sourceScheduler = source._scheduler as Scheduler;
      const addSpy = vi.spyOn(sourceScheduler, "add");
      const customScheduler = new Scheduler();

      const sub = source.pipe(withScheduler(customScheduler)).subscribe((value) => {});
      await sub;

      expect(addSpy).toHaveBeenCalledWith(sub, expect.any(CallbackAction));
    });

    it("should maintain parent-child relationship", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const parentCompletionSpy = vi.fn();
      const childCompletionSpy = vi.fn();
      const customScheduler = new Scheduler();

      const childObservable = source.pipe(withScheduler(customScheduler));

      source.finally(parentCompletionSpy);
      childObservable.finally(childCompletionSpy);

      await source.drain();

      // Both parent and child completion handlers should be called
      expect(parentCompletionSpy).toHaveBeenCalledTimes(1);
      expect(childCompletionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("when source completes", () => {
    it("should complete after all scheduled work is done", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const queueScheduler = new QueueScheduler();
      const completionSpy = vi.fn();
      const workDoneSpy = vi.fn();

      const sub = source.pipe(withScheduler(queueScheduler)).subscribe(async (value) => {
        await delay(50); // Each value takes 50ms to process
        workDoneSpy();
      });

      sub.finally(completionSpy);
      await sub;

      expect(workDoneSpy).toHaveBeenCalledTimes(3);
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should wait for all queued work to complete", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const queueScheduler = new QueueScheduler();
      const workCompletedOrder: number[] = [];

      await source.pipe(withScheduler(queueScheduler)).subscribe(async (value) => {
        await delay(30 * (4 - value)); // 3 completes first, then 2, then 1
        workCompletedOrder.push(value);
      });

      // Even though work completion times differ, all work should complete before
      // the observable completes, and in sequential order due to QueueScheduler
      expect(workCompletedOrder).toEqual([1, 2, 3]);
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("test error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const queueScheduler = new QueueScheduler();

      let capturedError: Error | null = null;
      try {
        await source.pipe(withScheduler(queueScheduler)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });
  });

  describe("when multiple subscribers", () => {
    it("should maintain independent scheduling for each subscriber", async () => {
      const source = AsyncObservable.from([1, 2]);
      const scheduler1 = new QueueScheduler();
      const scheduler2 = new Scheduler(); // Default scheduler (parallel)

      const results: string[] = [];

      const obs1 = source.pipe(withScheduler(scheduler1));
      const obs2 = source.pipe(withScheduler(scheduler2));

      await Promise.all([
        obs1.subscribe(async (value) => {
          await delay(value * 30);
          results.push(`seq-${value}`);
        }),
        obs2.subscribe(async (value) => {
          await delay((3 - value) * 30);
          results.push(`par-${value}`);
        }),
      ]);

      // obs1 should be sequential, obs2 parallel (default scheduler)
      // With QueueScheduler: seq-1, seq-2
      // With default Scheduler: par-2, par-1 (because 2 has shorter delay)
      expect(results).toContain("seq-1");
      expect(results).toContain("seq-2");
      expect(results).toContain("par-1");
      expect(results).toContain("par-2");

      // Check sequential processing for obs1
      const seqIndex1 = results.indexOf("seq-1");
      const seqIndex2 = results.indexOf("seq-2");
      expect(seqIndex1).toBeLessThan(seqIndex2);
    });
  });

  describe("when work takes different amounts of time", () => {
    it("should not block on slow work", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const scheduler = new Scheduler(); // Default scheduler allows parallel work

      const results: number[] = [];
      const startTime = Date.now();

      await source.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        await delay(value * 30); // 3 takes longest (90ms), 1 shortest (30ms)
        results.push(value);
      });

      const totalTime = Date.now() - startTime;

      // With parallel execution, total time should be close to the longest task
      // (with some overhead), not the sum of all task durations
      expect(totalTime).toBeLessThan(150); // 90ms for longest task + some overhead

      // Results should be in order of task completion
      expect(results).toEqual([1, 2, 3]);
    });
  });
});

describe("withOwnScheduler", () => {
  describe("when using custom scheduler", () => {
    it("should use provided scheduler for execution", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const customScheduler = new Scheduler();
      const scheduleSpy = vi.spyOn(customScheduler, "schedule");

      await source.pipe(withOwnScheduler(customScheduler)).subscribe((value) => {});

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("should not forward work to parent scheduler", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const sourceScheduler = source._scheduler as Scheduler;
      const addSpy = vi.spyOn(sourceScheduler, "add");
      const customScheduler = new Scheduler();

      const sub = source.pipe(withOwnScheduler(customScheduler)).subscribe((value) => {});
      await sub;

      // No work should be forwarded to the parent scheduler
      expect(addSpy).not.toHaveBeenCalledWith(sub, expect.any(CallbackAction));
    });

    it("should decouple from parent scheduler", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const parentCompletionSpy = vi.fn();
      const childCompletionSpy = vi.fn();
      const customScheduler = new Scheduler();

      const childObservable = source.pipe(withOwnScheduler(customScheduler));

      source.finally(parentCompletionSpy);
      childObservable.finally(childCompletionSpy);

      // Only wait for the child observable
      await childObservable.drain();

      // Child completion handler should be called
      expect(childCompletionSpy).toHaveBeenCalledTimes(1);
      // Parent completion handler should not be called since we're only
      // waiting for the child observable
      expect(parentCompletionSpy).not.toHaveBeenCalled();
    });
  });

  describe("when source completes", () => {
    it("should complete after all scheduled work is done", async () => {
      const source = AsyncObservable.from([1, 2, 3]);
      const customScheduler = new Scheduler();
      const completionSpy = vi.fn();
      const workDoneSpy = vi.fn();

      const sub = source.pipe(withOwnScheduler(customScheduler)).subscribe(async (value) => {
        await delay(50);
        workDoneSpy();
      });

      sub.finally(completionSpy);
      await sub;

      expect(workDoneSpy).toHaveBeenCalledTimes(3);
      expect(completionSpy).toHaveBeenCalledTimes(1);
    });

    it("should not wait for parent work to complete", async () => {
      const source = new AsyncObservable(async function* () {
        yield 1;
        await delay(100); // Simulate long-running work in source
        yield 2;
      });

      const customScheduler = new Scheduler();
      const parentWorkSpy = vi.fn();
      const childWorkSpy = vi.fn();

      const childObservable = source.pipe(withOwnScheduler(customScheduler));

      // Set up concurrent subscribers
      source.subscribe(async () => {
        await delay(150); // Longer than source delay
        parentWorkSpy();
      });

      const childSub = childObservable.subscribe((value) => {
        childWorkSpy(value);
      });

      // Wait only for the child observable - should complete without waiting for parent work
      await childSub;

      expect(childWorkSpy).toHaveBeenCalledTimes(2);
      expect(childWorkSpy).toHaveBeenCalledWith(1);
      expect(childWorkSpy).toHaveBeenCalledWith(2);
      // Parent work shouldn't be done yet
      expect(parentWorkSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("when source errors", () => {
    it("should propagate error", async () => {
      const error = new Error("test error");
      const source = new AsyncObservable(async function* () {
        yield 1;
        throw error;
      });

      const customScheduler = new Scheduler();

      let capturedError: Error | null = null;
      try {
        await source.pipe(withOwnScheduler(customScheduler)).subscribe(() => {});
      } catch (e) {
        capturedError = e as Error;
      }

      expect(capturedError).toBe(error);
    });
  });

  describe("when multiple subscribers", () => {
    it("should process each subscriber's work independently", async () => {
      const source = AsyncObservable.from([1, 2]);
      const queueScheduler = new Scheduler();
      const results: string[] = [];

      const observable = source.pipe(withOwnScheduler(queueScheduler));

      await Promise.all([
        observable.subscribe(async (value) => {
          await delay(10);
          results.push(`sub1-${value}`);
        }),
        observable.subscribe(async (value) => {
          await delay(25);
          results.push(`sub2-${value}`);
        }),
      ]);

      // Since we're using QueueScheduler, each subscriber should process sequentially
      expect(results).toEqual(["sub1-1", "sub1-2", "sub2-1", "sub2-2"]);
    });

    it("should not coordinate with parent subscribers", async () => {
      const source = AsyncObservable.from([1, 2]);
      const parentResults: number[] = [];
      const childResults: number[] = [];

      // Set up parent subscriber
      source.subscribe((value) => {
        parentResults.push(value);
      });

      // Set up child observable with own scheduler
      const customScheduler = new Scheduler();
      const childObs = source.pipe(withOwnScheduler(customScheduler));

      await childObs.subscribe((value) => {
        childResults.push(value);
      });

      // Both should receive all values
      expect(parentResults).toEqual([1, 2]);
      expect(childResults).toEqual([1, 2]);
    });
  });

  describe("when work takes different amounts of time", () => {
    it("should process work according to scheduler rules", async () => {
      const source = AsyncObservable.from([3, 1, 2]);
      const queueScheduler = new QueueScheduler();
      const results: number[] = [];

      await source.pipe(withOwnScheduler(queueScheduler)).subscribe(async (value) => {
        await delay(value * 30); // 3 takes longest, 1 shortest
        results.push(value);
      });

      // With queue scheduler, the order should be preserved regardless of duration
      expect(results).toEqual([3, 1, 2]);
    });

    it("should not be affected by parent work timing", async () => {
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        await delay(100); // Long delay in source
        yield 2;
      });

      const customScheduler = new Scheduler();
      const results: number[] = [];
      const startTimes: number[] = [];
      const start = Date.now();

      await source.pipe(withOwnScheduler(customScheduler)).subscribe((value) => {
        startTimes.push(Date.now() - start);
        results.push(value);
      });

      // Values should be received quickly after they're yielded
      expect(results).toEqual([1, 2]);
      expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(90); // Close to 100ms delay
    });
  });
});
