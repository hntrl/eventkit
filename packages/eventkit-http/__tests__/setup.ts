import { EventSource as ExternalEventSource } from "eventsource";

// To use the EventSource global in node, it needs a --experimental-eventsource flag (which isn't feasible)
// so we need to use the external implementation for testing. As far as I can tell, the external implementation
// is compatible with the browser implementation, so this should be fine.
// We don't need to do this for WebSocket because it's exported in node 22 but not node 20 (we test both versions)
if (!globalThis.EventSource) {
  globalThis.EventSource = ExternalEventSource as any;
}
