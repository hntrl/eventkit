import { type MessageEvent as UndiciMessageEvent } from "undici-types";
import {
  type AddEventListenerOptions,
  type EventListener,
  type EventListenerObject,
} from "undici-types/patch";

/**
 * Parses a MessageEvent and returns a new MessageEvent with the data parsed as JSON.
 * If the data cannot be parsed as JSON, the original event is returned unchanged.
 *
 * @param event - The MessageEvent to parse
 * @returns A new MessageEvent with the data parsed as JSON, or the original event if parsing fails
 */
export function parseMessageEvent<T>(event: MessageEvent): UndiciMessageEvent<T> {
  try {
    const data = JSON.parse(event.data);
    return new MessageEvent<T>(event.type, {
      data,
      lastEventId: event.lastEventId,
      origin: event.origin,
      ports: event.ports as (typeof MessagePort)[],
      source: event.source,
    });
  } catch {
    return event;
  }
}

/**
 * Represents a global event listener that can track which event types it's listening to.
 */
type GlobalEventListener = {
  /**
   * Returns a record of all event types and their associated listeners that have been registered.
   *
   * @returns A record mapping event types to their event listeners
   */
  getListeners: () => Record<string, EventListener | EventListenerObject>;
};

/**
 * Adds a global event listener to the target that automatically registers for new event types.
 * This function modifies the target's dispatchEvent method to automatically register the listener
 * for any event type that is dispatched but not yet being listened to.
 *
 * @param target - The EventTarget to attach the global listener to
 * @param listener - The event listener or listener object to be called when events are dispatched
 * @param options - Optional addEventListener options
 * @returns A GlobalEventListener object that can be used to track and remove the listeners
 */
export function addGlobalEventListener(
  target: EventTarget,
  listener: EventListener | EventListenerObject,
  options?: AddEventListenerOptions
): GlobalEventListener {
  const originalDispatchEvent = target.dispatchEvent;
  const listeners: Record<string, EventListener | EventListenerObject> = {};
  function dispatchEvent(event: Event) {
    if (!listeners[event.type]) {
      target.addEventListener(event.type, listener, options);
      listeners[event.type] = listener;
    }
    return originalDispatchEvent.call(target, event);
  }
  target.dispatchEvent = dispatchEvent;
  return {
    getListeners: () => listeners,
  };
}

/**
 * Removes all event listeners that were added by the global event listener.
 *
 * @param target - The EventTarget to remove the listeners from
 * @param listener - The GlobalEventListener object returned by addGlobalEventListener
 */
export function removeGlobalEventListeners(target: EventTarget, listener: GlobalEventListener) {
  const listeners = listener.getListeners();
  for (const eventType in listeners) {
    target.removeEventListener(eventType, listeners[eventType]);
  }
}
