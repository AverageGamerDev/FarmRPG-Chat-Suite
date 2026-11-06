/**
 * FarmRPG chat DOM, shared by every message feature.
 *
 * Zones: #chatzoneDesktop and #chatzoneMobile. Both stay in the page.
 * The desktop zone is hidden in the mobile layout. The mobile zone lives in
 * #mobilechatpanel, which opens from the bottom bar. Watch every zone present.
 *
 * Each message is .chat-txt. Element children:
 *   0  timestamp
 *   2  username — a profile link, or a .chip whose profile link is the name.
 *      The chip also shows a level such as "[200]"; that level is not the name.
 *   5  message body (item links render as <a><img alt="item"></a>)
 * Profile links: profile.php?user_name=<name> with spaces as "+".
 * Composer: #chat_txt_desktop, #chat_txt_mobile, #chat_message_compact,
 * or input[id^="chat_txt_"].
 */

export const CHAT_SELECTORS = ["#chatzoneDesktop", "#chatzoneMobile"];

export const CHAT_INPUT_SELECTOR =
  "#chat_txt_desktop, #chat_txt_mobile, #chat_message_compact, input[id^='chat_txt_']";

export const MESSAGE_SELECTOR = ".chat-txt";

export function findChatContainers(root = document) {
  const found = [];
  for (const selector of CHAT_SELECTORS) {
    found.push(...root.querySelectorAll(selector));
  }
  return found;
}

export function findChatContainer(root = document) {
  return findChatContainers(root)[0] ?? null;
}

export function queryMessages(root = document) {
  return Array.from(root.querySelectorAll(MESSAGE_SELECTOR));
}

export function messageText(message) {
  const node = message.children[5];
  if (!node) return "";
  return node.innerText || node.textContent || "";
}

export function messageBody(message) {
  return message.children[5] ?? null;
}

const AUTHOR_LINK = 'a[href*="profile.php?user_name="]';

function authorLabel(node) {
  if (!node) return "";

  const copy = typeof node.cloneNode === "function" ? node.cloneNode(true) : node;
  const badges = typeof copy.querySelectorAll === "function"
    ? Array.from(copy.querySelectorAll(".fcs-keyword-badge"))
    : [];
  for (const badge of badges) badge.remove();
  Array.from(copy.children || [])
    .filter((child) => child.classList?.contains("fcs-keyword-badge"))
    .forEach((child) => child.remove());

  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Author label. The mobile username is a .chip that also contains the level,
 * so the profile link inside child 2 is the name. A keyword badge appended
 * inside that slot is left out.
 */
export function messageAuthor(message) {
  const node = message.children[2];
  if (!node) return "Someone";

  const link = node.matches?.(AUTHOR_LINK) ? node : node.querySelector?.(AUTHOR_LINK);
  const fromLink = authorLabel(link);
  if (fromLink) return fromLink;

  const label = authorLabel(node).replace(/\s\[\d[\d,]*\]$/, "");
  return label || "Someone";
}

/**
 * Raw user_name query value from the profile link, or null.
 * @param {Element} message
 */
export function messageProfileName(message) {
  const link = message.querySelector('a[href^="profile.php?user_name="]');
  const href = link?.getAttribute("href") || "";
  const match = href.match(/user_name=(.+)$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Stable id for "have we already handled this message?" across chat redraws.
 * @param {Element} message
 */
export function fingerprint(message) {
  const timestamp = message.children[0]?.textContent || "";
  const body = message.children[5];
  const text = body?.textContent || body?.innerText || "";
  return `${timestamp}:${text}`.trim();
}

export function findChatInputs(root = document) {
  return Array.from(root.querySelectorAll(CHAT_INPUT_SELECTOR));
}

/**
 * The composer is looked up at use time. The game swaps pages without a reload,
 * so a node captured at startup can be detached.
 * @param {HTMLInputElement | null | undefined} preferred
 */
export function findActiveInput(preferred) {
  if (preferred?.isConnected) return preferred;

  const inputs = findChatInputs();
  return inputs.find((input) => input.offsetParent !== null) || inputs[0] || null;
}

/**
 * Inserts at the caret (or replaces the selection) and never sends the message.
 * Adds a separating space when the surrounding text needs one.
 * @param {HTMLInputElement | null | undefined} preferred
 * @param {string} text
 */
export function insertIntoChat(preferred, text) {
  const input = findActiveInput(preferred);
  if (!input) return false;

  input.focus();
  const value = input.value;
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const suffix = after && !/^\s/.test(after) ? " " : "";
  const insertion = prefix + text + suffix;

  if (typeof input.setRangeText === "function") {
    input.setRangeText(insertion, start, end, "end");
  } else {
    input.value = before + insertion + after;
    const cursor = before.length + insertion.length;
    input.setSelectionRange?.(cursor, cursor);
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
