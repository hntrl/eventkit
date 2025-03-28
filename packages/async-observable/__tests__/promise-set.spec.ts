import { describe, expect, it } from "vitest";
import { PromiseSet } from "../lib/utils/promise";

describe("PromiseSet", () => {
  describe("core functionality", () => {
    it("should track resolution of promises added after creation", async () => {
      const promiseSet = new PromiseSet();

      // Create some promises with different resolution times
      const promise1 = new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
      const promise2 = new Promise<void>((resolve) => setTimeout(() => resolve(), 20));

      // Add the first promise
      promiseSet.add(promise1);

      // Later add another promise
      setTimeout(() => {
        promiseSet.add(promise2);
      }, 5);

      // Wait for both promises to resolve
      await promiseSet;

      // If we get here, both promises were successfully tracked
      expect(true).toBe(true);
    });

    it("should differ from Promise.all by allowing dynamic additions", async () => {
      const promiseSet = new PromiseSet();
      const results: number[] = [];

      // With Promise.all, we need to collect all promises first
      const promise1 = Promise.resolve(1).then((val) => {
        results.push(val);
        return val;
      });

      // Add the first promise
      promiseSet.add(promise1);

      // Start waiting for promises to resolve
      const waitPromise = promiseSet.then(() => {
        // We should have all results when this resolves
        return results;
      });

      // Add another promise after we've started waiting
      // Promise.all wouldn't allow this, as it takes fixed array
      const promise2 = Promise.resolve(2).then((val) => {
        results.push(val);
        return val;
      });
      promiseSet.add(promise2);

      // Wait for all promises to resolve
      await waitPromise;

      // Both promises should have been processed
      expect(results.length).toBe(2);
      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it("should wait for all promises when awaited, including those added after awaiting", async () => {
      const promiseSet = new PromiseSet();
      const results: number[] = [];

      // Set up a few promises that will resolve at different times
      const promise1 = new Promise((resolve) =>
        setTimeout(() => {
          results.push(1);
          resolve(1);
        }, 10)
      );

      const promise2 = new Promise((resolve) =>
        setTimeout(() => {
          results.push(2);
          resolve(2);
        }, 20)
      );

      // Add the first promise
      promiseSet.add(promise1);

      // Start waiting but don't await yet
      const waitPromise = promiseSet.then(() => {
        return results;
      });

      // Add another promise after we've started waiting but before awaiting
      promiseSet.add(promise2);

      // Wait for all promises to resolve
      await expect(waitPromise).resolves.toEqual([1, 2]);
    });

    it("should create an empty PromiseSet with no initial promises", async () => {
      // Create an empty promise set
      const promiseSet = new PromiseSet();

      // It should be immediately resolvable if no promises are added
      const resolved = await Promise.race([
        promiseSet,
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]);

      // The promise set should resolve immediately
      expect(resolved).not.toBe("timeout");

      // We can add promises after it resolves
      const results: string[] = [];
      const newPromise = Promise.resolve("added later").then((val) => {
        results.push(val);
        return val;
      });

      promiseSet.add(newPromise);

      // Wait for the new promise to resolve
      await promiseSet;

      // The promise should have been processed
      expect(results).toEqual(["added later"]);
    });
  });
  describe("PromiseLike implementation", () => {
    describe("should implement the then method properly", () => {
      it("should return a promise that resolves when all added promises resolve", async () => {
        const promiseSet = new PromiseSet();
        const results: number[] = [];

        // Add multiple promises with different resolution times
        promiseSet.add(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              results.push(1);
              resolve();
            }, 20);
          })
        );

        promiseSet.add(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              results.push(2);
              resolve();
            }, 10);
          })
        );

        // Use the then method to chain a callback
        const finalPromise = promiseSet.then(() => {
          results.push(3);
          return "complete";
        });

        // Verify the promise returned by then resolves correctly
        const result = await finalPromise;

        // The callback should execute after all promises resolve
        expect(results).toEqual([2, 1, 3]);
        expect(result).toBe("complete");
      });

      it("should return a promise that rejects if any added promise rejects", async () => {
        const promiseSet = new PromiseSet();
        const error = new Error("Test rejection");

        // Add a promise that will resolve
        promiseSet.add(Promise.resolve());

        // Add a promise that will reject
        promiseSet.add(Promise.reject(error));

        // Use then method with both fulfillment and rejection handlers
        let fulfilled = false;
        let rejected = false;
        let caughtError: Error | null = null;

        await promiseSet.then(
          () => {
            fulfilled = true;
          },
          (err) => {
            rejected = true;
            caughtError = err;
          }
        );

        // The rejection handler should be called with the error
        expect(fulfilled).toBe(false);
        expect(rejected).toBe(true);
        expect(caughtError).toBe(error);
      });

      it("should function as a custom thennable for await statements", async () => {
        const promiseSet = new PromiseSet();
        let resolved = false;

        // Add a promise that resolves after a short delay
        promiseSet.add(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 10);
          })
        );

        // Use with await syntax (this uses the then method internally)
        await promiseSet;

        // The await should complete only after the promise resolves
        expect(resolved).toBe(true);
      });

      it("should resolve immediately if no promises are being tracked", async () => {
        const promiseSet = new PromiseSet();
        let thenCalled = false;

        // Use the then method when no promises have been added
        const startTime = Date.now();
        await promiseSet.then(() => {
          thenCalled = true;
        });
        const endTime = Date.now();

        // The then callback should be called
        expect(thenCalled).toBe(true);

        // Should resolve immediately (with a small tolerance for test execution time)
        expect(endTime - startTime).toBeLessThan(50);
      });
    });
    it("should implement the catch method for handling rejections", async () => {
      const promiseSet = new PromiseSet();
      const error = new Error("Test error for catch");

      // Add a promise that will reject
      promiseSet.add(Promise.reject(error));

      // Use the catch method to handle the rejection
      let caughtError: Error | null = null;
      await promiseSet.catch((err) => {
        caughtError = err;
      });

      // The catch handler should receive the error
      expect(caughtError).toBe(error);
    });
    it("should implement the finally method for execution after resolution/rejection", async () => {
      // Test with successful resolution
      const successSet = new PromiseSet();
      let finallyCalled = false;

      successSet.add(Promise.resolve("success"));

      await successSet.finally(() => {
        finallyCalled = true;
      });

      expect(finallyCalled).toBe(true);

      // Test with rejection
      const failSet = new PromiseSet();
      let finallyCalledAfterRejection = false;
      let errorCaught = false;

      failSet.add(Promise.reject(new Error("test")));

      try {
        await failSet.finally(() => {
          finallyCalledAfterRejection = true;
        });
      } catch (error) {
        errorCaught = true;
      }

      // Finally should be called even though there was a rejection
      expect(finallyCalledAfterRejection).toBe(true);
      expect(errorCaught).toBe(true);
    });
    it("should be usable with await syntax", async () => {
      const promiseSet = new PromiseSet();
      const values: number[] = [];

      // Add promises that resolve at different times
      promiseSet.add(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            values.push(1);
            resolve();
          }, 20);
        })
      );

      promiseSet.add(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            values.push(2);
            resolve();
          }, 10);
        })
      );

      // Use await syntax directly with the PromiseSet
      await promiseSet;

      // All promises should have resolved
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values.length).toBe(2);
    });
    it("should properly chain thenables", async () => {
      const promiseSet = new PromiseSet();

      // Add a simple promise
      promiseSet.add(Promise.resolve(42));

      // Chain multiple then calls
      const result = await promiseSet
        .then(() => "first transformation")
        .then((value) => `${value} and second transformation`)
        .then((value) => `${value} and third transformation`);

      // Verify the chain worked correctly
      expect(result).toBe(
        "first transformation and second transformation and third transformation"
      );
    });
  });
  describe("awaiting behavior", () => {
    it("should allow multiple awaits on the same set", async () => {
      const promiseSet = new PromiseSet();

      // Create resolvable promises
      let resolve1: (value: any) => void;
      const promise1 = new Promise((r) => (resolve1 = r));

      let resolve2: (value: any) => void;
      const promise2 = new Promise((r) => (resolve2 = r));

      // Add first promise to the set
      promiseSet.add(promise1);

      // Create multiple awaits on the same set
      const await1 = promiseSet.then(() => "await1");
      const await2 = promiseSet.then(() => "await2");
      const await3 = promiseSet.then(() => "await3");

      // Add second promise after creating awaits
      promiseSet.add(promise2);

      // Resolve both promises
      resolve1!(1);
      resolve2!(2);

      // All awaits should resolve
      const results = await Promise.all([await1, await2, await3]);

      expect(results).toEqual(["await1", "await2", "await3"]);
    });

    it("should not resolve until newly added promises resolve", async () => {
      const promiseSet = new PromiseSet();

      // Create promises with controlled resolution
      let resolve1: (value: any) => void;
      const promise1 = new Promise((r) => (resolve1 = r));

      let resolve2: (value: any) => void;
      const promise2 = new Promise((r) => (resolve2 = r));

      // Add first promise and start awaiting
      promiseSet.add(promise1);
      const awaitPromise = promiseSet.then(() => "completed");

      // Set up a check that the promise hasn't resolved yet
      let resolved = false;
      awaitPromise.then(() => {
        resolved = true;
      });

      // Resolve the first promise
      resolve1!(1);
      expect(resolved).toBe(false);

      // Add a new promise after the first one resolved
      promiseSet.add(promise2);

      // Still should not have resolved
      expect(resolved).toBe(false);

      // Now resolve the second promise
      resolve2!(2);

      // Now the original await should complete
      const result = await awaitPromise;
      expect(result).toBe("completed");
      expect(resolved).toBe(true);
    });

    it("should reject if any added promise rejects", async () => {
      const promiseSet = new PromiseSet();

      // Create one promise that resolves and one that rejects
      let resolve: (value: any) => void;
      const promise1 = new Promise((r) => (resolve = r));

      const error = new Error("Test rejection");
      const promise2 = Promise.reject(error);

      // Add both promises
      promiseSet.add(promise1);
      promiseSet.add(promise2);

      // Resolve the first promise
      resolve!(1);

      // Awaiting the set should reject with the error from promise2
      await expect(promiseSet).rejects.toThrow(error);
    });
  });
  describe("error handling", () => {
    it("should propagate errors from rejected promises", async () => {
      const promiseSet = new PromiseSet();
      const originalError = new Error("Original error");

      // Add a promise that will reject
      promiseSet.add(Promise.reject(originalError));

      // Check propagation through then()
      let errorFromThen: Error | null = null;
      await promiseSet.then(
        () => {},
        (err) => {
          errorFromThen = err;
        }
      );
      expect(errorFromThen).toBe(originalError);

      // Check propagation through catch()
      const anotherSet = new PromiseSet();
      anotherSet.add(Promise.reject(originalError));

      let errorFromCatch: Error | null = null;
      await anotherSet.catch((err) => {
        errorFromCatch = err;
      });
      expect(errorFromCatch).toBe(originalError);

      // Check propagation with await syntax
      const thirdSet = new PromiseSet();
      thirdSet.add(Promise.reject(originalError));

      try {
        await thirdSet;
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBe(originalError);
      }
    });

    it("should reset internal state after resolution", async () => {
      const resolveSet = new PromiseSet();

      // Add and resolve a promise
      let resolveFirst: (value: any) => void;
      const firstPromise = new Promise((r) => {
        resolveFirst = r;
      });
      resolveSet.add(firstPromise);
      resolveFirst!(true);

      // Wait for resolution
      await resolveSet;

      // Internal state should be reset, meaning:
      // 1. _promiseChain should be null
      // 2. _signal should be null
      // We can test this indirectly by verifying immediate resolution

      const startTime = Date.now();
      await resolveSet;
      const duration = Date.now() - startTime;

      // After resolution, awaiting again should be immediate
      expect(duration).toBeLessThan(50);
    });
    it("should keep errors from rejected promises across awaits", async () => {
      const rejectSet = new PromiseSet();

      const originalError = new Error("Original error");
      rejectSet.add(Promise.reject(originalError));

      try {
        await rejectSet;
        // If we get here, the catch should have thrown an error
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe(originalError);
      }

      let wasResolved = false;
      rejectSet.add(
        Promise.resolve().then(() => {
          wasResolved = true;
        })
      );

      try {
        await rejectSet;
        // Again we should expect this to throw an error
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe(originalError);
      }
      expect(wasResolved).toBe(true);
    });
    it("should reject when one promise rejects even when all promises have settled", async () => {
      const promiseSet = new PromiseSet();
      const originalError = new Error("Original error");
      promiseSet.add(Promise.reject(originalError));
      promiseSet.add(Promise.resolve());
      // Give a chance for all promises to settle
      await expect(promiseSet).rejects.toThrow(originalError);
    });
  });
});
