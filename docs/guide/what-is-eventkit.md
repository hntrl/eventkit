# What is eventkit?

Eventkit is a TypeScript library designed for defining, composing, and observing asynchronous streams of data. It simplifies the handling of data streams, making it easier to build reactive and event-driven applications.

<div class="tip custom-block" style="padding-top: 8px">

Want to try it out? Jump to [Getting Started](./getting-started.md).

</div>

## Use Cases

- **Real-Time Applications**: Eventkit's ability to handle real-time data streams makes it ideal for building applications that require fast, responsive user interfaces. If you're developing dashboards, chat applications, or live analytics tools, eventkit provides the primitives needed to process and react to continuous data flows without the mountains of boilerplate.

- **Reactive Programming**: Eventkit is built on well-established reactive principles which allows you to build applications that respond to changes in data in a declarative manner. The library's composable operators let you transform, filter, and combine streams, creating complex data processing pipelines with clean, maintainable code that accurately models your business logic.

- **Web or Server**: Eventkit works natively in any modern JavaScript runtime, making it versatile for frontend applications, backend services, or full-stack implementations. The same code can power real-time UI updates in the browser and handle high-throughput event processing on the server, simplifying your architecture. (eventkit even gives you the tools for having streams communicate between the browser and server!)

- **Data Processing**: Build efficient data transformation pipelines that process, filter, and aggregate streams of information with minimal overhead. Eventkit's scheduling capabilities give you fine-grained control over how and when work is executed, allowing you to optimize for throughput, latency, or resource usage depending on your specific requirements.

## Basic Example

```ts
import { Stream, filter } from "@eventkit/base";

// Create a stream of events
const stream = new Stream<{ type: string; payload: any }>();

// Filter for specific event types
const userEvents = stream.pipe(filter((event) => event.type.startsWith("user.")));
// Subscribe to the filtered stream
userEvents.subscribe((event) => {
  console.log(`Received user event: ${event.type}`);
});

// Push events to the stream
stream.push({ type: "user.login", payload: { userId: "123" } });
stream.push({ type: "system.update", payload: { version: "1.0.1" } }); // This won't be logged

// Wait for all events to be processed
await stream.drain();
```

## Features

### ⚡️ Powerful Async Primitives

Eventkit provides robust primitives for working with asynchronous data:

- **AsyncObservable**: A powerful implementation of the observable pattern that works with async iterators, allowing you to handle multiple values over time.
- **Stream**: A specialized observable that can be pushed to indefinitely, perfect for modeling event streams and real-time data.
- **Operators**: A rich set of composable operators for transforming, filtering, and combining streams of data.

### ⏱️ Fine-Grained Control

One of eventkit's most powerful features is its scheduling system:

- **Independent Control**: Every observable can adopt different async behaviors, giving you precise control over execution timing.
- **Side Effect Management**: Control exactly how and when side effects are executed in your application.
- **Consistency Guarantees**: Use `drain()` to wait for specific operations to complete before proceeding, enabling strong consistency when needed.

### 🔍 Type-Safe by Design

Eventkit is built with TypeScript from the ground up:

- **Full Type Safety**: Get compile-time checks and IDE autocompletion for all operations.
- **Predictable Interfaces**: Well-defined interfaces make it easy to understand how components interact.
- **Error Handling**: Comprehensive error propagation ensures issues are caught and handled appropriately.

### 🔄 Composable Architecture

Build complex data flows from simple building blocks:

- **Pipe-Based API**: Chain operators together to create sophisticated data transformation pipelines.
- **Reusable Components**: Create and share common patterns across your application.
- **Declarative Style**: Express what you want to happen, not how it should happen.
