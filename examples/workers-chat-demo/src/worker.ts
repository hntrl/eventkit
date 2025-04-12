import { AsyncObservable, concat, map, filter, Stream } from "@eventkit/base";
import { EventSourceResponse } from "@eventkit/http";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import HTML from "./chat.html";
import { DurableObject } from "./utils";

// Hono is a neat framework that handles the http routing for Cloudflare Workers pretty intuitively.
// It's not required to use eventkit, but just for sake of convenience we use it here.
// https://hono.dev/
export default new Hono<{ Bindings: Env }>()
  // Serve the static HTML file at the root.
  .get("/", () => {
    return new Response(HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })

  // If the request is for a room, we'll just defer to the room object to handle the request.
  .all("/api/room/:name", (c) => {
    const name = c.req.param("name");

    // This might look a little weird, but this is just a shorthand utility that
    // allows us to get the stub for a durable object in one line (see ./utils.ts).
    const room = ChatRoom.getStub(c.env, name);

    // Compute a new URL with `/api/room/<name>` removed. We'll forward the rest of the path
    // to the Durable Object.
    const newUrl = new URL(c.req.url);
    const path = newUrl.pathname.slice(1).split("/");
    newUrl.pathname = "/" + path.slice(3).join("/");

    // Send the request to the object. The `fetch()` method of a Durable Object stub has the
    // same signature as the global `fetch()` function, but the request is always sent to the
    // object, regardless of the request's URL.
    return room.fetch(newUrl, c.req.raw);
  })

  // This route creates a new room.
  // Incidentally, this code doesn't actually store anything. It just generates a valid
  // unique ID for this namespace. Each durable object namespace has its own ID space, but
  // IDs from one namespace are not valid for any other.
  .post("/api/room", (c) => {
    const id = c.env.rooms.newUniqueId();
    console.log("new room", id);
    return new Response(id.toString(), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  })
  // Generic route for all other requests.
  .notFound((c) => c.text("Not found", 404));

type ChatEvent =
  | { type: "system"; content: string }
  | { ts: number; type: "join"; name: string }
  | { ts: number; type: "message"; name: string; content: string };

// ChatRoom implements a Cloudflare Durable Object that coordinates an individual chat room. It's
// responsible for storing the chat history, and for pushing events to all clients connected to the
// room. You can learn more about Durable Objects at https://developers.cloudflare.com/durable-objects/
//
// Note: we use a `DurableObject` helper class to simplify the boilerplate of getting the stub for
// the object. See ./utils.ts for more details.
export class ChatRoom extends DurableObject<Env>("rooms") {
  // This is representative of the actual stream of events that we'll be pushing to the client. In
  // very simple terms, we can `subscribe()` to the stream, and then `push()` events to all
  // subscribers.
  stream = new Stream<ChatEvent>();

  // This is just a simple observable that emits orders a few welcome messages, and will be used
  // when the client first connects.
  welcomeMessages$ = AsyncObservable.from([
    "* This is a demo app built with Cloudflare Workers and Eventkit. The source code can be found at https://github.com/hntrl/eventkit/blob/main/examples/workers-chat-demo",
    "* WARNING: Participants in this chat are random people on the internet. Names are not authenticated; anyone can pretend to be anyone. Chat history is saved.",
  ]).pipe(map((message) => ({ type: "system", content: message })));

  // We keep track of the last-seen message's timestamp just so that we can assign monotonically
  // increasing timestamps even if multiple messages arrive simultaneously (see below). There's
  // no need to store this to disk since we assume if the object is destroyed and recreated, much
  // more than a millisecond will have gone by.
  lastTimestamp: number = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // This subscriber on the stream handles the "persistence" of stream messages.
    // Since we only care about saving messages, we filter out everything else, then save it to
    // disk.
    const messages$ = this.stream.pipe(filter((e) => e.type === "message"));
    messages$.subscribe(async (message) => {
      const key = new Date(message.ts).toISOString();
      await this.ctx.storage.put(key, message);
    });
  }

  // prettier-ignore
  // We use a Hono router to handle the incoming fetch requests to the object.
  router = new Hono()

    // This method can be considered the method by which we bubble messages from the object's
    // stream to the client. Instead of using something like a WebSocket, we use a long running
    // response (EventSource) to stream the messages to the client.
    .get("/",
      zValidator("query", z.object({ name: z.string().max(32) })),
      async (c) => {
        const { name } = c.req.valid("query");
        // First, we get the chat history from disk.
        const history$ = await this.getChatHistory$();

        // The subscription that the response object will be subscribed to *after* the join
        // event is pushed to the stream. To compensate, we'll add the join event to the
        // string of events that initially gets pushed to the client.
        const joinEvent = { ts: Date.now(), type: "join", name } as const;

        // Then, we create an observable that combines the chat history with some pre-defined
        // welcome messages and the object's stream. The concat operator effectively "merges"
        // all of these together, and emits them in order. Since the stream observable will wait
        // for new messages before emitting them, this is what effectively blocks the response from
        // completing since the stream is always waiting for new messages.
        const obs = history$.pipe(concat(this.welcomeMessages$, [joinEvent], this.stream));

        // Push the join event to all existing subscribers of the stream.
        this.stream.push(joinEvent);

        // Finally, we return an EventSourceResponse object, which will stream the combined
        // observable to the client. This in effect "subscribes" to the stream, and will push all
        // events from the stream as Server-Sent Events. When the response is closed (either by the
        // client, or because the stream ends), the subscription is automatically cleaned up.
        return new EventSourceResponse(obs);
      }
    )

    // This method handles the actual submission of new messages. It validates the request, adds
    // a timestamp, and pushes the message to the object's stream.
    .post(
      "/",
      zValidator("query", z.object({ name: z.string().max(32) })),
      zValidator("json", z.object({ message: z.string().max(256) })),
      (c) => {
        const { name } = c.req.valid("query");
        const { message } = c.req.valid("json");
        // Add timestamp. Here's where this.lastTimestamp comes in -- if we receive a bunch of
        // messages at the same time (or if the clock somehow goes backwards????), we'll assign
        // them sequential timestamps, so at least the ordering is maintained.
        const ts = Math.max(Date.now(), this.lastTimestamp + 1);
        this.lastTimestamp = ts;

        // Now we push the message event to the stream. This will (1) push the message to all
        // subscribers of the stream (which includes the EventSourceResponse objects created in the
        // get method), and (2) save the message to the chat history on disk using the subscriber
        // the constructor set up.
        this.stream.push({ ts, type: "message", name, content: message });
        return c.body(null, 204);
      }
    )

    // Generic route for all other requests.
    .notFound((c) => {
      console.log(c.req);
      return c.text("Not found", 404);
    });

  // The system will call fetch() whenever an HTTP request is sent to this Object. Such requests
  // can only be sent from other Worker code, such as the code above; these requests don't come
  // directly from the internet.
  async fetch(request: Request) {
    try {
      return this.router.fetch(request);
    } catch (err: any) {
      return new Response(err.stack, { status: 500 });
    }
  }

  async getChatHistory$() {
    // Load the last 100 messages from the chat history stored on disk, and return them as an
    // observable that we can use to stream the chat history to the client.
    const storage = await this.ctx.storage.list({ reverse: true, limit: 100 });
    const backlog = [...storage.values()];
    return AsyncObservable.from(backlog);
  }
}
