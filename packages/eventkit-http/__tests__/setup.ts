import { EventSource as ExternalEventSource } from "eventsource";

// To use the EventSource global in node, it needs a --experimental-eventsource flag (which isn't feasible)
// so we need to use the external implementation for testing. As far as I can tell, the external implementation
// is compatible with the browser implementation, so this should be fine.
if (!globalThis.EventSource) {
  globalThis.EventSource = ExternalEventSource as any;
}
