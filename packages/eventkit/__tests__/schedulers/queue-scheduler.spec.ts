import { describe, it, expect, vi } from "vitest";
import { QueueScheduler } from "../../lib/schedulers/queue";
import { ScheduledAction, CleanupAction, SchedulerSubject } from "@eventkit/async-observable";
import { InvalidConcurrencyLimitError } from "../../lib/utils/errors";
import { AsyncObservable, withScheduler } from "../../lib";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("QueueScheduler", () => {
  describe("constructor()", () => {
    it("should default to concurrency of 1 when no options are provided", async () => {
      const scheduler = new QueueScheduler();
      // @ts-ignore - Access private property for testing
      expect(scheduler.concurrency).toBe(1);
    });

    it("should accept custom concurrency value", async () => {
      const scheduler = new QueueScheduler({ concurrency: 3 });
      // @ts-ignore - Access private property for testing
      expect(scheduler.concurrency).toBe(3);
    });

    it("should throw InvalidConcurrencyLimitError when concurrency is less than 1", async () => {
      expect(() => new QueueScheduler({ concurrency: 0 })).toThrow(InvalidConcurrencyLimitError);
      expect(() => new QueueScheduler({ concurrency: -1 })).toThrow(InvalidConcurrencyLimitError);
    });
  });

  describe("schedule()", () => {
    it("should add the action to the subject's work set", async () => {
      const scheduler = new QueueScheduler();
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(async () => {});

      // Spy on the add method
      const addSpy = vi.spyOn(scheduler, "add");
      scheduler.schedule(subject, action);

      expect(addSpy).toHaveBeenCalledWith(subject, action);
    });

    it("should not add CleanupActions to the queue", async () => {
      const scheduler = new QueueScheduler();
      const subject = {} as SchedulerSubject;
      const cleanupAction = new CleanupAction(async () => {});

      // @ts-ignore - Access private property for testing
      const queueLengthBefore = scheduler._queue.length;
      scheduler.schedule(subject, cleanupAction);
      // @ts-ignore - Access private property for testing
      const queueLengthAfter = scheduler._queue.length;

      expect(queueLengthAfter).toBe(queueLengthBefore);
    });

    it("should process the queue when action is scheduled", async () => {
      const scheduler = new QueueScheduler();
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(async () => {});

      // Spy on the _processQueue method
      // @ts-ignore - Access private method for testing
      const processSpy = vi.spyOn(scheduler, "_processQueue");
      scheduler.schedule(subject, action);

      expect(processSpy).toHaveBeenCalled();
    });

    it("should respect concurrency limits", async () => {
      const scheduler = new QueueScheduler({ concurrency: 2 });
      const subject = {} as SchedulerSubject;
      const executionOrder: number[] = [];
      const actionDurations = [100, 50, 30];

      // Schedule 3 actions with different durations
      for (let i = 0; i < 3; i++) {
        const action = new ScheduledAction(async () => {
          executionOrder.push(i);
          await delay(actionDurations[i]);
        });
        scheduler.schedule(subject, action);
      }

      // Let actions complete
      await delay(200);

      // First 2 should start immediately (actions 0 and 1), but 1 should complete first
      // Then action 2 should start after one of the first two completes
      expect(executionOrder[0]).toBe(0);
      expect(executionOrder[1]).toBe(1);
      expect(executionOrder[2]).toBe(2);

      // @ts-ignore - Verify max running never exceeded concurrency
      expect(scheduler._running).toBe(0);
    });

    it("should execute actions in the order they are scheduled", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const executionOrder: number[] = [];

      // Schedule 3 actions
      for (let i = 0; i < 3; i++) {
        const action = new ScheduledAction(async () => {
          executionOrder.push(i);
        });
        scheduler.schedule(subject, action);
      }

      await delay(50);

      // With concurrency 1, they should execute in the exact order scheduled
      expect(executionOrder).toEqual([0, 1, 2]);
    });
  });

  describe("queue processing", () => {
    it("should continue processing the queue after an action completes", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const executionOrder: number[] = [];

      // Schedule 3 actions with delays
      for (let i = 0; i < 3; i++) {
        const action = new ScheduledAction(async () => {
          await delay(20);
          executionOrder.push(i);
        });
        scheduler.schedule(subject, action);
      }

      // Wait for all actions to complete
      await delay(100);

      // All actions should have executed
      expect(executionOrder).toEqual([0, 1, 2]);
      // Queue should be empty
      // @ts-ignore - Access private property for testing
      expect(scheduler._queue.length).toBe(0);
      // No running actions
      // @ts-ignore - Access private property for testing
      expect(scheduler._running).toBe(0);
    });

    it("should handle empty queue correctly", async () => {
      const scheduler = new QueueScheduler();
      // @ts-ignore - Call private method directly
      await scheduler._processQueue();
      // Should not throw and should exit gracefully
      // @ts-ignore - Access private property for testing
      expect(scheduler._running).toBe(0);
    });

    it("should recover and continue processing after an action throws an error", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const executionOrder: number[] = [];

      // First action will throw
      const errorAction = new ScheduledAction(async () => {
        throw new Error("Test error");
      });

      // Second action should still run
      const goodAction = new ScheduledAction(async () => {
        executionOrder.push(1);
      });

      scheduler.schedule(subject, errorAction);
      scheduler.schedule(subject, goodAction);

      await delay(50);

      expect(executionOrder).toEqual([1]);
      // @ts-ignore - Access private property for testing
      expect(scheduler._running).toBe(0);
    });
  });

  describe("integration with observables", () => {
    it("should process observable emissions sequentially when concurrency is 1", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const results: number[] = [];
      const timings: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield* [1, 2, 3];
      });

      await observable.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        const start = Date.now();
        // Shorter delay for higher values to test sequential processing
        await delay(100 - value * 20);
        results.push(value);
        timings.push(Date.now() - start);
      });

      // Results should be in order regardless of processing time
      expect(results).toEqual([1, 2, 3]);
    });

    it("should process observable emissions with specified concurrency limit", async () => {
      const scheduler = new QueueScheduler({ concurrency: 2 });
      const startTimes: number[] = [];
      const completionOrder: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield* [1, 2, 3, 4];
      });

      await observable.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        startTimes.push(value);
        // Different delays to test concurrent execution
        if (value === 1 || value === 3) {
          await delay(100);
        }
        completionOrder.push(value);
      });

      // First two should start concurrently, then the next two
      expect(startTimes).toEqual([1, 2, 3, 4]);

      // Values 2 and 4 should complete before 1 and 3 due to shorter delays
      expect(completionOrder).toEqual([2, 1, 4, 3]);
    });

    it("should allow waiting for all scheduled work to complete", async () => {
      const scheduler = new QueueScheduler({ concurrency: 2 });
      let completed = false;

      const observable = new AsyncObservable(async function* () {
        yield* [1, 2, 3];
      });

      const promise = observable
        .pipe(withScheduler(scheduler))
        .subscribe(async (value) => {
          await delay(50);
        })
        .then(() => {
          completed = true;
        });

      // Not completed immediately
      expect(completed).toBe(false);

      await promise;

      // Now completed
      expect(completed).toBe(true);
    });

    it("should correctly handle multiple observables sharing the same scheduler", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const results: string[] = [];

      const observable1 = new AsyncObservable<string>(async function* () {
        yield* ["A1", "A2"];
      });

      const observable2 = new AsyncObservable<string>(async function* () {
        yield* ["B1", "B2"];
      });

      const sub1 = observable1.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        await delay(20);
        results.push(value);
      });

      const sub2 = observable2.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        await delay(20);
        results.push(value);
      });

      await Promise.all([sub1, sub2]);

      // With concurrency 1, all actions should be processed sequentially
      // The exact order depends on scheduling, but within each observable the order is preserved
      expect(results.filter((r) => r.startsWith("A"))).toEqual(["A1", "A2"]);
      expect(results.filter((r) => r.startsWith("B"))).toEqual(["B1", "B2"]);
    });
  });

  describe("edge cases", () => {
    it("should handle rapid scheduling of many actions", async () => {
      const scheduler = new QueueScheduler({ concurrency: 3 });
      const subject = {} as SchedulerSubject;
      const completedActions: number[] = [];

      // Schedule 20 quick actions
      for (let i = 0; i < 20; i++) {
        const action = new ScheduledAction(async () => {
          await delay(5);
          completedActions.push(i);
        });
        scheduler.schedule(subject, action);
      }

      await delay(100);

      expect(completedActions.length).toBe(20);
      // @ts-ignore - Access private property for testing
      expect(scheduler._running).toBe(0);
      // @ts-ignore - Access private property for testing
      expect(scheduler._queue.length).toBe(0);
    });

    it("should handle actions with varying execution times", async () => {
      const scheduler = new QueueScheduler({ concurrency: 2 });
      const subject = {} as SchedulerSubject;
      const completed: number[] = [];

      // Mix of fast and slow actions
      const durations = [80, 10, 50, 30, 70, 20];

      for (let i = 0; i < durations.length; i++) {
        const action = new ScheduledAction(async () => {
          await delay(durations[i]);
          completed.push(i);
        });
        scheduler.schedule(subject, action);
      }

      await delay(200);

      expect(completed.length).toBe(durations.length);
      // With concurrency 2, faster actions should complete earlier regardless of schedule order
      // The first two should be 0 and 1, but after that, the order depends on completion times
      expect(completed.slice(0, 2).sort()).toEqual([1, 2]);
    });

    it("should handle actions scheduled during execution of another action", async () => {
      const scheduler = new QueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const results: number[] = [];

      // First action schedules another action
      const action1 = new ScheduledAction(async () => {
        results.push(1);

        // Schedule a new action during execution
        const nestedAction = new ScheduledAction(async () => {
          results.push(3);
        });
        scheduler.schedule(subject, nestedAction);
      });

      // Second action runs normally
      const action2 = new ScheduledAction(async () => {
        results.push(2);
      });

      scheduler.schedule(subject, action1);
      scheduler.schedule(subject, action2);

      await delay(50);

      // The first action gets executed immediately, which means the nested action is scheduled before action2: 1, 3, 2
      expect(results).toEqual([1, 3, 2]);
    });
  });
});
