---
outline: [2, 6]
---

# Creating Streams

Streams are one of the most basic objects available in eventkit. They provide a powerful way to model asynchronous data that arrives when you decide it should be delivered.

```ts
import { Stream } from "eventkit";

// A stream of numbers
const stream = new Stream<number>();

// Subscribe to the stream
stream.subscribe((value) => {
  console.log(value);
});

// Push a value into the stream
stream.push(1);

// Wait for the stream to finish processing
await stream.drain();
console.log("done");

// output:
// 1
// done
```

With Streams, you can transform, filter, and combine data as it flows through your application. This approach allows you to build systems that respond to changes naturally, rather than constantly polling for updates or managing complex state. And unlike many other reactive libraries, eventkit's Streams are designed with async/await in mind, making them feel natural in modern JavaScript codebases.

Say you wanted to selectively observe values from the stream like you would with an EventEmitter.

```ts
import { Stream, filter } from "eventkit";

type Event =
  | { type: "increment"; value: number }
  | { type: "decrement"; value: number };

const stream = new Stream<Event>();

const incrementEvents$ = stream.pipe(
  filter((event) => event.type === "increment")
);
const decrementEvents$ = stream.pipe(
  filter((event) => event.type === "decrement")
);

let value = 0;

incrementEvents$.subscribe((event) => {
  value += event.value;
});

decrementEvents$.subscribe((event) => {
  value -= event.value;
});

stream.push({ type: "increment", value: 5 });
stream.push({ type: "decrement", value: 3 });
stream.push({ type: "increment", value: 2 });

await stream.drain();
console.log(value); // 4
```

`.pipe()` and `filter()` are apart of a larger set of operators that allow you to express your stream logic in a declarative way (more on this in [Transforming Data](/guide/concepts/transforming-data)).

### It's like an "EventEmitter"

If you're familiar with Node.js EventEmitters or browser-based event systems, Streams will feel conceptually similar - they allow you to subscribe to events and react when they occur. However, Streams go beyond these patterns by providing powerful transformation capabilities and better observability into the execution of it's subscription callbacks (or side effects).

Unlike EventEmitters where you typically have separate handlers for different event types, Streams create a unified pipeline for data processing. This makes composition more natural and allows for complex transformations that would be cumbersome with traditional event systems.

### It's like a "ReadableStream/WritableStream"

Streams in eventkit also share some philosophical similarities with the Web Streams API (ReadableStream, WritableStream), but with a more focused API that's optimized for event handling rather than binary data transfer. Like Web Streams, eventkit Streams allow you to process data incrementally as it becomes available, but with a simpler interface designed specifically for application events.

## Basics of streams

