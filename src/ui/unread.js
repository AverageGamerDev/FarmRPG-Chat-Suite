import { createBoundedSet } from "../core/bounded-set.js";
import { chatPollState, shouldPollChat } from "../core/chat-poll.js";
import { onDocumentMutations } from "../core/dom-observer.js";

const BADGE_CLASS = "fcs-unread";
const MARKED_CLASS = "fcs-has-unread";

/**
 * The game's control that opens the mobile chat panel.
 * @param {ParentNode} [root]
 */
export function findChatOpenButton(root = document) {
  const direct = root.querySelector("#openchatbtn, #bottom a.open-panel, #bottom [data-panel='right']");
  if (direct) return direct;

  const row = root.querySelector("#bottom .footer-btn-row");
  if (!row) return null;

  return Array.from(row.querySelectorAll("a, button")).find((node) => {
    if (node.classList?.contains("fcs-menu-btn")) return false;
    const hint = [
      node.id,
      node.className,
      node.getAttribute?.("href") || "",
      node.getAttribute?.("aria-label") || "",
    ].join(" ").toLowerCase();
    return hint.includes("chat");
  }) ?? null;
}

/**
 * @param {number} count
 */
export function unreadLabel(count) {
  if (!count || count < 1) return "";
  if (count > 9) return "9+";
  return String(count);
}

/**
 * One count for a new mention or item alert while chat is hidden.
 * The same message id counts once. Opening chat clears the count.
 *
 * @param {number} count
 * @param {string} id
 * @param {boolean} chatHidden
 * @param {{ has: (id: string) => boolean, add: (id: string) => void, clear: () => void }} seen
 */
export function applyUnread(count, id, chatHidden, seen) {
  if (!chatHidden) {
    const changed = count !== 0;
    if (changed) seen.clear();
    return { count: 0, changed };
  }

  if (!id || seen.has(id)) return { count, changed: false };
  seen.add(id);
  return { count: count + 1, changed: true };
}

/**
 * Badge on the bottom-bar chat button. In-memory only.
 */
export function mountUnreadMark() {
  const seen = createBoundedSet(200);
  let count = 0;
  let badge = null;
  let panel = null;
  let panelObserver = null;

  function chatHidden() {
    return shouldPollChat(chatPollState());
  }

  function paint() {
    const button = findChatOpenButton();
    if (!button) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
    }
    if (badge.parentElement !== button) button.appendChild(badge);

    const label = unreadLabel(count);
    badge.textContent = label;
    badge.hidden = !label;
    badge.title = label ? `${count} new chat alert${count === 1 ? "" : "s"}` : "";
    button.classList.toggle(MARKED_CLASS, Boolean(label));
  }

  function note(id) {
    const next = applyUnread(count, id, chatHidden(), seen);
    count = next.count;
    if (next.changed) paint();
  }

  function sync() {
    if (!chatHidden() && count !== 0) {
      count = 0;
      seen.clear();
    }
    paint();
    watchPanel();
  }

  function watchPanel() {
    const next = document.querySelector("#mobilechatpanel");
    if (next === panel) return;
    panelObserver?.disconnect();
    panel = next;
    if (!panel) return;

    panelObserver = new MutationObserver(sync);
    panelObserver.observe(panel, { attributes: true, attributeFilter: ["class", "style"] });
  }

  onDocumentMutations(sync);
  document.addEventListener("click", (event) => {
    const button = findChatOpenButton();
    if (!button?.contains(event.target)) return;
    count = 0;
    seen.clear();
    paint();
  });

  return { note };
}
