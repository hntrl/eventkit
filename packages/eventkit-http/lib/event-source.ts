import { AsyncObservable } from "eventkit";
import { type ErrorEvent, type MessageEvent } from "undici-types";

/**
 * Represents the different types of events that can be emitted by an EventSource.
 * This type union covers all possible event types: error, message, and open events.
 *
 * @template T - The type of data contained in message events
 */
type EventSourceEvent<T> =
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
 * A drop-in replacement for the standard EventSource class that provides an Observable interface
 * for handling [Server-Sent Events (SSE)](https://en.wikipedia.org/wiki/Server-sent_events).
 * This class extends the native EventSource class and adds the ability to consume events as an
 * {@link AsyncObservable} using the {@link asObservable} method.
 *
 * @example
 * ```ts
 * import { EventSource } from "@eventkit/http";
 *
 * const source = new EventSource("https://api.example.com/events");
 *
 * // Get raw message data
 * source.asObservable<string>().subscribe(data => {
 *   console.log("Received:", data);
 * });
 *
 * // Get full event objects including metadata
 * source.asObservable<string>({ dematerialize: true }).subscribe(event => {
 *   switch (event.type) {
 *     case "message":
 *       console.log("Message:", event.data.data);
 *       break;
 *     case "error":
 *       console.error("Error:", event.data);
 *       break;
 *     case "open":
 *       console.log("Connection opened");
 *       break;
 *   }
 * });
 * ```
 *
 * @see [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource)
 */
class EventSourceObservable extends EventSource {
  /**
   * Converts the EventSource into an AsyncObservable that yields either raw message data
   * or full event objects depending on the options provided.
   *
   * @param opts - Configuration options for the observable
   * @param opts.dematerialize - When true, yields full event objects including metadata.
   *                            When false or omitted, yields only the message data.
   * @returns An AsyncObservable that yields either raw message data or full event objects
   * @template T - The type of data contained in message events
   */
  asObservable<T>(opts: { dematerialize: true }): AsyncObservable<EventSourceEvent<T>>;
  asObservable<T>(opts?: { dematerialize: false }): AsyncObservable<T>;
  asObservable<T>(opts?: { dematerialize: boolean }): AsyncObservable<any> {
    if (opts?.dematerialize === true) {
      return eventSourceObservable<T>(this, { dematerialize: true });
    }
    return eventSourceObservable<T>(this, { dematerialize: false });
  }
}
Object.defineProperty(EventSourceObservable, "name", { value: "EventSource" });

export { EventSourceObservable as EventSource };

/**
 * Creates an AsyncObservable from an EventSource instance.
 *
 * @param source - The EventSource instance to convert to an AsyncObservable
 * @param opts - Configuration options for the observable
 * @param opts.dematerialize - When true, yields full event objects including metadata.
 *                            When false or omitted, yields only the message data.
 * @returns An AsyncObservable that yields either raw message data or full event objects
 * @template T - The type of data contained in message events
 */
export function eventSourceObservable<T>(
  source: EventSource,
  opts: { dematerialize: true }
): AsyncObservable<EventSourceEvent<T>>;
export function eventSourceObservable<T>(
  source: EventSource,
  opts?: { dematerialize: false }
): AsyncObservable<T>;
export function eventSourceObservable<T>(
  source: EventSource,
  opts?: { dematerialize: boolean }
): AsyncObservable<any> {
  if (opts?.dematerialize) {
    return new AsyncObservable<EventSourceEvent<T>>(() => dematerializeEventSource(source));
  }
  return new AsyncObservable<T>(() => materializeEventSource(source));
}

/**
 * An async generator function that yields full event objects from an EventSource,
 * including metadata like event type and raw event data.
 *
 * @param source - The EventSource instance to read events from
 * @returns An async generator that yields EventSourceEvent objects
 * @template T - The type of data contained in message events
 * @internal
 */
async function* dematerializeEventSource<T>(source: EventSource) {
  const { signal, abort } = new AbortController();
  try {
    let eventBuffer: EventSourceEvent<T>[] = [];

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
      if (source.readyState === EventSource.CLOSED) break;
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
 * An async generator function that yields only the message data from an EventSource,
 * discarding metadata like event type and raw event data.
 *
 * @param source - The EventSource instance to read events from
 * @returns An async generator that yields only the message data
 * @template T - The type of data contained in message events
 * @internal
 */
async function* materializeEventSource<T>(source: EventSource) {
  const { signal, abort } = new AbortController();
  try {
    let messageBuffer: T[] = [];
    let error: ErrorEvent | null = null;

    source.addEventListener("message", (event) => messageBuffer.push(event.data), { signal });
    source.addEventListener("error", (event) => (error = event), { signal });

    while (!signal.aborted) {
      if (source.readyState === EventSource.CLOSED) break;
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
