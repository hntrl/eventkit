---
outline: [2, 3]
next: false
---

# HTTP Streaming

HTTP has entrenched itself as the defacto standard for how we send data over the internet. Particularly with modern web applications and JavaScript, the transactional nature of an HTTP request/response is a powerful way to reason about how data moves between client and server. However, it's become common-place to treat the request/response objects as a single, atomic blob of data, even though HTTP was designed to be a protocol for streaming data. This departure from the original design has led to a lot of hacks and abstractions to try to emulate streaming behavior even when JavaScript already has the primitives needed to support it. We largely think this is because that the API's to support this, up until recently, have been hard to reason about and not very ergonomic.

Observables are, at heart, a way to represent a collection of values over time, which makes it a natural fit for representing streams of HTTP data. We can use observables to consume/produce HTTP data streams in a way that's easy to understand and takes advantage of all the transformation, composability, lifecycle, and side effect management bonuses that observables provide.

::: tip INFO
The examples dotted throughout this guide demonstrate how you can use eventkit primitives to send data streams to an HTTP client. Eventkit doesn't have any opinion on how the actual HTTP server is implemented, so long as the server knows how to handle standard objects like [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) or [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response). The examples below are using express/hono-like syntax, but some parts are intentionally left missing for the sake of brevity.
:::

### Example A: Using AsyncObservable + the fetch API

`AsyncObservable` can be created from/used as a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), so we can use them to represent the body of an HTTP response, and consume it as an observable on the other end. Take an instance of a basic client/server interaction as an example:

```ts
// server.ts
import { AsyncObservable } from "eventkit";

// create an observable that emits a number every second
const obs = new AsyncObservable<number>(async function* () {
  for (let i = 0; i < 10; i++) {
    yield i;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
});

app.get("/stream", (req, res) => {
  // since AsyncObservable can be used as an async iterable,
  // we can create a ReadableStream from it
  const stream = ReadableStream.from(obs);
  return new Response(stream);
});
```
```ts
// client.ts
import { AsyncObservable, map } from "eventkit";

const res = await fetch("/stream");
// the body of the response is a ReadableStream which we can create
// an AsyncObservable from
const obs = AsyncObservable.from(res.body);

function appendElement(content: string) {
  const p = document.createElement('p');
  p.textContent = content;
  document.body.appendChild(p);
}

const decoder = new TextDecoder();
const sub = obs
  // because ReadableStream emits buffers, we need to decode them
  .pipe(map((v) => decoder.decode(v)))
  .subscribe((v) => appendElement(v));

await sub;
// will only add "done" once all 10 numbers have been
// received and dom updates have completed
appendElement("done");
```

