---
outline: [2, 3]
---

# Motivations

Eventkit centers itself around solving two higher-order problems:

- How do we observe values over time in a collection?
- How do we observe the [side effects](https://en.wikipedia.org/wiki/Side_effect_(computer_science)) that come from observing those values?

These problems are particularly relevant in modern JavaScript applications where asynchronous operations are ubiquitous. Traditional approaches to handling asynchronous code, such as callbacks or even Promises, often fall short when dealing with complex sequences of events or when needing to track the status of operations triggered by those events.

The first problem (observing values over time) is about creating a consistent pattern for handling streams of data that may arrive at unpredictable intervals. This could be user interactions, network responses, or any other source of events that occur over time rather than all at once.

The second problem (observing side effects) addresses the challenge of monitoring and managing the consequences of processing these values. When an observable emits a value and a subscriber processes it, that processing might trigger additional operations like API calls, state updates, or DOM manipulations. Being able to track these side effects is crucial for ensuring that all operations complete properly, especially in environments with limited execution contexts like serverless.

By tackling these two problems together, eventkit provides a comprehensive solution for reactive programming that goes beyond just handling asynchronous data streams. It offers a way to orchestrate and monitor the entire flow of data and the effects it produces throughout your application.

### History of the Observable pattern

Eventkit does this by offering an alternative implementation of the [Observable Pattern](/concepts/observable-pattern) that's built on top of async generators. However, the Observable pattern is not a new concept and it's worth mentioning it's tenure in the JavaScript ecosystem.

Observables have a history of being used within JavaScript, even going so far as to be proposed as a standard for the language by way of a [TC39 proposal](https://github.com/tc39/proposal-observable) in May of 2015. The TC39 proposal ultimately failed to gain traction in part due to some opposition that the API wasn't suitable to be a language-level primitive. The Observable pattern has still survived in the form of being implemented by libraries like RxJS, and has even made a reprisal to become a [web standard](https://github.com/wicg/observable).

Regardless of the state that the observable pattern is in (between being a userland problem vs. a language-level primitive), it's still a beneficial pattern that's used extensively in the JavaScript ecosystem, eventkit included.

## Why not RxJS?

[RxJS](https://rxjs.dev/) is a well-established library (which eventkit takes **a lot** of inspiration and concepts from) that has largely led the charge for implementing a reactive programming model in JavaScript. Eventkit differentiates itself primarily in how it handles handles the second higher-order problem of observing side effects.

### RxJS is inherently synchronous

RxJS operates on a synchronous execution model. This means that when an observable emits a value, the associated side effects are executed immediately on the main thread. This synchronous nature can be advantageous in scenarios where immediate execution is necessary, such as orchestrating blocking work that cannot be deferred.

However, this approach also presents challenges. When dealing with computationally expensive operations, executing them synchronously can lead to performance bottlenecks. The call stack may become blocked, resulting in a sluggish user interface or delayed processing of subsequent events. While RxJS provides mechanisms to schedule tasks asynchronously using the microtask queue, this introduces complexity, can obscure the execution flow of side effects, and loses the ability to observe the status of those side effects.

**TL;DR** ⎯ while RxJS's synchronous model is suitable for certain use cases, it requires careful management to avoid performance issues, especially in applications with heavy computational demands.

### eventkit is inherently asynchronous

In contrast, eventkit is designed with asynchronicity at its core. By leveraging JavaScript's async/await primitives, eventkit provides a more natural and intuitive way to handle its asynchronous nature. This design choice aligns with the fundamental purpose of observables: to represent data that changes over time.

With eventkit, the execution and side effects of observables are managed asynchronously which allows for non-blocking execution. This means the mechanism by which an observable emits a value and pushes it to its consumers inherently allows the call stack to continue execution. This approach is particularly beneficial in environments where responsiveness is critical, such as web applications with complex user interfaces or serverless functions.

### Why is the distinction important?

The distinction between synchronous and asynchronous execution models is crucial for you to understand when choosing the right tool for your needs. In scenarios where immediate execution is necessary, a synchronous model like RxJS may be appropriate. However, for applications that require better handling of side effects and non-blocking execution, eventkit's asynchronous approach offers significant advantages. Namely it reduces the risk of performance bottlenecks, and provides greater flexibility in orchestrating complex workflows.

### Generators are a thing now

The Observable pattern in RxJS relies heavily on its own implementation of the [Observable Contract](https://reactivex.io/documentation/contract.html) to solve the first higher-order problem of yielding values over time in a collection. However, JavaScript's newer [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) provide a more intuitive and native abstraction to express this. Eventkit leans into this heavily for a number of reasons:

- Rather than observables evaluating in their own loop (whether on the main loop or as a microtask) generators freeze their execution after a yield statement until more data is requested (which is more performant).
- "Values over time" becomes the responsibility of the runtime, which likely means its more performant since it's not implemented in JavaScript code (The core of the observable is about `60%` smaller in eventkit than it is in rxjs!).
- The learning curve becomes a lot smaller. If you understand generators, observables are not a far step.

#### Why not generators then?

Generators are excellent for managing the first higher-order problem of observing values over time, but they fall short when it comes to the second problem: observing the side effects that arise from its values. Generators do not inherently provide a mechanism to track or manage side effects, which can be a significant limitation in reactive programming. While they are similar, they're distinct from an observable because of this detail.

This is explained more in the [Observable Pattern](/concepts/observable-pattern#async-iterators-generators) section.

#### Why is observing side effects important?

For one, observing side effects gives us more visibility into our processes, but its especially crucial in environments where execution is short-lived. In these contexts it's essential to ensure that any side effects are completed before the execution context is terminated (think serverless, node, etc). Eventkit was created because there wasn't an off-the-shelf solution for solving this problem in JavaScript.

In a [CQRS](https://en.wikipedia.org/wiki/Command_Query_Responsibility_Segregation) (**C**ommand **Q**uery **R**esponsibility **S**egregation) architecture, for example, commands may trigger side effects that update the read model. Observing these side effects and making sure they're completed before the execution context is terminated means that you can guarantee that the read model will **eventually** be consistent (unless your server rack gets hit by a meteorite, but that's a different problem).

Similarly, in [event sourcing](https://en.wikipedia.org/wiki/Event-driven_architecture), side effects may be used to update projections or trigger additional events. By observing these side effects, you can ensure that your system remains reactive and that all necessary updates are applied.

A more practical example of where this becomes important can be found in the [Event Sourcing](/examples/event-sourcing) example.