# Transforming Data

Transforming data is a core part of eventkit. It happens through the use of operators, which are powerful utility functions that allow you to manipulate, transform, filter, and combine [observables](/guide/concepts/observable-pattern) (like [Streams](/guide/concepts/creating-streams)) in a declarative way. They form a crucial part of the reactive programming patterns that eventkit employs, and enables you to create complex data processing pipelines.

## Introduction to Operators

In eventkit, operators are functions that take an observable as input, and return a new observable that (most commonly) subscribes to the provided observable, transform the data in some way, and yield that transformed data to the subscriber.

For example, the `map` operator is synonymous to the Array method with the same name.

::: code-group

```ts [Stream]
import { Stream, map } from "eventkit";

// Array method
[1, 2, 3].map((x) => x * x); // [1, 4, 9]

// Using operators
const stream = new Stream<number>();
stream
  .pipe(map((x) => x * x))
  .subscribe((x) => console.log("squared", x));

stream.push(1);
stream.push(2);
stream.push(3);

await stream.drain();

// outputs:
// squared 1
// squared 4
// squared 9
```

```ts [AsyncObservable]
import { AsyncObservable, map } from "eventkit";

// Array method
[1, 2, 3].map((x) => x * x); // [1, 4, 9]

// Using operators
AsyncObservable.from([1, 2, 3])
  .pipe(map((x) => x * x))
  .subscribe((x) => console.log("squared", x));

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

To give a practical example of what multiple operators chained together looks like, let's say we want to square all the numbers in an array, filter out the odd numbers, and then sum them all up:

```ts
import { AsyncObservable, map, filter, reduce } from "eventkit";

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

## Available Operators

Eventkit provides a variety of built-in operators to handle common transformations. A complete reference of all operators can be found [here](/guide/reference/operators).

## Creating Custom Operators

### Use the `pipe()` operator to make new operators

If there is a commonly used sequence of operators in your code, you can use the pipe() function to extract the sequence into a new operator. Even if a sequence is not that common, breaking it out into a single operator can improve readability and reusability.

For example, you could make a function that discarded odd values and doubled even values like this:

```ts
function doubleEvens() {
  return pipe(
    filter((num) => num % 2 === 0),
    map((num) => num * 2)
  );
}
```

_The `pipe()` operator is analogous to the `.pipe()` method on AsyncObservable._

### Creating custom operators

While eventkit provides many built-in operators, you can also create your own custom operators to implement your own transformations. An operator is most commonly a function that takes a source observable and returns a new observable that performs some transformation on the data.

```ts
import { AsyncObservable, type OperatorFunction } from "eventkit";

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

`source.AsyncObservable` is a pattern used to declare that the returned observable is a child of the source observable. This is used for scheduling purposes and allows us to add any work of the child observable to the parent observable's scheduler. More details can be found [here](/guide/concepts/scheduling#composing-observables).

In case you get stuck trying to implement your own operator, the source code of all the existing operators are available [here](https://github.com/hntrl/eventkit/blob/main/packages/eventkit/lib/operators).
