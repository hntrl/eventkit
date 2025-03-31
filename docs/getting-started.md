# Getting Started

In this guide, we'll walk through the fundamentals and tell you how to go from 0 to 100 with eventkit.

## Installation

::: code-group

```sh [npm]
npm install eventkit
```

```sh [yarn]
yarn add eventkit
```

```sh [pnpm]
pnpm add eventkit
```

```sh [bun]
bun add eventkit
```
:::

## A Simple Example

Let's create a simple example to demonstrate how eventkit works. We'll create a stream of events and filter them based on a condition.

```typescript
import { Stream, filter } from "eventkit";

// Create a stream of events
const stream = new Stream<{ type: string; payload: any }>();

// Filter for specific event types
const userEvents = stream.pipe(
  filter(event => event.type.startsWith("user."))
);

// Subscribe to the filtered stream
userEvents.subscribe(event => {
  console.log(`Received user event: ${event.type}`);
});

// Push events to the stream
stream.push({ type: "user.login", payload: { userId: "123" } });
stream.push({ type: "system.update", payload: { version: "1.0.1" } }); // This won't be logged

// Wait for all events to be processed
await stream.drain();
```

## Basic Concepts

Eventkit revolves around a few core concepts:

- [**AsyncObservable**](/concepts/observable-pattern#using-asyncobservable): A powerful implementation of the observable pattern that handles asynchronous data streams, allowing you to process multiple values over time.
- [**Stream**](/concepts/creating-streams): A specialized observable that can be pushed to indefinitely and provides fine-grained control over execution timing, perfect for real-time data and event-driven applications.
- [**Operators**](/concepts/transforming-data): Composable functions that transform, filter, and combine data streams, enabling you to build complex data processing pipelines with clean, declarative code.
- [**Schedulers**](/concepts/scheduling#the-scheduler-object): Components that coordinate work execution, giving you precise control over how and when side effects occur in your application.

## Next Steps

Now that you have a basic understanding of how to use Eventkit, you can explore more advanced features and concepts:

- **[What is Eventkit?](/what-is-eventkit.md)**: Learn more about the library and its use cases.
- **[Creating Streams](/concepts/creating-streams)**: Learn how to create and manipulate streams.
- **[Transforming Data](/concepts/transforming-data)**: Learn how to transform data in streams.
- **[Observable Pattern](/concepts/observable-pattern)**: Understand the core principles of eventkit.

