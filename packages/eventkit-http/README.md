`@eventkit/http` is a package that provides HTTP utilities for eventkit.

## Installation

```sh
npm i @eventkit/http
```

### Using a CDN

This package also bundles a browser-friendly version that can be accessed using a CDN like [unpkg](https://unpkg.com/).

```html
<!-- Development -->
<script src="https://unpkg.com/@eventkit/http/dist/index.global.js"></script>
<!-- Minified -->
<script src="https://unpkg.com/@eventkit/http/dist/index.global.min.js"></script>
```

When imported this way, all exports are available on the `eventkit.http` global variable.

```js
const { EventSource } = eventkit.http;
```

## Related Resources

- [HTTP Streaming](https://hntrl.github.io/eventkit/guide/examples/http-streaming)
- [API Reference](https://hntrl.github.io/eventkit/reference/_eventkit/http)
- [Changelog](./CHANGELOG.md)
