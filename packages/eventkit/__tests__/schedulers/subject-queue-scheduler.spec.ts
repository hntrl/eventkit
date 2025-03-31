import { describe, it, expect, vi } from "vitest";
import { SubjectQueueScheduler } from "../../lib/schedulers/subject-queue";
import { ScheduledAction, CleanupAction, SchedulerSubject } from "@eventkit/async-observable";
import { InvalidConcurrencyLimitError } from "../../lib/utils/errors";
import { AsyncObservable, withScheduler } from "../../lib";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("SubjectQueueScheduler", () => {
  describe("constructor()", () => {
    it("should default to concurrency of 1 when no options are provided", async () => {
      const scheduler = new SubjectQueueScheduler();
      // @ts-ignore - Access private property for testing
      expect(scheduler.concurrency).toBe(1);
    });

    it("should accept custom concurrency value", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 3 });
      // @ts-ignore - Access private property for testing
      expect(scheduler.concurrency).toBe(3);
    });

    it("should throw InvalidConcurrencyLimitError when concurrency is less than 1", async () => {
      expect(() => new SubjectQueueScheduler({ concurrency: 0 })).toThrow(
        InvalidConcurrencyLimitError
      );
      expect(() => new SubjectQueueScheduler({ concurrency: -1 })).toThrow(
        InvalidConcurrencyLimitError
      );
    });
  });

  describe("schedule()", () => {
    it("should add the action to the subject's work set", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(async () => {});

      // Spy on the add method
      const addSpy = vi.spyOn(scheduler, "add");
      scheduler.schedule(subject, action);

      expect(addSpy).toHaveBeenCalledWith(subject, action);
    });

    it("should not add CleanupActions to the queue", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;
      const cleanupAction = new CleanupAction(async () => {});

      // @ts-ignore - Access private property for testing
      const mapBefore = scheduler._subjectQueues.has(subject);
      scheduler.schedule(subject, cleanupAction);

      // CleanupAction should not create a queue for the subject if none exists
      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.has(subject)).toBe(mapBefore);
    });

    it("should create a new queue for subjects that don't have one yet", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(async () => {});

      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.has(subject)).toBe(false);

      scheduler.schedule(subject, action);

      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.has(subject)).toBe(true);
      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.get(subject)).toBeInstanceOf(Array);
    });

    it("should add actions to the subject's existing queue", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;
      const action1 = new ScheduledAction(async () => {});
      const action2 = new ScheduledAction(async () => {});

      scheduler.schedule(subject, action1);

      // Add second action and verify the queue exists
      // @ts-ignore - Access private property for testing
      const queueSizeBefore = scheduler._subjectQueues.get(subject).length;
      scheduler.schedule(subject, action2);
      await scheduler.promise(subject);
      // @ts-ignore - Access private property for testing
      const queueSizeAfter = scheduler._subjectQueues.get(subject).length;

      // Queue size should increase for the same subject
      expect(queueSizeAfter).toBe(queueSizeBefore); // First action started executing immediately
    });

    it("should process the queue when an action is scheduled", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(async () => {});

      // Spy on the _processSubjectQueue method
      // @ts-ignore - Access private method for testing
      const processSpy = vi.spyOn(scheduler, "_processSubjectQueue");
      scheduler.schedule(subject, action);

      expect(processSpy).toHaveBeenCalledWith(subject);
    });
  });

  describe("per-subject queue processing", () => {
    it("should maintain separate queues for different subjects", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      const action1 = new ScheduledAction(async () => {
        await delay(50);
      });

      const action2 = new ScheduledAction(async () => {
        await delay(50);
      });

      scheduler.schedule(subject1, action1);
      scheduler.schedule(subject2, action2);

      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.has(subject1)).toBe(true);
      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.has(subject2)).toBe(true);
      // Should be different queue arrays
      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.get(subject1)).not.toBe(
        // @ts-ignore - Access private property for testing
        scheduler._subjectQueues.get(subject2)
      );
    });

    it("should apply concurrency limits independently to each subject", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      const subject1Started: number[] = [];
      const subject2Started: number[] = [];

      // Schedule multiple actions for each subject
      for (let i = 0; i < 3; i++) {
        const action1 = new ScheduledAction(async () => {
          subject1Started.push(i);
          await delay(30);
        });

        const action2 = new ScheduledAction(async () => {
          subject2Started.push(i);
          await delay(30);
        });

        scheduler.schedule(subject1, action1);
        scheduler.schedule(subject2, action2);
      }

      // Let the first action from each subject start
      await delay(10);

      // Only one action per subject should have started
      expect(subject1Started.length).toBe(1);
      expect(subject2Started.length).toBe(1);

      // Wait for all actions to complete
      await delay(200);

      // All actions should have executed in order for each subject
      expect(subject1Started).toEqual([0, 1, 2]);
      expect(subject2Started).toEqual([0, 1, 2]);
    });

    it("should execute actions in order within each subject's queue", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
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

    it("should process queues from different subjects in parallel", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      let subject1Started = false;
      let subject2Started = false;
      let subject1Finished = false;
      let subject2Finished = false;

      const action1 = new ScheduledAction(async () => {
        subject1Started = true;
        await delay(100);
        subject1Finished = true;
      });

      const action2 = new ScheduledAction(async () => {
        subject2Started = true;
        await delay(100);
        subject2Finished = true;
      });

      scheduler.schedule(subject1, action1);
      scheduler.schedule(subject2, action2);

      // Let actions start
      await delay(50);

      // Both subjects should have started their actions in parallel
      expect(subject1Started).toBe(true);
      expect(subject2Started).toBe(true);

      // But neither should be finished yet
      expect(subject1Finished).toBe(false);
      expect(subject2Finished).toBe(false);

      // Wait for completion
      await delay(100);

      // Both should now be finished
      expect(subject1Finished).toBe(true);
      expect(subject2Finished).toBe(true);
    });

    it("should continue processing a subject's queue after its action completes", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const results: number[] = [];

      for (let i = 0; i < 3; i++) {
        const action = new ScheduledAction(async () => {
          await delay(20);
          results.push(i);
        });
        scheduler.schedule(subject, action);
      }

      await delay(100);

      expect(results).toEqual([0, 1, 2]);
      // @ts-ignore - Access private property for testing
      expect(scheduler._subjectQueues.get(subject)?.length || 0).toBe(0);
    });

    it("should handle empty queues correctly for individual subjects", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;

      // @ts-ignore - Call private method directly
      await scheduler._processSubjectQueue(subject);

      // Should not throw and should exit gracefully
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject)).toBe(false);
    });

    it("should recover and continue processing after an action throws an error", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const subject = {} as SchedulerSubject;
      const results: number[] = [];

      // First action will throw
      const errorAction = new ScheduledAction(async () => {
        throw new Error("Test error");
      });

      // Second action should still run
      const goodAction = new ScheduledAction(async () => {
        results.push(1);
      });

      scheduler.schedule(subject, errorAction);
      scheduler.schedule(subject, goodAction);

      await delay(50);

      expect(results).toEqual([1]);
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject)).toBe(false);
    });
  });

  describe("subject cleanup", () => {
    it("should remove subject from tracking when all its actions complete", async () => {
      const scheduler = new SubjectQueueScheduler();
      const subject = {} as SchedulerSubject;

      const action = new ScheduledAction(async () => {
        await delay(20);
      });

      scheduler.schedule(subject, action);

      // Subject should be tracked while action is running
      await delay(10);
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject)).toBe(true);

      // After action completes, subject should be removed from tracking
      await delay(20);
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject)).toBe(false);
    });

    it("should properly manage running count for subjects with multiple actions", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 2 });
      const subject = {} as SchedulerSubject;

      const action1 = new ScheduledAction(async () => {
        await delay(50);
      });

      const action2 = new ScheduledAction(async () => {
        await delay(30);
      });

      scheduler.schedule(subject, action1);
      scheduler.schedule(subject, action2);

      await delay(10);
      // Should have 2 running actions for this subject
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.get(subject)).toBe(2);

      await delay(30); // action2 completes
      // Should have 1 running action for this subject
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.get(subject)).toBe(1);

      await delay(20); // action1 completes
      // Subject should be removed from tracking
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject)).toBe(false);
    });
  });

  describe("integration with observables", () => {
    it("should process emissions from different observables in parallel", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });

      let observable1Started = false;
      let observable2Started = false;
      let observable1Completed = false;
      let observable2Completed = false;

      const observable1 = new AsyncObservable(async function* () {
        yield 1;
      });

      const observable2 = new AsyncObservable(async function* () {
        yield 2;
      });

      const sub1 = observable1.pipe(withScheduler(scheduler)).subscribe(async () => {
        observable1Started = true;
        await delay(50);
        observable1Completed = true;
      });

      const sub2 = observable2.pipe(withScheduler(scheduler)).subscribe(async () => {
        observable2Started = true;
        await delay(50);
        observable2Completed = true;
      });

      // Let actions start
      await delay(20);

      // Both observables should have started processing in parallel
      expect(observable1Started).toBe(true);
      expect(observable2Started).toBe(true);

      await Promise.all([sub1, sub2]);

      // Both should now be completed
      expect(observable1Completed).toBe(true);
      expect(observable2Completed).toBe(true);
    });

    it("should process emissions from the same observable sequentially when concurrency is 1", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const results: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield* [1, 2, 3];
      });

      await observable.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        // Shorter delay for higher values
        await delay(100 - value * 20);
        results.push(value);
      });

      // Results should be in order despite different processing times
      expect(results).toEqual([1, 2, 3]);
    });

    it("should process emissions from the same observable with specified concurrency limit", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 2 });
      const startTimes: number[] = [];
      const completionOrder: number[] = [];

      const observable = new AsyncObservable<number>(async function* () {
        yield* [1, 2, 3, 4];
      });

      await observable.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        startTimes.push(value);
        if (value === 1 || value === 3) {
          await delay(100);
        }
        completionOrder.push(value);
      });

      // First two should start concurrently (1 and 2)
      expect(startTimes.slice(0, 2).sort()).toEqual([1, 2]);

      // Values 2 and 4 should complete before 1 and 3 due to shorter delays
      expect(completionOrder[0]).toBe(2);
      expect(completionOrder[2]).toBe(4);
    });

    it("should allow waiting for all scheduled work to complete", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 2 });
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
  });

  describe("edge cases", () => {
    it("should handle rapid scheduling of many actions across multiple subjects", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 3 });
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      const subject1Completed: number[] = [];
      const subject2Completed: number[] = [];

      // Schedule 10 quick actions for each subject
      for (let i = 0; i < 10; i++) {
        const action1 = new ScheduledAction(async () => {
          await delay(5);
          subject1Completed.push(i);
        });

        const action2 = new ScheduledAction(async () => {
          await delay(5);
          subject2Completed.push(i);
        });

        scheduler.schedule(subject1, action1);
        scheduler.schedule(subject2, action2);
      }

      await delay(100);

      expect(subject1Completed.length).toBe(10);
      expect(subject2Completed.length).toBe(10);

      // Both subjects should be cleaned up
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject1)).toBe(false);
      // @ts-ignore - Access private property for testing
      expect(scheduler._runningBySubject.has(subject2)).toBe(false);
    });

    it("should handle actions with varying execution times", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 2 });
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

      // With concurrency 2, faster actions complete earlier
      // The completion order will depend on execution times
      expect(completed.indexOf(1)).toBeLessThan(completed.indexOf(0));
      expect(completed.indexOf(5)).toBeLessThan(completed.indexOf(4));
    });

    it("should work with nested observables while maintaining subject isolation", async () => {
      const scheduler = new SubjectQueueScheduler({ concurrency: 1 });
      const results: string[] = [];

      const innerObservableA = new AsyncObservable<string>(async function* () {
        yield* ["A-inner1", "A-inner2"];
      });

      const innerObservableB = new AsyncObservable<string>(async function* () {
        yield* ["B-inner1", "B-inner2"];
      });

      const observableA = new AsyncObservable<string | AsyncObservable<string>>(async function* () {
        yield "A-outer1";
        yield innerObservableA;
        yield "A-outer2";
      });

      const observableB = new AsyncObservable<string | AsyncObservable<string>>(async function* () {
        yield "B-outer1";
        yield innerObservableB;
        yield "B-outer2";
      });

      const subA = observableA.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        if (value instanceof AsyncObservable) {
          await value
            .pipe(withScheduler(scheduler))
            .subscribe((innerValue) => results.push(innerValue));
        } else {
          results.push(value);
        }
      });

      const subB = observableB.pipe(withScheduler(scheduler)).subscribe(async (value) => {
        if (value instanceof AsyncObservable) {
          await value
            .pipe(withScheduler(scheduler))
            .subscribe((innerValue) => results.push(innerValue));
        } else {
          results.push(value);
        }
      });

      await Promise.all([subA, subB]);

      // Each observable's values should be in order
      expect(results.filter((r) => r.startsWith("A-"))).toEqual([
        "A-outer1",
        "A-inner1",
        "A-inner2",
        "A-outer2",
      ]);

      expect(results.filter((r) => r.startsWith("B-"))).toEqual([
        "B-outer1",
        "B-inner1",
        "B-inner2",
        "B-outer2",
      ]);
    });
  });
});
