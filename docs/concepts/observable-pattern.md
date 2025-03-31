---
outline: [2, 6]
---

# Observable Pattern

In programming, you often write code or instructions with the expectation that they will be executed in a serial, one-at-a-time fashion in the order they are written. But what about when you want to execute code or instructions in parallel? Or when you want to execute code or instructions in a way that is not interdependent of each other?

The observable pattern is one of many answers to this problem. It allows you to write code or instructions that will be executed in parallel and their results later recaptured in an arbitrary order. Rather than calling a function and waiting for it to finish, you define the mechanism by which data is retrieved and transformed in the form of an "observable", watch for any data that is yielded by "observing" the observable, and responding accordingly. Eventkit uses this pattern as its core mechanism for handling asynchronous data.

You can think of an observable as a first-class object that represents a collection of events over time. They're like Promises but for multiple values. Instead of waiting for a producer to evaluate a value and then distribute it to a consumer (like a synchronous function call or a promise), an observable is different in that as it's evaluating, a consumer is responding to anything that is yielded by the producer, which can happen multiple times as the producer is executing.

An advantage of this pattern is that it allows you to define tasks that consume this collection in a way that is interdependent of each other. If you think about how a function works, it doesn't care about how its return value is being used, it just passes it to the caller. Observables act as a similar abstraction, with the key difference being that they can return multiple values over time.

**TL;DR** ⎯ Observables provide a way to evaluate a collection of data over time.

|              | single items | multiple items |
| ------------ | ------------ | -------------- |
| synchronous  | function     | iterator       |
| asynchronous | promise      | observable     |

