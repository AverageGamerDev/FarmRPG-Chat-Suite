import { createBoundedSet } from "../../core/bounded-set.js";
import { fingerprint, messageAuthor, messageBody, messageProfileName } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { normalizeUsername } from "../../core/identity.js";
import { keys } from "../../core/storage.js";
import { log } from "../../core/log.js";

const KEYWORD_CLASS = "fcs-keyword";
const BADGE_CLASS = "fcs-keyword-badge";

const REPEAT_SALE_MS = 5 * 60 * 1000;

const matches = createBoundedSet(100);
const recentSales = new Map();
let keywords = new Set();

/**
 * Item names come from the image alt inside an item link, not from the
 * surrounding sentence. The alert is specifically an item-keyword watch.
 * @param {Element | null | undefined} textContainer
 */
export function extractItemNames(textContainer) {
  if (!textContainer?.children?.length) return [];

  const items = [];
  for (const element of textContainer.children) {
    if (!element.matches?.("a")) continue;
    const image = element.children[0];
    if (image?.matches?.("img") && image.alt) items.push(image.alt);
  }
  return items;
}

/**
 * @param {string} input
 */
export function parseKeywordInput(input) {
  return String(input)
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase().replace(/[()]/g, ""))
    .filter(Boolean);
}

/**
 * First watched keyword contained in an item name, or null.
 * @param {Iterable<string>} itemNames
 * @param {Iterable<string>} keywordList
 */
export function matchKeyword(itemNames, keywordList) {
  for (const item of itemNames) {
    const haystack = String(item).toLowerCase();
    for (const keyword of keywordList) {
      if (haystack.includes(keyword)) return keyword;
    }
  }
  return null;
}

/**
 * Same seller plus the same item names, ignoring order and case.
 * @param {string | null | undefined} author
 * @param {Iterable<string>} itemNames
 */
export function saleKey(author, itemNames) {
  const who = normalizeUsername(author);
  const items = Array.from(
    new Set(
      Array.from(itemNames, (name) => String(name).trim().toLowerCase()).filter(Boolean),
    ),
  ).sort();
  if (!who || items.length === 0) return "";
  return `${who}\n${items.join("\n")}`;
}

/**
 * True when this seller already offered these items inside the quiet window.
 * A new offer is remembered. Entries older than the window are dropped.
 * @param {Map<string, number>} recent
 * @param {string} key
 * @param {number} now
 * @param {number} [windowMs]
 */
export function isRepeatSale(recent, key, now, windowMs = REPEAT_SALE_MS) {
  for (const [id, at] of recent) {
    if (now - at >= windowMs) recent.delete(id);
  }
  if (!key) return false;

  const last = recent.get(key);
  if (last != null && now - last < windowMs) return true;

  recent.set(key, now);
  return false;
}

function load(store) {
  const stored = store.getJson(keys.keywords, []);
  keywords = new Set(Array.isArray(stored) ? stored.map((keyword) => String(keyword).toLowerCase()) : []);
}

function save(store) {
  store.setJson(keys.keywords, Array.from(keywords));
}

function badgeHost(author) {
  return author.querySelector?.(".chip-label") || author;
}

function applyHighlight(message, keyword) {
  if (message.classList.contains("fcs-pinned")) return;

  message.classList.add(KEYWORD_CLASS);
  const author = message.children[2];
  if (!author) return;

  const host = badgeHost(author);
  let badge = Array.from(host.children).find((child) =>
    child.classList?.contains(BADGE_CLASS),
  );
  if (!badge) {
    badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    host.appendChild(badge);
  }
  badge.textContent = `🔔 ${keyword}`;
}

function removeHighlights() {
  document.querySelectorAll(`.${KEYWORD_CLASS}`).forEach((message) => {
    message.classList.remove(KEYWORD_CLASS);
  });
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
}

function writeKeywords(store, text) {
  keywords = new Set(text.trim() ? parseKeywordInput(text) : []);
  save(store);
}

export const keywordAlerts = defineFeature({
  id: "keywords",
  toggle: {
    label: "Items",
    hint: "Alert when a watched item is posted",
  },
  requires: "keywords",

  start(ctx) {
    load(ctx.storage);
    if (keywords.size === 0) return false;

    void ctx.ensureNotificationPermission();
    log.info("Keyword watcher started", Array.from(keywords));
    return true;
  },

  stop() {
    matches.clear();
    recentSales.clear();
    removeHighlights();
    log.info("Keyword watcher stopped");
  },

  onMessages(messages, _mutations, ctx) {
    if (keywords.size === 0) return;

    for (const message of messages) {
      const body = messageBody(message);
      const names = extractItemNames(body);
      const keyword = matchKeyword(names, keywords);
      if (!keyword) continue;

      const id = fingerprint(message);
      applyHighlight(message, keyword);
      if (matches.has(id)) continue;

      matches.add(id);
      const seller = messageProfileName(message) || messageAuthor(message);
      if (isRepeatSale(recentSales, saleKey(seller, names), Date.now())) {
        log.info("Repeat sale suppressed", seller);
        continue;
      }

      ctx.notify(`Keyword Alert: "${keyword}"`, messageAuthor(message));
      ctx.markUnread?.(id);
      log.info("Keyword match", keyword);
    }
  },
});

keywordAlerts.loadFrom = (ctx) => load(ctx.storage);
keywordAlerts.readText = () => Array.from(keywords).join(", ");
keywordAlerts.writeText = (ctx, text) => writeKeywords(ctx.storage, text);
