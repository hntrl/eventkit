import { describe, it, expect, vi } from "vitest";
import { AsyncObservable } from "@eventkit/async-observable";
import { SingletonAsyncObservable, singletonFrom } from "../lib/singleton";
import { NoValuesError } from "../lib/utils/errors";

describe("SingletonAsyncObservable", () => {
  describe("constructor", () => {
    it("should create a new SingletonAsyncObservable instance", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 42;
      });
      expect(singleton).toBeInstanceOf(SingletonAsyncObservable);
    });

    it("should inherit from AsyncObservable", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 42;
      });
      expect(singleton).toBeInstanceOf(AsyncObservable);
    });
  });

  describe("then method", () => {
    it("should implement PromiseLike interface", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 42;
      });
      expect(typeof singleton.then).toBe("function");
    });

    it("should resolve with the first emitted value", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 1;
        yield 2;
        yield 3;
      });
      const result = await singleton;
      expect(result).toBe(1);
    });

    it("should throw NoValuesError when no values are emitted", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        // No values emitted
      });
      await expect(singleton).rejects.toThrow(NoValuesError);
    });

    it("should cancel the subscription after the first value is emitted", async () => {
      const mockCancel = vi.fn();
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        try {
          yield 42;
          yield 43;
          yield 44;
        } finally {
          mockCancel();
        }
      });

      await singleton;
      // subscriber count should be 0 after the first value is emitted
      expect(mockCancel).toHaveBeenCalled();
    });

    it("should work with await syntax", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 42;
      });
      const result = await singleton;
      expect(result).toBe(42);
    });

    it("should support onfulfilled callback", async () => {
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        yield 42;
      });

      const result = await singleton.then((value) => value * 2);
      expect(result).toBe(84);
    });

    it("should support onrejected callback for error handling", async () => {
      const error = new Error("Test error");
      const singleton = new SingletonAsyncObservable<number>(async function* () {
        throw error;
      });

      const result = await singleton.then(
        () => "success",
        () => "error handled"
      );

      expect(result).toBe("error handled");
    });
  });
});

describe("singletonFrom function", () => {
  it("should create a SingletonAsyncObservable from an AsyncObservable", async () => {
    const source = new AsyncObservable<number>(async function* () {
      yield 42;
    });

    const singleton = singletonFrom(source);
    expect(singleton).toBeInstanceOf(SingletonAsyncObservable);
  });

  it("should preserve the generator function from the source", async () => {
    const generator = async function* () {
      yield 42;
    };

    const source = new AsyncObservable<number>(generator);
    const singleton = singletonFrom(source);

    // Test that the generator function is preserved by checking if it produces the same result
    const result = await singleton;
    expect(result).toBe(42);
  });

  it("should preserve the scheduler from the source", async () => {
    const source = new AsyncObservable<number>(async function* () {
      yield 42;
    });

    const customScheduler = source._scheduler;
    const singleton = singletonFrom(source);

    expect(singleton._scheduler).toBe(customScheduler);
  });

  it("should allow awaiting the first value", async () => {
    const source = new AsyncObservable<number>(async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const singleton = singletonFrom(source);
    const result = await singleton;

    expect(result).toBe(1);
  });
});
