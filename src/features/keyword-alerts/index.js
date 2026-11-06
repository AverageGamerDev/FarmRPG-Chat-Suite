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
import { keys } from "../../core/storage.js";
import { log } from "../../core/log.js";
import { playerMute } from "../player-mute/index.js";

const KEYWORD_CLASS = "fcs-keyword";
const BADGE_CLASS = "fcs-keyword-badge";

const matches = createBoundedSet(100);
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
  const keyword = matchKeyword(extractItemNames(messageBody(message)), keywords);
  if (!keyword) return null;
  if (!acceptsTradeSide(tradeSideFilter, tradeIntent(messageText(message)))) return null;
  return keyword;
}

function repaintVisible() {
  removeHighlights();
  for (const message of queryMessages()) {
    const hit = keywordHit(message);
    if (hit) applyHighlight(message, hit);
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
    removeHighlights();
    log.info("Keyword watcher stopped");
  },

  onMessages(messages, _mutations, ctx) {
    if (keywords.size === 0) return;

    for (const message of messages) {
      const hit = keywordHit(message);
      if (!hit) continue;

      const seller = messageProfileName(message) || messageAuthor(message);
      const id = fingerprint(message);
      if (playerMute.blocks(seller)) {
        matches.add(id);
        continue;
      }

      applyHighlight(message, hit);
      if (matches.has(id)) continue;

      matches.add(id);
      const room = message.dataset?.fcsRoom;
      const title = room ? `Keyword Alert: "${hit}" · ${room}` : `Keyword Alert: "${hit}"`;
      ctx.notify(title, messageAuthor(message));
      ctx.markUnread?.(id);
      log.info("Keyword match", hit);
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
