---
prev: false
---

# Reactive Systems

If it isn't already abundantly clear, we have a growing dependence on software, whether it be the devices we use or the products we use them with. Consequently that also means that there is similar growth in the amount of demand on the software we build. Today's software engineers often revel in the war stories of times where the sheer volume of requests or data was so high it often meant seconds of latency for the user, hours of downtime, nightmareish oncall/rollout schedules, or often times all of the above!

Despite these roadblocks, that doesn't mean the growth in demand has slowed down. Users expect milisecond response times and 100% uptime, and the amount of data we need to process is changed from gigabytes to terabytes to petabytes and beyond. So how have we managed to keep up?

Historically, it's been the responsibility of the developer to address these scale problems independently. But as it turns out, there is a lot of overlap in the patterns and principles employed to address these problems no matter the domain or scale. This realization led to the emergence of reactive systems—a set of principles and patterns that help us build applications capable of handling uncertainty, failure, and dynamic load while maintaining responsiveness (see the [Reactive Manifesto](https://www.reactivemanifesto.org/)).

In practice, a reactive system is often designed to operate across multiple compute nodes where the interactions, data, and responsibilities are distributed. This is why the principles of reactive systems are often associated with distributed computing. With that in mind, there's a question that's begging to be asked:

> Why is a JavaScript library (which is inherently single-threaded and not distributed) concerning itself with a distributed computing paradigm?

JavaScript on the server has over time found its footing through the introduction of environments like NodeJS, Cloudflare Workers, or fullstack frameworks like NextJS. The novelty of being able to use the same dependencies, tooling, and language for both the frontend and the system that supports it has become a core strength of the ecosystem and is largely why it has become the language of choice for so many developers.

The cracks start to show when JS on the server is used at scale, either by way of volume or the complexity of the application. The concepts and patterns related to a "reactive system" were born out of a need to coordinate massive amounts of volume and complexity across multiple domains, services, and compute nodes. In the process of trying to solve these multi-faceted problems, there have been a number of advances in the way we think about building systems that don't pay any mind to how the actual system is built. Namely things like how we:

- Organize business logic
- Decouple independent components
- Optimize for things like throughput or consistency

At first glance, these concepts might seem like they belong exclusively to the world of large-scale distributed systems. But the truth is, the challenges that reactive systems solve—managing complex state, coordinating asynchronous operations, handling failure gracefully—are universal concerns in modern application development.

One of the driving motivations behind eventkit was the need to reconcile these patterns, but in a way that makes sense for the vast use cases of JavaScript. We believe that eventkit, which was partly built using these same principles, can provide a powerful foundation for building complex systems in JavaScript.

