---
"@eventkit/base": minor
---

Introduces `SingletonAsyncObservable`; a utility class for observables that lets you access the value emitted by observables that emit one (and only one) value (like the observables returned from `reduce()`, `count()`, etc.) using native await syntax.

This makes the consumption of these single value operators a little bit more readable. For instance:

```ts
const obs = AsyncObservable.from([1, 2, 3]);
const singleton = obs.pipe(first());

// instead of this:
let firstValue: number | undefined;
await obs.subscribe((value) => {
  firstValue = value;
});
console.log(firstValue); // 1

// you can just do this:
console.log(await singleton); // 1
```
