# Available Operators

Under construction 🚧

### Transformation Operators

- [buffer](/guide/reference/operators/buffer)
- [bufferCount](/guide/reference/operators/bufferCount)
- [map](/guide/reference/operators/map)
- [partition](/guide/reference/operators/partition)

### Join Operators

- [concat](/guide/reference/operators/concat)
- [concatAll](/guide/reference/operators/concatAll)
- [concatMap](/guide/reference/operators/concatMap)
- [merge](/guide/reference/operators/merge)
- [mergeAll](/guide/reference/operators/mergeAll)
- [mergeMap](/guide/reference/operators/mergeMap)

### Filtering Operators

- [elementAt](/guide/reference/operators/elementAt)
- [filter](/guide/reference/operators/filter)
- [takeUntil](/guide/reference/operators/takeUntil)

### Error Handling Operators

- [dlq](/guide/reference/operators/dlq)
- [retry](/guide/reference/operators/retry)

### Aggregation Operators

- [count](/guide/reference/operators/count)
- [reduce](/guide/reference/operators/reduce)

### Scheduling Operators

- [withScheduler](/guide/reference/operators/withScheduler)
- [withOwnScheduler](/guide/reference/operators/withOwnScheduler)



<!--
- [buffer](/guide/reference/operators/buffer)
- [map](/guide/reference/operators/map)
- [partition](/guide/reference/operators/partition)
- [takeUntil](/guide/reference/operators/takeUntil)

### Filtering Operators

- [filter](/guide/reference/operators/filter)

### Filtering Operators

#### `filter<T>(predicate: (value: T, index: number) => boolean)`

The `filter` operator emits only values that pass the specified predicate test.

**Example:**

```typescript
import { Stream, filter } from "eventkit";

// Create a stream of numbers
const numberStream = new Stream<number>();

// Filter out odd numbers
const evenStream = numberStream.pipe(filter((num) => num % 2 === 0));

// Subscribe to the filtered stream
evenStream.subscribe((even) => {
  console.log(`Even number: ${even}`);
});

// Push values to the original stream
numberStream.push(1); // Nothing logged
numberStream.push(2); // Logs: Even number: 2
numberStream.push(3); // Nothing logged
numberStream.push(4); // Logs: Even number: 4
```

### Aggregation Operators

#### `reduce<T, R>(accumulator: (acc: R, value: T, index: number) => R, seed: R)`

The `reduce` operator applies an accumulator function to each value and emits the final accumulated result when the source completes.

**Example:**

```typescript
import { Stream, reduce } from "eventkit";

// Create a stream of numbers
const numberStream = new Stream<number>();

// Sum all numbers
const sum = numberStream.pipe(reduce((acc, num) => acc + num, 0));

// Subscribe to get the final sum
sum.subscribe((total) => {
  console.log(`Total sum: ${total}`);
});

// Push values
numberStream.push(1);
numberStream.push(2);
numberStream.push(3);

// When we're done, cancel the stream to get the final result
numberStream.cancel(); // Logs: Total sum: 6
```

#### `count<T>()`

The `count` operator counts the number of values emitted by the source observable and emits this count when the source completes.

**Example:**

```typescript
import { Stream, count } from "eventkit";

const eventStream = new Stream<string>();
const eventCount = eventStream.pipe(count());

eventCount.subscribe((total) => {
  console.log(`Total events: ${total}`);
});

eventStream.push("event1");
eventStream.push("event2");
eventStream.push("event3");

eventStream.cancel(); // Logs: Total events: 3
```

### Utility Operators

#### `elementAt<T>(index: number, defaultValue?: T)`

Emits the value at the specified index in the sequence of emitted values.

**Example:**

```typescript
import { Stream, elementAt } from "eventkit";

const stream = new Stream<string>();
const thirdElement = stream.pipe(elementAt(2));

thirdElement.subscribe((value) => {
  console.log(`Third element: ${value}`);
});

stream.push("first");
stream.push("second");
stream.push("third"); // Logs: Third element: third
stream.push("fourth"); // Nothing logged
```

### Combination Operators

#### `merge<T>(...sources: AsyncObservableInput<T>[])`

Combines multiple streams into a single stream that emits values from all input streams.

**Example:**

```typescript
import { Stream, merge } from "eventkit";

const stream1 = new Stream<number>();
const stream2 = new Stream<number>();

const mergedStream = merge(stream1, stream2);

mergedStream.subscribe((value) => {
  console.log(`Received: ${value}`);
});

stream1.push(1); // Logs: Received: 1
stream2.push(2); // Logs: Received: 2
stream1.push(3); // Logs: Received: 3
```

#### `concat<T>(...sources: AsyncObservableInput<T>[])`

Concatenates multiple streams by subscribing to them in sequence, emitting values from the first until it completes, then moving to the next.

**Example:**

```typescript
import { Stream, concat } from "eventkit";

const stream1 = new Stream<number>();
const stream2 = new Stream<number>();

const concatStream = concat(stream1, stream2);

concatStream.subscribe((value) => {
  console.log(`Received: ${value}`);
});

stream1.push(1); // Logs: Received: 1
stream2.push(2); // Nothing logged yet
stream1.push(3); // Logs: Received: 3
stream1.cancel(); // Now stream2's values will be emitted
stream2.push(4); // Logs: Received: 4
```

### Partitioning Operators

#### `partition<T>(predicate: (value: T, index: number) => boolean)`

Splits a stream into two streams: one with values that satisfy the predicate and one with values that don't.

**Example:**

```typescript
import { Stream, partition } from "eventkit";

const numberStream = new Stream<number>();
const [evenStream, oddStream] = partition(numberStream, (num) => num % 2 === 0);

evenStream.subscribe((num) => console.log(`Even: ${num}`));
oddStream.subscribe((num) => console.log(`Odd: ${num}`));

numberStream.push(1); // Logs: Odd: 1
numberStream.push(2); // Logs: Even: 2
numberStream.push(3); // Logs: Odd: 3
numberStream.push(4); // Logs: Even: 4
```

### Buffer Operators

#### `buffer<T>(closing: AsyncObservableInput<any>)`

Collects values from the source stream and emits them as an array when the closing stream emits.

**Example:**

```typescript
import { Stream, buffer } from "eventkit";

const dataStream = new Stream<number>();
const flushStream = new Stream<void>();

const bufferedStream = dataStream.pipe(buffer(flushStream));

bufferedStream.subscribe((buffer) => {
  console.log(`Received buffer: [${buffer.join(", ")}]`);
});

dataStream.push(1);
dataStream.push(2);
dataStream.push(3);
flushStream.push(); // Logs: Received buffer: [1, 2, 3]

dataStream.push(4);
dataStream.push(5);
flushStream.push(); // Logs: Received buffer: [4, 5]
```

### Flow Control Operators

#### `takeUntil<T>(notifier: AsyncObservableInput<any>)`

Emits values from the source stream until the notifier stream emits a value.

**Example:**

```typescript
import { Stream, takeUntil } from "eventkit";

const dataStream = new Stream<number>();
const stopStream = new Stream<void>();

const limitedStream = dataStream.pipe(takeUntil(stopStream));

limitedStream.subscribe((value) => {
  console.log(`Received: ${value}`);
});

dataStream.push(1); // Logs: Received: 1
dataStream.push(2); // Logs: Received: 2
stopStream.push(); // Stops the limitedStream from receiving more values
dataStream.push(3); // Nothing logged
``` -->
