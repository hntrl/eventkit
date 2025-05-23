`@eventkit/base` is the primary package in the eventkit project.

## Installation

```sh
npm i @eventkit/base
```

### Using a CDN

This package also bundles a browser-friendly version that can be accessed using a CDN like [unpkg](https://unpkg.com/).

```html
<!-- Development -->
<script src="https://unpkg.com/@eventkit/base/dist/index.global.js"></script>
<!-- Minified -->
<script src="https://unpkg.com/@eventkit/base/dist/index.global.min.js"></script>
```

When imported this way, all exports are available on the `eventkit` global variable.

```js
const { Stream, filter } = eventkit;
```

## Basic Example

This is a basic example of how to use an eventkit stream. To get started, you should check out the [Getting Started](https://hntrl.github.io/eventkit/guide/getting-started) guide.

```typescript
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

## Related Resources

- [eventkit](https://github.com/hntrl/eventkit)
- [Getting Started](https://hntrl.github.io/eventkit/guide/getting-started)
- [API Reference](https://hntrl.github.io/eventkit/reference/_eventkit/base)
- [Changelog](./CHANGELOG.md)
