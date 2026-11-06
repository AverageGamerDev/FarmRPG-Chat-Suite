import { createBoundedSet } from "../../core/bounded-set.js";
import {
  fingerprint,
  messageAuthor,
  messageBody,
  messageProfileName,
  messageText,
  queryMessages,
} from "../../core/chat.js";
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
let tradeSideFilter = "both";

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
 * `wts`, `wtb`, or `both` when the saved value is missing or unknown.
 * @param {string | null | undefined} value
 */
export function normalizeTradeSide(value) {
  const id = String(value || "").trim().toLowerCase();
  return id === "wts" || id === "wtb" ? id : "both";
}

const SELL_WORD = /\b(?:wts|selling|sell)\b/i;
const BUY_WORD = /\b(?:wtb|buying|buy)\b/i;

/**
 * Which half of Trade a post is asking for. Selling is WTS, selling, or sell.
 * Buying is WTB, buying, or buy. Any capitalization counts. `mixed` names both
 * sides, and "" names neither. Image names are not part of this text.
 * @param {string | null | undefined} text
 */
export function tradeIntent(text) {
  const value = String(text || "");
  const sell = SELL_WORD.test(value);
  const buy = BUY_WORD.test(value);
  if (sell && buy) return "mixed";
  if (sell) return "wts";
  if (buy) return "wtb";
  return "";
}

/**
 * A chosen side drops only the opposite half. Posts that name neither side,
 * or name both, still match.
 * @param {string | null | undefined} filter
 * @param {string | null | undefined} intent
 */
export function acceptsTradeSide(filter, intent) {
  const want = normalizeTradeSide(filter);
  if (want === "both" || !intent || intent === "mixed") return true;
  return intent === want;
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
  tradeSideFilter = normalizeTradeSide(store.get(keys.tradeSide));
}

function saveSide(store, value) {
  tradeSideFilter = normalizeTradeSide(value);
  if (tradeSideFilter === "both") store.remove(keys.tradeSide);
  else store.set(keys.tradeSide, tradeSideFilter);
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

/**
 * A watched item on the side the player asked for.
 * @param {Element} message
 */
function keywordHit(message) {
  const names = extractItemNames(messageBody(message));
  const keyword = matchKeyword(names, keywords);
  if (!keyword) return null;
  if (!acceptsTradeSide(tradeSideFilter, tradeIntent(messageText(message)))) return null;
  return { keyword, names };
}

function repaintVisible() {
  removeHighlights();
  for (const message of queryMessages()) {
    const hit = keywordHit(message);
    if (hit) applyHighlight(message, hit.keyword);
  }
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
      const hit = keywordHit(message);
      if (!hit) continue;

      const id = fingerprint(message);
      applyHighlight(message, hit.keyword);
      if (matches.has(id)) continue;

      matches.add(id);
      const seller = messageProfileName(message) || messageAuthor(message);
      if (isRepeatSale(recentSales, saleKey(seller, hit.names), Date.now())) {
        log.info("Repeat sale suppressed", seller);
        continue;
      }

      const room = message.dataset?.fcsRoom;
      const title = room ? `Keyword Alert: "${hit.keyword}" · ${room}` : `Keyword Alert: "${hit.keyword}"`;
      ctx.notify(title, messageAuthor(message));
      ctx.markUnread?.(id);
      log.info("Keyword match", hit.keyword);
    }
  },
});

keywordAlerts.loadFrom = (ctx) => load(ctx.storage);
keywordAlerts.readText = () => Array.from(keywords).join(", ");
keywordAlerts.writeText = (ctx, text) => writeKeywords(ctx.storage, text);
keywordAlerts.readSide = () => tradeSideFilter;
keywordAlerts.writeSide = (ctx, value) => {
  saveSide(ctx.storage, value);
  if (keywordAlerts.isEnabled()) repaintVisible();
};
