# [eventkit](https://hntrl.github.io/eventkit/) — [![GitHub license][license-badge]][license-url] [![npm][npm-badge]][npm-url] [![build][build-badge]][build-url] [![PRs Welcome][prs-badge]][prs-url]

[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
[license-url]: https://github.com/hntrl/eventkit/blob/main/LICENSE.md
[npm-badge]: https://img.shields.io/npm/v/eventkit
[npm-url]: https://www.npmjs.com/package/eventkit
[build-badge]: https://img.shields.io/github/actions/workflow/status/hntrl/eventkit/test.yml
[build-url]: https://github.com/hntrl/eventkit/actions/workflows/test.yml
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[prs-url]: https://legacy.reactjs.org/docs/how-to-contribute.html#your-first-pull-request

Eventkit is a library for defining, composing, and observing asynchronous streams of data.

- **Declarative** 🌍: Build complex data streams using a simple, declarative API inspired by RxJS and Node.js streams
- **Async-First Architecture** ⚡️: Built on modern async iterators and generators, making it perfect for handling real-time data and I/O operations
- **Batteries Included** 🔋: Super clean APIs, first-class TypeScript support with full type inference, and all the extras included
- **Lightweight & Modular** 📦: Zero external dependencies and a modular design that lets you only import what you need

You can learn more about the use cases and features of Eventkit in the [official documentation](https://hntrl.github.io/eventkit/guide/what-is-eventkit/).

## Basic Usage

The best way to start using Eventkit is by checking out the [getting started](https://hntrl.github.io/eventkit/guide/getting-started/) guide.

Here's a basic example of how to use an eventkit stream:

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

## Documentation

View the official eventkit documentation [here](https://hntrl.github.io/eventkit/).

## Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) guide for more information on how to get involved.

## License

Distributed under the MIT License. See the [LICENSE](LICENSE.md) for more information.