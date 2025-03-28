import { describe, expect, it, vi } from "vitest";
import { CleanupAction, PassthroughScheduler, Scheduler, ScheduledAction } from "../lib/scheduler";
import { SchedulerSubject } from "../lib/types";
import { AsyncObservable } from "../lib/observable";

describe("PassthroughScheduler", () => {
  describe("core functionality and purpose", () => {
    it("should pass all work through to a parent scheduler", async () => {
      // Create parent scheduler with tracking
      const parentScheduler = new Scheduler();
      const subject = {} as SchedulerSubject;

      // Create passthrough scheduler
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Add work using the passthrough scheduler
      let workExecuted = false;
      const promise = Promise.resolve().then(() => {
        workExecuted = true;
      });

      passthroughScheduler.add(subject, promise);

      // Verify work is tracked in the parent scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);

      // Wait for work completion using the passthrough scheduler
      await passthroughScheduler.promise(subject);

      // Verify work was executed
      expect(workExecuted).toBe(true);

      // Parent scheduler should have cleaned up its tracking
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should defer execution of scheduled actions to the parent scheduler", async () => {
      // Create a custom parent scheduler to track execution
      class CustomParentScheduler extends Scheduler {
        executionOrder: string[] = [];

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionOrder.push("parent:before");
          super.schedule(subject, action);
          this.executionOrder.push("parent:after");
        }
      }

      const parentScheduler = new CustomParentScheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Schedule an action
      let actionExecuted = false;
      const action = new ScheduledAction(() => {
        parentScheduler.executionOrder.push("action");
        actionExecuted = true;
        return "result";
      });

      // Schedule using the passthrough scheduler
      passthroughScheduler.schedule(subject, action);

      // Verify the action is tracked in the parent scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);

      // Clean up
      await passthroughScheduler.promise(subject);

      // Verify the action was executed by the parent scheduler
      expect(actionExecuted).toBe(true);
      expect(parentScheduler.executionOrder).toEqual(["parent:before", "action", "parent:after"]);
    });

    it("should enable isolation and independent observation of parent scheduler work subsets", async () => {
      const parentScheduler = new Scheduler();
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Create two passthrough schedulers for different work subsets
      const passthrough1 = new PassthroughScheduler(parentScheduler);
      const passthrough2 = new PassthroughScheduler(parentScheduler);

      // Track execution
      const results: string[] = [];

      // Add work to first passthrough scheduler
      let resolve1: (value: any) => void;
      const promise1 = new Promise<void>((r) => (resolve1 = r));
      promise1.then(() => results.push("work1"));
      passthrough1.add(subject1, promise1);

      // Resolve only the first work item
      resolve1!(null);

      // Wait for just the first subset to complete
      await passthrough1.promise(subject1);

      // Only the first work item should be done
      expect(results).toEqual(["work1"]);

      // Add work to second passthrough scheduler
      let resolve2: (value: any) => void;
      const promise2 = new Promise<void>((r) => (resolve2 = r));
      promise2.then(() => results.push("work2"));
      passthrough2.add(subject2, promise2);

      // Complete the second work item
      resolve2!(null);
      await passthrough2.promise(subject2);

      // Now both work items should be done
      expect(results).toEqual(["work1", "work2"]);
    });

    it("should pass work through while tracking it independently", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Add multiple work items
      const completedWork: string[] = [];

      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          completedWork.push("work1");
        })
      );

      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          completedWork.push("work2");
        })
      );

      // Parent scheduler should be tracking the work
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);

      // Complete the work from the parent perspective
      await parentScheduler.promise(subject);

      // Work should be completed
      expect(completedWork).toContain("work1");
      expect(completedWork).toContain("work2");

      // Parent tracking is cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should pin work to a specified subject in the parent scheduler", async () => {
      const parentScheduler = new Scheduler();
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Add work
      let workDone = false;
      passthroughScheduler.add(
        workSubject,
        Promise.resolve().then(() => {
          workDone = true;
        })
      );

      // Work should be added to both the work subject and the pinning subject
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Waiting for the pinning subject should complete the work
      await parentScheduler.promise(pinningSubject);

      // Work should be done
      expect(workDone).toBe(true);

      // Schedule an action to verify pinning for schedule method
      let actionExecuted = false;
      const action = new ScheduledAction(() => {
        actionExecuted = true;
        return "result";
      });

      passthroughScheduler.schedule(workSubject, action);

      // Action should be executed
      expect(actionExecuted).toBe(true);

      // Action should be tracked for both subjects
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Clean up
      await parentScheduler.promise(workSubject);
      await parentScheduler.promise(pinningSubject);
    });

    it("should handle cleanup actions specially", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Track execution order
      const executionOrder: string[] = [];

      // Add cleanup action
      const cleanup = new CleanupAction(() => {
        executionOrder.push("cleanup");
      });

      // Add regular work
      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          executionOrder.push("regular work");
        })
      );

      passthroughScheduler.add(subject, cleanup);

      // Verify cleanup is tracked in parent scheduler
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(true);

      // Complete work
      await passthroughScheduler.promise(subject);

      // Regular work should be done before cleanup
      expect(executionOrder[0]).toBe("regular work");
      expect(executionOrder[1]).toBe("cleanup");

      // Parent scheduler should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(false);
    });
  });
  describe("constructor and initialization", () => {
    it("should be created with a parent scheduler reference as required parameter", async () => {
      // Create parent scheduler
      const parentScheduler = new Scheduler();

      // Create passthrough scheduler with parent
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Verify parent is properly set (using an indirect test since parent is protected)
      const subject = {} as SchedulerSubject;
      const action = new ScheduledAction(() => "test");

      // Schedule on passthrough should go to parent
      passthroughScheduler.schedule(subject, action);
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);
    });

    it("should optionally accept a pinning subject parameter", async () => {
      // Create parent scheduler
      const parentScheduler = new Scheduler();

      // Create subjects
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with parent and pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Test that pinning subject is properly used
      const action = new ScheduledAction(() => "test");

      // Schedule on the work subject
      passthroughScheduler.schedule(workSubject, action);

      // Verify work is associated with both subjects in parent
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);
    });
  });
  describe("add method", () => {
    it("should add the promise to the parent scheduler for the given subject", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create promise to add
      const promise = Promise.resolve();

      // Add the promise to the passthrough scheduler
      passthroughScheduler.add(subject, promise);

      // Verify the promise was added to the parent scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);

      // Complete the work
      await parentScheduler.promise(subject);
    });

    it("should optionally add the promise to the pinning subject in parent scheduler", async () => {
      const parentScheduler = new Scheduler();
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Create promise to add
      const promise = Promise.resolve();

      // Add the promise to the work subject
      passthroughScheduler.add(workSubject, promise);

      // Verify the promise was added to both subjects in the parent scheduler
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);
    });

    it("should connect work across parent-child scheduler hierarchy", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Track execution
      let executed = false;

      // Add work to passthrough
      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          executed = true;
        })
      );

      // Waiting on parent should complete the work
      await parentScheduler.promise(subject);

      // Work should be executed
      expect(executed).toBe(true);

      // Parent tracking should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should observe promises to determine when a subject's work completes", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create a promise with controlled resolution
      let resolvePromise: (value: any) => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      // Add the promise to the passthrough scheduler
      passthroughScheduler.add(subject, promise);

      // Start waiting for completion on both schedulers
      const parentCompletion = parentScheduler.promise(subject).then(() => "parent done");
      const passthroughCompletion = passthroughScheduler
        .promise(subject)
        .then(() => "passthrough done");

      // Verify neither promise is resolved yet
      const notDoneYet = await Promise.race([
        parentCompletion,
        passthroughCompletion,
        Promise.resolve("not done"),
      ]);
      expect(notDoneYet).toBe("not done");

      // Resolve the promise
      resolvePromise!(null);

      // Both schedulers should complete
      const results = await Promise.all([parentCompletion, passthroughCompletion]);
      expect(results).toEqual(["parent done", "passthrough done"]);

      // Parent scheduler should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });
  });
  describe("schedule method", () => {
    it("should delegate work execution to the parent scheduler", async () => {
      // Create parent scheduler with execution tracking
      class TrackingParentScheduler extends Scheduler {
        executionCount = 0;

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionCount++;
          return super.schedule(subject, action);
        }
      }

      const parentScheduler = new TrackingParentScheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create action to schedule
      const action = new ScheduledAction(() => "result");

      // Schedule the action through passthrough
      passthroughScheduler.schedule(subject, action);

      // Clean up
      await parentScheduler.promise(subject);

      // Verify parent scheduler was called to execute the action
      expect(parentScheduler.executionCount).toBe(1);
    });

    it("should not execute actions directly like the base Scheduler", async () => {
      // Create a mocked action to verify execution
      const action = new ScheduledAction(() => "result");
      const executeSpy = vi.spyOn(action, "execute");

      // Create parent scheduler
      const parentScheduler = new Scheduler();

      // Create a custom version of PassthroughScheduler to test execution
      class TestPassthroughScheduler extends PassthroughScheduler {
        isExecutedByChild = false;

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          // Call the parent method
          super.schedule(subject, action);

          // Check if the action was executed by super.schedule(subject, action)
          // by checking if the execute count increased after super.schedule
          if (executeSpy.mock.calls.length > 1) {
            this.isExecutedByChild = true;
          }
        }
      }

      const passthroughScheduler = new TestPassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Schedule the action
      passthroughScheduler.schedule(subject, action);

      // Verify the action was executed
      expect(executeSpy).toHaveBeenCalled();

      // But it should be executed by parent scheduler, not by the passthrough
      expect(passthroughScheduler.isExecutedByChild).toBe(false);

      // Clean up
      await parentScheduler.promise(subject);
    });

    it("should add the action to the parent scheduler for the same subject", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create action to schedule
      const action = new ScheduledAction(() => "result");

      // Schedule the action
      passthroughScheduler.schedule(subject, action);

      // Verify the action was added to the parent for the same subject
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);

      // Clean up
      await parentScheduler.promise(subject);
    });

    it("should optionally add the action to the pinning subject when provided", async () => {
      const parentScheduler = new Scheduler();
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Create action to schedule
      const action = new ScheduledAction(() => "result");

      // Schedule the action for the work subject
      passthroughScheduler.schedule(workSubject, action);

      // Verify the action was added to both subjects in the parent
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Waiting on either subject should complete the work
      await parentScheduler.promise(pinningSubject);

      // Subject shouldn't be cleaned up in parent since it wasn't awaited
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      // Pinning subject should be cleaned up in parent
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(false);
    });

    it("should connect actions to their owning subject", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Create actions for each subject
      const action1 = new ScheduledAction(() => "result1");
      const action2 = new ScheduledAction(() => "result2");

      // Schedule each action
      passthroughScheduler.schedule(subject1, action1);
      passthroughScheduler.schedule(subject2, action2);

      // Verify each action is connected to its subject
      expect(parentScheduler._subjectPromises.has(subject1)).toBe(true);
      expect(parentScheduler._subjectPromises.has(subject2)).toBe(true);

      // Complete work for just subject1
      await passthroughScheduler.promise(subject1);

      // Only subject1 should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject1)).toBe(false);
      expect(parentScheduler._subjectPromises.has(subject2)).toBe(true);

      // Complete work for subject2
      await passthroughScheduler.promise(subject2);
      expect(parentScheduler._subjectPromises.has(subject1)).toBe(false);
      expect(parentScheduler._subjectPromises.has(subject2)).toBe(false);
    });
  });
  describe("promise method", () => {
    it("should retrieve work only for the specified subject", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Create two subjects
      const subject1 = {} as SchedulerSubject;
      const subject2 = {} as SchedulerSubject;

      // Add work to both subjects
      let work1Done = false;
      let work2Done = false;

      passthroughScheduler.add(
        subject1,
        Promise.resolve().then(() => {
          work1Done = true;
        })
      );

      passthroughScheduler.add(
        subject2,
        Promise.resolve().then(() => {
          work2Done = true;
        })
      );

      // Wait for just subject1's work
      await passthroughScheduler.promise(subject1);

      // Only subject1's tracking should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject1)).toBe(false);
      expect(parentScheduler._subjectPromises.has(subject2)).toBe(true);

      // Both work items should be done since promises resolve immediately
      expect(work1Done).toBe(true);
      expect(work2Done).toBe(true);
    });

    it("should observe only a subset of the parent scheduler's work", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      const subject = {} as SchedulerSubject;
      const otherSubject = {} as SchedulerSubject;

      // Add work directly to parent for otherSubject
      let otherWorkDone = false;
      parentScheduler.add(
        otherSubject,
        Promise.resolve().then(() => {
          otherWorkDone = true;
        })
      );

      // Add work to passthrough for subject
      let subjectWorkDone = false;
      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          subjectWorkDone = true;
        })
      );

      // Wait for subject's work through passthrough
      await passthroughScheduler.promise(subject);

      // Passthrough's subject should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);

      // The parent should still be tracking otherSubject
      expect(parentScheduler._subjectPromises.has(otherSubject)).toBe(true);

      // Both work items should be done
      expect(subjectWorkDone).toBe(true);
      expect(otherWorkDone).toBe(true);
    });

    it("should allow independently waiting for completion of pinned subjects", async () => {
      const parentScheduler = new Scheduler();
      const pinningSubject = {} as SchedulerSubject;
      const workSubject1 = {} as SchedulerSubject;
      const workSubject2 = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Add work to different subjects
      let work1Done = false;
      let work2Done = false;

      passthroughScheduler.add(
        workSubject1,
        Promise.resolve().then(() => {
          work1Done = true;
        })
      );

      passthroughScheduler.add(
        workSubject2,
        Promise.resolve().then(() => {
          work2Done = true;
        })
      );

      // Verify work is added to the pinning subject
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Wait for completion of pinning subject through parent
      await parentScheduler.promise(pinningSubject);

      // All work should be done
      expect(work1Done).toBe(true);
      expect(work2Done).toBe(true);

      // Pinning subject should be cleaned up in parent
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(false);

      // But still has its own tracking of the work subjects
      expect(parentScheduler._subjectPromises.has(workSubject1)).toBe(true);
      expect(parentScheduler._subjectPromises.has(workSubject2)).toBe(true);
    });

    it("should allow visibility into pinned subjects while parent maintains full visibility", async () => {
      const parentScheduler = new Scheduler();
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Track execution
      const results: string[] = [];

      // Create a promise with delayed resolution
      let resolveWork: (value: any) => void;
      const workPromise = new Promise<void>((resolve) => {
        resolveWork = resolve;
      }).then(() => {
        results.push("work done");
      });

      // Add the work to the passthrough scheduler
      passthroughScheduler.add(workSubject, workPromise);

      // Verify work is tracked in both subjects in parent
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Start waiting for completion through both paths
      const passthroughCompletion = passthroughScheduler
        .promise(workSubject)
        .then(() => results.push("passthrough completed"));

      const pinningCompletion = parentScheduler
        .promise(pinningSubject)
        .then(() => results.push("pinning completed"));

      // Resolve the work
      resolveWork!(null);

      // Wait for both paths to complete
      await Promise.all([passthroughCompletion, pinningCompletion]);

      // Verify execution order
      expect(results[0]).toBe("work done");
      expect(results).toContain("passthrough completed");
      expect(results).toContain("pinning completed");
    });

    it("should resolve when all tracked work for the subject completes", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Add multiple work items
      const results: number[] = [];

      // Work with different completion times
      passthroughScheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push(1);
            resolve();
          }, 10);
        })
      );

      passthroughScheduler.add(
        subject,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            results.push(2);
            resolve();
          }, 5);
        })
      );

      // Wait for all work to complete
      await passthroughScheduler.promise(subject);

      // Both work items should be completed
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results.length).toBe(2);

      // Subject should be cleaned up
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });

    it("should execute cleanup actions after main work completes", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Track execution order
      const executionOrder: string[] = [];

      // Add cleanup action
      passthroughScheduler.add(
        subject,
        new CleanupAction(() => {
          executionOrder.push("cleanup");
          return Promise.resolve();
        })
      );

      // Add regular work
      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          executionOrder.push("regular work");
        })
      );

      // Wait for all work to complete
      await passthroughScheduler.promise(subject);

      // Verify execution order
      expect(executionOrder.length).toBe(2);
      expect(executionOrder[0]).toBe("regular work");
      expect(executionOrder[1]).toBe("cleanup");

      // Cleanup should be handled in the passthrough scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should not observe unrelated work in the parent scheduler", async () => {
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      const subject = {} as SchedulerSubject;
      const unrelatedSubject = {} as SchedulerSubject;

      // Track execution
      let subjectWorkDone = false;
      let unrelatedWorkDone = false;
      let unrelatedResolve: (value: any) => void;
      const unrelatedPromise = new Promise<void>((resolve) => {
        unrelatedResolve = () => {
          resolve();
          unrelatedWorkDone = true;
        };
      });

      // Add work to the subject through passthrough
      passthroughScheduler.add(
        subject,
        Promise.resolve().then(() => {
          subjectWorkDone = true;
        })
      );

      // Add unrelated work directly to parent
      parentScheduler.add(unrelatedSubject, unrelatedPromise);

      // Wait for subject's work through passthrough
      await passthroughScheduler.promise(subject);

      // Subject's work should be done
      expect(subjectWorkDone).toBe(true);
      expect(unrelatedWorkDone).toBe(false);

      // Subject should be cleaned up in parent
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);

      // The unrelated work should still be pending in parent
      expect(parentScheduler._subjectPromises.has(unrelatedSubject)).toBe(true);

      // Now resolve the unrelated work
      unrelatedResolve!(null);

      // Clean up parent
      await parentScheduler.promise(unrelatedSubject);
      expect(parentScheduler._subjectPromises.has(unrelatedSubject)).toBe(false);
    });
  });
  describe("dispose method", () => {
    it("should track resources being disposed", async () => {
      // Create parent and passthrough schedulers
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Create a subject and add both regular work and cleanup action
      const subject = {} as SchedulerSubject;

      // Add regular work
      passthroughScheduler.add(subject, Promise.resolve());

      // Add cleanup action
      const cleanupSpy = vi.fn();
      const cleanupAction = new CleanupAction(cleanupSpy);
      passthroughScheduler.add(subject, cleanupAction);

      // Verify work is tracked in parent scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(true);

      // Execute the cleanup action manually to verify it's tracked
      expect(cleanupSpy).not.toHaveBeenCalled();

      // Dispose of the subject
      await passthroughScheduler.dispose(subject);

      // Verify the cleanup action was executed
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Verify work is completed in parent scheduler
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should remove the subject from tracking after disposal", async () => {
      // Create parent and passthrough schedulers
      const parentScheduler = new Scheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Add work to a subject
      const subject = {} as SchedulerSubject;
      passthroughScheduler.add(subject, Promise.resolve());
      passthroughScheduler.add(subject, new CleanupAction(() => {}));

      // Verify the subject is initially tracked
      expect(parentScheduler._subjectPromises.has(subject)).toBe(true);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(true);

      // Dispose of the subject
      await passthroughScheduler.dispose(subject);

      // Verify the subject is removed from both tracking maps
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(false);
    });

    it("should properly dispose of pinned subjects", async () => {
      // Create parent scheduler
      const parentScheduler = new Scheduler();

      // Create subjects
      const pinningSubject = {} as SchedulerSubject;
      const workSubject = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning subject
      const passthroughScheduler = new PassthroughScheduler(parentScheduler, pinningSubject);

      // Add work to the work subject (which gets pinned to pinningSubject)
      const executionSpy = vi.fn();
      passthroughScheduler.add(workSubject, Promise.resolve().then(executionSpy));

      // Add a cleanup action
      const cleanupSpy = vi.fn();
      passthroughScheduler.add(workSubject, new CleanupAction(cleanupSpy));

      // Verify work is tracked in parent for both subjects
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(true);
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);

      // Dispose of the work subject
      await passthroughScheduler.dispose(workSubject);

      // Verify cleanup was executed
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Verify work subject is removed from parent tracking
      expect(parentScheduler._subjectPromises.has(workSubject)).toBe(false);
      expect(parentScheduler._subjectCleanup.has(workSubject)).toBe(false);

      // The pinning subject should still be tracked in parent (not disposed)
      expect(parentScheduler._subjectPromises.has(pinningSubject)).toBe(true);
    });

    it("should handle disposal of subjects that exist in both parent and child schedulers", async () => {
      // Create parent scheduler
      const parentScheduler = new Scheduler();

      // Create passthrough scheduler
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);

      // Create a subject
      const subject = {} as SchedulerSubject;

      // Add work directly to parent
      const parentCleanupSpy = vi.fn();
      parentScheduler.add(subject, new CleanupAction(parentCleanupSpy));

      // Add different work to passthrough
      const childCleanupSpy = vi.fn();
      passthroughScheduler.add(subject, new CleanupAction(childCleanupSpy));

      // Verify work is tracked in both schedulers
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(true);

      // Dispose through the parent scheduler
      await parentScheduler.dispose(subject);

      // Both cleanup actions should have executed
      expect(parentCleanupSpy).toHaveBeenCalledTimes(1);
      expect(childCleanupSpy).toHaveBeenCalledTimes(1);

      // Subject should be removed from parent scheduler
      expect(parentScheduler._subjectCleanup.has(subject)).toBe(false);
      expect(parentScheduler._subjectPromises.has(subject)).toBe(false);
    });
  });
  describe("observable composition", () => {
    it("should enable parent-child scheduler relationships", async () => {
      // Create a hierarchy of schedulers
      const rootScheduler = new Scheduler();
      const middleScheduler = new PassthroughScheduler(rootScheduler);
      const leafScheduler = new PassthroughScheduler(middleScheduler);

      // Create subjects for tracking work
      const rootSubject = {} as SchedulerSubject;
      const middleSubject = {} as SchedulerSubject;
      const leafSubject = {} as SchedulerSubject;

      // Add work at each level
      let rootWork = false;
      let middleWork = false;
      let leafWork = false;

      rootScheduler.add(
        rootSubject,
        Promise.resolve().then(() => {
          rootWork = true;
        })
      );

      middleScheduler.add(
        middleSubject,
        Promise.resolve().then(() => {
          middleWork = true;
        })
      );

      leafScheduler.add(
        leafSubject,
        Promise.resolve().then(() => {
          leafWork = true;
        })
      );

      // Verify work flows up the hierarchy
      expect(rootScheduler._subjectPromises.has(rootSubject)).toBe(true);
      expect(rootScheduler._subjectPromises.has(middleSubject)).toBe(true);
      expect(rootScheduler._subjectPromises.has(leafSubject)).toBe(true);

      // Complete leaf subject's work
      await leafScheduler.promise(leafSubject);

      // Verify all work is done
      expect(rootWork).toBe(true);
      expect(middleWork).toBe(true);
      expect(leafWork).toBe(true);
    });

    it("should create parent-child relationships between observables in a composition", async () => {
      // This test simulates observable composition without actual AsyncObservable
      const rootScheduler = new Scheduler();

      // Create pinning subjects to simulate observable hierarchy
      const parentObservable = {} as SchedulerSubject;
      const childObservable = {} as SchedulerSubject;

      // Create child scheduler that pins work to parent
      const childScheduler = new PassthroughScheduler(rootScheduler, parentObservable);

      // Add work to the child
      let workDone = false;
      childScheduler.add(
        childObservable,
        Promise.resolve().then(() => {
          workDone = true;
        })
      );

      // Verify work is tracked for both observables in parent
      expect(rootScheduler._subjectPromises.has(childObservable)).toBe(true);
      expect(rootScheduler._subjectPromises.has(parentObservable)).toBe(true);

      // We can wait on just the parent observable to complete all child work
      await rootScheduler.promise(parentObservable);

      // Work should be done
      expect(workDone).toBe(true);
    });

    it("should allow observing subsets of work independently", async () => {
      const rootScheduler = new Scheduler();

      // Create two parallel branches
      const branchA = {} as SchedulerSubject;
      const branchB = {} as SchedulerSubject;

      const schedulerA = new PassthroughScheduler(rootScheduler, branchA);
      const schedulerB = new PassthroughScheduler(rootScheduler, branchB);

      // Create work subjects
      const workA = {} as SchedulerSubject;
      const workB = {} as SchedulerSubject;

      // Add controlled work to each branch
      let resolveA: (value: any) => void;
      const promiseA = new Promise<void>((resolve) => {
        resolveA = resolve;
      });

      let resolveB: (value: any) => void;
      const promiseB = new Promise<void>((resolve) => {
        resolveB = resolve;
      });

      schedulerA.add(workA, promiseA);
      schedulerB.add(workB, promiseB);

      // Start waiting for just branch A
      const branchACompletion = rootScheduler.promise(branchA).then(() => "branchA");

      // Only resolve branch A
      resolveA!(null);

      // Branch A should complete without waiting for branch B
      const result = await branchACompletion;
      expect(result).toBe("branchA");

      // Branch B should still be tracked
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(true);

      // Complete branch B
      resolveB!(null);
      await rootScheduler.promise(branchB);

      // Everything should be cleaned up
      expect(rootScheduler._subjectPromises.has(branchA)).toBe(false);
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(false);
    });

    it("should maintain visibility into specific branches of observable compositions", async () => {
      const rootScheduler = new Scheduler();

      // Create a tree structure
      const rootSubject = {} as SchedulerSubject;
      const branchA = {} as SchedulerSubject;
      const branchB = {} as SchedulerSubject;
      const leafA1 = {} as SchedulerSubject;
      const leafA2 = {} as SchedulerSubject;
      const leafB1 = {} as SchedulerSubject;

      // Create schedulers for each branch
      const branchAScheduler = new PassthroughScheduler(rootScheduler, rootSubject);
      const branchBScheduler = new PassthroughScheduler(rootScheduler, rootSubject);
      const leafA1Scheduler = new PassthroughScheduler(branchAScheduler, branchA);
      const leafA2Scheduler = new PassthroughScheduler(branchAScheduler, branchA);
      const leafB1Scheduler = new PassthroughScheduler(branchBScheduler, branchB);

      // Add work to leaf nodes
      let leafA1Done = false;
      let leafA2Done = false;
      let leafB1Done = false;

      leafA1Scheduler.add(
        leafA1,
        Promise.resolve().then(() => {
          leafA1Done = true;
        })
      );

      leafA2Scheduler.add(
        leafA2,
        Promise.resolve().then(() => {
          leafA2Done = true;
        })
      );

      leafB1Scheduler.add(
        leafB1,
        Promise.resolve().then(() => {
          leafB1Done = true;
        })
      );

      // We can observe just branch A
      await branchAScheduler.promise(branchA);

      // Only branch A's leaves should be done
      expect(leafA1Done).toBe(true);
      expect(leafA2Done).toBe(true);

      // Branch B work should still be tracked but also done
      // (since promises resolve immediately)
      expect(leafB1Done).toBe(true);
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(true);

      // Complete the rest
      await rootScheduler.promise(rootSubject);

      // Everything should be cleaned up
      expect(rootScheduler._subjectPromises.has(rootSubject)).toBe(false);
    });

    it("should track work such that a child's work is a subset of its parent's work", async () => {
      const rootScheduler = new Scheduler();
      const parent = {} as SchedulerSubject;
      const child = {} as SchedulerSubject;

      // Create passthrough scheduler with pinning
      const childScheduler = new PassthroughScheduler(rootScheduler, parent);

      // Add work to child
      let workDone = false;
      childScheduler.add(
        child,
        Promise.resolve().then(() => {
          workDone = true;
        })
      );

      // Verify work is tracked for both parent and child
      expect(rootScheduler._subjectPromises.has(parent)).toBe(true);
      expect(rootScheduler._subjectPromises.has(child)).toBe(true);

      // Waiting on parent should complete the child's work
      await rootScheduler.promise(parent);

      // Work should be done
      expect(workDone).toBe(true);

      // Parent should be cleaned up
      expect(rootScheduler._subjectPromises.has(parent)).toBe(false);

      // Child should still be tracked in parent
      expect(rootScheduler._subjectPromises.has(child)).toBe(true);
    });

    it("should enable waiting for completion of any observable in a composition graph", async () => {
      const rootScheduler = new Scheduler();

      // Create a composition structure
      const root = {} as SchedulerSubject;
      const middle = {} as SchedulerSubject;
      const leaf = {} as SchedulerSubject;

      // Create schedulers
      const middleScheduler = new PassthroughScheduler(rootScheduler, root);
      const leafScheduler = new PassthroughScheduler(middleScheduler, middle);

      // Add controlled work to leaf with delayed resolution
      let resolveWork: (value: any) => void;
      const leafWork = new Promise<void>((resolve) => {
        resolveWork = resolve;
      });

      leafScheduler.add(leaf, leafWork);

      // Verify work is tracked at all levels
      expect(rootScheduler._subjectPromises.has(root)).toBe(true);
      expect(rootScheduler._subjectPromises.has(middle)).toBe(true);
      expect(rootScheduler._subjectPromises.has(leaf)).toBe(true);

      // Start waiting at different levels
      const rootPromise = rootScheduler.promise(root).then(() => "root done");
      const middlePromise = middleScheduler.promise(middle).then(() => "middle done");
      const leafPromise = leafScheduler.promise(leaf).then(() => "leaf done");

      // Resolve the leaf work
      resolveWork!(null);

      // All promises should complete
      const results = await Promise.all([rootPromise, middlePromise, leafPromise]);

      expect(results).toContain("root done");
      expect(results).toContain("middle done");
      expect(results).toContain("leaf done");
    });

    it("should allow independently waiting for specific branches in the observable tree", async () => {
      const rootScheduler = new Scheduler();

      // Create two parallel branches
      const branchA = {} as SchedulerSubject;
      const branchB = {} as SchedulerSubject;

      // Create schedulers for each branch
      const schedulerA = new PassthroughScheduler(rootScheduler);
      const schedulerB = new PassthroughScheduler(rootScheduler);

      // Add controlled work to each branch
      let resolveA: (value: any) => void;
      const promiseA = new Promise<void>((resolve) => {
        resolveA = resolve;
      });

      let resolveB: (value: any) => void;
      const promiseB = new Promise<void>((resolve) => {
        resolveB = resolve;
      });

      schedulerA.add(branchA, promiseA);
      schedulerB.add(branchB, promiseB);

      // Verify both branches are tracked in root
      expect(rootScheduler._subjectPromises.has(branchA)).toBe(true);
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(true);

      // Start waiting on branch A only
      const branchAComplete = schedulerA.promise(branchA).then(() => "A done");

      // Resolve only branch A
      resolveA!(null);

      // Branch A should complete
      const result = await branchAComplete;
      expect(result).toBe("A done");

      // Branch A should be cleaned up in its scheduler
      expect(rootScheduler._subjectPromises.has(branchA)).toBe(false);

      // Branch B should still be tracked
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(true);

      // Resolve branch B
      resolveB!(null);
      await schedulerB.promise(branchB);

      // Branch B should be cleaned up in its scheduler
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(false);
    });

    it("should not be blocked by unrelated work in other branches of the composition", async () => {
      const rootScheduler = new Scheduler();

      // Create two parallel branches
      const branchA = {} as SchedulerSubject;
      const branchB = {} as SchedulerSubject;

      // Create schedulers for each branch
      const schedulerA = new PassthroughScheduler(rootScheduler);
      const schedulerB = new PassthroughScheduler(rootScheduler);

      // Add controlled work to branch B only
      let resolveB: (value: any) => void;
      const promiseB = new Promise<void>((resolve) => {
        resolveB = resolve;
      });

      schedulerB.add(branchB, promiseB);

      // Add immediately resolving work to branch A
      let branchADone = false;
      schedulerA.add(
        branchA,
        Promise.resolve().then(() => {
          branchADone = true;
        })
      );

      // Wait for branch A
      await schedulerA.promise(branchA);

      // Branch A should be done
      expect(branchADone).toBe(true);

      // Branch A should be cleaned up in its scheduler
      expect(rootScheduler._subjectPromises.has(branchA)).toBe(false);

      // Branch B should still be waiting
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(true);

      // Now resolve branch B
      resolveB!(null);
      await schedulerB.promise(branchB);

      // Branch B should be cleaned up in its scheduler
      expect(rootScheduler._subjectPromises.has(branchB)).toBe(false);
    });

    it("should pass through scheduling behavior from parent to child", async () => {
      // Create custom scheduler to track execution
      class CustomExecutionScheduler extends Scheduler {
        executionOrder: string[] = [];

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionOrder.push("before execution");
          super.schedule(subject, action);
          this.executionOrder.push("after execution");
        }
      }

      const rootScheduler = new CustomExecutionScheduler();
      const childScheduler = new PassthroughScheduler(rootScheduler);
      const subject = {} as SchedulerSubject;

      // Schedule action through child
      const action = new ScheduledAction(() => {
        rootScheduler.executionOrder.push("action executed");
        return "result";
      });

      childScheduler.schedule(subject, action);

      // Verify the action's execution followed parent's custom behavior
      expect(rootScheduler.executionOrder).toEqual([
        "before execution",
        "action executed",
        "after execution",
      ]);

      // Clean up
      await rootScheduler.promise(subject);
    });

    it("should support chaining of multiple PassthroughSchedulers", async () => {
      const rootScheduler = new Scheduler();
      const level1 = new PassthroughScheduler(rootScheduler);
      const level2 = new PassthroughScheduler(level1);
      const level3 = new PassthroughScheduler(level2);

      const subject = {} as SchedulerSubject;

      // Add work to the deepest level
      let workDone = false;
      level3.add(
        subject,
        Promise.resolve().then(() => {
          workDone = true;
        })
      );

      // Verify work is tracked
      expect(rootScheduler._subjectPromises.has(subject)).toBe(true);

      // Complete from the top level
      await rootScheduler.promise(subject);

      // Work should be done
      expect(workDone).toBe(true);

      // Root level should be cleaned up
      expect(rootScheduler._subjectPromises.has(subject)).toBe(false);

      // Clean up each level in reverse order
      await level3.promise(subject);
      expect(rootScheduler._subjectPromises.has(subject)).toBe(false);

      await level2.promise(subject);
      expect(rootScheduler._subjectPromises.has(subject)).toBe(false);

      await level1.promise(subject);
      expect(rootScheduler._subjectPromises.has(subject)).toBe(false);
    });
  });
  describe("execution forwarding", () => {
    it("should forward the execution of actions to the parent scheduler", async () => {
      // Create a parent scheduler with execution tracking
      class ExecutionTrackingScheduler extends Scheduler {
        executionCount = 0;
        lastExecutedAction: ScheduledAction<any> | null = null;

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          this.executionCount++;
          this.lastExecutedAction = action;
          return super.schedule(subject, action);
        }
      }

      const parentScheduler = new ExecutionTrackingScheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create action
      const action = new ScheduledAction(() => "result");

      // Schedule through passthrough
      passthroughScheduler.schedule(subject, action);

      // Verify parent executed the action
      expect(parentScheduler.executionCount).toBe(1);
      expect(parentScheduler.lastExecutedAction).toBe(action);

      // Clean up
      await parentScheduler.promise(subject);
    });

    it("should ensure the parent scheduler's execution model is applied to all child actions", async () => {
      // Create a parent scheduler with a custom execution model
      class DelayedExecutionScheduler extends Scheduler {
        executionTimes: number[] = [];

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          // Instead of immediately executing, we'll add a small delay
          this.add(
            subject,
            new Promise<void>((resolve) => {
              setTimeout(() => {
                this.executionTimes.push(Date.now());
                action.execute();
                resolve();
              }, 10);
            })
          );

          // We don't call super.schedule since we're overriding the execution model
        }
      }

      const parentScheduler = new DelayedExecutionScheduler();
      const passthroughScheduler = new PassthroughScheduler(parentScheduler);
      const subject = {} as SchedulerSubject;

      // Create actions
      let action1Executed = false;
      const action1 = new ScheduledAction(() => {
        action1Executed = true;
        return "result1";
      });

      let action2Executed = false;
      const action2 = new ScheduledAction(() => {
        action2Executed = true;
        return "result2";
      });

      // Schedule through passthrough
      const startTime = Date.now();
      passthroughScheduler.schedule(subject, action1);
      passthroughScheduler.schedule(subject, action2);

      // Actions shouldn't execute immediately due to parent's execution model
      expect(action1Executed).toBe(false);
      expect(action2Executed).toBe(false);

      // Wait for completion
      await parentScheduler.promise(subject);

      // Now actions should be executed
      expect(action1Executed).toBe(true);
      expect(action2Executed).toBe(true);

      // Verify the execution model was applied (delayed execution)
      parentScheduler.executionTimes.forEach((time) => {
        expect(time - startTime).toBeGreaterThanOrEqual(10);
      });
    });

    it("should propagate execution dynamics from the root scheduler to the entire composition", async () => {
      // Create a scheduler with a custom execution model
      class CustomOrderScheduler extends Scheduler {
        executionOrder: string[] = [];

        schedule(subject: SchedulerSubject, action: ScheduledAction<any>) {
          // @ts-ignore
          this.executionOrder.push(`before:${action.name || "unnamed"}`);
          const result = super.schedule(subject, action);
          // @ts-ignore
          this.executionOrder.push(`after:${action.name || "unnamed"}`);
          return result;
        }
      }

      // Create a chain of schedulers
      const rootScheduler = new CustomOrderScheduler();
      const level1 = new PassthroughScheduler(rootScheduler);
      const level2 = new PassthroughScheduler(level1);
      const level3 = new PassthroughScheduler(level2);

      const subject = {} as SchedulerSubject;

      // Create named actions
      const action1 = new ScheduledAction(() => {
        rootScheduler.executionOrder.push("execute:action1");
        return "result1";
      });
      // @ts-ignore
      action1.name = "action1";

      const action2 = new ScheduledAction(() => {
        rootScheduler.executionOrder.push("execute:action2");
        return "result2";
      });
      // @ts-ignore
      action2.name = "action2";

      // Schedule through different levels of the chain
      level2.schedule(subject, action1);
      level3.schedule(subject, action2);

      // Verify the execution followed the root scheduler's model
      expect(rootScheduler.executionOrder).toEqual([
        "before:action1",
        "execute:action1",
        "after:action1",
        "before:action2",
        "execute:action2",
        "after:action2",
      ]);

      // Clean up
      await rootScheduler.promise(subject);
    });
  });
  describe("observable integration", () => {
    it("should be used internally by derived observables via AsyncObservable getter", async () => {
      // Create a parent observable
      const parentObservable = new AsyncObservable<number>();

      // The AsyncObservable getter returns a class that uses a PassthroughScheduler
      // bound to the parent observable's scheduler
      const childObservableClass = parentObservable.AsyncObservable;

      // Instantiate a child observable using the returned class
      const childObservable = new childObservableClass<string>();

      // Verify the child observable has a PassthroughScheduler
      expect(childObservable._scheduler).toBeInstanceOf(PassthroughScheduler);

      // Test that work flows through the schedulers correctly
      let value = 0;

      // Add work to the child observable's scheduler
      childObservable._scheduler.add(
        childObservable,
        Promise.resolve().then(() => {
          value = 42;
        })
      );

      // Awaiting the parent observable should complete work scheduled by the child
      await parentObservable.drain();

      // Work should be completed
      expect(value).toBe(42);
    });

    it("should support observable derivation through a bound AsyncObservable class", async () => {
      const sourceObservable = new AsyncObservable<number>(async function* (sub) {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a derived observable using the AsyncObservable getter
      const derivedObservable = new sourceObservable.AsyncObservable<string>(async function* (sub) {
        for await (const num of sourceObservable) {
          yield `Number: ${num}`;
        }
      });

      // Collect results from the derived observable
      const results: string[] = [];
      for await (const value of derivedObservable) {
        results.push(value);
      }

      // Verify the correct values were received
      expect(results).toEqual(["Number: 1", "Number: 2", "Number: 3"]);

      // Verify the derived observable's scheduler is a PassthroughScheduler
      expect(derivedObservable._scheduler).toBeInstanceOf(PassthroughScheduler);
    });

    it("should initialize with derived observables when created through the AsyncObservable getter", async () => {
      // Create a root observable
      const rootObservable = new AsyncObservable<string>();

      // Create a child observable
      const childObservable = new rootObservable.AsyncObservable<number>();

      // The child's scheduler should be a PassthroughScheduler
      expect(childObservable._scheduler).toBeInstanceOf(PassthroughScheduler);

      // The PassthroughScheduler should be initialized with the root scheduler and root observable
      const childScheduler = childObservable._scheduler as PassthroughScheduler;

      // Add work to the child
      let workDone = false;
      childScheduler.add(
        childObservable,
        Promise.resolve().then(() => {
          workDone = true;
        })
      );

      // Verify work is tracked in both schedulers
      const rootScheduler = rootObservable._scheduler as Scheduler;
      expect(rootScheduler._subjectPromises.has(childObservable)).toBe(true);

      // Verify the pinning relationship is established (work pinned to root observable)
      expect(rootScheduler._subjectPromises.has(rootObservable)).toBe(true);

      // Awaiting the root should complete child work
      await rootObservable.drain();

      // Work should be completed
      expect(workDone).toBe(true);
    });

    it("should maintain the relationship between parent and child observables", async () => {
      // Create a hierarchy of observables
      const rootObservable = new AsyncObservable<string>();
      const level1 = new rootObservable.AsyncObservable<number>();
      const level2 = new level1.AsyncObservable<boolean>();

      // Track completion states
      let rootCleanupExecuted = false;
      let level1WorkExecuted = false;
      let level2WorkExecuted = false;

      // Add cleanup to root
      rootObservable.finally(() => {
        rootCleanupExecuted = true;
      });

      // Add work to different levels
      level1._scheduler.add(
        level1,
        Promise.resolve().then(() => {
          level1WorkExecuted = true;
        })
      );

      level2._scheduler.add(
        level2,
        Promise.resolve().then(() => {
          level2WorkExecuted = true;
        })
      );

      // Awaiting the root should complete all work in the hierarchy
      await rootObservable.drain();

      // All work should be completed
      expect(level1WorkExecuted).toBe(true);
      expect(level2WorkExecuted).toBe(true);
      expect(rootCleanupExecuted).toBe(true);
    });

    it("should enable side effect propagation across the entire observable composition", async () => {
      // Create a source observable
      const source = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a series of transforms using the PassthroughScheduler
      const doubled = new source.AsyncObservable<number>(async function* () {
        for await (const value of source) {
          yield value * 2;
        }
      });

      const stringified = new doubled.AsyncObservable<string>(async function* () {
        for await (const value of doubled) {
          yield `Value: ${value}`;
        }
      });

      // Side effect tracking
      const sideEffects: string[] = [];

      // Add side effects at each level
      source.finally(() => sideEffects.push("source cleanup"));
      doubled.finally(() => sideEffects.push("doubled cleanup"));
      stringified.finally(() => sideEffects.push("stringified cleanup"));

      // Process the final observable
      const results: string[] = [];
      stringified.subscribe((value) => results.push(value));
      await source.drain();

      // Verify the observable chain produced correct results
      expect(results).toEqual(["Value: 2", "Value: 4", "Value: 6"]);

      // Verify side effects propagated through the composition
      expect(sideEffects).toContain("source cleanup");
      expect(sideEffects).toContain("doubled cleanup");
      expect(sideEffects).toContain("stringified cleanup");
    });
  });
});