::: tip INFO
Eventkit as a library is beholden to the single-threaded nature of JavaScript, which means that systems built using eventkit are lacking in some respects to the idea of a reactive system (see the [Reactive Manifesto](https://www.reactivemanifesto.org/)). This guide is meant to (1) introduce you to these principles, and (2) show how a reactive library like eventkit can be used to model them, but not assert that eventkit is the "silver bullet" for reactive systems.
:::

In the rest of this guide, we'll explore some of the related and fundamental concepts of reactive systems, and how to use eventkit to put those concepts into practice.

## Event Sourcing

Event sourcing at it's most basic level is a way of persisting your application's state by storing the history that determines that state. Instead of mutating the state of your application directly, you record all the changes that happen to it as a sequence of events.

If you think about how a traditional CRUD application (create, read, update, delete) works, when you modify the state of your application you do so by directly mutating state, like issuing an update statement for a specific record in a database. This record that you're updating becomes the source of truth—the only way to know the current state of the application is to query that record.

```ts
// Traditional CRUD application:
let counter: number = 0;

app.post("/increment", (req, res) => {
  counter++;
  res.json({ count: counter });
});

app.post("/decrement", (req, res) => {
  counter--;
  res.json({ count: counter });
});
```

With event sourcing, instead of mutating the state of your application directly, you record all the changes that happen to it as a sequence of events and have an independent process that uses those events to construct the current state of the application.

```ts
// Event sourcing application:
import { Stream } from "@eventkit/base";

type CounterEvent = { type: "increment" | "decrement" };
const stream = new Stream<CounterEvent>();

let counter: number = 0;
let events: CounterEvent[] = [];
stream.subscribe((event) => {
  if (event.type === "increment") {
    counter++;
  } else if (event.type === "decrement") {
    counter--;
  }
  events.push(event);
});

app.post("/increment", async (req, res) => {
  stream.push({ type: "increment" });
  await stream.drain();
  res.json({ count: counter });
});

app.post("/decrement", async (req, res) => {
  stream.push({ type: "decrement" });
  await stream.drain();
  res.json({ count: counter });
});
```

**Why would I want to do this?** On the face of it, the above example seems like a lot of additional boilerplate without much upside. Why not just mutate the state directly?

There's a number of benefits that come with employing an event sourced state model. As with anything, there's weighted significance to each of these benefits depending on the domain you're working in.

- **Performance**: Events are immutable, which means you can persist them in an append-only store like a log. This makes them a lot more efficient to store and query than a traditional database. Events are also typically smaller than the broader state they effect, which makes them even more efficient to store.
- **Audit Trails**: Events are immutable and store the full history of the state of the system. This makes them a great way to provide a detailed audit trail of all the changes that have occurred in the system.
- **Deriving later value from events**: If you store the events your system produces, you have the ability to determine the state of the system at any previous points in time by querying the events associated with an object up to a certain point. You can't predict what questions the business might want to ask about the information stored in a system, but if you store the lowest atomical unit of state, you can derive any higher level value from it.
- **Encapsulation**: Events provide a useful way of communicating with other processes in your system. An event producer doesn't need to know anything about the event consumers, and vice versa. That means that the effects that an event will have on state isn't the responsibility of the event producer (more on this in the next section).
- **Fixing errors**: You might discover an error that results in the system calculating an incorrect value. Rather than fixing the error and performing a risky manual adjustment on a stored value, you can simply replay the events that occurred up to the point of the error and calculate the correct value after a fix has been applied.
- **Troubleshooting**: You can use a string of events to troubleshoot problems in a production system by taking a copy of the events and repalying it in a test environment. If you know the time that an issue occurred, you can easily replay the event stream up to that point to see exactly what happened.

### Best Practices

Within event sourcing, it's beneficial to make sure that your events follow certain heuristics:

- Events are representative of things that have already happened in the past. For instance, "the table was booked", "the item was added to the cart", "the user was created" are all events that have already happened. Pay particular attention to how we describe these events using past tense.
- Events are immutable and cannot be modified. Because they represent something that has already happened, they cannot be changed. Subsequent events may alter or negate the impact of previous events, such as "the reservation was cancelled" is the compensating action for "the table was booked".
- Events are one-way messages. Events have a single source (the publisher) and many subscribers (the consumers).
- Events most often include parameters that provide additional context about user intent. For example, "the table was booked" might include the number of guests, the date, and time of the reservation. Certain fields (like the number of guests) might not have any impact on the state of the application, but they are an all encompassing description of the transaction that occurred.

## CQRS

**C**ommand **Q**uery **S**aparation ([CQS](https://en.wikipedia.org/wiki/Command%E2%80%93query_separation)) is a pattern that suggests separating the operations that read data (a query) from those that write it (a command). A query returns data and does not alter the state of an object; a command changes the state of an object but does not return any data. If event sourcing is about how we store and derive state, CQS is about how we interact with it. The benefit is that you have a better understanding of the impact of your operations and can optimize them for it's specific use case.

A lot of systems already employ CQS without realizing it. For example in a REST API, a POST/PUT/DELETE request is a command that changes the state of an object, and a GET request is a query that returns data.

Reactive systems take this a step further and suggest that the two operations should be handled by separate services (and by extension different data models) altogether. This is often referred to as a separate term called **C**ommand **Q**uery **R**esponsibility **S**egregation ([CQRS](https://en.wikipedia.org/wiki/Command%E2%80%93query_separation)). CQRS is a natural continuation of CQS, and the gist between the two is the same, but with the key distinction that the two operations are handled separately in more ways than just different entrypoints.

This pattern comes from the observation that, in most systems, there's a lot more read traffic than write traffic. Rather than handling both operations in the same service/data model, it's often better to handle the read traffic in a more performant data model while the write traffic is handled in a more durable/consistent data model. This mitigates the risk that a write operation will fail due to the read traffic on the same instance. It's for this same reason that a lot of modern database deployments involve "read replicas"—separate database instances that are optimized for reading data.

When used in conjunction with event sourcing as we detailed above, this separation of concerns is even more pronounced. When the unit of state is an event detailing a change to the state of an object, the read and write operations are naturally separated. And when used with an "event stream", we can completely separate different representations of the same state!

```ts
import { Stream } from "@eventkit/base";

type CounterEvent = { type: "increment" | "decrement" };
const stream = new Stream<CounterEvent>();

const readModel = new Stream<CounterEvent>();

// primary write model that represents events as a state object
let counter: number = 0;
stream.subscribe((event) => {
  if (event.type === "increment") {
    counter++;
  } else if (event.type === "decrement") {
    counter--;
  }
});

// secondary read model that publishes events to a different service
stream.subscribe(async (event) => {
  await fetch("https://analytics.com/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
});

app.post("/increment", async (req, res) => {
  stream.push({ type: "increment" });
  // we could add as many read models as we want, and nothing would change
  // this endpoint because the read model is completely separate!
  await stream.drain();
  res.json({ count: counter });
});
```
