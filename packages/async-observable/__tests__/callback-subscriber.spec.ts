import { describe, expect, it, vi } from "vitest";
import { AsyncObservable } from "../lib/observable";
import { CallbackSubscriber, ConsumerPromise } from "../lib/subscriber";
import { CallbackAction, ScheduledAction } from "../lib/scheduler";

describe("CallbackSubscriber", () => {
  describe("constructor", () => {
    it("should initialize with observable and callback", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Create a callback function
      const callback = (value: number) => value * 2;

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Verify initialization
      expect(subscriber._observable).toBe(observable);
      expect(subscriber["callback"]).toBe(callback);
    });

    it("should start iteration with callback immediately", async () => {
      // Track execution
      let iterationStarted = false;

      // Create an observable with a generator that signals when started
      const observable = new AsyncObservable<number>(async function* () {
        iterationStarted = true;
        yield 1;
      });

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, () => {});

      // Give time for microtasks to process
      await Promise.resolve();

      // Verify iteration has started without explicit next() calls
      expect(iterationStarted).toBe(true);

      // Ensure cleanup
      await subscriber.cancel();
    });

    it("should process observable values through callback function", async () => {
      // Track processed values
      const processedValues: number[] = [];

      // Create a simple observable that yields values
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a callback that doubles values and tracks them
      const callback = (value: number) => {
        const processed = value * 2;
        processedValues.push(processed);
        return processed;
      };

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Wait for all values to be processed
      await subscriber;

      // Verify all values were processed through the callback
      expect(processedValues).toEqual([2, 4, 6]);
    });

    it("should schedule callbacks through the observable's scheduler", async () => {
      // Create an observable with a spy on its scheduler
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create a spy on the scheduler's schedule method
      const scheduleSpy = vi.spyOn(observable._scheduler, "schedule");

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, () => {});

      // Wait for all values to be processed
      await subscriber;

      // Verify the scheduler.schedule was called for each value
      expect(scheduleSpy).toHaveBeenCalledWith(subscriber, expect.any(ScheduledAction));
    });

    it("should add the consumer promise to the scheduler", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Create a spy on the scheduler's add method
      const addSpy = vi.spyOn(observable._scheduler, "add");

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, () => {});

      // Verify scheduler.add was called with the consumer promise
      expect(addSpy).toHaveBeenCalledWith(subscriber, expect.any(ConsumerPromise));
    });

    it("should handle errors in callbacks", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create a callback that throws on the second value
      const callbackError = new Error("Callback error");
      const callback = (value: number) => {
        if (value === 2) {
          throw callbackError;
        }
        return value;
      };

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Wait for the error
      await expect(subscriber).rejects.toThrow(callbackError);
    });
  });
  describe("callback execution", () => {
    it("should schedule the callback for each emitted value", async () => {
      // Track callback executions
      const executedValues: number[] = [];

      // Create an observable that yields values
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      // Create a callback that tracks executions
      const callback = (value: number) => {
        executedValues.push(value);
      };

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Wait for all values to be processed
      await subscriber;

      // Verify the callback was executed for each value
      expect(executedValues).toEqual([1, 2, 3]);
    });

    it("should use the observable's scheduler for callback execution", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      // Create spies to track execution
      const scheduleSpy = vi.spyOn(observable._scheduler, "schedule");

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, () => {});

      // Wait for all values to be processed
      await subscriber;

      // Verify the scheduler was used for callback execution
      expect(scheduleSpy).toHaveBeenCalled();

      // The first argument to schedule should be the subscriber
      expect(scheduleSpy).toHaveBeenCalledWith(subscriber, expect.any(CallbackAction));
    });

    it("should bind the callback to the subscriber instance", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      // Create a callback that verifies 'this' binding
      let callbackThis: any = null;
      const callback = function (this: any, value: number) {
        callbackThis = this;
      };

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Wait for all values to be processed
      await subscriber;

      // Verify the callback was bound to the subscriber
      expect(callbackThis).toBe(subscriber);
    });

    it("should handle async callbacks properly", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Track execution order
      const executionOrder: string[] = [];

      // Create an async callback
      const callback = async (value: number) => {
        executionOrder.push(`start ${value}`);
        await new Promise((resolve) => setTimeout(resolve, value * 10));
        executionOrder.push(`end ${value}`);
        return value;
      };

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, callback);

      // Wait for all values to be processed
      await subscriber;

      // Verify execution order - callbacks should complete even if they're async
      expect(executionOrder).toContain("start 1");
      expect(executionOrder).toContain("end 1");
      expect(executionOrder).toContain("start 2");
      expect(executionOrder).toContain("end 2");

      // The second callback might start before the first one ends due to async nature
      const start1Index = executionOrder.indexOf("start 1");
      const end1Index = executionOrder.indexOf("end 1");
      const start2Index = executionOrder.indexOf("start 2");

      // First callback should start before it ends
      expect(start1Index).toBeLessThan(end1Index);
    });

    it("should execute clean up code", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      // Track execution
      let cleanupExecuted = false;

      // Create a CallbackSubscriber
      const subscriber = new CallbackSubscriber<number>(observable, () => {});

      // Add cleanup work
      subscriber.finally(() => {
        cleanupExecuted = true;
      });

      // Wait for all values to be processed and cleanup
      await subscriber;

      // Verify cleanup was executed
      expect(cleanupExecuted).toBe(true);
    });
  });
});
