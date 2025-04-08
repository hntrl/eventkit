import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { WebSocket, websocketObservable } from "../lib/websocket";
import { WebSocketServer } from "ws";

const shouldRun = typeof globalThis.WebSocket === "function";

let wss: WebSocketServer;
const PORT = 8080;

beforeEach(() => {
  wss = new WebSocketServer({ port: PORT });
});

afterEach(() => {
  wss.close();
});

describe.skipIf(shouldRun)("WebSocket (exported class)", () => {
  describe("constructor should reject if WebSocket is not supported", () => {
    it("should reject if WebSocket is not supported", () => {
      try {
        new WebSocket(`ws://localhost:${PORT}`);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBe("WebSocket is not supported in this environment");
      }
    });
  });
});

describe.skipIf(!shouldRun)("WebSocket functionality", () => {
  describe("WebSocket (exported class)", () => {
    describe("asObservable()", () => {
      describe("when dematerialize is false (default)", () => {
        it("yields only message data from the WebSocket", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable();

          // Collect values
          const values: any[] = [];
          const subscription = observable.subscribe((value) => {
            values.push(value);
          });

          // Send messages from the server
          wss.on("connection", (socket) => {
            socket.send("Hello");
            socket.send(JSON.stringify({ key: "value" }));
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          // Verify we received only the message data
          expect(values).toEqual(["Hello", { key: "value" }]);
        });

        it("propagates errors from the WebSocket's 'error' event", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable();

          // The subscription should error
          const errorPromise = observable.subscribe(() => {});

          // Simulate an error by closing the connection abruptly
          wss.on("connection", (socket) => {
            socket.terminate();
          });

          // Should throw an error
          try {
            await errorPromise;
            // Should not reach here
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        it("completes when the WebSocket connection closes", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable();

          // Collect values
          const values: any[] = [];
          const subscription = observable.subscribe((value) => {
            values.push(value);
          });

          // Send a message and close the connection
          wss.on("connection", (socket) => {
            socket.send("test-message");
            socket.close(1000, "Normal closure");
          });

          // Wait for the subscription to complete
          await subscription;

          // Should have received the message
          expect(values).toEqual(["test-message"]);
        });

        it("cleans up listeners when the observable is cancelled", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);

          // Spy on removeEventListener
          const removeSpy = vi.spyOn(ws, "removeEventListener");

          // Create the observable
          const observable = ws.asObservable();
          const subscription = observable.subscribe(() => {});

          wss.on("connection", (socket) => {
            socket.send("test-message");
            socket.close();
          });

          // Cancel the subscription
          await subscription.cancel();

          // Should have removed event listeners
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("message");
        });

        it("cleans up listeners when the WebSocket closes", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);

          // Spy on removeEventListener
          const removeSpy = vi.spyOn(ws, "removeEventListener");

          // Create the observable
          const observable = ws.asObservable();
          const subscription = observable.subscribe(() => {});

          // Close the WebSocket
          wss.on("connection", (socket) => {
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          const mockCalls = removeSpy.mock.calls;

          // Should have removed event listeners
          expect(mockCalls.length).toBe(2);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("close");
        });
      });

      describe("when dematerialize is true", () => {
        it("yields 'open' events with correct data", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable({ dematerialize: true });

          wss.on("connection", (socket) => {
            socket.send("test-message");
            socket.terminate();
          });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            events.push(event);
          });

          // Wait for the subscription to complete
          await subscription;

          // Should have received an open event
          expect(events.length).toBeGreaterThan(0);
          expect(events[0].type).toBe("open");
        });

        it("yields 'message' events with correct data (including type)", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            events.push(event);
            if (event.type === "message") {
              wss.on("connection", (socket) => {
                socket.close();
              });
            }
          });

          // Send a message from the server
          wss.on("connection", (socket) => {
            socket.send("test-message");
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          // Should have received open and message events
          expect(events.length).toBeGreaterThanOrEqual(2); // at least open and message

          const messageEvents = events.filter((e) => e.type === "message");
          expect(messageEvents.length).toBe(1);
          expect(messageEvents[0].data).toBe("test-message");
        });

        it("yields 'close' events with correct data (including code and reason)", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            events.push(event);
          });

          // Close the WebSocket with specific code and reason
          wss.on("connection", (socket) => {
            socket.close(1001, "Going away");
          });

          // Wait for the subscription to complete
          await subscription;

          // Should have received open and close events
          const closeEvents = events.filter((e) => e.type === "close");
          expect(closeEvents.length).toBe(1);
          expect(closeEvents[0].code).toBe(1001);
          expect(closeEvents[0].reason).toBe("Going away");
        });

        it("yields events in the order they are received", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable({ dematerialize: true });

          // Collect events
          const events: any[] = [];
          const subscription = observable.subscribe((event) => {
            events.push(event);
            if (events.length >= 4) {
              // open + 3 messages
              wss.on("connection", (socket) => {
                socket.close();
              });
            }
          });

          // Send messages in sequence
          wss.on("connection", (socket) => {
            socket.send("message1");
            socket.send("message2");
            socket.send("message3");
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          // First event should be 'open'
          expect(events[0].type).toBe("open");

          // Messages should be in order
          const messageEvents = events.filter((e) => e.type === "message");
          expect(messageEvents.length).toBe(3);
          expect(messageEvents[0].data).toBe("message1");
          expect(messageEvents[1].data).toBe("message2");
          expect(messageEvents[2].data).toBe("message3");
        });

        it("completes when the WebSocket connection closes", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);
          const observable = ws.asObservable({ dematerialize: true });

          // Track completion
          let completed = false;

          const subscription = observable.subscribe();
          subscription.finally(() => (completed = true));

          // Send a message
          wss.on("connection", (socket) => {
            socket.send("test-message");
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          expect(completed).toBe(true);
        });

        it("cleans up listeners when the observable is cancelled", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);

          // Spy on removeEventListener
          const removeSpy = vi.spyOn(ws, "removeEventListener");

          // Create the observable
          const observable = ws.asObservable({ dematerialize: true });
          const subscription = observable.subscribe(() => {});

          // Cancel the subscription
          await subscription.cancel();

          // Should have removed event listeners
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(1);
          expect(mockCalls[0][0]).toBe("open");
        });

        it("cleans up listeners when the WebSocket closes", async () => {
          // Create WebSocket instance
          const ws = new WebSocket(`ws://localhost:${PORT}`);

          // Spy on removeEventListener
          const removeSpy = vi.spyOn(ws, "removeEventListener");

          // Create the observable with dematerialize: true
          const observable = ws.asObservable({ dematerialize: true });
          const subscription = observable.subscribe(() => {});

          // Close the WebSocket
          wss.on("connection", (socket) => {
            socket.close();
          });

          // Wait for the subscription to complete
          await subscription;

          // Should have removed event listeners
          const mockCalls = removeSpy.mock.calls;
          expect(mockCalls.length).toBe(2);
          expect(mockCalls[0][0]).toBe("open");
          expect(mockCalls[1][0]).toBe("close");
        });
      });
    });
  });

  describe("websocketObservable() (standalone function)", () => {
    describe("when dematerialize is false (default)", () => {
      it("yields only message data", async () => {
        // Create a WebSocket instance
        const ws = new WebSocket(`ws://localhost:${PORT}`);

        // Use the standalone function directly
        const observable = websocketObservable(ws);

        // Collect values
        const values: any[] = [];
        const subscription = observable.subscribe((value) => {
          values.push(value);
        });

        // Send messages from the server
        wss.on("connection", (socket) => {
          socket.send("standalone-message-1");
          socket.send("standalone-message-2");
          socket.close();
        });

        // Wait for the subscription to complete
        await subscription;

        // Verify we received only the message data
        expect(values).toEqual(["standalone-message-1", "standalone-message-2"]);
      });

      it("propagates errors", async () => {
        // Create a WebSocket instance
        const ws = new WebSocket(`ws://localhost:${PORT}`);

        // Use the standalone function directly
        const observable = websocketObservable(ws);

        // The subscription should error
        const errorPromise = observable.subscribe(() => {});

        // Simulate an error by closing the connection abruptly
        wss.on("connection", (socket) => {
          socket.terminate();
        });

        // Should throw an error
        try {
          await errorPromise;
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe("when dematerialize is true", () => {
      it("yields 'open', 'message', and 'close' events", async () => {
        // Create a WebSocket instance
        const ws = new WebSocket(`ws://localhost:${PORT}`);

        // Use the standalone function with dematerialize: true
        const observable = websocketObservable(ws, {
          dematerialize: true,
        });

        // Collect events by type
        const events: Record<string, any[]> = {
          open: [],
          message: [],
          close: [],
        };

        const subscription = observable.subscribe((event) => {
          // Add the event to its corresponding category
          events[event.type].push(event);
        });

        // Send a message after a short delay
        wss.on("connection", (socket) => {
          socket.send("standalone-dematerialized-message");
          socket.close(1000, "Standalone test complete");
        });

        // Wait for the subscription to complete (will happen after close)
        await subscription;

        // Verify we received all types of events
        expect(events.open.length).toBe(1);
        expect(events.open[0].type).toBe("open");

        expect(events.message.length).toBe(1);
        expect(events.message[0].type).toBe("message");
        expect(events.message[0].data).toBe("standalone-dematerialized-message");

        expect(events.close.length).toBe(1);
        expect(events.close[0].type).toBe("close");
        expect(events.close[0].code).toBe(1000);
        expect(events.close[0].reason).toBe("Standalone test complete");
      });
    });
  });
});