A Stream is a special type of [AsyncObservable](/guide/concepts/observable-pattern#using-asyncobservable) that allows you to push values into it at any time. This makes it perfect for representing events that occur over time, like user interactions, network responses, or any other asynchronous data source.

### `preprocess()`

You can provide a `preprocess` method in the stream's constructor to transform or validate the values that are pushed into the stream.

::: tip Example with Zod 💎
[Zod](https://zod.dev/) is a powerful schema validation library that lets you validate any incoming data. If you wanted to validate that the values pushed into the stream are a specific shape, you could do so like this:

```ts
import { z } from "zod";
import { Stream } from "eventkit";

const eventSchema = z.union([
  z.object({ type: z.literal("increment"), value: z.number().min(0) }),
  z.object({ type: z.literal("decrement"), value: z.number().min(0) }),
]);

const stream = new Stream({
  preprocess(value) {
    return eventSchema.parse(value);
  }
})

stream.push({ type: "increment", value: -1 }); // ZodError
```
:::

### `scheduler`

Scheduling is a more advanced concept that allows you to control how the stream's subscribers process values (which you can learn about [here](/guide/concepts/scheduling)).

To give a basic example, say that you wanted to handle all of the callbacks in the stream sequentially:

```ts
import { Stream, QueueScheduler } from "eventkit";

const stream = new Stream({
  scheduler: new QueueScheduler()
})

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const subA = stream.subscribe(async (value) => {
  await delay(100);
  console.log("subA", value);
});

const subB = stream.subscribe(async (value) => {
  await delay(1000);
  console.log("subB", value);
});

console.log("pushing values");
stream.push(1);
stream.push(2);
stream.push(3);

await stream.drain();
console.log("done");

// output:
// pushing values
// subA 1 (after 100ms)
// subB 1 (after 1000ms)
// subA 2 (after 1100ms)
// subB 2 (after 2100ms)
// subA 3 (after 2200ms)
// subB 3 (after 3200ms)
// done
```

## AsyncObservable

The `AsyncObservable` object is a different, more abstractive way, to represent values over time. Whereas values can be pushed to a stream from anywhere in your code, the values that get emitted from an `AsyncObservable` are produced by a self-contained generator function.

```ts
import { AsyncObservable } from "eventkit";

const myObservable = new AsyncObservable(async function* () {
  yield 1;
  yield 2;
  yield 3;
});

await myObservable.subscribe((value) => {
  console.log(value);
});

// output:
// 1
// 2
// 3
```

`AsyncObservable` is perhaps the most basic building block of eventkit. Internally, Streams are just special types of observables that yield values that are pushed into them using the `push()` method.

If you're familiar with an [Observable](https://github.com/WICG/observable) or libraries like [RxJS](https://rxjs.dev/), then the concept of `AsyncObservable` will feel very familiar.

### Waiting for work to finish

One of the key facets of `AsyncObservable` is that it allows you to be strongly consistent in waiting for work associated with an observable to finish. When a value is yielded, the callbacks that get called as a result of that value being yielded are tracked as a [side effect](https://en.wikipedia.org/wiki/Side_effect_(computer_science)). Eventkit allows you to wait for all or parts of those side effects to finish.

::: code-group
```ts [AsyncObservable]
import { AsyncObservable } from "eventkit";

const myObservable = new AsyncObservable(async function* () {
  yield 1;
});

const persistenceSub = myObservable.subscribe(async (value) => {
  console.log("db:", value);
  await saveToDatabase(value);
});

const otherExpensiveSub = myObservable.subscribe(async (value) => {
  console.log("other:", value);
  // let's assume that this takes longer than the database operation
  await otherExpensiveOperation(value);
});

// We can either (1) wait for both callbacks to finish
await myObservable.drain();

// or (2) wait for just one of them to finish
await persistenceSub;
// in this case, we can safely query our changes without being
// blocked by the other callback
await queryDatabase();
```
```ts [Stream]
import { Stream } from "eventkit";

const stream = new Stream();

const persistenceSub = myObservable.subscribe(async (value) => {
  console.log("db:", value);
  await saveToDatabase(value);
});

const otherExpensiveSub = myObservable.subscribe(async (value) => {
  console.log("other:", value);
  // let's assume that this takes longer than the database operation
  await otherExpensiveOperation(value);
});

stream.push(1);

// We can either (1) wait for both callbacks to finish
await stream.drain();

// or (2) wait for just one of them to finish
await persistenceSub;
// in this case, we can safely query our changes without being
// blocked by the other callback
await queryDatabase();
```
:::

We can also wait for a specific subset of those side effects to finish.

::: code-group
```ts [AsyncObservable]
import { AsyncObservable } from "eventkit";

const myObservable = new AsyncObservable(async function* () {
  yield 1;
});

// database callbacks
const dbOps$ = myObservable.pipe()

const firstDatabaseSub = dbOps$.subscribe(async (value) => {
  console.log("db A:", value);
  await saveToDatabaseA(value);
});

const secondDatabaseSub = dbOps$.subscribe(async (value) => {
  console.log("db B:", value);
  await saveToDatabaseB(value);
});

// other callbacks
const otherExpensiveSub = myObservable.subscribe(async (value) => {
  console.log("other:", value);
  // let's assume that this takes longer than the database operations
  await otherExpensiveOperation(value);
});

// This will wait for the first and second database callbacks to finish
// but not be blocked by the expensive operation
await dbOps$.drain();
```
```ts [Stream]
import { Stream } from "eventkit";

const stream = new Stream<number>();

// database callbacks
const dbOps$ = stream.pipe()

const firstDatabaseSub = dbOps$.subscribe(async (value) => {
  console.log("db A:", value);
  await saveToDatabaseA(value);
});

const secondDatabaseSub = dbOps$.subscribe(async (value) => {
  console.log("db B:", value);
  await saveToDatabaseB(value);
});

// other callbacks
const otherExpensiveSub = stream.subscribe(async (value) => {
  console.log("other:", value);
  // let's assume that this takes longer than the database operations
  await otherExpensiveOperation(value);
});

stream.push(1);

// This will wait for the first and second database callbacks to finish
// but not be blocked by the expensive operation
await dbOps$.drain();
```
:::

This is especially useful when you need to enact stronger consistency guarantees (see [Event Sourcing](/guide/examples/event-sourcing)).

More can be read about how this works [here](/guide/concepts/scheduling#composing-observables).
