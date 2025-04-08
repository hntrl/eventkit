import { describe, it, expect } from "vitest";
import { AsyncObservable, QueueScheduler } from "@eventkit/base";
import { EventSourceResponse } from "../lib/event-source-response";

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return chunks;
  } finally {
    reader.releaseLock();
  }
}

describe("EventSourceResponse", () => {
  describe("constructor()", () => {
    it("should set 'Content-Type' header to 'text/event-stream'", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
      });

      const response = new EventSourceResponse(observable, {});

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("should set 'Connection' header to 'keep-alive'", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
      });

      const response = new EventSourceResponse(observable, {});

      expect(response.headers.get("Connection")).toBe("keep-alive");
    });

    it("should merge provided headers with default SSE headers", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
      });

      const response = new EventSourceResponse(observable, {
        headers: {
          "Cache-Control": "no-cache",
          "X-Custom-Header": "custom-value",
        },
      });

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Connection")).toBe("keep-alive");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    });

    it("should initialize body with a ReadableStream", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
      });

      const response = new EventSourceResponse(observable, {});

      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it("should apply a QueueScheduler with concurrency 1 to the input observable", async () => {
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
      });

      const response = new EventSourceResponse(observable, {});
      // @ts-ignore - Using protected property for testing
      const scheduler = response.observable._scheduler.deferred as QueueScheduler;
      expect(scheduler).toBeInstanceOf(QueueScheduler);
      // @ts-ignore - Using protected property for testing
      expect(scheduler.concurrency).toBe(1);
    });

    it("should begin consuming the observable upon instantiation", async () => {
      // Create an observable that tracks when it's subscribed to
      let subscribed = false;
      const observable = new AsyncObservable<string>(async function* () {
        subscribed = true;
        yield "test";
      });

      // Before creating the response, the observable shouldn't be subscribed to
      expect(subscribed).toBe(false);

      // Creating the response should trigger subscription
      new EventSourceResponse(observable, {});

      // The observable should now be subscribed to
      expect(subscribed).toBe(true);
    });
  });

  describe("event streaming", () => {
    it("should transform events from observable into SSE formatted Uint8Array chunks", async () => {
      // Create an observable with a single event
      const observable = new AsyncObservable<string>(async function* () {
        yield "test-message";
        yield "test-message-2";
      });

      // Create the response
      const response = new EventSourceResponse(observable, {});

      // Read the response body
      const chunks = await consumeStream(response.body!);

      // // Should be a Uint8Array
      expect(chunks[0]).toBeInstanceOf(Uint8Array);
      //
      // Convert to string and check format
      const text = new TextDecoder().decode(chunks[0]);
      expect(text).toContain("id: 1");
      expect(text).toContain("data: test-message");
      expect(text).toMatch(/id: 1\ndata: test-message\n\n/);
    });

    it("should correctly format events using the default serializer", async () => {
      // Create an observable with various types of values
      const observable = new AsyncObservable<any>(async function* () {
        yield { message: "object-data" }; // Object
        yield 42; // Number
        yield "string-data"; // String
      });

      // Create the response
      const response = new EventSourceResponse(observable, {});

      // Read all chunks from the response body
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];

      // Read until done
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
        } else {
          chunks.push(result.value);
        }
      }

      // Convert all chunks to strings
      const texts = chunks.map((chunk) => new TextDecoder().decode(chunk));

      // Check formatting for each type
      expect(texts[0]).toMatch(/id: 1\ndata: {"message":"object-data"}\n\n/);
      expect(texts[1]).toMatch(/id: 2\ndata: 42\n\n/);
      expect(texts[2]).toMatch(/id: 3\ndata: string-data\n\n/);
    });

    it("should correctly format events using a custom serializer provided via sse options", async () => {
      // Create an observable with custom data
      const observable = new AsyncObservable<{ id: string; type: string; content: string }>(
        async function* () {
          yield { id: "abc123", type: "notification", content: "Hello World" };
        }
      );

      // Create the response with custom serializer options
      const response = new EventSourceResponse(observable, {
        sse: {
          getId: (event) => event.id,
          getType: (event) => event.type,
          getEvent: (event) => event.content,
        },
      });

      // Read the response body
      const reader = response.body!.getReader();
      const { value } = await reader.read();

      // Convert to string and check format
      const text = new TextDecoder().decode(value);
      expect(text).toMatch(/id: abc123\nevent: notification\ndata: Hello World\n\n/);
    });

    it("should increment and use the event index correctly for default id", async () => {
      // Create an observable with multiple events
      const observable = new AsyncObservable<string>(async function* () {
        yield "first";
        yield "second";
        yield "third";
      });

      // Create the response
      const response = new EventSourceResponse(observable, {});

      // Read all chunks from the response body
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];

      // Read until done
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
        } else {
          chunks.push(result.value);
        }
      }

      // Convert all chunks to strings
      const texts = chunks.map((chunk) => new TextDecoder().decode(chunk));

      // Check that the IDs are incrementing
      expect(texts[0]).toContain("id: 1");
      expect(texts[1]).toContain("id: 2");
      expect(texts[2]).toContain("id: 3");
    });

    it("should close the response stream when the source observable completes", async () => {
      // Create an observable that completes immediately after yielding a value
      const observable = new AsyncObservable<string>(async function* () {
        yield "test";
        // Then complete
      });

      // Create the response
      const response = new EventSourceResponse(observable, {});

      // Read from the response body
      const reader = response.body!.getReader();

      // Read the value
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toContain("test");

      // The next read should indicate done
      const result = await reader.read();
      expect(result.done).toBe(true);
    });
  });

  describe("serialization details (getSerializer logic)", () => {
    describe("id field", () => {
      it("should default to the event index (1-based)", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "test";
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toMatch(/^id: 1\n/);
      });

      it("should use the result of a provided getId function", async () => {
        const observable = new AsyncObservable<{ customId: string }>(async function* () {
          yield { customId: "custom-id-1" };
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getId: (event) => event.customId,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toMatch(/^id: custom-id-1\n/);
      });

      it("should omit the id field if getId is null", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "test";
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getId: null,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).not.toContain("id:");
      });
    });

    describe("event field (event type)", () => {
      it("should be omitted by default", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "test";
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).not.toContain("event:");
      });

      it("should use the result of a provided getType function", async () => {
        const observable = new AsyncObservable<{ type: string }>(async function* () {
          yield { type: "notification" };
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getType: (event) => event.type,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toContain("event: notification");
      });

      it("should be omitted if getType is null", async () => {
        const observable = new AsyncObservable<{ type: string }>(async function* () {
          yield { type: "notification" };
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getType: null,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).not.toContain("event:");
      });
    });

    describe("data field", () => {
      it("should default to JSON.stringify for objects", async () => {
        const observable = new AsyncObservable<object>(async function* () {
          yield { key: "value" };
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toContain('data: {"key":"value"}');
      });

      it("should default to String() for non-objects", async () => {
        const observable = new AsyncObservable<number>(async function* () {
          yield 42;
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data: 42");
      });

      it("should use the result of a provided getEvent function", async () => {
        const observable = new AsyncObservable<{ data: string }>(async function* () {
          yield { data: "custom-formatted" };
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getEvent: (event) => `CUSTOM: ${event.data}`,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data: CUSTOM: custom-formatted");
      });

      it("should correctly format multi-line data fields (each line prefixed with 'data: ')", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "line1\nline2\nline3";
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data: line1\ndata: line2\ndata: line3");
      });

      it("should omit the data field if getEvent is null", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "test";
        });

        const response = new EventSourceResponse(observable, {
          sse: {
            getEvent: null,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).not.toContain("data:");
      });
    });

    describe("general format", () => {
      it("should separate fields with newline characters", async () => {
        const observable = new AsyncObservable<{ id: string; type: string; data: string }>(
          async function* () {
            yield { id: "123", type: "test", data: "content" };
          }
        );

        const response = new EventSourceResponse(observable, {
          sse: {
            getId: (event) => event.id,
            getType: (event) => event.type,
            getEvent: (event) => event.data,
          },
        });

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toMatch(/id: 123\nevent: test\ndata: content\n\n/);
      });

      it("should end each event message with two newline characters", async () => {
        const observable = new AsyncObservable<string>(async function* () {
          yield "test";
        });

        const response = new EventSourceResponse(observable, {});

        // Read the response body
        const reader = response.body!.getReader();
        const { value } = await reader.read();

        // Convert to string and check format
        const text = new TextDecoder().decode(value);
        expect(text).toMatch(/\n\n$/);
      });
    });
  });

  describe("error and cancellation handling", () => {
    it("should terminate the stream and cancel the subscriber if the serializer throws an error", async () => {
      // Create an observable
      const observable = new AsyncObservable<any>(async function* () {
        yield { problematicData: null };
      });

      // Create a response with a serializer that will throw
      const response = new EventSourceResponse(observable, {
        sse: {
          getEvent: () => {
            throw new Error("Serialization error");
          },
        },
      });

      // Read from the response body - should fail
      const reader = response.body!.getReader();

      try {
        await reader.read();
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it("should cancel the subscriber if the response stream is cancelled/aborted by the client", async () => {
      // Track subscriber cancellation
      let cancelled = false;

      // Create an observable that tracks cancellation
      const observable = new AsyncObservable<string>(async function* () {
        try {
          yield "test";
          // Wait indefinitely
          await new Promise((resolve) => setTimeout(resolve, 10));
        } finally {
          // This will execute when the generator is cancelled
          cancelled = true;
        }
      });

      // Create the response
      const response = new EventSourceResponse(observable, {});

      // Read the first chunk
      const reader = response.body!.getReader();
      await reader.read();
      await reader.read();

      // Cancel the reader
      reader.cancel();

      // The observable should have been cancelled
      expect(cancelled).toBe(true);
    });
  });
});
