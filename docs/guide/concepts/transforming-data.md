---
outline: [2, 6]
---

# Transforming Data

Transforming data is a core part of eventkit. It happens through the use of operators, which are powerful utility functions that allow you to manipulate, transform, filter, and combine [observables](./observable-pattern) (like [Streams](./creating-streams)) in a declarative way. They form a crucial part of the reactive programming patterns that eventkit employs, and enables you to create complex data processing pipelines.

## Introduction to Operators

In eventkit, operators are functions that take an [observable](./observable-pattern) as input, and return a new observable that (most commonly) subscribes to the provided observable, transforms the data in some way, and yield that transformed data to the subscriber.

For example, the [`map`](/reference/eventkit/map) operator is synonymous to the Array method with the same name.

::: code-group

```ts [AsyncObservable]
import { AsyncObservable, map } from "@eventkit/base";

// Array method
[1, 2, 3].map((x) => x * x); // [1, 4, 9]

// Using operators
await AsyncObservable.from([1, 2, 3])
  .pipe(map((x) => x * x))
  .subscribe((x) => console.log("squared", x));

// outputs:
// squared 1
// squared 4
// squared 9
```

```ts [Stream]
import { Stream, map } from "@eventkit/base";

// Array method
[1, 2, 3].map((x) => x * x); // [1, 4, 9]

// Using operators
const stream = new Stream<number>();
stream.pipe(map((x) => x * x)).subscribe((x) => console.log("squared", x));

stream.push(1);
stream.push(2);
stream.push(3);

await stream.drain();

// outputs:
// squared 1
// squared 4
// squared 9
```

:::

## Chaining Operators

Operators are in-itself ordinary functions, so they could be used like `op()(obs)`. In practice, we tend to pipe many operators together which becomes quickly unreadable.

```ts
// yuck 🤮
op4()(op3()(op2()(op1()(obs))));
```

For that reason AsyncObservable provides a `pipe` method that allows you to chain operators together. Each operator in the chain takes the output of the previous operator as its input.

```ts
obs.pipe(op1(), op2(), op3(), op4());
```

To give a practical example of what multiple operators chained together looks like, let's say we want to square all the numbers in an observable, filter out the odd numbers, and then sum them all up:

```ts
import { AsyncObservable, map, filter, reduce } from "@eventkit/base";

const obs = AsyncObservable.from([-1, 2, 3, 0, 5]);

const processed$ = obs.pipe(
  map((num) => num * num), // Square each number
  filter((num) => num % 2 === 0), // Filter out odd numbers
  reduce((sum, num) => sum + num, 0) // Sum them all
);

await processed$.subscribe(console.log);

// outputs:
// "4"

// calculation:
// [-1, 2, 3, 0, 5] -> [1, 4, 9, 0, 25] (after map)
// -> [4, 0] (after filter, only even numbers remain)
// -> 4 (after reduce, 4 + 0 = 4)
```

## Singleton Operators

The output of some operators is an observable that only emits a single value. For those special cases, the observable that is returned is what is known as a "singleton" observable. (See [SingletonAsyncObservable](/reference/_eventkit/base/SingletonAsyncObservable))

All a singleton observable does is extend [AsyncObservable](/reference/_eventkit/base/AsyncObservable) class and implement the `PromiseLike` interface, which means that when it's used in an `await` statement (or with the `then` method) it will return a promise that will subscribe to the observable and resolve with the first (and only) value emitted.

This means that when dealing with a singleton observable, all you need to do is `await` the observable to get the emitted value instead of calling `subscribe` and hoisting the value out of the callback.

For example, the [`first`](/reference/_eventkit/base/first) operator is a singleton operator that emits the first value of an observable and then completes.

