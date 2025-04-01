import { AsyncObservable } from "eventkit";
import { type CloseEvent, type ErrorEvent, type MessageEvent } from "undici-types";

/**
 * Represents the different types of events that can be emitted by a WebSocket.
 * This type union covers all possible event types: close, error, message, and open events.
 *
 * @template T - The type of data contained in message events
 */
type WebSocketEvent<T> =
  | {
      type: "close";
      data: CloseEvent;
    }
  | {
      type: "error";
      data: ErrorEvent;
    }
  | {
      type: "message";
      data: MessageEvent<T>;
    }
  | {
      type: "open";
      data: Event;
    };

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
  const { signal, abort } = new AbortController();
  try {
    let eventBuffer: WebSocketEvent<T>[] = [];

    // prettier-ignore
    source.addEventListener(
      "close",
      (event) => eventBuffer.push({ type: "close", data: event }),
      { signal }
    );
    // prettier-ignore
    source.addEventListener(
      "message",
      (event) => eventBuffer.push({ type: "message", data: event }),
      { signal }
    );
    // prettier-ignore
    source.addEventListener(
      "error",
      (event) => eventBuffer.push({ type: "error", data: event }),
      { signal }
    );
    // prettier-ignore
    source.addEventListener(
      "open",
      (event) => eventBuffer.push({ type: "open", data: event }),
      { signal }
    );

    while (!signal.aborted) {
      if (source.readyState === WebSocket.CLOSED) break;
      if (eventBuffer.length > 0) {
        const events = [...eventBuffer];
        eventBuffer = [];
        yield* events;
      } else {
        // Schedule the next iteration of the loop at the end of the call stack, which gives a
        // chance for the event source to emit more values.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    abort();
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
  const { signal, abort } = new AbortController();
  try {
    let messageBuffer: T[] = [];
    let error: ErrorEvent | null = null;

    source.addEventListener("message", (event) => messageBuffer.push(event.data), { signal });
    source.addEventListener("error", (event) => (error = event), { signal });

    while (!signal.aborted) {
      if (source.readyState === WebSocket.CLOSED) break;
      if (error !== null) throw error;
      if (messageBuffer.length > 0) {
        const messages = [...messageBuffer];
        messageBuffer = [];
        yield* messages;
      } else {
        // Schedule the next iteration of the loop at the end of the call stack, which gives a
        // chance for the event source to emit more values.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    abort();
  }
}
