import { describe, expect, it } from "vitest";
import { ScheduledAction } from "../lib/scheduler";

describe("ScheduledAction", () => {
  describe("creation and initialization", () => {
    it("should create an action with a callback function", async () => {
      const callback = () => "test result";
      const action = new ScheduledAction(callback);

      expect(action).toBeInstanceOf(ScheduledAction);
      expect(action["callback"]).toBe(callback);
    });

    it("should accept a callback function to be called on execution", async () => {
      let callCount = 0;
      const callback = () => {
        callCount++;
        return "test result";
      };

      const action = new ScheduledAction(callback);
      await action.execute();

      expect(callCount).toBe(1);
    });

    it("should support callbacks that return any type T", async () => {
      // String return type
      const stringAction = new ScheduledAction(() => "string result");
      await stringAction.execute();
      const stringResult = await stringAction;
      expect(stringResult).toBe("string result");

      // Number return type
      const numberAction = new ScheduledAction(() => 42);
      await numberAction.execute();
      const numberResult = await numberAction;
      expect(numberResult).toBe(42);

      // Object return type
      const obj = { key: "value" };
      const objectAction = new ScheduledAction(() => obj);
      await objectAction.execute();
      const objectResult = await objectAction;
      expect(objectResult).toBe(obj);

      // Promise return type
      const promiseAction = new ScheduledAction(() => Promise.resolve([1, 2, 3]));
      await promiseAction.execute();
      const promiseResult = await promiseAction;
      expect(promiseResult).toEqual([1, 2, 3]);
    });

    it("should initialize with _hasExecuted set to false", async () => {
      const action = new ScheduledAction(() => "result");

      expect(action._hasExecuted).toBe(false);
    });

    it("should not execute the callback upon creation", async () => {
      let executed = false;
      const action = new ScheduledAction(() => {
        executed = true;
        return "result";
      });

      // Callback should not be executed on creation
      expect(executed).toBe(false);

      // Should only execute when explicitly called
      await action.execute();
      expect(executed).toBe(true);
    });

    it("should lazily initialize the signal when needed", async () => {
      const action = new ScheduledAction(() => "result");

      // Signal should not be initialized yet
      expect(action._signal).toBeNull();

      // Accessing the signal property should initialize it
      const signal = action.signal;
      expect(signal).not.toBeNull();
      expect(action._signal).toBe(signal);

      // The signal can also be initialized when then() is called
      const action2 = new ScheduledAction(() => "result");
      expect(action2._signal).toBeNull();

      action2.then(() => {});
      expect(action2._signal).not.toBeNull();
    });
  });
  describe("execute method", () => {
    it("should run the provided callback when called", async () => {
      let wasExecuted = false;
      const action = new ScheduledAction(() => {
        wasExecuted = true;
        return "result";
      });

      await action.execute();

      expect(wasExecuted).toBe(true);
    });

    it("should call the callback at most once even if called multiple times", async () => {
      let callCount = 0;
      const action = new ScheduledAction(() => {
        callCount++;
        return "result";
      });

      // Call execute multiple times
      await action.execute();
      await action.execute();
      await action.execute();

      // Callback should only be called once
      expect(callCount).toBe(1);
    });

    it("should resolve the action's promise with the callback's return value", async () => {
      const expectedResult = { key: "test value" };
      const action = new ScheduledAction(() => expectedResult);

      await action.execute();
      const result = await action;

      expect(result).toBe(expectedResult);
    });

    it("should resolve or reject based on the callback's return value", async () => {
      // Test successful resolution
      const successAction = new ScheduledAction(() => "success");
      await successAction.execute();
      await expect(successAction).resolves.toBe("success");

      // Test rejection
      const error = new Error("Test error");
      const failAction = new ScheduledAction(() => {
        throw error;
      });

      await failAction.execute();
      await expect(failAction).rejects.toBe(error);
    });

    it("should handle both synchronous and asynchronous callbacks", async () => {
      // Synchronous callback
      const syncAction = new ScheduledAction(() => "sync result");
      await syncAction.execute();
      expect(await syncAction).toBe("sync result");

      // Asynchronous callback using setTimeout
      const asyncAction = new ScheduledAction(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("async result"), 10);
        });
      });

      await asyncAction.execute();
      expect(await asyncAction).toBe("async result");
    });

    it("should handle callbacks that return promises", async () => {
      // Promise that resolves
      const resolveAction = new ScheduledAction(() => Promise.resolve("promise result"));
      await resolveAction.execute();
      expect(await resolveAction).toBe("promise result");

      // Promise that rejects
      const error = new Error("Promise rejection");
      const rejectAction = new ScheduledAction(() => Promise.reject(error));

      await rejectAction.execute().catch(() => {}); // Catch to prevent test failure
      await expect(rejectAction).rejects.toBe(error);
    });

    it("should return a promise that resolves when execution completes", async () => {
      let completionFlag = false;

      const action = new ScheduledAction(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completionFlag = true;
        return "done";
      });

      // The execute method should return a promise
      const executePromise = action.execute();
      expect(executePromise).toBeInstanceOf(Promise);

      // Before resolution, the flag should still be false
      expect(completionFlag).toBe(false);

      // After awaiting, the execution should be complete
      await executePromise;
      expect(completionFlag).toBe(true);
    });
  });
  describe("PromiseLike implementation", () => {
    it("should implement the then method properly", async () => {
      const action = new ScheduledAction(() => "test value");

      // It should return a Promise-like object that can be used with then
      const thenResult = action.then((value) => `transformed: ${value}`);
      expect(thenResult).toHaveProperty("then");

      // Execute and verify transformation
      await action.execute();
      const result = await thenResult;
      expect(result).toBe("transformed: test value");
    });

    it("should remain pending until execute() is called", async () => {
      const action = new ScheduledAction(() => "test result");

      // Create a race between the action and a timeout
      const result = await Promise.race([
        action.then(() => "action resolved"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]);

      // The timeout should win because action hasn't been executed yet
      expect(result).toBe("timeout");

      // After execution, the action should resolve immediately
      await action.execute();

      const afterExecuteResult = await Promise.race([
        action.then(() => "action resolved"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]);

      expect(afterExecuteResult).toBe("action resolved");
    });

    it("should resolve with the value returned by the callback after execution", async () => {
      const expectedValue = { id: 123, name: "test object" };
      const action = new ScheduledAction(() => expectedValue);

      // Execute and verify the resolved value
      await action.execute();
      const result = await action;

      expect(result).toBe(expectedValue);
    });

    it("should reject if the callback throws an error", async () => {
      const expectedError = new Error("Test error in callback");
      const action = new ScheduledAction(() => {
        throw expectedError;
      });

      // Execute and verify the rejection
      await action.execute().catch(() => {}); // Catch to prevent test failure

      // Can also use expect().rejects
      await expect(action).rejects.toBe(expectedError);
    });

    it("should be usable with await syntax", async () => {
      const action = new ScheduledAction(() => "await result");

      // First, execute the action
      await action.execute();

      // Should be able to use with await
      const result = await action;
      expect(result).toBe("await result");
    });

    it("should be chainable with other promise methods", async () => {
      const action = new ScheduledAction(() => 42);

      // Chain multiple promise methods
      const chainedPromise = action.then((value) => value * 2).then((value) => `Value: ${value}`);

      await action.execute();
      const result = await chainedPromise;

      expect(result).toBe("Value: 84");
    });

    it("should conform to the PromiseLike interface contract", async () => {
      const action = new ScheduledAction(() => "contract test");

      // Should have a then method with the correct signature
      expect(typeof action.then).toBe("function");

      // Should work with Promise.resolve
      const resolvedPromise = Promise.resolve(action);
      expect(resolvedPromise).not.toBe(action); // Promise.resolve should wrap it

      // Execute and verify it works with Promise.all
      await action.execute();
      const results = await Promise.all([action, Promise.resolve("other value")]);
      expect(results).toEqual(["contract test", "other value"]);
    });

    it("should maintain the same promise instance for multiple accesses", async () => {
      const action = new ScheduledAction(() => "stable promise");

      // Get the signal promise before execution
      const promise1 = action.signal;
      const promise2 = action.signal;

      // Both should reference the same Signal instance
      expect(promise1).toBe(promise2);
    });

    it("should use the same promise for multiple calls to then()", async () => {
      const action = new ScheduledAction(() => "then test");

      // Call then multiple times to create separate handlers
      const result1Promise = action.then((value) => `${value} - 1`);
      const result2Promise = action.then((value) => `${value} - 2`);

      // Execute the action
      await action.execute();

      // All handlers should receive the same value
      const [result1, result2] = await Promise.all([result1Promise, result2Promise]);
      expect(result1).toBe("then test - 1");
      expect(result2).toBe("then test - 2");
    });

    it("should be independently observable from the execution itself", async () => {
      const action = new ScheduledAction(() => "independent observation");

      // Set up multiple observers
      const observer1 = action.then((value) => `${value} - observer1`);
      const observer2 = action.then((value) => `${value} - observer2`);

      // Execute the action
      await action.execute();

      // Each observer should get the result independently
      const result1 = await observer1;
      const result2 = await observer2;

      expect(result1).toBe("independent observation - observer1");
      expect(result2).toBe("independent observation - observer2");

      // A new observer added after execution should get the result immediately
      const observer3 = action.then((value) => `${value} - observer3`);
      const result3 = await observer3;
      expect(result3).toBe("independent observation - observer3");
    });
  });
});
