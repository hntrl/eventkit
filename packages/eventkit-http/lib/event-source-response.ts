import { QueueScheduler, type Subscriber, withScheduler, type AsyncObservable } from "eventkit";

type EventSourceSerializer<T> = (event: T, index: number) => Uint8Array;

/**
 * Configuration options for customizing how events are serialized into SSE format.
 * Each property can be a function that extracts the corresponding SSE field from an event,
 * or null to exclude that field from the output.
 *
 * @template T - The type of the events being serialized
 */
export type EventSourceSerializerInit<T> = {
  /**
   * Function to extract the event ID. If null, no ID will be included.
   * If undefined, the event index will be used as the ID.
   */
  getId?: ((value: T, index: number) => string) | null;

  /**
   * Function to extract the event type. If null, no type will be included.
   * If undefined, no type will be included.
   */
  getType?: ((value: T, index: number) => string) | null;

  /**
   * Function to extract the event data. If null, no data will be included.
   * If undefined, the event will be JSON stringified if it's an object, or converted to string
   * otherwise.
   */
  getEvent?: ((value: T, index: number) => string) | null;
};

/**
 * Configuration options for creating an EventSourceResponse.
 * Extends the standard ResponseInit interface with SSE-specific options.
 *
 * @template T - The type of the events being streamed
 */
export type EventSourceResponseInit<T> = ResponseInit & {
  /**
   * Options for customizing how events are serialized into SSE format.
   * If not provided, default serialization will be used.
   */
  sse?: EventSourceSerializerInit<T>;
};

const Response: typeof globalThis.Response =
  globalThis.Response ??
  class {
    constructor() {
      throw new Error("Response is not supported in this environment");
    }
  };

/**
 * A Response subclass that subscribes to an {@link AsyncObservable} and streams the values yielded
 * by the observable to the client as [Server-Sent Events (SSE)](https://en.wikipedia.org/wiki/Server-sent_events).
 * Optional property selectors can be provided to customize the serialization of the events.
 *
 * @example
 * ```ts
 * const observable = new AsyncObservable<Message>(...);
 * const response = new EventSourceResponse(observable, {
 *   sse: {
 *     getId: (msg) => msg.id,
 *     getType: (msg) => msg.type,
 *     getEvent: (msg) => JSON.stringify(msg.data)
 *   }
 * });
 * ```
 *
 * @see [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
 * @template T - The type of events that will be streamed
 */
export class EventSourceResponse<T> extends Response {
  /** Internal counter for event IDs */
  private eventIndex = 0;
  /** The writable stream that writes events to the client */
  private readonly writable: WritableStream<{ event: T; index: number }>;
  /** The source observable that provides the events */
  protected readonly observable: AsyncObservable<T>;
  /** The subscriber that handles the event stream */
  protected readonly subscriber: Subscriber<T>;

  /**
   * Creates a new EventSourceResponse that streams events from an AsyncObservable.
   *
   * @param observable - The source of events to stream
   * @param init - Configuration options for the response and SSE serialization
   */
  constructor(observable: AsyncObservable<T>, init: EventSourceResponseInit<T>) {
    const encoder = new TextEncoder();
    const serializer = getSerializer(encoder, init.sse);
    const stream = getTransformStream(serializer, () => this.subscriber?.cancel());
    super(stream.readable, {
      ...init,
      headers: {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        ...init.headers,
      },
    });
    const scheduler = new QueueScheduler({ concurrency: 1 });
    this.writable = stream.writable;
    this.observable = observable.pipe(withScheduler(scheduler));
    this.subscriber = this._subscribe();
  }

  /**
   * Subscribes to the observable and writes events to the output stream.
   * @internal
   */
  private _subscribe() {
    const writer = this.writable.getWriter();
    const sub = this.observable.subscribe(async (event) => {
      this.eventIndex++;
      await writer.write({ event, index: this.eventIndex });
    });
    sub.finally(() => {
      writer.close();
    });
    return sub;
  }
}

function getTransformStream<T>(
  serializer: EventSourceSerializer<T>,
  onCancel: () => Promise<void>
) {
  return new TransformStream<{ event: T; index: number }, Uint8Array>({
    async transform(message, controller) {
      try {
        const serialized = serializer(message.event, message.index);
        controller.enqueue(serialized);
      } catch (error) {
        controller.terminate();
        await onCancel();
        throw error;
      }
    },
    async flush() {
      await onCancel();
    },
  });
}

function getSerializer<T = any>(
  encoder: InstanceType<typeof TextEncoder>,
  init?: EventSourceSerializerInit<T>
): EventSourceSerializer<T> {
  const predicateFn = (
    key: keyof EventSourceSerializerInit<T>,
    defaultFn: (event: T, index: number) => string | undefined
  ) => {
    const value = init?.[key];
    if (value === null) return () => undefined;
    else if (value === undefined) return defaultFn;
    else return value;
  };

  const getId = predicateFn("getId", (_, index: number) => index.toString());
  const getType = predicateFn("getType", () => undefined);
  const getEvent = predicateFn("getEvent", (event: T) => {
    if (typeof event === "object") return JSON.stringify(event);
    else return String(event);
  });

  return (event: T, index: number) => {
    const eventId = getId(event, index);
    const eventType = getType(event, index);
    const eventData = getEvent(event, index);

    let serialized = "";

    if (eventId) serialized += `id: ${eventId}\n`;
    if (eventType) serialized += `event: ${eventType}\n`;
    if (eventData) {
      const dataLines = eventData.split("\n").map((line) => `data: ${line}`);
      serialized += dataLines.join("\n");
      serialized += "\n";
    }

    serialized += "\n";
    return encoder.encode(serialized);
  };
}
