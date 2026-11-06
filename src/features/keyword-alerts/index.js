import { createBoundedSet } from "../../core/bounded-set.js";
import { fingerprint, messageAuthor, messageBody } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { keys } from "../../core/storage.js";
import { log } from "../../core/log.js";

const KEYWORD_CLASS = "fcs-keyword";
const BADGE_CLASS = "fcs-keyword-badge";

const matches = createBoundedSet(100);
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
    removeHighlights();
    log.info("Keyword watcher stopped");
  },

  onMessages(messages, _mutations, ctx) {
    if (keywords.size === 0) return;

    for (const message of messages) {
      const body = messageBody(message);
      const keyword = matchKeyword(extractItemNames(body), keywords);
      if (!keyword) continue;

      const id = fingerprint(message);
      applyHighlight(message, keyword);
      if (matches.has(id)) continue;

      matches.add(id);
      ctx.notify(`Keyword Alert: "${keyword}"`, messageAuthor(message));
      ctx.markUnread?.(id);
      log.info("Keyword match", keyword);
    }
  },
});

keywordAlerts.loadFrom = (ctx) => load(ctx.storage);
keywordAlerts.readText = () => Array.from(keywords).join(", ");
keywordAlerts.writeText = (ctx, text) => writeKeywords(ctx.storage, text);
