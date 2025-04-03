import { AsyncObservable } from "eventkit";
import { WebSocket } from "ws";

// FIXME: This WebSocket implementation requires the use of the `ws` package.
// We should try to find a way to use the native WebSocket implementation
// when targeting environments that support it. (it would mean we can make the
// websocket implementation look virtually the same to the event-source implementation)

/**
 * Represents the different types of events that can be emitted by a WebSocket.
 * This type union covers all possible event types: close, error, message, and open events.
 *
 * @template T - The type of data contained in message events
 */
type WebSocketEvent<T> =
  | WebSocket.CloseEvent
  | WebSocket.ErrorEvent
  | (Omit<WebSocket.MessageEvent, "data"> & { data: T })
  | WebSocket.Event;

/**
 * A drop-in replacement for the standard WebSocket class that provides an Observable interface
 * for handling WebSocket connections. This class extends the native WebSocket class and adds
 * the ability to consume events as an {@link AsyncObservable} using the {@link asObservable}
 * method.
 *
 * @example
 * ```ts
 * import { WebSocket } from "@eventkit/http";
 *
 * const ws = new WebSocket("wss://api.example.com/ws");
 *
 * // Get raw message data
 * ws.asObservable<string>().subscribe(data => {
 *   console.log("Received:", data);
 * });
 *
 * // Get full event objects including metadata
 * ws.asObservable<string>({ dematerialize: true }).subscribe(event => {
 *   switch (event.type) {
 *     case "message":
 *       console.log("Message:", event.data.data);
 *       break;
 *     case "error":
 *       console.error("Error:", event.data);
 *       break;
 *     case "close":
 *       console.log("Connection closed:", event.data.code, event.data.reason);
 *       break;
 *     case "open":
 *       console.log("Connection opened");
 *       break;
 *   }
 * });
 * ```
 *
 * @see [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
 */
class WebSocketObservable extends WebSocket {
  /**
   * Converts the WebSocket into an AsyncObservable that yields either raw message data
   * or full event objects depending on the options provided.
   *
   * @param opts - Configuration options for the observable
   * @param opts.dematerialize - When true, yields full event objects including metadata.
   *                            When false or omitted, yields only the message data.
   * @returns An AsyncObservable that yields either raw message data or full event objects
   * @template T - The type of data contained in message events
   */
  asObservable<T>(opts: { dematerialize: true }): AsyncObservable<WebSocketEvent<T>>;
  asObservable<T>(opts?: { dematerialize?: false }): AsyncObservable<T>;
  asObservable<T>(opts?: { dematerialize?: boolean }): AsyncObservable<T | WebSocketEvent<T>> {
    if (opts?.dematerialize === true) {
      return websocketObservable<T>(this, { dematerialize: true });
    }
    return websocketObservable<T>(this, { dematerialize: false });
  }
}
Object.defineProperty(WebSocketObservable, "name", { value: "WebSocket" });

export { WebSocketObservable as WebSocket };

/**
 * Creates an AsyncObservable from a WebSocket instance.
 *
 * @param ws - The WebSocket instance to convert to an AsyncObservable
 * @param opts - Configuration options for the observable
 * @param opts.dematerialize - When true, yields full event objects including metadata.
 *                            When false or omitted, yields only the message data.
 * @returns An AsyncObservable that yields either raw message data or full event objects
 * @template T - The type of data contained in message events
 */
export function websocketObservable<T>(
  ws: WebSocket,
  opts: { dematerialize: true }
): AsyncObservable<WebSocketEvent<T>>;
export function websocketObservable<T>(
  ws: WebSocket,
  opts?: { dematerialize?: false }
): AsyncObservable<T>;
export function websocketObservable<T>(
  ws: WebSocket,
  opts?: { dematerialize?: boolean }
): AsyncObservable<T | WebSocketEvent<T>> {
  if (opts?.dematerialize) {
    return new AsyncObservable<WebSocketEvent<T>>(() => dematerializeWebsocket(ws));
  }
  return new AsyncObservable<T>(() => materializeWebsocket(ws));
}

/**
 * An async generator function that yields full event objects from a WebSocket,
 * including metadata like event type and raw event data.
 *
 * @param source - The WebSocket instance to read events from
 * @returns An async generator that yields WebSocketEvent objects
 * @template T - The type of data contained in message events
 * @internal
 */
async function* dematerializeWebsocket<T>(source: WebSocket) {
  let eventBuffer: WebSocketEvent<T>[] = [];
  let closed = false;

  const closeListener = (event: WebSocket.CloseEvent) => {
    eventBuffer.push(event);
    closed = true;
  };
  const errorListener = (event: WebSocket.ErrorEvent) => {
    eventBuffer.push(event);
  };
  const messageListener = (event: WebSocket.MessageEvent) => {
    try {
      event.data = JSON.parse(event.data as string);
      eventBuffer.push(event);
    } catch {
      // Do nothing
      eventBuffer.push(event);
    }
  };
  const openListener = (event: WebSocket.Event) => {
    eventBuffer.push(event);
  };

  try {
    source.addEventListener("close", closeListener);
    source.addEventListener("error", errorListener);
    source.addEventListener("message", messageListener);
    source.addEventListener("open", openListener);

    while (true) {
      if (eventBuffer.length > 0) {
        const events = [...eventBuffer];
        eventBuffer = [];
        yield* events;
      } else if (closed || source.readyState === WebSocket.CLOSED) {
        break;
      } else {
        // Schedule the next iteration of the loop at the end of the call stack, which gives a
        // chance for the websocket to emit more values.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    source.close();
    source.removeEventListener("close", closeListener);
    source.removeEventListener("error", errorListener);
    source.removeEventListener("message", messageListener);
    source.removeEventListener("open", openListener);
  }
}

/**
 * An async generator function that yields only the message data from a WebSocket,
 * discarding metadata like event type and raw event data.
 *
 * @param source - The WebSocket instance to read events from
 * @returns An async generator that yields only the message data
 * @template T - The type of data contained in message events
 * @internal
 */
async function* materializeWebsocket<T>(source: WebSocket) {
  let messageBuffer: T[] = [];
  let error: WebSocket.ErrorEvent | null = null;
  let closed = false;

  const closeListener = () => {
    closed = true;
  };
  const errorListener = (event: WebSocket.ErrorEvent) => {
    error = event;
  };
  const messageListener = (event: WebSocket.MessageEvent) => {
    try {
      const data: T = JSON.parse(event.data as string);
      messageBuffer.push(data);
    } catch {
      // Do nothing
      messageBuffer.push(event.data as T);
    }
  };

  try {
    source.addEventListener("close", closeListener);
    source.addEventListener("error", errorListener);
    source.addEventListener("message", messageListener);

    while (true) {
      if (messageBuffer.length > 0) {
        const messages = [...messageBuffer];
        messageBuffer = [];
        yield* messages;
      } else if (error !== null) {
        throw error;
      } else if (closed || source.readyState === WebSocket.CLOSED) {
        break;
      } else {
        // Schedule the next iteration of the loop at the end of the call stack, which gives a
        // chance for the websocket to emit more values.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    source.close();
    source.removeEventListener("close", closeListener);
    source.removeEventListener("error", errorListener);
    source.removeEventListener("message", messageListener);
  }
}
