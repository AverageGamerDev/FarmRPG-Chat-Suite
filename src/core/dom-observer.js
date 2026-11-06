import { findChatContainers, MESSAGE_SELECTOR } from "./chat.js";
import { log } from "./log.js";

const listeners = new Set();
let documentObserver = null;
let scheduled = false;

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      log.error("DOM listener failed", error);
    }
  }
}

/**
 * Batched callback for page swaps. The game re-renders panels without a reload,
 * so features re-attach their controls from here. The listener also runs once
 * immediately so the first paint does not wait for a mutation.
 * @param {() => void} listener
 */
export function onDocumentMutations(listener) {
  listeners.add(listener);
  ensureDocumentObserver();
  listener();
  return () => listeners.delete(listener);
}

function ensureDocumentObserver() {
  if (documentObserver || !document.body) return;

  documentObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      emit();
    });
  });

  documentObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Collects .chat-txt nodes added in this batch, including messages wrapped in
 * a parent the game inserted in one go.
 * @param {MutationRecord[]} mutations
 */
export function collectChatMessages(mutations) {
  const messages = [];
  const seen = new Set();

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const found = node.classList?.contains("chat-txt")
        ? [node]
        : Array.from(node.querySelectorAll?.(MESSAGE_SELECTOR) ?? []);

      for (const message of found) {
        if (seen.has(message)) continue;
        seen.add(message);
        messages.push(message);
      }
    }
  }

  return messages;
}

/**
 * Follows every chat zone across page swaps. Desktop and mobile zones are
 * both in the DOM; the layout only shows one. `onMessages` receives newly
 * added message nodes from the zone that changed. `onReady` runs each time a
 * new zone is attached so features can paint messages already on screen.
 *
 * @param {(messages: Element[], mutations: MutationRecord[]) => void} onMessages
 * @param {() => void} [onReady]
 */
export function createChatWatcher(onMessages, onReady) {
  const observers = new Map();

  function attach() {
    const zones = findChatContainers();
    const live = new Set(zones);

    for (const [zone, observer] of observers) {
      if (live.has(zone) && zone.isConnected) continue;
      observer.disconnect();
      observers.delete(zone);
    }

    for (const zone of zones) {
      if (observers.has(zone)) continue;

      const observer = new MutationObserver((mutations) => {
        const messages = collectChatMessages(mutations);
        if (messages.length === 0) return;

        try {
          onMessages(messages, mutations);
        } catch (error) {
          log.error("chat watcher failed", error);
        }
      });

      observer.observe(zone, { childList: true, subtree: true });
      observers.set(zone, observer);
      log.info("Watching", zone.id || "chat");
      onReady?.();
    }
  }

  return {
    start() {
      onDocumentMutations(attach);
    },
  };
}
