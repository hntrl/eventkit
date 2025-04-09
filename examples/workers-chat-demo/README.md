# Cloudflare + Eventkit Edge Chat Demo

This is a demo app written on [Cloudflare Workers](https://workers.cloudflare.com/) utilizing [Durable Objects](https://blog.cloudflare.com/introducing-workers-durable-objects) and [Eventkit](https://github.com/eventkit/eventkit) to implement real-time chat with stored history. This app runs 100% on Cloudflare's edge.

This demo is based off of the [Edge Chat Demo](https://github.com/cloudflare/workers-chat-demo/tree/master) provided by Cloudflare, but uses eventkit in place of WebSockets to demonstrate its capabilities.

## How does it work?

This chat app uses a Durable Object to control each chat room. Users can listen to new messages pushed to the room by listening to its event stream using EventSource. Whereas the chat demo this is based off of uses a WebSocket connection to facilitate the chat, this app uses [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) and a good ol' POST endpoint to handle the interactions.

The chat history is also stored in durable storage, but this is only for history. Real-time messages are relayed directly from one user to others without going through the storage layer.

For more details, take a look at the code! It is well-commented.

## Learn More

- [HTTP Streaming in Eventkit](https://hntrl.github.io/eventkit/guide/examples/http-streaming)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)

## Running locally

You can run the demo locally using the following command:

```bash
pnpm wrangler:dev
```

This will start the worker locally and you can interact with it by opening the dev server link in your browser.

## Deploy it yourself

If you haven't already, enable Durable Objects by visiting the [Cloudflare dashboard](https://dash.cloudflare.com/) and navigating to "Workers" and then "Durable Objects".

Then, make sure you have [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update), the official Workers CLI, installed.

After installing it, run `wrangler login` to [connect it to your Cloudflare account](https://developers.cloudflare.com/workers/cli-wrangler/authentication).

Once you've enabled Durable Objects on your account and have Wrangler installed and authenticated, you can deploy the app for the first time by running:

    pnpm wrangler:deploy

If you get an error saying "Cannot create binding for class [...] because it is not currently configured to implement durable objects", you need to update your version of Wrangler.

This command will deploy the app to your account under the name `eventkit-edge-chat-demo`.