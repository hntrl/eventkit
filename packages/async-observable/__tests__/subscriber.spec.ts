import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { AsyncObservable } from "../lib/observable";
import {
  CallbackSubscriber,
  kCancelSignal,
  Subscriber,
  SubscriberReturnSignal,
} from "../lib/subscriber";
import { Scheduler } from "../lib/scheduler";

describe("Subscriber", () => {
  describe("constructor", () => {
    it("should initialize with the provided observable", async () => {
      // Create a mock observable
      const observable = new AsyncObservable<number>();

      // Create a subscriber with the observable
      const subscriber = new Subscriber<number>(observable);

      // Verify the observable is stored correctly
      expect(subscriber._observable).toBe(observable);
    });

    it("should create a generator when first accessed (lazy initialization)", async () => {
      // Create an observable with a generator spy
      let generatorCalled = false;
      const observable = new AsyncObservable<number>(async function* (sub) {
        generatorCalled = true;
        yield 1;
      });

      // Create a spy on the generator method
      vi.spyOn(observable, "_generator");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify the generator hasn't been created yet
      expect(subscriber._generator).toBeNull();
      expect(observable._generator).not.toHaveBeenCalled();
      expect(generatorCalled).toBe(false);

      // Access the generator through the getter
      await subscriber.next();
      const generator = subscriber._generator;

      // Verify the generator was created
      expect(subscriber._generator).not.toBeNull();
      expect(observable._generator).toHaveBeenCalledWith(subscriber);

      // Accessing it again should return the same instance (cached)
      const generator2 = subscriber._generator;
      expect(generator2).toBe(generator);
      expect(observable._generator).toHaveBeenCalledTimes(1);
    });

    it("should register with the observable's scheduler", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Spy on scheduler's add method
      const schedulerAddSpy = vi.spyOn(observable._scheduler, "add");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify the subscriber was registered with the scheduler
      expect(schedulerAddSpy).toHaveBeenCalledTimes(1);
      expect(schedulerAddSpy).toHaveBeenCalledWith(subscriber, expect.any(Promise));

      // Verify the promise passed is the _returnSignal
      const addCall = schedulerAddSpy.mock.calls[0];
      const promiseArg = addCall[1];

      // The promise should be from the return signal
      expect(promiseArg).toBe(subscriber._returnSignal.asPromise());
    });

    it("should initialize internal promise resolvers", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify signal instances are created
      expect(subscriber._returnSignal).toBeDefined();
      expect(subscriber._cancelSignal).toBeDefined();

      // Verify they're initialized as Signal instances
      expect(subscriber._returnSignal.constructor.name).toBe("Signal");
      expect(subscriber._cancelSignal.constructor.name).toBe("Signal");

      // Verify the signals can be resolved
      let returnResolved = false;
      subscriber._returnSignal.asPromise().then(() => {
        returnResolved = true;
      });

      let cancelResolved = false;
      subscriber._cancelSignal.asPromise().then(() => {
        cancelResolved = true;
      });

      // Resolve the signals
      subscriber._returnSignal.resolve();
      subscriber._cancelSignal.resolve(kCancelSignal);

      // Wait for resolution
      await Promise.resolve();

      // Verify the signals were resolved
      expect(returnResolved).toBe(true);
      expect(cancelResolved).toBe(true);
    });

    it("should initialize _returnSignal as SubscriberReturnSignal", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify the return signal is a SubscriberReturnSignal
      expect(subscriber._returnSignal).instanceOf(SubscriberReturnSignal);
    });

    it("should add work to both subscriber and parent observable", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Add work to the subscriber via the scheduler
      const scheduler = observable._scheduler as Scheduler;
      const work = Promise.resolve();
      scheduler.add(subscriber, work);

      // Verify work is tracked for both subscriber and observable
      expect(scheduler._subjectPromises.has(subscriber)).toBe(true);
      expect(scheduler._subjectPromises.has(observable)).toBe(true);

      // Clean up
      subscriber._returnSignal.resolve();
      await scheduler.promise(subscriber);

      // Verify work is cleaned up
      expect(scheduler._subjectPromises.has(subscriber)).toBe(false);
    });
  });
  describe("SubscriptionLike implementation", () => {
    it("should implement a cancel method for resource disposal", async () => {
      // Create an observable with a generator that yields values
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
        } finally {
          // This will be called when the generator is cancelled
        }
      });

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify the subscriber has a cancel method
      expect(typeof subscriber.cancel).toBe("function");

      // The cancel method should return a Promise
      const cancelPromise = subscriber.cancel();
      expect(cancelPromise instanceof Promise).toBe(true);

      // The promise should resolve
      await cancelPromise;
    });

    it("should trigger generator cleanup when cancelled", async () => {
      // Track cleanup
      let cleanupExecuted = false;

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          // This will block indefinitely unless cancelled
          await new Promise((resolve) => {});
        } finally {
          cleanupExecuted = true;
        }
      });

      const subscriber = new Subscriber<number>(observable);
      // Initialize generator by accessing it
      await subscriber.next();

      // Verify cleanup hasn't happened yet
      expect(cleanupExecuted).toBe(false);

      // Cancel the subscriber
      await subscriber.cancel();

      // Verify cleanup was executed
      expect(cleanupExecuted).toBe(true);
    });

    it("should call generator's return() method when cancelled", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);

      // Access generator to initialize it
      await subscriber.next();

      const generator = subscriber._generator;

      // Create a spy on generator.return
      // @ts-ignore
      const returnSpy = vi.spyOn(generator, "return");

      // Cancel the subscriber
      await subscriber.cancel();

      // Verify return was called
      expect(returnSpy).toHaveBeenCalled();
    });

    it("should resolve the cancel promise when cleanup is complete", async () => {
      // Create a delayable cleanup
      let resolveCleanup: () => void;
      const cleanupPromise = new Promise<void>((resolve) => {
        resolveCleanup = resolve;
      });

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
        } finally {
          await cleanupPromise;
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Initialize the generator to ensure finally block will run
      const iteratorResult = await subscriber.next();
      expect(iteratorResult.value).toBe(1);

      // Start cancellation but don't await it
      const cancelPromise = subscriber.cancel();

      // Verify the promise hasn't resolved yet
      let cancelled = false;
      cancelPromise.then(() => {
        cancelled = true;
      });

      // Wait a tick to allow any synchronous resolutions
      await Promise.resolve();
      expect(cancelled).toBe(false);

      // Resolve the cleanup
      resolveCleanup!();

      // Now the cancel promise should resolve
      await cancelPromise;
      expect(cancelled).toBe(true);
    });

    it("should send cancellation signal via kCancelSignal", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);

      // Set up a listener on the cancel signal
      let signalReceived = false;
      subscriber[kCancelSignal].then((signal) => {
        signalReceived = signal === kCancelSignal;
      });

      // Cancel the subscriber
      await subscriber.cancel();

      // Verify the cancel signal was sent
      expect(signalReceived).toBe(true);
    });

    it("should separate cleanup completion from execution state", async () => {
      // We'll have two flags: one for execution state and one for cleanup
      let executionCompleted = false;
      let cleanupExecuted = false;

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionCompleted = true;
          yield 2;
        } finally {
          // This delay simulates some async cleanup work
          await new Promise((resolve) => setTimeout(resolve, 20));
          cleanupExecuted = true;
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Get first value to initialize generator
      const iteratorResult = await subscriber.next();
      expect(iteratorResult.value).toBe(1);

      // Cancel the subscriber
      const cancelPromise = subscriber.cancel();

      // At this point, execution may or may not be complete,
      // but cleanup should not have finished yet
      expect(cleanupExecuted).toBe(false);

      // Wait for cancellation to complete
      await cancelPromise;

      // Now cleanup should be done
      expect(cleanupExecuted).toBe(true);

      // But execution state may not have completed (the timeout for yield 2)
      // This is key - execution and cleanup are separate concerns
      // In reality, execution would be interrupted by cancellation,
      // but the test demonstrates they're tracked separately
    });
  });
  describe("PromiseLike implementation", () => {
    it("should implement then/catch/finally methods", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);

      // Verify the subscriber has then, catch, and finally methods
      expect(typeof subscriber.then).toBe("function");
      expect(typeof subscriber.catch).toBe("function");
      expect(typeof subscriber.finally).toBe("function");

      // Ensure they return promises
      expect(subscriber.then() instanceof Promise).toBe(true);
      expect(subscriber.catch(() => {}) instanceof Promise).toBe(true);
      expect(subscriber.finally(() => {}) instanceof Promise).toBe(true);
    });

    it("should resolve when the generator completes", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Generator completes naturally
      });

      const subscriber = new Subscriber<number>(observable);

      // Access values to start the generator
      expect((await subscriber.next()).value).toBe(1);
      expect((await subscriber.next()).value).toBe(2);
      expect((await subscriber.next()).done).toBe(true);

      // Subscriber should resolve when generator completes
      let resolved = false;
      await subscriber.then(() => {
        resolved = true;
      });

      expect(resolved).toBe(true);
    });

    it("should reject when the generator throws an error", async () => {
      const testError = new Error("Test generator error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      const subscriber = new Subscriber<number>(observable);

      // Start the generator
      await subscriber.next();

      // The next call should throw
      try {
        await subscriber.next();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe(testError);
      }

      // The subscriber promise should also reject with the same error
      await expect(subscriber).rejects.toBe(testError);
    });

    it("should act as a catch-all for errors during generator execution", async () => {
      const testError = new Error("Test execution error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        await Promise.resolve();
        throw testError;
      });

      const subscriber = new Subscriber<number>(observable);

      // Even without awaiting the next call that would throw,
      // the subscriber should capture the error
      let caughtError = null;
      try {
        // Consume the observable to completion
        for await (const value of subscriber) {
          // Just iterate through all values
        }
        await subscriber;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBe(testError);
    });

    it("should track execution state via the scheduler", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);
      const scheduler = observable._scheduler as Scheduler;

      // Spy on scheduler.promise
      const promiseSpy = vi.spyOn(scheduler, "promise");

      // Call then method to get promise state
      await subscriber.next();
      await subscriber.then(() => {});

      // Verify scheduler.promise was called with the subscriber
      expect(promiseSpy).toHaveBeenCalledWith(subscriber);
    });

    it("should be awaitable multiple times", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);

      // Consume the observable to completion
      for await (const value of subscriber) {
        // Just iterate through all values
      }

      // Should be able to await multiple times
      let firstAwait = false;
      let secondAwait = false;

      await subscriber.then(() => {
        firstAwait = true;
      });

      await subscriber.then(() => {
        secondAwait = true;
      });

      expect(firstAwait).toBe(true);
      expect(secondAwait).toBe(true);
    });

    it("should resolve when all its scheduled work completes", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);
      const scheduler = observable._scheduler as Scheduler;

      // Add additional work to the subscriber
      let work1Done = false;
      let work2Done = false;

      const work1 = new Promise<void>((resolve) => {
        setTimeout(() => {
          work1Done = true;
          resolve();
        }, 10);
      });

      const work2 = new Promise<void>((resolve) => {
        setTimeout(() => {
          work2Done = true;
          resolve();
        }, 20);
      });

      scheduler.add(subscriber, work1);
      scheduler.add(subscriber, work2);

      // Consume all values from the observable
      for await (const value of subscriber) {
        // Just iterate to complete the generator
      }

      // Subscriber should not resolve until all work is done
      const beforeWorkDone = await Promise.race([
        Promise.resolve("not done"),
        subscriber.then(() => "done"),
      ]);

      expect(beforeWorkDone).toBe("not done");
      expect(work1Done).toBe(false);
      expect(work2Done).toBe(false);

      // Wait for the subscriber to resolve
      await subscriber;

      // All work should be complete
      expect(work1Done).toBe(true);
      expect(work2Done).toBe(true);
    });
    it("should dispose of resources via scheduler when the promise is resolved", async () => {
      // Create an observable with a generator that completes normally
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Natural completion
      });

      // Spy on the scheduler's dispose method
      const disposeSpy = vi.spyOn(observable._scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      const subPromise = subscriber.then();

      expect(disposeSpy).not.toHaveBeenCalled();

      // Iterate through values to trigger promise resolution
      for await (const value of subscriber) {
        // Just consume values
      }

      // Wait for the promise to resolve
      await subPromise;

      // Verify the scheduler's dispose method was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);

      // Observable should have no subscribers
      expect(observable.subscribers.length).toBe(0);

      // Clean up spy
      disposeSpy.mockRestore();
    });
    it("should dispose of resources via scheduler when the promise is rejected", async () => {
      // Create a test error
      const testError = new Error("Test rejection error");

      // Create an observable with a generator that throws an error
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      // Spy on the scheduler's dispose method
      const disposeSpy = vi.spyOn(observable._scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      expect(disposeSpy).not.toHaveBeenCalled();

      // Attempt to iterate through values (will throw)
      try {
        for await (const value of subscriber) {
          // Should throw after first value
        }
        // Wait for the promise to resolve
        await subscriber;
      } catch (error) {
        expect(error).toBe(testError);
      }

      // Verify the scheduler's dispose method was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);

      // Observable should have no subscribers
      expect(observable.subscribers.length).toBe(0);

      // Clean up spy
      disposeSpy.mockRestore();
    });
  });
  describe("AsyncIterable implementation", () => {
    it("should implement Symbol.asyncIterator", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);

      // Verify the subscriber has Symbol.asyncIterator method
      expect(typeof subscriber[Symbol.asyncIterator]).toBe("function");

      // Verify it returns an AsyncIterator with the required methods
      const iterator = subscriber[Symbol.asyncIterator]();
      expect(typeof iterator.next).toBe("function");
      expect(typeof iterator.return).toBe("function");
      expect(typeof iterator.throw).toBe("function");
    });

    it("should yield values from the generator", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const subscriber = new Subscriber<number>(observable);

      // Get values one by one using the iterator
      const iterator = subscriber[Symbol.asyncIterator]();

      // First value
      const result1 = await iterator.next();
      expect(result1.done).toBe(false);
      expect(result1.value).toBe(1);

      // Second value
      const result2 = await iterator.next();
      expect(result2.done).toBe(false);
      expect(result2.value).toBe(2);

      // Third value
      const result3 = await iterator.next();
      expect(result3.done).toBe(false);
      expect(result3.value).toBe(3);

      // End of iteration
      const result4 = await iterator.next();
      expect(result4.done).toBe(true);
    });

    it("should signal completion when generator is done", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        // Generator completes after one value
      });

      const subscriber = new Subscriber<number>(observable);

      // Get the first and only value
      const result1 = await subscriber.next();
      expect(result1.done).toBe(false);
      expect(result1.value).toBe(1);

      // Generator should be done
      const result2 = await subscriber.next();
      expect(result2.done).toBe(true);

      // The return signal should be resolved
      // We can verify this indirectly by checking if the subscriber promise is resolved
      let resolved = false;
      await subscriber.then(() => {
        resolved = true;
      });

      expect(resolved).toBe(true);
    });

    it("should propagate errors from the generator", async () => {
      const testError = new Error("Test iterator error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      const subscriber = new Subscriber<number>(observable);
      const iterator = subscriber[Symbol.asyncIterator]();

      // First value should be OK
      const result1 = await iterator.next();
      expect(result1.value).toBe(1);

      // Next call should throw the error
      await expect(iterator.next()).rejects.toBe(testError);
    });

    it("should allow early termination via return", async () => {
      // Track if finally block was executed
      let cleanupExecuted = false;

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
        } finally {
          cleanupExecuted = true;
        }
      });

      const subscriber = new Subscriber<number>(observable);
      const iterator = subscriber[Symbol.asyncIterator]();

      // Get first value
      const result1 = await iterator.next();
      expect(result1.value).toBe(1);

      // Early termination
      const returnResult = await iterator.return(undefined);
      expect(returnResult.done).toBe(true);

      // Cleanup should have been executed
      expect(cleanupExecuted).toBe(true);

      // Subscriber should now be resolved
      let resolved = false;
      await subscriber.then(() => {
        resolved = true;
      });
      expect(resolved).toBe(true);
    });

    it("should support for-await-of loop usage", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });

      const subscriber = new Subscriber<number>(observable);

      // Collect values using a for-await-of loop
      const values: number[] = [];
      for await (const value of subscriber) {
        values.push(value);
      }

      // Verify all values were collected
      expect(values).toEqual([1, 2, 3]);

      // Subscriber should be complete after loop
      let resolved = false;
      await subscriber.then(() => {
        resolved = true;
      });
      expect(resolved).toBe(true);
    });
    it("should dispose of resources via scheduler when the iteration completes", async () => {
      // Create an observable with a generator that completes normally
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Natural completion
      });

      // Spy on the scheduler's dispose method
      const disposeSpy = vi.spyOn(observable._scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      expect(disposeSpy).not.toHaveBeenCalled();

      // Create an iterator and consume all values
      const iterator = subscriber[Symbol.asyncIterator]();
      await iterator.next(); // First value
      await iterator.next(); // Second value
      const result = await iterator.next(); // Should be done

      // Verify the iterator has completed
      expect(result.done).toBe(true);

      // Verify the scheduler's dispose method was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);

      // Clean up spy
      disposeSpy.mockRestore();
    });
    it("should dispose of resources via scheduler when an error occurs", async () => {
      // Create a test error
      const testError = new Error("Test iteration error");

      // Create an observable with a generator that throws an error
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      // Spy on the scheduler's dispose method
      const disposeSpy = vi.spyOn(observable._scheduler, "dispose");

      // Create a subscriber and iterator
      const subscriber = new Subscriber<number>(observable);
      const iterator = subscriber[Symbol.asyncIterator]();

      expect(disposeSpy).not.toHaveBeenCalled();

      // Get the first value successfully
      await iterator.next();

      // Next call should throw
      try {
        await iterator.next();
      } catch (error) {
        expect(error).toBe(testError);
      }

      // Verify the scheduler's dispose method was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);

      // Clean up spy
      disposeSpy.mockRestore();
    });
    it("should dispose of resources via scheduler when early termination occurs", async () => {
      // Create an observable with a generator that would emit multiple values
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3; // Should never be reached
      });

      // Spy on the scheduler's dispose method
      const disposeSpy = vi.spyOn(observable._scheduler, "dispose");

      // Create a subscriber and iterator
      const subscriber = new Subscriber<number>(observable);
      const iterator = subscriber[Symbol.asyncIterator]();

      expect(disposeSpy).not.toHaveBeenCalled();

      // Get the first value
      await iterator.next();

      // Call return to terminate early
      await iterator.return();

      // Verify the scheduler's dispose method was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);

      // Trying to get more values should indicate completion
      const result = await iterator.next();
      expect(result.done).toBe(true);

      // Clean up spy
      disposeSpy.mockRestore();
    });
  });
  describe("error handling", () => {
    it("should forward generator errors to promise rejection", async () => {
      const testError = new Error("Test generator error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      const subscriber = new Subscriber<number>(observable);

      // Get the first value
      const value = await subscriber.next();
      expect(value.value).toBe(1);

      const subPromise = subscriber.then();

      await expect(subscriber.next()).rejects.toBe(testError);

      // The subscriber promise should reject with the error
      await expect(subPromise).rejects.toBe(testError);
    });

    it("should separate execution errors from cleanup errors", async () => {
      // Create two distinct errors
      const executionError = new Error("Execution error");
      const cleanupError = new Error("Cleanup error");

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          throw executionError; // This error represents a problem during execution
        } finally {
          // We're simulating a cleanup error that happens during generator cleanup
          throw cleanupError;
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Get the first value
      await subscriber.next();

      // The next call should throw the cleanup error, not the execution error since it happens later
      const nextPromise = subscriber.next();
      await expect(nextPromise).rejects.toBe(cleanupError);
    });

    it("should propagate errors from callbacks to awaiting promises", async () => {
      // Create an observable with callback error tracking
      const callbackError = new Error("Callback error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      // Create a CallbackSubscriber to test callback error handling
      const callbackSubscriber = new CallbackSubscriber<number>(observable, (value) => {
        if (value === 2) {
          throw callbackError;
        }
        return value;
      });

      // Alternatively, the error should be available through awaiting the subscriber
      await expect(callbackSubscriber).rejects.toBe(callbackError);
    });

    it("should propagate errors from generators to awaiting promises", async () => {
      // Create an observable with a generator that throws
      const generatorError = new Error("Generator error");

      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        await Promise.resolve();
        throw generatorError;
      });

      const subscriber = new Subscriber<number>(observable);

      const subPromise = subscriber.then();

      // Immediately consume the generator
      subscriber.next();
      await expect(subscriber.next()).rejects.toBe(generatorError);

      // Any code awaiting the subscriber should receive the error
      await expect(subPromise).rejects.toBe(generatorError);
    });

    it("should throw errors from cleanup work to the cancellation promise", async () => {
      // Create an observable with a cleanup error
      const cleanupError = new Error("Cleanup error");

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
          // Wait indefinitely
          await new Promise(() => {});
        } finally {
          // This error will be thrown during cancellation
          throw cleanupError;
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Start the generator
      await subscriber.next();

      // Cancelling should result in the cleanup error being thrown
      await expect(subscriber.cancel()).rejects.toBe(cleanupError);

      // But the main subscriber promise should still be resolved, not rejected
      // This is because cancellation is considered separate from execution
      await subscriber;
    });
  });
  describe("cleanup behavior", () => {
    it("should execute cleanup work after all other work completes", async () => {
      // Create an observable with some work
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);

      // Track execution order
      const executionOrder: string[] = [];

      // Add regular work
      const scheduler = observable._scheduler as Scheduler;
      scheduler.add(
        subscriber,
        Promise.resolve().then(() => {
          executionOrder.push("regular work");
        })
      );

      // Add cleanup work
      subscriber.finally(() => {
        executionOrder.push("cleanup work");
      });

      // Consume all values to complete the generator
      for await (const value of subscriber) {
        executionOrder.push(`value: ${value}`);
      }

      // Verify cleanup work was executed last
      expect(executionOrder).toContain("cleanup work");
      expect(executionOrder.indexOf("cleanup work")).toBe(executionOrder.length - 1);
    });

    it("should support resource cleanup through generator try/finally blocks", async () => {
      // Track cleanup execution
      let cleanupExecuted = false;

      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          cleanupExecuted = true;
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Consume all values
      for await (const value of subscriber) {
        // Just iterating
      }

      // Verify cleanup was executed
      expect(cleanupExecuted).toBe(true);
    });

    it("should add cleanup work via finally() method", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
      });

      const subscriber = new Subscriber<number>(observable);

      // Track if cleanup was executed
      let cleanupExecuted = false;
      subscriber.finally(() => {
        cleanupExecuted = true;
      });

      // Complete the subscriber
      for await (const value of subscriber) {
        // Just iterating
      }

      // Verify cleanup was executed
      expect(cleanupExecuted).toBe(true);
    });

    it("should execute cleanup work when cancelled", async () => {
      const observable = new AsyncObservable<number>(async function* () {
        try {
          yield 1;
          // This would block indefinitely unless cancelled
          await new Promise(() => {});
        } finally {
          // Generator cleanup
        }
      });

      const subscriber = new Subscriber<number>(observable);

      // Add explicit cleanup work
      let finallyExecuted = false;
      subscriber.finally(() => {
        finallyExecuted = true;
      });

      // Get the first value to start the generator
      await subscriber.next();

      // Cancel the subscription
      await subscriber.cancel();

      // Verify cleanup work was executed
      expect(finallyExecuted).toBe(true);
    });

    it("should execute cleanup work after completion", async () => {
      // Create an observable that completes
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);

      // Add cleanup work with multiple approaches
      let cleanup1Executed = false;
      let cleanup2Executed = false;

      subscriber.finally(() => {
        cleanup1Executed = true;
      });

      // Add a second cleanup to verify all cleanup work is executed
      subscriber.finally(() => {
        cleanup2Executed = true;
      });

      // Complete naturally
      for await (const value of subscriber) {
        // Just iterate
      }

      // Verify all cleanup work was executed
      expect(cleanup1Executed).toBe(true);
      expect(cleanup2Executed).toBe(true);

      // The scheduler should have no more work for this subscriber
      const scheduler = observable._scheduler as Scheduler;
      expect(scheduler._subjectPromises.has(subscriber)).toBe(false);
      expect(scheduler._subjectCleanup.has(subscriber)).toBe(false);
    });
    it("should call scheduler.dispose when the generator completes", async () => {
      // Create an observable with a generator that completes after emitting values
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Generator completes naturally
      });

      // Create a spy on the scheduler's dispose method
      const scheduler = observable._scheduler;
      const disposeSpy = vi.spyOn(scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify dispose hasn't been called yet
      expect(disposeSpy).not.toHaveBeenCalled();

      // Consume the values to complete the generator
      const iterator = subscriber[Symbol.asyncIterator]();
      await iterator.next(); // value: 1
      await iterator.next(); // value: 2
      await iterator.next(); // done: true

      // Verify dispose was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);
      expect(disposeSpy).toHaveBeenCalledTimes(1);

      // Clean up
      disposeSpy.mockRestore();
    });

    it("should call scheduler.dispose when the generator throws an error", async () => {
      // Create a specific error to identify
      const testError = new Error("Generator error");

      // Create an observable with a generator that throws
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError; // Will throw on the second next() call
      });

      // Create a spy on the scheduler's dispose method
      const scheduler = observable._scheduler;
      const disposeSpy = vi.spyOn(scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify dispose hasn't been called yet
      expect(disposeSpy).not.toHaveBeenCalled();

      // Get the iterator and first value
      const iterator = subscriber[Symbol.asyncIterator]();
      await iterator.next(); // Get first value successfully

      // Next call should throw the error
      try {
        await iterator.next();
        // If we get here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe(testError);
      }

      // Verify dispose was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);
      expect(disposeSpy).toHaveBeenCalledTimes(1);

      // Clean up
      disposeSpy.mockRestore();
    });

    it("should call scheduler.dispose when return() is called on the iterator", async () => {
      // Create an observable with a generator
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3; // This should never be reached
      });

      // Create a spy on the scheduler's dispose method
      const scheduler = observable._scheduler;
      const disposeSpy = vi.spyOn(scheduler, "dispose");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify dispose hasn't been called yet
      expect(disposeSpy).not.toHaveBeenCalled();

      // Get the iterator and first value
      const iterator = subscriber[Symbol.asyncIterator]();
      await iterator.next(); // Get first value

      // Now manually call return to terminate early
      await iterator.return();

      // Verify dispose was called with the subscriber
      expect(disposeSpy).toHaveBeenCalledWith(subscriber);
      expect(disposeSpy).toHaveBeenCalledTimes(1);

      // Verify the iterator is indeed done
      const result = await iterator.next();
      expect(result.done).toBe(true);

      // Clean up
      disposeSpy.mockRestore();
    });
  });
  describe("kCancelSignal", () => {
    it("should provide access to the cancellation signal", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);

      // Verify kCancelSignal is accessible
      expect(subscriber[kCancelSignal]).toBeDefined();
      expect(subscriber[kCancelSignal]).toBeInstanceOf(Promise);

      // Verify it's the promise from the _cancelSignal
      expect(subscriber[kCancelSignal]).toBe(subscriber._cancelSignal.asPromise());
    });

    it("should resolve the signal when cancel() is called", async () => {
      const observable = new AsyncObservable<number>();
      const subscriber = new Subscriber<number>(observable);

      // Create a flag to track signal resolution
      let signalResolved = false;
      let resolvedValue: any = null;

      // Listen for the signal to resolve
      subscriber[kCancelSignal].then((value) => {
        signalResolved = true;
        resolvedValue = value;
      });

      // Initially, the signal should not be resolved
      expect(signalResolved).toBe(false);

      // Call cancel()
      subscriber.cancel();

      // Give time for microtasks to process
      await Promise.resolve();

      // Signal should now be resolved with kCancelSignal value
      expect(signalResolved).toBe(true);
      expect(resolvedValue).toBe(kCancelSignal);
    });

    it("should enable breaking out of generators with early interrupt", async () => {
      // Create an observable with a generator that would otherwise block
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        // This would block indefinitely
        await new Promise<void>(() => {});
        yield 2; // This should never be reached if cancelled
      });

      const subscriber = new Subscriber<number>(observable);

      // Get the first value
      const result1 = await subscriber.next();
      expect(result1.value).toBe(1);

      // Start the next() call which would normally block
      const nextPromise = subscriber.next();

      // Before it can resolve, cancel the subscriber
      subscriber.cancel();

      // The next() call should complete with done:true instead of blocking
      const result2 = await nextPromise;
      expect(result2.done).toBe(true);

      // The subscriber should be in a completed state
      const isComplete = await Promise.race([
        subscriber.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 50)),
      ]);

      expect(isComplete).toBe(true);
    });
  });
  describe("SubscriberReturnSignal", () => {
    it("should be used for tracking subscriber execution state", async () => {
      // Create an observable and subscriber
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
      });

      const subscriber = new Subscriber<number>(observable);

      // Verify the return signal is created and is a SubscriberReturnSignal
      expect(subscriber._returnSignal).toBeInstanceOf(SubscriberReturnSignal);

      // Check initial state - should not be resolved yet
      let isResolved = false;
      subscriber._returnSignal.asPromise().then(() => {
        isResolved = true;
      });

      // Should not be resolved immediately
      await Promise.resolve();
      expect(isResolved).toBe(false);

      // After consuming all values, it should eventually resolve
      await subscriber.next();
      await subscriber.next();
      await subscriber.next(); // This should complete the generator

      // The return signal should now be resolved
      await Promise.resolve();
      expect(isResolved).toBe(true);
    });

    it("should be registered with the scheduler", async () => {
      // Create an observable
      const observable = new AsyncObservable<number>();

      // Spy on scheduler's add method
      const schedulerAddSpy = vi.spyOn(observable._scheduler, "add");

      // Create a subscriber
      const subscriber = new Subscriber<number>(observable);

      // Verify the return signal was registered with the scheduler
      expect(schedulerAddSpy).toHaveBeenCalledWith(subscriber, subscriber._returnSignal);
    });

    it("should resolve when generator execution completes", async () => {
      // Create an observable that completes normally
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        // Generator completes normally after yielding values
      });

      const subscriber = new Subscriber<number>(observable);

      // Create a spy to track when the return signal resolves
      let signalResolved = false;
      subscriber._returnSignal.asPromise().then(() => {
        signalResolved = true;
      });

      // Consume all values to complete the generator
      let result = await subscriber.next();
      expect(result.value).toBe(1);

      result = await subscriber.next();
      expect(result.value).toBe(2);

      result = await subscriber.next();
      expect(result.done).toBe(true);

      // The return signal should resolve
      await Promise.resolve();
      expect(signalResolved).toBe(true);
    });

    it("should reject when generator execution fails", async () => {
      // Create an observable that throws an error
      const testError = new Error("Test error in generator");
      const observable = new AsyncObservable<number>(async function* () {
        yield 1;
        throw testError;
      });

      const subscriber = new Subscriber<number>(observable);

      // Create a spy to track when the return signal rejects
      let caughtError: Error | null = null;
      subscriber._returnSignal.asPromise().catch((err) => {
        caughtError = err;
      });

      // Get the first value
      const firstValue = await subscriber.next();
      expect(firstValue.value).toBe(1);

      // Next call should throw the error
      await expect(subscriber.next()).rejects.toBe(testError);

      // The return signal should reject with the same error
      await Promise.resolve();
      expect(caughtError).toBe(testError);
    });
  });
});
