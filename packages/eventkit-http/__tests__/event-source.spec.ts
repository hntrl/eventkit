import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { EventSource, EventSourceMessage, eventSourceObservable } from "../lib";

const shouldRun = typeof globalThis.EventSource === "function";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe.skipIf(shouldRun)("EventSource (exported class)", () => {
  it("should reject if EventSource is not supported", () => {
    try {
      new EventSource("http://localhost/events");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toBe("EventSource is not supported in this environment");
    }
  });
});

describe.skipIf(!shouldRun)("SSE functionality", () => {
  describe("EventSource (exported class)", () => {
    describe("asObservable()", () => {
      describe("when dematerialize is false (default)", () => {
        it("yields only message data from the EventSource", async () => {
          // Setup MSW handler to simulate SSE stream
          server.use(
            http.get("http://localhost/events", () => {
              return new HttpResponse(
                // Format follows SSE protocol
                'data: {"value":"hello"}\n\n' + 'data: {"value":"world"}\n\n',
                {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  },
                }
              );
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/events");
          const observable = eventSource.asObservable();

          // Collect emitted values
          const values: any[] = [];
          const subscription = observable.subscribe((value) => {
            values.push(value);
            // After receiving two messages, close the connection
            // we do this because EventSource will keep reconnecting
            // even after the server has exhausted the stream
            if (values.length === 2) {
              eventSource.close();
            }
          });

          // Wait for the subscription to complete
          await subscription;

          // Verify we received exactly the message data, not event objects
          expect(values).toEqual([
            { id: undefined, type: "message", data: { value: "hello" } },
            { id: undefined, type: "message", data: { value: "world" } },
          ]);
        });
        it("propagates errors from the EventSource's 'error' event", async () => {
          // Setup MSW handler that returns an error
          server.use(
            http.get("http://localhost/error-events", () => {
              return new HttpResponse(null, { status: 500 });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/error-events");
          const observable = eventSource.asObservable();

          // The subscription should error
          try {
            await observable.subscribe(() => {});
            // Should not reach here
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeDefined();
          }
        });
        it("completes when the EventSource connection closes gracefully", async () => {
          // Setup MSW handler to simulate SSE stream that completes
          server.use(
            http.get("http://localhost/completing-events", () => {
              return new HttpResponse('data: {"message":"complete-test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/completing-events");
          const observable = eventSource.asObservable();

          // Collect values
          const values: any[] = [];
          const subscription = observable.subscribe((value) => {
            values.push(value);
            // After receiving the value, close the connection
            eventSource.close();
          });

          // This should complete without error
          await subscription;

          expect(values).toEqual([
            { id: undefined, type: "message", data: { message: "complete-test" } },
          ]);
        });
        it("cleans up listeners when the observable is cancelled", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/cancelled-events", () => {
              return new HttpResponse('data: {"message":"cancelled-test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance and spy on removeEventListener
          const eventSource = new EventSource("http://localhost/cancelled-events");
          const removeSpy = vi.spyOn(eventSource, "removeEventListener");

          // Create the observable and subscriber
          const observable = eventSource.asObservable();
          const subscription = observable.subscribe(() => {});

          // Cancel the subscription
          await subscription.cancel();

          // Verify that all listeners were removed (message, error, open)
          expect(removeSpy).toHaveBeenCalledTimes(3);

          // Introspectively examine the mock calls
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(3);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("message");
          expect(mockCalls[2][0]).toBe("error");
        });
        it("cleans up listeners when the EventSource closes", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/closing-events", () => {
              return new HttpResponse('data: {"message":"closing-test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance and spy on removeEventListener
          const eventSource = new EventSource("http://localhost/closing-events");
          const removeSpy = vi.spyOn(eventSource, "removeEventListener");

          // Create observable
          const observable = eventSource.asObservable();

          // Start subscription
          const subscription = observable.subscribe((value) => {
            // After receiving a message, close the EventSource
            eventSource.close();
          });

          // Wait for the subscription to complete
          await subscription;

          // Verify that all listeners were removed (message, error, open)
          expect(removeSpy).toHaveBeenCalledTimes(3);

          // Introspectively examine the mock calls
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(3);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("message");
          expect(mockCalls[2][0]).toBe("error");
        });
        it("handles custom event types with id's", async () => {
          // Setup MSW handler with custom event types
          server.use(
            http.get("http://localhost/custom-events", () => {
              return new HttpResponse(
                // Notice the event: field specifies a custom event type
                'id: 3\nevent: custom-event\ndata: {"customData":"value1"}\n\n' +
                  'id: 6\ndata: {"message":"regular-message"}\n\n' +
                  'id: 9\nevent: another-custom\ndata: {"customData":"value2"}\n\n',
                {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  },
                }
              );
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/custom-events");

          const observable = eventSource.asObservable();

          // Collect events
          const events: EventSourceMessage<any>[] = [];
          let messageCount = 0;

          const subscription = observable.subscribe((event) => {
            events.push(event);
            messageCount++;
            if (messageCount >= 3) {
              eventSource.close();
            }
          });

          await subscription;

          // Verify we received both regular message events and custom events
          expect(events).toEqual([
            { id: "3", type: "custom-event", data: { customData: "value1" } },
            { id: "6", type: "message", data: { message: "regular-message" } },
            { id: "9", type: "another-custom", data: { customData: "value2" } },
          ]);
        });
      });
      describe("when dematerialize is true", () => {
        it("yields 'open' events with correct data", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/open-events", () => {
              return new HttpResponse('data: {"message":"test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/open-events");
          const observable = eventSource.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            events.push(event);
            // After we receive the open event and one message, close
            if (events.length === 2) {
              eventSource.close();
            }
          });

          await subscription;

          // Verify the first event is an 'open' event
          expect(events.length).toBeGreaterThan(0);
          expect(events[0].type).toBe("open");
        });
        it("yields 'message' events with correct data (including type)", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/message-events", () => {
              return new HttpResponse('data: {"message":"test-message"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/message-events");
          const observable = eventSource.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            if (event.type === "message") {
              events.push(event);
              eventSource.close();
            }
          });

          await subscription;

          // Verify the message event format
          expect(events.length).toBeGreaterThan(0);
          expect(events[0].type).toBe("message");
          expect(events[0].data).toEqual({ message: "test-message" });
        });
        it("yields 'error' events with correct data (including type)", async () => {
          // Setup MSW handler that will error
          server.use(
            http.get("http://localhost/error-events-dematerialized", () => {
              return new HttpResponse(null, { status: 500 });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/error-events-dematerialized");
          const observable = eventSource.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];

          // With dematerialize: true, we should get an error event before the observable errors
          const subscription = observable.subscribe((event) => {
            events.push(event);
          });

          // With error event handling, this should complete normally
          await subscription;

          // Verify we got an error event
          expect(events.length).toBeGreaterThan(0);
          expect(events[0].type).toBe("error");
          expect(events[0].code).toBe(500);
        });
        it("yields events in the order they are received", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/ordered-events", () => {
              return new HttpResponse(
                'data: {"id":1}\n\n' + 'data: {"id":2}\n\n' + 'data: {"id":3}\n\n',
                {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  },
                }
              );
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/ordered-events");
          const observable = eventSource.asObservable({ dematerialize: true });

          // Collect all events
          const events: any[] = [];
          let messageCount = 0;

          const subscription = observable.subscribe((event) => {
            events.push(event);
            if (event.type === "message") {
              messageCount++;
              if (messageCount === 3) {
                eventSource.close();
              }
            }
          });

          await subscription;

          // First event should be 'open'
          expect(events[0].type).toBe("open");

          // Messages should be in order 1, 2, 3
          const messageEvents = events.filter((e) => e.type === "message");
          expect(messageEvents[0].data).toEqual({ id: 1 });
          expect(messageEvents[1].data).toEqual({ id: 2 });
          expect(messageEvents[2].data).toEqual({ id: 3 });
        });
        it("completes when the EventSource connection closes gracefully", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/closing-events-dematerialized", () => {
              return new HttpResponse('data: {"message":"closing-test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/closing-events-dematerialized");
          const observable = eventSource.asObservable({ dematerialize: true });

          let completed = false;

          const subscription = observable.subscribe((event) => {
            if (event.type === "message") {
              eventSource.close();
              completed = true;
            }
          });

          // This should complete without error
          await subscription;

          expect(completed).toBe(true);
        });
        it("cleans up listeners when the observable is cancelled", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/cancel-events-dematerialized", () => {
              return new HttpResponse('data: {"message":"test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/cancel-events-dematerialized");
          const removeSpy = vi.spyOn(eventSource, "removeEventListener");

          // Create observable
          const observable = eventSource.asObservable({ dematerialize: true });
          const subscription = observable.subscribe(() => {});

          // Cancel subscription
          await subscription.cancel();

          // Verify that all listeners were removed (message, error, open)
          expect(removeSpy).toHaveBeenCalledTimes(3);

          // Introspectively examine the mock calls
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(3);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("message");
          expect(mockCalls[2][0]).toBe("error");
        });
        it("cleans up listeners when the EventSource closes", async () => {
          // Setup MSW handler
          server.use(
            http.get("http://localhost/close-cleanup-dematerialized", () => {
              return new HttpResponse('data: {"message":"test"}\n\n', {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/close-cleanup-dematerialized");
          const removeSpy = vi.spyOn(eventSource, "removeEventListener");

          // Create observable
          const observable = eventSource.asObservable({ dematerialize: true });

          // Subscribe and close after first message
          const subscription = observable.subscribe((event) => {
            if (event.type === "message") {
              eventSource.close();
            }
          });

          await subscription;

          // Verify that all listeners were removed (message, error, open)
          expect(removeSpy).toHaveBeenCalledTimes(3);

          // Introspectively examine the mock calls
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(3);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("message");
          expect(mockCalls[2][0]).toBe("error");
        });
        it("handles custom event types added via addEventListener on the source", async () => {
          // Setup MSW handler with custom event types
          server.use(
            http.get("http://localhost/custom-events", () => {
              return new HttpResponse(
                // Notice the event: field specifies a custom event type
                'event: custom-event\ndata: {"customData":"value1"}\n\n' +
                  'data: {"message":"regular-message"}\n\n' +
                  'event: another-custom\ndata: {"customData":"value2"}\n\n',
                {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  },
                }
              );
            })
          );

          // Create EventSource instance
          const eventSource = new EventSource("http://localhost/custom-events");

          // Add event listener for the custom event type before creating the observable
          const customEventHandler = vi.fn();
          eventSource.addEventListener("custom-event", customEventHandler);

          // Create observable with dematerialize: true to see all event types
          const observable = eventSource.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          let messageCount = 0;

          const subscription = observable.subscribe((event) => {
            events.push(event);

            // After we've received enough events, close the connection
            messageCount++;
            if (messageCount >= 3) {
              // open + 3 events
              eventSource.close();
            }
          });

          await subscription;

          // First event should be 'open'
          expect(events[0].type).toBe("open");

          // Verify we received both regular message events and custom events
          const messageEvents = events.filter((e) => e.type === "message");
          const customEvents = events.filter((e) => e.type === "custom-event");
          const anotherCustomEvents = events.filter((e) => e.type === "another-custom");

          // Should have one regular message
          expect(messageEvents.length).toBe(1);
          expect(messageEvents[0].data).toEqual({ message: "regular-message" });

          // Should have one custom-event
          expect(customEvents.length).toBe(1);
          expect(customEvents[0].data).toEqual({ customData: "value1" });

          // Should have one another-custom event
          expect(anotherCustomEvents.length).toBe(1);
          expect(anotherCustomEvents[0].data).toEqual({ customData: "value2" });

          // Verify that the manually added event listener was also called
          expect(customEventHandler).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
  describe("eventSourceObservable() (standalone function)", () => {
    describe("when dematerialize is false (default)", () => {
      it("yields only message data", async () => {
        // Setup MSW handler
        server.use(
          http.get("http://localhost/standalone-events", () => {
            return new HttpResponse('data: {"message":"standalone-test"}\n\n', {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          })
        );

        // Create a standard EventSource instance
        const source = new EventSource("http://localhost/standalone-events");

        // Use the standalone function directly
        const observable = eventSourceObservable(source);

        // Collect values
        const values: any[] = [];
        const subscription = observable.subscribe((value) => {
          values.push(value);
          source.close();
        });

        await subscription;

        // Should only receive the message data
        expect(values).toEqual([
          { id: undefined, type: "message", data: { message: "standalone-test" } },
        ]);
      });

      it("propagates errors", async () => {
        // Setup MSW handler that returns an error
        server.use(
          http.get("http://localhost/standalone-error", () => {
            return new HttpResponse(null, { status: 500 });
          })
        );

        // Create a standard EventSource instance
        const source = new EventSource("http://localhost/standalone-error");

        // Use the standalone function directly
        const observable = eventSourceObservable(source);

        // The subscription should error
        try {
          await observable.subscribe(() => {});
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe("when dematerialize is true", () => {
      it("yields 'open', 'message', and 'error' events", async () => {
        // Setup MSW handler
        server.use(
          http.get("http://localhost/standalone-dematerialized", () => {
            return new HttpResponse('data: {"message":"hello-dematerialized"}\n\n', {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          })
        );

        // Create a standard EventSource instance
        const source = new EventSource("http://localhost/standalone-dematerialized");

        // Use the standalone function with dematerialize: true
        const observable = eventSourceObservable(source, { dematerialize: true });

        // Collect events
        const events: any[] = [];
        const subscription = observable.subscribe((event) => {
          events.push(event);

          // Close the connection after receiving a message event
          if (event.type === "message") {
            source.close();
          }
        });

        await subscription;

        // Should have received at least an open and a message event
        expect(events.length).toBeGreaterThanOrEqual(2);

        // Verify event types
        const openEvents = events.filter((e) => e.type === "open");
        const messageEvents = events.filter((e) => e.type === "message");

        expect(openEvents.length).toBe(1);
        expect(messageEvents.length).toBe(1);

        // Check message data
        expect(messageEvents[0]).toBeInstanceOf(MessageEvent);
      });
    });
  });
});