You can see the full example and test this out yourself [here](https://github.com/hntrl/eventkit/tree/main/examples/http-streaming).

## HTTP Utilities

In addition to HTTP being a streaming protocol, the HTTP protocol also maintains several standardized formats for representing streams of data. Things like [Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (SSE) and WebSockets are examples of protocols that use HTTP as a transport mechanism. Eventkit provides the `@eventkit/http` package to help you interface with HTTP this way using observables.

#### Installation

::: code-group
```sh [npm]
npm install @eventkit/http
```
```sh [yarn]
yarn add @eventkit/http
```
```sh [pnpm]
pnpm add @eventkit/http
```
```sh [bun]
bun add @eventkit/http
```
:::

### `EventSource`

[Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (or SSE) is a standard format for representing emissions in a stream of data as event objects. [All browsers ship](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#browser_compatibility) with a native `EventSource` object, which makes for a great way to represent a data stream in an event based format.

The way that data is represented is a newline separated collection of event objects, each with an `id`, `event`, and `data` field:

```
id: <event id>
event: <event type>
data: <event data>

id: <next event id>
event: <next event type>
data: <next event data>

...etc
```

[`@eventkit/http`](/reference/_eventkit/http) ships with a separate [`EventSource`](/reference/_eventkit/http/EventSource) class that allows you to represent the stream as an [`AsyncObservable`](/reference/eventkit/AsyncObservable). When you import [`EventSource`](/reference/_eventkit/_http/EventSource) from [`@eventkit/http`](/reference/_eventkit/http), all it's doing is extending the native `EventSource` class provided by the runtime and adding the `asObservable` method that allows you to represent the stream as an [`AsyncObservable`](/reference/eventkit/AsyncObservable).

```ts
import { EventSource } from "@eventkit/http";

const eventSource = new EventSource("http://localhost:3000/stream");
const obs = eventSource.asObservable();

obs.subscribe((event) => console.log(event));
```

In the native implementation of `EventSource`, the way that state/data is yielded is through adding event listeners to the event source instance (see what types of events are available [here](https://developer.mozilla.org/en-US/docs/Web/API/EventSource#events)). By default, the EventSource observable will only yield actual message event data, and throw an error whenever an error event is emitted. If you want to be able to observe the actual [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event) objects, you can pass in the `dematerialize` option to the [`asObservable`](/reference/_eventkit/http/EventSource#asobservable) method:

```ts
const obs = eventSource.asObservable({ dematerialize: true });
// instead of just yielding message data, the observable will yield 'open', 'message', 'error', and
// (if the `event` field is defined on the message) keyed event objects.
```

### `EventSourceResponse`

As the natural counter-part to [`EventSource`](/reference/_eventkit/http/EventSource), [`EventSourceResponse`](/reference/_eventkit/http/EventSourceResponse) is a class that allows you to represent an [`AsyncObservable`](/reference/eventkit/AsyncObservable) as an SSE response. You can create it by constructing the response as you would with a normal response, but instead of passing in a stream you pass in an observable:

```ts
import { EventSourceResponse } from "@eventkit/http";

const obs = new AsyncObservable<number>(async function* () {
  for (let i = 0; i < 10; i++) {
    yield i;
  }
});

app.get("/stream", (req, res) => {
  return new EventSourceResponse(obs, {
    headers: {
      "X-Custom-Header": "Hello",
    }
  });
});
```

You can also pass in SSE-specific options to inform how the events should be serialized:

```ts
return new EventSourceResponse(obs, {
  sse: {
    getId: (n) => (n * 2).toString(),
    getEvent: (n) => `increment`,
    getData: (n) => n.toString(),
  }
})

// will emit events like:
// id: 0
// event: increment
// data: 0
//
// id: 2
// event: increment
// data: 1
//
// ...etc
```

#### Example B: Streaming fibonacci numbers using SSE

Let's say we have a long-running job that we want to stream the updates of. We can represent the job as an [`AsyncObservable`](/reference/eventkit/AsyncObservable) and then use [`EventSourceResponse`](/reference/_eventkit/http/EventSourceResponse) to stream it using SSE:

```ts
import { AsyncObservable } from "eventkit";
import { EventSourceResponse } from "@eventkit/http";

// a long-running job that emits the fibonacci sequence
const fib = new AsyncObservable<number>(async function* () {
  let a = 0;
  let b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
});

app.get("/fibonacci", (req, res) => {
  return new EventSourceResponse(fib, {
    sse: {
      getId: (n, index) => index.toString(),
      getEvent: (n) => `fibonacci`,
      getData: (n) => n.toString(),
    }
  });
});
```

We can expect the serialized output to look something like this:

```
id: 0
event: fibonacci
data: 0

<after 8 events>

id: 7
event: fibonacci
data: 21

...etc
```

Browsers know how to handle SSE responses, so you can either visit the endpoint directly, or embed it in your page like this:

```ts
import { AsyncObservable } from "eventkit";
import { EventSource } from "@eventkit/http";

const eventSource = new EventSource("http://localhost/fibonacci");
const obs = eventSource.asObservable();

function appendElement(content: string) {
  const p = document.createElement('p');
  p.textContent = content;
  document.body.appendChild(p);
}

obs.subscribe(({ id, event, data }) => {
  console.log(`[${id}] ${event}: ${data}`);
  appendElement(data.toString())
});
```

#### Example C: Real-time chat server using SSE

Using [`Stream`](/reference/eventkit/Stream) and [`EventSourceResponse`](/reference/_eventkit/http/EventSourceResponse), we can create a very basic chat application that employs SSE and standard requests to handle the interactions:

```ts
import { Stream, filter } from "eventkit";
import { EventSourceResponse } from "@eventkit/http";

type ChatEvent = { room: string; user: string; ts: number } & (
  | {
      type: "join" | "leave";
    }
  | {
      type: "message";
      body: string;
    }
);

const stream = new Stream<ChatEvent>();

app.post("/chat/:room", (req, res) => {
  const { room } = req.params;
  const { user } = req.headers;
  const { message } = req.body;
  stream.push({ room, user, ts: Date.now(), type: "message", body: message });
  res.sendStatus(200);
});

app.get("/chat/:room", (req, res) => {
  const { room } = req.params;
  const roomEvents$ = stream.pipe(filter((e) => e.room === room));
  return new EventSourceResponse(roomEvents$);
});

stream.subscribe((e) => {
  if (e.type === "join") {
    console.log(`[${e.room}] ${e.user} has joined the room`);
  }
  if (e.type === "message") {
    console.log(`[${e.room}] ${e.user}: ${e.body}`);
  }
  if (e.type === "leave") {
    console.log(`[${e.room}] ${e.user} has left the room`);
  }
});
```

### `WebSocket`

[WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) is a protocol that allows for a full-duplex, two-way communication channel between a client and server, and has become a popular protocol for building real-time applications.

[`@eventkit/http`](/reference/_eventkit/http) ships with a separate [`WebSocket`](/reference/_eventkit/http/WebSocket) class that allows you to represent the **receiving end** of the websocket connection as an [`AsyncObservable`](/reference/eventkit/AsyncObservable). When you import [`WebSocket`](/reference/_eventkit/http/WebSocket) from [`@eventkit/http`](/reference/_eventkit/http), all it's doing is extending the native `WebSocket` class provided by the runtime and adding the [`asObservable`](/reference/_eventkit/http/WebSocket#asobservable) method that allows you to represent incoming data as an [`AsyncObservable`](/reference/eventkit/AsyncObservable).

```ts
import { WebSocket } from "@eventkit/http";

const ws = new WebSocket("ws://localhost");
const obs = ws.asObservable();
```

In the native implementation of `WebSocket`, the way that state/data is yielded is through adding event listeners to the websocket instance (see what types of events are available [here](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#events)). By default, the WebSocket observable will only yield actual message event data, and throw an error whenever an error event is emitted. If you want to be able to observe the actual [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event) objects, you can pass in the `dematerialize` option to the [`asObservable`](/reference/_eventkit/http/WebSocket#asobservable) method:

```ts
const obs = ws.asObservable({ dematerialize: true });
// instead of just yielding message data, the observable will yield 'open', 'message', 'error', and 'close' event objects
```

::: tip
Websockets "as an observable" only represent the receiving end of the connection. If you want to also be able to observe data as it's being sent, a common pattern is to use a [`Stream`](/reference/eventkit/Stream), add a subscription to handle the work of actually sending data through the websocket, and then push events to the [`Stream`](/reference/eventkit/Stream) instead of pushing them to the websocket directly.

```ts
import { Stream } from "eventkit";
import { WebSocket } from "@eventkit/http";

const ws = new WebSocket("ws://localhost");
const tx = new Stream<any>();
const rx = ws.asObservable();

// subscriber that handles the sending side of the connection
tx.subscribe(ws.send);

// completely separate subscriber that listens to whatever data is sent
tx.subscribe((event) => {
  console.log(`sending: ${event}`);
})

// subscriber that listens to whatever data is received
rx.subscribe((event) => {
  console.log(`received: ${event}`);
});

// push events to all tx subscribers and the websocket
tx.push("hello");
```
:::