```ts
import { AsyncObservable, first } from "@eventkit/base";

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

Singleton observables are meant to provide a shorthand for dealing with observables that only emit a single value. They are still observables in every other way, so you can still use methods like `pipe`, `subscribe`, `drain`, etc.

## Available Operators

Eventkit provides a variety of built-in operators to handle common transformations. Below is a complete list of all the operators that ship as standard with eventkit.

### Join Operators

- [concat](/reference/_eventkit/base/concat)
- [concatAll](/reference/_eventkit/base/concatAll)
- [concatMap](/reference/_eventkit/base/concatMap)
- [merge](/reference/_eventkit/base/merge)
- [mergeAll](/reference/_eventkit/base/mergeAll)
- [mergeMap](/reference/_eventkit/base/mergeMap)

### Transformation Operators

- [buffer](/reference/_eventkit/base/buffer)
- [bufferCount](/reference/_eventkit/base/bufferCount)
- [map](/reference/_eventkit/base/map)
- [pairwise](/reference/_eventkit/base/pairwise)
- [partition](/reference/_eventkit/base/partition)
- [takeUntil](/reference/_eventkit/base/takeUntil)

### Filtering Operators

- [elementAt](/reference/_eventkit/base/elementAt)
- [filter](/reference/_eventkit/base/filter)
- [find](/reference/_eventkit/base/find)
- [findIndex](/reference/_eventkit/base/findIndex)
- [first](/reference/_eventkit/base/first)
- [last](/reference/_eventkit/base/last)
- [skip](/reference/_eventkit/base/skip)

### Error Handling Operators

- [dlq](/reference/_eventkit/base/dlq)
- [retry](/reference/_eventkit/base/retry)

### Scheduling Operators

- [withOwnScheduler](/reference/_eventkit/base/withOwnScheduler)
- [withScheduler](/reference/_eventkit/base/withScheduler)

### Boolean Operators

- [every](/reference/_eventkit/base/every)
- [isEmpty](/reference/_eventkit/base/isEmpty)

### Aggregation Operators

- [max](/reference/_eventkit/base/max)
- [min](/reference/_eventkit/base/min)
- [count](/reference/_eventkit/base/count)
- [reduce](/reference/_eventkit/base/reduce)

## Creating Custom Operators

### Use the `pipe()` operator to make new operators

If there is a commonly used sequence of operators in your code, you can use the pipe() function to extract the sequence into a new operator. Even if a sequence is not that common, breaking it out into a single operator can improve readability and reusability.

For example, you could make a function that discarded odd values and doubled even values like this:

```ts
function doubleEvens() {
  return pipe(
    filter((num: number) => num % 2 === 0),
    map((num) => num * 2)
  );
}
```

_The `pipe()` operator is analogous to the `.pipe()` method on AsyncObservable._

::: tip
When you use the pipe method, you should provide a type parameter to the first operator in the chainthat represents the type of data that will be emitted by the observable that gets operated on. This allows you to keep end-to-end type safety when hoisting transforms like this.
:::

### Creating custom operators

While eventkit provides many built-in operators, you can also create your own custom operators to implement your own transformations. An operator is most commonly a function that takes a source observable and returns a new observable that performs some transformation on the data. You'll likely never need to do this as you can achieve just about any data transformation by chaining multiple of the built-in operators together.

```ts
import { AsyncObservable, type OperatorFunction } from "@eventkit/base";

// Custom operator that doubles even numbers and filters out odd numbers
function doubleEvens<T extends number>(): OperatorFunction<T, T> {
  return (source) =>
    // see note below this block on what `source.AsyncObservable` is
    new source.AsyncObservable<T>(async function* () {
      for await (const value of source) {
        if (value % 2 === 0) {
          yield (value * 2) as T;
        }
      }
    });
}

// Usage
const numbers = AsyncObservable.from([1, 2, 3, 4]);
const doubledEvens = numbers.pipe(doubleEvens());

await doubledEvens.subscribe((value) => {
  console.log(`Doubled even: ${value}`);
});

// outputs:
// first yield - nothing logged (odd)
// second yield - "Doubled even: 4"
// third yield - nothing logged (odd)
// fourth yield - "Doubled even: 8"
```

::: info
`source.AsyncObservable` is a pattern used to declare that the returned observable is a child of the source observable. This is used for scheduling purposes and allows us to add any work of the child observable to the parent observable's scheduler. More details can be found [here](./scheduling#composing-observables).
:::

::: tip
In case you get stuck trying to implement your own operator, the source code of all the existing operators are available [here](https://github.com/hntrl/eventkit/blob/main/packages/eventkit/lib/operators).
:::
