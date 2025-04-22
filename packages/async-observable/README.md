`@eventkit/async-observable` is the package that provides the `AsyncObservable` class. This is exported separately from the main package to separate the implementation details of the observable pattern from the rest of the API.

## Installation

```sh
npm i @eventkit/async-observable
```

### Using a CDN

This package also bundles a browser-friendly version that can be accessed using a CDN like [unpkg](https://unpkg.com/).

```html
<!-- Development -->
<script src="https://unpkg.com/@eventkit/async-observable/dist/index.global.js"></script>
<!-- Minified -->
<script src="https://unpkg.com/@eventkit/async-observable/dist/index.global.min.js"></script>
```

When imported this way, all exports are available on the `eventkit.asyncObservable` global variable.

```js
const { AsyncObservable } = eventkit.asyncObservable;
```

## Related Resources

- [Observable Pattern](https://hntrl.github.io/eventkit/guide/concepts/observable-pattern)
- [API Reference](https://hntrl.github.io/eventkit/reference/eventkit/AsyncObservable)
- [Changelog](./CHANGELOG.md)
