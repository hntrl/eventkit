import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { AsyncObservable, Stream } from "eventkit";
import { Hono } from "hono";

const app = new Hono();

app.get("/", serveStatic({ path: "./src/index.html" }));

app.get("/eventkit.js", serveStatic({ path: "./node_modules/eventkit/dist/index.mjs" }));

app.get("/observable-stream", () => {
  const obs = new AsyncObservable<string>(async function* () {
    const messages = [
      "Starting the stream...",
      "This is a slow stream",
      "Each message takes time",
      "To propagate through",
      "The network",
      "Like a river",
      "Flowing downstream",
      "One message at a time",
      "Almost there...",
      "Done!",
    ];

    for (const msg of messages) {
      yield msg + "\n";
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay between messages
    }
  });

  return new Response(ReadableStream.from(obs));
});

const stream = new Stream<string>();

app.get("/shared-stream", () => {
  return new Response(ReadableStream.from(stream));
});

app.post("/shared-stream", async (c) => {
  const body = await c.req.text();
  stream.push(body);
  return c.body(null, 204);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
