import { defineFeature } from "../../core/feature.js";
import { fingerprint } from "../../core/chat.js";
import { log } from "../../core/log.js";

const SEPARATOR_CLASS = "fcs-separator";

/**
 * The separator marks where a redraw of the chat left off.
 * A batch that also removes nodes is treated as a chat refresh. If the message
 * we last anchored on shows up again, the divider is inserted just before it
 * ("new" rows sit on the other side of that anchor in the game's order).
 *
 * @param {string | null} lastKnown
 * @param {Element[]} messages
 * @param {boolean} chatWasCleared
 * @param {(message: Element) => string} fingerprintOf
 */
export function planSessionSeparator(lastKnown, messages, chatWasCleared, fingerprintOf) {
  const newest = fingerprintOf(messages[0]);

  if (!chatWasCleared || !lastKnown) {
    return { lastKnown: newest, before: null };
  }

  const before = messages.find((message) => fingerprintOf(message) === lastKnown) ?? null;
  return { lastKnown: newest, before };
}

function chatWasCleared(mutations) {
  return mutations.some((mutation) => mutation.removedNodes.length > 0);
}

function insertSeparator(beforeMessage) {
  const previous = beforeMessage.previousElementSibling;
  if (previous?.classList.contains(SEPARATOR_CLASS)) return;

  const separator = document.createElement("div");
  separator.className = SEPARATOR_CLASS;
  separator.textContent = "─── New Messages ───";
  beforeMessage.parentElement?.insertBefore(separator, beforeMessage);
  log.info("Session separator inserted");
}

const anchors = new WeakMap();
let fallbackAnchor = null;

export const sessionMarkers = defineFeature({
  id: "separator",
  autoStart: true,
  toggle: {
    label: "Session",
    hint: "Mark where new messages start",
  },

  start() {
    log.info("Session separator started");
    return true;
  },

  stop() {
    document.querySelectorAll(`.${SEPARATOR_CLASS}`).forEach((node) => node.remove());
    log.info("Session separator stopped");
  },

  onMessages(messages, mutations) {
    const zone = messages[0]?.closest?.("#chatzoneDesktop, #chatzoneMobile") ?? null;
    const previous = zone ? anchors.get(zone) ?? null : fallbackAnchor;
    const plan = planSessionSeparator(
      previous,
      messages,
      chatWasCleared(mutations),
      fingerprint,
    );
    if (zone) anchors.set(zone, plan.lastKnown);
    else fallbackAnchor = plan.lastKnown;
    if (plan.before) insertSeparator(plan.before);
  },
});