There are plenty of schools of thought on how best to describe this model of asynchronous programming. [Reactive programming](https://en.wikipedia.org/wiki/Reactive_programming), the "[reactor pattern](https://en.wikipedia.org/wiki/Reactor_pattern)", and the "[observer pattern](https://en.wikipedia.org/wiki/Observer_pattern)" are all different ways of describing similar concepts. The reactor pattern is the most similar to what an Observable is in the context of eventkit.

## Push vs. Pull {#push-vs-pull}

To go deeper into detail on where the observable pattern fits in, it's beneficial to illustrate the difference between _push_ and _pull_.

_Push and Pull are two different ways of describing how data is transferred from a producer to a consumer._

**What is push?** In push systems, the producer determines when to send data to the consumer. The consumer doesn't have any idea of when it will receive data.

Promises are a good example of a push system in JavaScript. A promise (the producer) delivers a resolved value to a callback (the consumer; `then`, `catch`, `await`, etc.). Unlike functions, it's the promise that determines when the value is delivered (i.e. by calling `resolve` or `reject`).

**What is pull?** In pull systems, the consumer determines when it receives data from the producer. The producer doesn't have any idea of when it will receive a request, and it's unaware of when the data will be delivered to the consumer.

Every function is a pull system. The function is a producer of data, and the code that calls the function is consuming it by "pulling" the data from the return value of the function.

Generator functions and iterators are another type of pull system. Code that calls `iterator.next()` (like through `for await` loops) is the consumer, pulling data from the iterator (the producer).

|          | Pull                                                        | Push                                       |
| -------- | ----------------------------------------------------------- | ------------------------------------------ |
| Producer | **Active:** produces data when requested by the consumer    | **Passive:** produces data at its own pace |
| Consumer | **Passive:** decides when to request data from the producer | **Active:** reacts to received data        |

The observable pattern is a push system. An observable is a producer of any number of values, "pushing" them to its observers.

- A function is a lazily evaluated computation that returns a single value when invoked.
- A promise is a computation that may or may not return a single value.
- A generator is a lazily evaluated computation that returns any number of values on iteration.
- An observable is a lazily evaluated computation that may or may not yield any number of values.

## Using AsyncObservable

AsyncObservable is eventkit's implementation of the observable pattern. The implementation is slightly different than the Observable primitive that is familiar to the JavaScript ecosystem, so it's named this way to avoid confusion (more on this in the [Motivations](/motivations) section).

Eventkit relies on the [async iterator/generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator) pattern as the mechanism to yield values to its subscribers. This means that the producer of the observable is an async generator function in itself.

The following example demonstrates an AsyncObservable that yields 3 numbers.

```ts
import { AsyncObservable } from "eventkit";

const myObservable = new AsyncObservable(async function* () {
  yield 1;
  yield 2;
  yield 3;
});
```

To invoke the observable, we need to add a subscriber to it. The subscriber (or the observer) is a function that will be called with each value that is yielded by the producer.

```ts
myObservable.subscribe((value) => {
  console.log("output", value);
});
```

Which will output:

```
output 1
output 2
output 3
```

It's worth noting that as a result of yielding values, the observable is not sequentially waiting for each value to be logged via the subscriber's callback before continuing (hence the name AsyncObservable). Instead, the execution of the subscriber's callback with the value that's yielded is added to a [Scheduler](/concepts/async-processing#scheduler) which controls the execution behavior of the observable.

For instance, given the following example:

```ts
import { AsyncObservable } from "eventkit";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const myObservable = new AsyncObservable(async function* () {
  console.log("yielding 1");
  yield 1;
  console.log("yielding 2");
  yield 2;
  console.log("yielding 3");
  yield 3;
});

console.log("subscribing");
myObservable.subscribe(async (value) => {
  await delay(1000 - value * 100);
  console.log("output", value);
});
console.log("done");
```

We can expect the following output:

```
subscribing
done
yielding 1
yielding 2
yielding 3
output 3
output 2
output 1
```

A couple of things to note here:

1. `output 3` is logged before `output 2` and `output 1`. Since a higher value yielded means a shorter delay in the callback, it takes less time for `console.log` to get called if the value is higher. This is to demonstrate that the callbacks don't happen in sequential order by default.
2. `done` is logged before any of the `output` callbacks are executed. This is to demonstrate that executing an observable doesn't block the main thread from executing.

We can better control this execution in the following ways:

1. Providing a different Scheduler to the AsyncObservable to control the behavior of the callbacks (an example of this in [Scheduling](/concepts/scheduling#queue-scheduler))
2. Awaiting the subscriber, which will resolve when all the values in the observable have been yielded and all callbacks have finished executing
3. Awaiting the `drain()` method of the AsyncObservable, which will resolve when all current subscribers have finished executing

For instance, if we wanted to wait for all the values to be yielded before logging "done", we could do so in the following ways:

```ts
console.log("subscribing");
// await the subscriber to finish
await myObservable.subscribe(async (value) => {
  await delay(1000 - value * 100);
  console.log("output", value);
});
console.log("done");

// or

console.log("subscribing");
myObservable.subscribe(async (value) => {
  await delay(1000 - value * 100);
  console.log("output", value);
});
// await for all subscribers of the observable to finish
await myObservable.drain();
console.log("done");
```

In either case, we can expect the following output:

```
subscribing
yielding 1
yielding 2
yielding 3
output 3
output 2
output 1
done
```

### Subscribing to an AsyncObservable

```ts
observable.subscribe((x) => console.log(x));
```

Each time you subscribe to an observable, a new execution is created. This means that if you subscribe to an observable multiple times, you'll get multiple executions. An execution created this way for sake of simplicity is an execution of the generator function provided to the AsyncObservable (the producer) which delivers values to the provided callback (the consumer).

::: tip
Subscribing to an AsyncObservable is like calling a function, with the callback being representative of where the data is being delivered to.
:::

An alternative way of subscribing to an observable is using it like a generator in a `for await` loop.

```ts
for await (const value of observable) {
  console.log(value);
}
```

This is a shorthand that subscribes to the observable and iterates over the values it yields. It's a more concise way of subscribing to an observable, but it's not recommended for a number of reasons:

1. We have no way to observe the side effects being done as a result of the values yielded by the observable.
2. All values emitted by the observable will be handled sequentially, negating a large benefit of AsyncObservable.
3. This can potentially block the observable from ever resolving if the for await loop isn't managed properly.

The only notable exception to this is when you're subscribing to an observable inside of an observable (i.e. [operators](/concepts/transforming-data#creating-custom-operators)) since the execution of an observable is inherently tracked as apart of its life cycle.

### Disposing AsyncObservable Executions

Because each execution is a new instance of the generator function, and since these executions may be infinite, it's possible to dispose of them when they're no longer needed. Since each execution is exclusive to each `subscribe()` call, we can control the execution lifecycle by calling `cancel()` on the subscriber.

```ts
const sub = observable.subscribe((x) => console.log(x));
await sub.cancel();
```

Internally, this calls the `return()` method on the generator function which marks the end of the execution. Consequently we can also use this to handle any cleanup that needs to be done when the generator is disposed of by way of a `try/finally` block ([MDN Reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#errors_during_iteration)):

```ts
const myObservable = new AsyncObservable(async function* () {
  try {
    yield 1;
    await delay(10000);
    yield 2;
  } finally {
    console.log("🧹 cleaning up");
  }
});

const sub = myObservable.subscribe(console.log);
await sub.cancel();

// output:
// 🧹 cleaning up
```

Because of the way that generators work, the finally block will also execute when all the values have been yielded and we've reached the end of the generator. This makes it good to handle any observables that keep open resources.

```ts
// ... same as above

await myObservable.subscribe(console.log);

// output:
// 1
// (10000 ms later)
// 2
// 🧹 cleaning up
```

In cases where you use for await loops, the cleanup is also implicitly handled by the loop whenever an early return is encountered.

```ts
// ... same as above

for await (const value of myObservable) {
  // instantly break out of the loop
  break;
}

// output:
// 🧹 cleaning up
```

You can also use the `cancel()` method on the observable to dispose of all current executions.

```ts
myObservable.subscribe(console.log);
myObservable.subscribe(console.log);
await myObservable.cancel();

// output:
// 🧹 cleaning up
// 🧹 cleaning up
```

### AsyncObservable lifecycle

A big benefit that comes from using AsyncObservable is that it provides a way to observe the executions and side effects that come from the observable, including any errors that are thrown. This is described in more detail in the [Async Processing](/concepts/async-processing) section.

## Observables are like functions

A common gotcha with the observable pattern is the baseline assumption is that an observable acts like a pub/sub system or EventEmitter. This is not the case (although an observable does act as a good abstraction for this, see [Creating Streams](/concepts/creating-streams)).

Consider the following example:

```ts
function foo() {
  console.log("foo");
  return 1;
}

console.log(foo());
console.log(foo());
```

We can expect the output to be:

```
foo
1
foo
1
```

We can replicate this behavior using an observable:

```ts
const fooObservable = new AsyncObservable(async function* () {
  console.log("foo");
  yield 1;
});

await fooObservable.subscribe(console.log);
await fooObservable.subscribe(console.log);
```

We can again expect the output to be:

```
foo
1
foo
1
```

This is because both functions and observables are lazy computations. If you don't subscribe to an observable or call a function, `console.log('foo')` will never be called. In both cases "calling" the function or "subscribing" to the observable is the trigger that causes the computation to execute. EventEmitter is different in that the side effects are shared and have an eager execution regardless of the existence of subscribers. Observables have no shared execution and are lazy.

## Async iterators/generators

It's worth noting that the AsyncObservable solves a very similar problem to the [async iterator/generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator) pattern. In the table above, a more accurate comparison would be:

|              | single items | multiple items                           |
| ------------ | ------------ | ---------------------------------------- |
| synchronous  | function     | iterator                                 |
| asynchronous | promise      | ~~observable~~ async iterator/observable |

For instance, the following example is synonymous with the AsyncObservable example we provided above:

```ts
async function* generator() {
  yield* [1, 2, 3];
}

for await (const value of generator()) {
  // this could be best described as the "subscriber callback"
  console.log("output", value);
}
```

The important distinction to make here is that the `for await` loop is the consumer, **pulling** data from the generator (or the producer). Even though the for await loop must be called asynchronously, the values are still processed by the loop in a sequential fashion.

AsyncObservable augments the generator pattern by orchestrating the **pushing** side of the equation; the observable handles the _pulling_ of values from the generator and does the work of _pushing_ them to the consumer.

While this detail seems simple, it justifies the existence of the observable, and enables a lot more control over the side effects that come from values yielded by the observable.

- Generators don't have any visibility into the handling of the values it yields; observables do.
- Generators don't have any way to make a distinction between the objects that are accessing it; observables do and they're called subscribers.
- Generators work under the assumption that the consumer will handle the values in a sequential fashion; observables enable a more flexible execution model.
