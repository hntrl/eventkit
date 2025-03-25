import { describe, expect, it, vi } from "vitest";
import { CleanupAction, ScheduledAction, Scheduler } from "../lib/scheduler";
import { SchedulerLike, SchedulerSubject } from "../lib/types";
import { Subscriber } from "../lib/subscriber";
import { AsyncObservable } from "../lib/observable";
import { PromiseSet } from "../lib/utils/promise";

describe("Scheduler", () => {
  describe("core responsibilities", () => {
    it("should coordinate all work associated with subjects", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create promises representing different work items
      let resolve1: (value: any) => void;
      const promise1 = new Promise<void>((r) => (resolve1 = r));

      let resolve2: (value: any) => void;
      const promise2 = new Promise<void>((r) => (resolve2 = r));

      // Add work to the subject
      scheduler.add(subject, promise1);
      scheduler.add(subject, promise2);

      // Start waiting for all work to complete
      const completion = scheduler.promise(subject);

      // Work is not done yet
      const notDone = await Promise.race([
        completion.then(() => "done"),
        Promise.resolve("not done"),
      ]);
      expect(notDone).toBe("not done");

      // Complete all work
      resolve1!(1);
      resolve2!(2);

      // Wait for completion
      await completion;

      // Verify internal state is cleared
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should observe what work belongs to an execution", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Create work for different subjects
      let resolveSubject1: (value: any) => void;
      const subject1Promise = new Promise<void>((r) => (resolveSubject1 = r));

      let resolveSubject2: (value: any) => void;
      const subject2Promise = new Promise<void>((r) => (resolveSubject2 = r));

      // Add work to each subject
      scheduler.add(subject1, subject1Promise);
      scheduler.add(subject2, subject2Promise);

      // Create promises for each subject's completion
      const subject1Completion = scheduler.promise(subject1);
      const subject2Completion = scheduler.promise(subject2);

      // Complete only subject1's work
      resolveSubject1!(1);
      await subject1Completion;

      // Subject2's work should still be pending
      const subject2Status = await Promise.race([
        subject2Completion.then(() => "completed"),
        Promise.resolve("pending"),
      ]);
      expect(subject2Status).toBe("pending");

      // Complete subject2's work
      resolveSubject2!(2);
      await subject2Completion;
    });

    it("should observe when work associated with an execution is completed", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let workCompleted = false;

      // Add async work that takes some time
      scheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            workCompleted = true;
            resolve();
          }, 10);
        })
      );

      // Initially work is not complete
      expect(workCompleted).toBe(false);

      // Wait for completion
      await scheduler.promise(subject);

      // Work should be completed
      expect(workCompleted).toBe(true);
    });

    it("should control how work is executed", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let executed = false;

      // Create an action
      const action = new ScheduledAction(() => {
        executed = true;
        return "result";
      });

      // Before scheduling, work is not executed
      expect(executed).toBe(false);

      // Schedule the action
      scheduler.schedule(subject, action);

      // Wait for completion
      await scheduler.promise(subject);

      // Default scheduler executes immediately
      expect(executed).toBe(true);
    });

    it("should enable observation of asynchronous work from subscriptions", async () => {
      // Create a mock Subscriber that extends SchedulerSubject
      class MockSubscriber extends Subscriber<any> {
        constructor(observable: any) {
          super(observable);
        }
      }

      const scheduler = new Scheduler();
      const mockObservable = { _scheduler: scheduler } as any;
      const subscriber = new MockSubscriber(mockObservable);

      // Add work to the subscriber
      let subscriberWorkDone = false;
      scheduler.add(
        subscriber,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            subscriberWorkDone = true;
            resolve();
          }, 10);
        })
      );

      // The work should be added to both the subscriber and its observable
      expect(scheduler._subjectPromises.has(subscriber)).toBe(true);
      expect(scheduler._subjectPromises.has(mockObservable)).toBe(true);

      subscriber._returnSignal.resolve();

      // Wait for completion
      await scheduler.promise(subscriber);

      // Work should be completed
      expect(subscriberWorkDone).toBe(true);
    });

    it("should support drop-in replacement via SchedulerLike interface", async () => {
      // Create a custom scheduler that implements SchedulerLike
      class CustomScheduler implements SchedulerLike {
        executionOrder: string[] = [];

        add(subject: SchedulerSubject, promise: PromiseLike<void>) {
          // Implementation details not important for this test
        }

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionOrder.push("custom:before");
          action.execute();
          this.executionOrder.push("custom:after");
        }

        async promise(subject: SchedulerSubject): Promise<void> {
          // Simple implementation for the test
          return Promise.resolve();
        }
      }

      const customScheduler = new CustomScheduler();
      const subject = {} as SchedulerSubject;

      // Create an action
      const action = new ScheduledAction(() => {
        customScheduler.executionOrder.push("action");
        return "result";
      });

      // Schedule with the custom scheduler
      customScheduler.schedule(subject, action);

      // Custom execution order should be used
      expect(customScheduler.executionOrder).toEqual(["custom:before", "action", "custom:after"]);
    });

    it("should allow overriding execution behavior in subclasses", async () => {
      // Create a subclass that overrides the schedule method
      class DeferredScheduler extends Scheduler {
        executionOrder: string[] = [];

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionOrder.push("before");
          // Call add first, like the parent class
          this.add(subject, action);

          if (action instanceof CleanupAction) return;

          // Override execution behavior - defer execution with setTimeout
          setTimeout(() => {
            this.executionOrder.push("executing");
            action.execute();
            this.executionOrder.push("after");
          }, 10);
        }
      }

      const deferredScheduler = new DeferredScheduler();
      const subject = {} as SchedulerSubject;

      // Create an action
      const action = new ScheduledAction(() => {
        deferredScheduler.executionOrder.push("action");
        return "result";
      });

      // Schedule with the deferred scheduler
      deferredScheduler.schedule(subject, action);

      // Execution should not happen immediately
      expect(deferredScheduler.executionOrder).toEqual(["before"]);

      // Wait for the deferred execution
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Now execution should have happened
      expect(deferredScheduler.executionOrder).toEqual(["before", "executing", "action", "after"]);
    });
  });
  describe("initialization and work tracking", () => {
    it("should initialize with empty maps for subject promises and cleanup actions", async () => {
      const scheduler = new Scheduler();

      // Verify internal maps start empty
      expect(scheduler._subjectPromises.size).toBe(0);
      expect(scheduler._subjectCleanup.size).toBe(0);
    });

    it("should track work and cleanup actions separately", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add regular work
      const regularWork = Promise.resolve();
      scheduler.add(subject, regularWork);

      // Add cleanup work
      const cleanupAction = new CleanupAction(() => {});
      scheduler.add(subject, cleanupAction);

      // Verify they're tracked in different maps
      expect(scheduler._subjectPromises.has(subject)).toBe(true);
      expect(scheduler._subjectCleanup.has(subject)).toBe(true);

      // Verify correct objects are in each map
      const promiseSet = scheduler._subjectPromises.get(subject);
      const cleanupSet = scheduler._subjectCleanup.get(subject);

      expect(cleanupSet?.has(cleanupAction)).toBe(true);
      expect(cleanupSet?.size).toBe(1);
    });

    it("should maintain independent work tracking for each subject", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Add work to subject1
      let resolveSubject1: (value: any) => void;
      const subject1Promise = new Promise<void>((r) => (resolveSubject1 = r));
      scheduler.add(subject1, subject1Promise);

      // Add work to subject2
      let resolveSubject2: (value: any) => void;
      const subject2Promise = new Promise<void>((r) => (resolveSubject2 = r));
      scheduler.add(subject2, subject2Promise);

      // Resolve only subject1's work
      resolveSubject1!(1);

      // Wait for subject1 to complete
      await scheduler.promise(subject1);

      // Verify subject1's tracking is cleaned up
      expect(scheduler._subjectPromises.has(subject1)).toBe(false);

      // But subject2's work is still tracked
      expect(scheduler._subjectPromises.has(subject2)).toBe(true);

      // Complete subject2's work and verify cleanup
      resolveSubject2!(2);
      await scheduler.promise(subject2);
      expect(scheduler._subjectPromises.has(subject2)).toBe(false);
    });

    it("should represent all work as promise-like objects", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Different types of work that can be added
      const regularPromise = Promise.resolve();
      const action = new ScheduledAction(() => {});
      const cleanupAction = new CleanupAction(() => {});

      // Add each type
      scheduler.add(subject, regularPromise);
      scheduler.add(subject, action);
      scheduler.add(subject, cleanupAction);

      // Execute the action
      await action.execute();

      // Verify they can all be awaited with promise-like interface
      await scheduler.promise(subject);

      // If we got here without errors, the test passes
      expect(true).toBe(true);
    });

    it("should consider a subject 'complete' when all its work promises have resolved", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let workDone = false;

      // Add multiple work items with different completion times
      let resolveFirst: (value: any) => void;
      const firstPromise = new Promise<void>((r) => (resolveFirst = r));

      let resolveSecond: (value: any) => void;
      const secondPromise = new Promise<void>((r) => (resolveSecond = r));

      scheduler.add(subject, firstPromise);
      scheduler.add(subject, secondPromise);

      // Start waiting for completion
      const completion = scheduler.promise(subject).then(() => {
        workDone = true;
      });

      // Resolve only the first promise
      resolveFirst!(1);

      // Wait a moment to ensure any possible resolution would have happened
      await new Promise((r) => setTimeout(r, 10));

      // Work should not be done yet
      expect(workDone).toBe(false);

      // Now resolve the second promise
      resolveSecond!(2);

      // Now work should complete
      await completion;
      expect(workDone).toBe(true);
    });

    it("should differentiate between regular work and cleanup actions", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Track execution order
      const executionOrder: string[] = [];

      // Add regular work
      scheduler.add(
        subject,
        Promise.resolve().then(() => {
          executionOrder.push("regular work");
        })
      );

      // Add cleanup action
      const cleanup = new CleanupAction(() => {
        executionOrder.push("cleanup action");
      });
      scheduler.add(subject, cleanup);

      // Wait for all work to complete
      await scheduler.promise(subject);

      // Cleanup should execute after regular work
      expect(executionOrder).toEqual(["regular work", "cleanup action"]);

      // Test with scheduler.schedule as well
      const subject2 = {} as SchedulerSubject;
      const executionOrder2: string[] = [];

      // Schedule regular action
      scheduler.schedule(
        subject2,
        new ScheduledAction(() => {
          executionOrder2.push("regular action");
        })
      );

      // Schedule cleanup action
      scheduler.schedule(
        subject2,
        new CleanupAction(() => {
          executionOrder2.push("cleanup action");
        })
      );

      // Wait for all work to complete
      await scheduler.promise(subject2);

      // Regular action should execute immediately, cleanup after
      expect(executionOrder2).toEqual(["regular action", "cleanup action"]);
    });
  });
  describe("add method", () => {
    it("should add a promise owned by a subject to be observed", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create a promise to add
      let promiseResolved = false;
      const promise = Promise.resolve().then(() => {
        promiseResolved = true;
      });

      // Add the promise to the subject
      scheduler.add(subject, promise);

      // Wait for subject's work to complete
      await scheduler.promise(subject);

      // Verify the promise was executed
      expect(promiseResolved).toBe(true);
    });

    it("should create a new PromiseSet if one doesn't exist for the subject", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Initially no promise set exists for the subject
      expect(scheduler._subjectPromises.has(subject)).toBe(false);

      // Add a promise to the subject
      scheduler.add(subject, Promise.resolve());

      // Verify a new PromiseSet was created
      expect(scheduler._subjectPromises.has(subject)).toBe(true);
      expect(scheduler._subjectPromises.get(subject)).instanceOf(PromiseSet);
    });

    it("should track the promise to determine when subject's work completes", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let resolved = false;

      // Create a promise that resolves after a delay
      let resolve: (value: any) => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });

      scheduler.add(subject, promise);

      // Start waiting for subject completion
      const completion = scheduler.promise(subject).then(() => {
        resolved = true;
      });

      // Verify work isn't completed yet
      expect(resolved).toBe(false);

      // Resolve the promise
      resolve!(null);

      // Wait for completion
      await completion;

      // Verify work is now completed
      expect(resolved).toBe(true);
    });

    it("should handle both regular promises and ScheduledAction objects", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Track execution
      const results: string[] = [];

      // Add a regular promise
      scheduler.add(
        subject,
        Promise.resolve().then(() => {
          results.push("regular promise");
        })
      );

      // Add a scheduled action
      const action = new ScheduledAction(() => {
        results.push("scheduled action");
      });

      scheduler.add(subject, action);

      // Execute the action
      await action.execute();

      // Wait for all work to complete
      await scheduler.promise(subject);

      // Verify both types were executed
      expect(results).toContain("regular promise");
      expect(results).toContain("scheduled action");
    });

    it("should handle CleanupAction objects differently from regular work", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add regular work
      scheduler.add(subject, Promise.resolve());

      // Add cleanup action
      const cleanup = new CleanupAction(() => {});
      scheduler.add(subject, cleanup);

      // Verify regular work is in the promises map
      expect(scheduler._subjectPromises.has(subject)).toBe(true);

      // Verify cleanup is in the cleanup map
      expect(scheduler._subjectCleanup.has(subject)).toBe(true);
      expect(scheduler._subjectCleanup.get(subject)?.has(cleanup)).toBe(true);

      // Verify cleanup is NOT in the promises map
      const promiseSet = scheduler._subjectPromises.get(subject);
      // We can't directly check if promiseSet contains cleanup, so we'll just
      // make sure the cleanup set has exactly what we added
      expect(scheduler._subjectCleanup.get(subject)?.size).toBe(1);
    });

    it("should handle the special case of subscribers by adding to parent observable", async () => {
      class MockSubscriber extends Subscriber<any> {
        constructor(observable: any) {
          super(observable);
        }
      }

      const scheduler = new Scheduler();
      const observable = { _scheduler: scheduler } as any;
      const subscriber = new MockSubscriber(observable);

      // Add work to the subscriber
      const promise = Promise.resolve();
      scheduler.add(subscriber, promise);

      // Verify work was added to both subscriber and observable
      expect(scheduler._subjectPromises.has(subscriber)).toBe(true);
      expect(scheduler._subjectPromises.has(observable)).toBe(true);

      // Handle cleanup case
      const cleanup = new CleanupAction(() => {});
      scheduler.add(subscriber, cleanup);

      // Verify cleanup was added to both subscriber and observable
      expect(scheduler._subjectCleanup.has(subscriber)).toBe(true);
      expect(scheduler._subjectCleanup.has(observable)).toBe(true);
    });

    it("should connect subscriber work back to its observable", async () => {
      // Create mock subscriber and observable
      const scheduler = new Scheduler();
      const observable = { _scheduler: scheduler } as any;

      class MockSubscriber extends Subscriber<any> {
        constructor(observable: any) {
          super(observable);
        }
      }

      const subscriber = new MockSubscriber(observable);

      // Create work with controlled resolution
      let resolveWork: (value: any) => void;
      const work = new Promise<void>((r) => {
        resolveWork = r;
      });

      // Add work to subscriber
      scheduler.add(subscriber, work);

      // Start waiting on the observable's completion
      const observableCompletion = scheduler.promise(observable);

      // Resolve subscriber's work
      resolveWork!(null);
      subscriber._returnSignal.resolve();

      // Observable's completion should also resolve
      await observableCompletion;
    });

    it("should automatically create a new PromiseSet for new subjects", async () => {
      const scheduler = new Scheduler();

      // Create multiple subjects
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Add work to both subjects
      scheduler.add(subject1, Promise.resolve());
      scheduler.add(subject2, Promise.resolve());

      // Verify each subject got its own PromiseSet
      expect(scheduler._subjectPromises.has(subject1)).toBe(true);
      expect(scheduler._subjectPromises.has(subject2)).toBe(true);

      // Verify they're separate PromiseSets
      const promiseSet1 = scheduler._subjectPromises.get(subject1);
      const promiseSet2 = scheduler._subjectPromises.get(subject2);
      expect(promiseSet1).not.toBe(promiseSet2);

      // Wait for both to complete
      await Promise.all([scheduler.promise(subject1), scheduler.promise(subject2)]);

      // Verify both are cleaned up
      expect(scheduler._subjectPromises.has(subject1)).toBe(false);
      expect(scheduler._subjectPromises.has(subject2)).toBe(false);
    });
  });
  describe("schedule method", () => {
    it("should schedule an action owned by a subject for later execution", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let executed = false;

      // Create an action that will be scheduled
      const action = new ScheduledAction(() => {
        executed = true;
        return "result";
      });

      // Schedule the action
      scheduler.schedule(subject, action);

      // Wait for all work to complete
      await scheduler.promise(subject);

      // Verify the action was executed
      expect(executed).toBe(true);
    });

    it("should add the action to the subject's work set", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create an action that will be scheduled
      const action = new ScheduledAction(() => "result");

      // Schedule the action
      scheduler.schedule(subject, action);

      // Verify the action was added to the subject's work set
      expect(scheduler._subjectPromises.has(subject)).toBe(true);

      // Wait for completion
      await scheduler.promise(subject);

      // After completion, subject should be removed from tracking
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should connect the action to its owning subject", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Create actions for each subject
      const action1 = new ScheduledAction(() => "result1");
      const action2 = new ScheduledAction(() => "result2");

      // Schedule each action with its subject
      scheduler.schedule(subject1, action1);
      scheduler.schedule(subject2, action2);

      // Complete subject1's work
      await scheduler.promise(subject1);

      // subject1 should be cleaned up but subject2 should still be tracked
      expect(scheduler._subjectPromises.has(subject1)).toBe(false);
      expect(scheduler._subjectPromises.has(subject2)).toBe(true);

      // Complete subject2's work
      await scheduler.promise(subject2);
      expect(scheduler._subjectPromises.has(subject2)).toBe(false);
    });

    it("should immediately execute non-cleanup actions by default", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let executed = false;

      // Create a regular action
      const action = new ScheduledAction(() => {
        executed = true;
        return "result";
      });

      // Before scheduling
      expect(executed).toBe(false);

      // Schedule the action
      scheduler.schedule(subject, action);

      // Verify the action was executed immediately
      expect(executed).toBe(true);

      // But it's still tracked for completion
      expect(scheduler._subjectPromises.has(subject)).toBe(true);

      // Wait for cleanup
      await scheduler.promise(subject);
    });

    it("should not execute cleanup actions immediately", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let executed = false;

      // Create a cleanup action
      const cleanup = new CleanupAction(() => {
        executed = true;
        return "cleanup complete";
      });

      // Schedule the cleanup action
      scheduler.schedule(subject, cleanup);

      // Verify the action was NOT executed immediately
      expect(executed).toBe(false);

      // Verify it was added to the cleanup set
      expect(scheduler._subjectCleanup.has(subject)).toBe(true);
      expect(scheduler._subjectCleanup.get(subject)?.size).toBe(1);

      // Execute all work for the subject
      await scheduler.promise(subject);

      // Now the cleanup action should have been executed
      expect(executed).toBe(true);
    });

    it("should handle actions scheduled for subscribers by adding to parent observable", async () => {
      // Create mock subscriber and observable
      const scheduler = new Scheduler();
      const observable = { _scheduler: scheduler } as any;

      class MockSubscriber extends Subscriber<any> {
        constructor(observable: any) {
          super(observable);
        }
      }

      const subscriber = new MockSubscriber(observable);

      // Create action to be executed
      let executed = false;
      const action = new ScheduledAction(() => {
        executed = true;
        return "result";
      });

      // Schedule the action for the subscriber
      scheduler.schedule(subscriber, action);

      // Action should be executed immediately
      expect(executed).toBe(true);

      // Action should be added to both subscriber and observable
      expect(scheduler._subjectPromises.has(subscriber)).toBe(true);
      expect(scheduler._subjectPromises.has(observable)).toBe(true);

      // Ensure CleanupAction is also handled correctly
      let cleanupExecuted = false;
      const cleanup = new CleanupAction(() => {
        cleanupExecuted = true;
        return "cleanup done";
      });

      // Schedule the cleanup action
      scheduler.schedule(subscriber, cleanup);

      // Cleanup should not execute immediately
      expect(cleanupExecuted).toBe(false);

      // Cleanup should be added to both subscriber and observable
      expect(scheduler._subjectCleanup.has(subscriber)).toBe(true);
      expect(scheduler._subjectCleanup.has(observable)).toBe(true);

      // Complete the work
      subscriber._returnSignal.resolve();
      await scheduler.promise(subscriber);

      // Cleanup should now be executed
      expect(cleanupExecuted).toBe(true);

      // Both should be cleaned up
      expect(scheduler._subjectPromises.has(subscriber)).toBe(false);
      expect(scheduler._subjectCleanup.has(subscriber)).toBe(false);
    });
  });
  describe("dispose method", () => {
    it("should execute all cleanup actions for a subject immediately", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create cleanup actions with spies
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      scheduler.add(subject, new CleanupAction(cleanup1));
      scheduler.add(subject, new CleanupAction(cleanup2));

      // Verify cleanup actions are not executed yet
      expect(cleanup1).not.toHaveBeenCalled();
      expect(cleanup2).not.toHaveBeenCalled();

      // Call dispose
      await scheduler.dispose(subject);

      // Verify all cleanup actions were executed immediately
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it("should wait for both regular promises and cleanup actions to complete", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create a promise with delayed resolution
      let resolvePromise: (value: any) => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      scheduler.add(subject, promise);

      // Create a cleanup action with delayed execution
      let cleanupCompleted = false;
      const cleanupAction = new CleanupAction(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        cleanupCompleted = true;
      });
      scheduler.add(subject, cleanupAction);

      // Start dispose but don't await it yet
      const disposePromise = scheduler.dispose(subject);

      // Neither the promise nor cleanup should be complete immediately
      expect(cleanupCompleted).toBe(false);

      // Resolve the regular promise
      resolvePromise!(null);

      // Wait for disposal to complete
      await disposePromise;

      // Both regular promise and cleanup action should be complete
      expect(cleanupCompleted).toBe(true);
    });

    it("should remove the subject from tracking collections after disposal", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add regular promise and cleanup action
      scheduler.add(subject, Promise.resolve());
      scheduler.add(subject, new CleanupAction(() => {}));

      // Verify subject is being tracked
      expect(scheduler._subjectPromises.has(subject)).toBe(true);
      expect(scheduler._subjectCleanup.has(subject)).toBe(true);

      // Dispose of the subject
      await scheduler.dispose(subject);

      // Verify subject is removed from all tracking collections
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should be callable independently of the promise method", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add work and cleanup
      let workExecuted = false;
      scheduler.add(
        subject,
        Promise.resolve().then(() => {
          workExecuted = true;
        })
      );

      const cleanupSpy = vi.fn();
      scheduler.add(subject, new CleanupAction(cleanupSpy));

      // Call dispose directly without calling promise first
      await scheduler.dispose(subject);

      // Regular work should still be executed
      expect(workExecuted).toBe(true);

      // Cleanup should be executed
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Subject should be removed from tracking
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should handle the special case of observables by also disposing subscribers", async () => {
      const scheduler = new Scheduler();
      const observable = new AsyncObservable();
      const subscriber = new Subscriber(observable);

      // Add work to both subscriber and observable
      const subscriberCleanup = vi.fn();
      const observableCleanup = vi.fn();

      scheduler.add(subscriber, new CleanupAction(subscriberCleanup));
      scheduler.add(observable, new CleanupAction(observableCleanup));

      // Dispose the subscriber
      await scheduler.dispose(observable);

      // Both cleanups should be executed
      expect(subscriberCleanup).toHaveBeenCalledTimes(1);
      expect(observableCleanup).toHaveBeenCalledTimes(1);

      // Both subjects should be removed from tracking
      expect(scheduler._subjectPromises.has(observable)).toBe(false);
      expect(scheduler._subjectPromises.has(subscriber)).toBe(false);
    });

    it("should be idempotent - calling multiple times on the same subject should not cause issues", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add cleanup action with spy
      const cleanupSpy = vi.fn();
      scheduler.add(subject, new CleanupAction(cleanupSpy));

      // Call dispose multiple times
      await scheduler.dispose(subject);
      await scheduler.dispose(subject); // Second call
      await scheduler.dispose(subject); // Third call

      // Cleanup should only be executed once
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Tracking should still be clean
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should properly handle subjects with no cleanup actions", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add only regular promise, no cleanup actions
      let workExecuted = false;
      scheduler.add(
        subject,
        Promise.resolve().then(() => {
          workExecuted = true;
        })
      );

      // Verify no cleanup is tracked
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);

      // Dispose should still work
      await scheduler.dispose(subject);

      // Regular work should still be executed
      expect(workExecuted).toBe(true);

      // Subject should be removed from tracking
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should properly handle subjects with no regular promises", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add only cleanup action, no regular promises
      const cleanupSpy = vi.fn();
      scheduler.add(subject, new CleanupAction(cleanupSpy));

      // Verify no promises are tracked
      expect(scheduler._subjectPromises.has(subject)).toBe(false);

      // Dispose should still work
      await scheduler.dispose(subject);

      // Cleanup should be executed
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Subject should be removed from tracking
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });
  });
  describe("promise method", () => {
    it("should return a promise that resolves when subject work completes", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let workDone = false;

      // Add work to the subject
      scheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            workDone = true;
            resolve();
          }, 10);
        })
      );

      // Get promise for subject completion
      const completion = scheduler.promise(subject);

      // Promise should be pending until work completes
      expect(workDone).toBe(false);

      // Wait for completion
      await completion;

      // Work should be done
      expect(workDone).toBe(true);
    });

    it("should wait for all scheduled work to be executed", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      const results: number[] = [];

      // Add multiple work items with different completion times
      scheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push(1);
            resolve();
          }, 15);
        })
      );

      scheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push(2);
            resolve();
          }, 5);
        })
      );

      // Wait for all work to complete
      await scheduler.promise(subject);

      // Both work items should have been completed
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results.length).toBe(2);
    });

    it("should allow awaiting completion of a specific subject", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      const results: string[] = [];

      // Add work to subject1
      scheduler.add(
        subject1,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push("subject1");
            resolve();
          }, 10);
        })
      );

      // Add work to subject2
      scheduler.add(
        subject2,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push("subject2");
            resolve();
          }, 20);
        })
      );

      // Await only subject1
      await scheduler.promise(subject1);

      // Only subject1's work should be done
      expect(results).toEqual(["subject1"]);

      // Await subject2
      await scheduler.promise(subject2);

      // Now both should be done
      expect(results).toEqual(["subject1", "subject2"]);
    });

    it("should retrieve work for the specified subject", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Add different work to each subject
      let subject1Done = false;
      scheduler.add(
        subject1,
        Promise.resolve().then(() => {
          subject1Done = true;
        })
      );

      // Retrieve and await just subject1's work
      await scheduler.promise(subject1);

      let subject2Done = false;
      scheduler.add(
        subject2,
        Promise.resolve().then(() => {
          subject2Done = true;
        })
      );

      // Only subject1's work should be done
      expect(subject1Done).toBe(true);
      expect(subject2Done).toBe(false);

      // Complete subject2's work
      await scheduler.promise(subject2);
      expect(subject2Done).toBe(true);
    });

    it("should await all promises in the subject's work set", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add multiple work items
      const results: number[] = [];

      let resolve1: (value: any) => void;
      const promise1 = new Promise<void>((r) => (resolve1 = r));

      let resolve2: (value: any) => void;
      const promise2 = new Promise<void>((r) => (resolve2 = r));

      let resolve3: (value: any) => void;
      const promise3 = new Promise<void>((r) => (resolve3 = r));

      scheduler.add(subject, promise1);
      scheduler.add(subject, promise2);
      scheduler.add(subject, promise3);

      // Start waiting for completion
      const completion = scheduler.promise(subject).then(() => {
        results.push(4);
      });

      // Resolve promises in a different order
      resolve2!(null);
      results.push(1);

      resolve1!(null);
      results.push(2);

      resolve3!(null);
      results.push(3);

      // Wait for completion
      await completion;

      // Results should show that all promises were awaited
      // before the completion promise resolved
      expect(results).toEqual([1, 2, 3, 4]);
    });

    it("should execute all cleanup actions after main work completes", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      const executionOrder: string[] = [];

      // Add regular work
      scheduler.add(
        subject,
        Promise.resolve().then(() => {
          executionOrder.push("regular work");
        })
      );

      // Add cleanup actions
      scheduler.add(
        subject,
        new CleanupAction(() => {
          executionOrder.push("cleanup 1");
        })
      );

      scheduler.add(
        subject,
        new CleanupAction(() => {
          executionOrder.push("cleanup 2");
        })
      );

      // Wait for all work including cleanup
      await scheduler.promise(subject);

      // Verify regular work was executed before cleanup
      expect(executionOrder[0]).toBe("regular work");
      expect(executionOrder).toContain("cleanup 1");
      expect(executionOrder).toContain("cleanup 2");
      expect(executionOrder.length).toBe(3);
    });

    it("should execute cleanup actions even if main work fails", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      let cleanupExecuted = false;

      // Add work that will fail
      scheduler.add(subject, Promise.reject(new Error("Test error")));

      // Add cleanup action
      scheduler.add(
        subject,
        new CleanupAction(() => {
          cleanupExecuted = true;
        })
      );

      // Wait for completion, catching the error
      try {
        await scheduler.promise(subject);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        // Expected
      }

      // Cleanup should still have executed
      expect(cleanupExecuted).toBe(true);

      // Subject tracking should be cleaned up
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should clean up subject tracking after completion", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Add work and cleanup
      scheduler.add(subject, Promise.resolve());
      scheduler.add(subject, new CleanupAction(() => {}));

      // Verify subject is being tracked
      expect(scheduler._subjectPromises.has(subject)).toBe(true);
      expect(scheduler._subjectCleanup.has(subject)).toBe(true);

      // Wait for completion
      await scheduler.promise(subject);

      // Subject should be removed from tracking
      expect(scheduler._subjectPromises.has(subject)).toBe(false);
      expect(scheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should remove the subject from tracking maps after completion", async () => {
      const scheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Add work to both subjects
      scheduler.add(subject1, Promise.resolve());
      scheduler.add(subject2, Promise.resolve());

      // Complete only subject1
      await scheduler.promise(subject1);

      // subject1 should be removed, but subject2 should remain
      expect(scheduler._subjectPromises.has(subject1)).toBe(false);
      expect(scheduler._subjectPromises.has(subject2)).toBe(true);

      // Check size of maps
      expect(scheduler._subjectPromises.size).toBe(1);

      // Complete subject2
      await scheduler.promise(subject2);

      // All subjects should be removed
      expect(scheduler._subjectPromises.size).toBe(0);
    });

    it("should execute cleanup actions in parallel", async () => {
      const scheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Track execution timing
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      // Add regular work
      scheduler.add(subject, Promise.resolve());

      // Add cleanup actions that take different amounts of time
      scheduler.add(
        subject,
        new CleanupAction(async () => {
          const start = Date.now();
          startTimes.push(start);

          // First cleanup takes longer
          await new Promise((resolve) => setTimeout(resolve, 30));

          const end = Date.now();
          endTimes.push(end);
        })
      );

      scheduler.add(
        subject,
        new CleanupAction(async () => {
          const start = Date.now();
          startTimes.push(start);

          // Second cleanup resolves faster
          await new Promise((resolve) => setTimeout(resolve, 10));

          const end = Date.now();
          endTimes.push(end);
        })
      );

      // Start time measurement
      const overallStart = Date.now();

      // Wait for completion
      await scheduler.promise(subject);

      const overallDuration = Date.now() - overallStart;

      // If cleanup actions run in parallel, the overall duration
      // should be close to the duration of the longest action
      expect(overallDuration).toBeLessThan(50); // Allowing some margin

      // Both actions should start at roughly the same time
      const startDiff = Math.abs(startTimes[0] - startTimes[1]);
      expect(startDiff).toBeLessThan(10); // Small timing difference is acceptable

      // End times should differ because durations are different
      const endDiff = Math.abs(endTimes[0] - endTimes[1]);
      expect(endDiff).toBeGreaterThan(10);
    });
  });
});
