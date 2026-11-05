import { keys } from "../../core/storage.js";

export const MAX_FILL_VALUE = 200;
export const MAX_LAST_VALUES = 100;

const PLACEHOLDER_SOURCE = "\\{([A-Za-z0-9_ ]{1,30})\\}";

function placeholderPattern() {
  return new RegExp(PLACEHOLDER_SOURCE, "g");
}

/** Unique placeholder names in order of first appearance. */
export function getPlaceholders(text) {
  const names = [];
  for (const match of String(text).matchAll(placeholderPattern())) {
    const name = match[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Replaces {name} with its value. A blank value keeps the {name} token.
 * @param {string} text
 * @param {Record<string, string>} values
 */
export function fillTemplate(text, values) {
  return String(text).replace(placeholderPattern(), (match, raw) => {
    const value = values[raw.trim()];
    return typeof value === "string" && value ? value : match;
  });
}

/**
 * @param {ReturnType<import("../../core/storage.js").createStorage>} store
 */
export function loadLastValues(store) {
  const raw = store.getJson(keys.lastValues, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

/**
 * Newest entries sit at the end. The map is capped so a long history cannot grow forever.
 * @param {Record<string, string>} current
 * @param {Record<string, string>} values
 */
export function rememberValues(current, values) {
  const next = { ...current };
  for (const [name, value] of Object.entries(values)) {
    delete next[name];
    next[name] = String(value).slice(0, MAX_FILL_VALUE);
  }

  const names = Object.keys(next);
  while (names.length > MAX_LAST_VALUES) delete next[names.shift()];
  return next;
}

/**
 * @param {ReturnType<import("../../core/storage.js").createStorage>} store
 * @param {Record<string, string>} values
 */
export function saveLastValues(store, values) {
  const next = rememberValues(loadLastValues(store), values);
  return store.setJson(keys.lastValues, next);
}
