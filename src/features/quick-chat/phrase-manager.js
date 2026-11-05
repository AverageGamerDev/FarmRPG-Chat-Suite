import { keys } from "../../core/storage.js";

export const MAX_TITLE = 40;

const ID_LENGTH = 7;

/** The chat composer is a single line, so newlines collapse to spaces. */
export function cleanText(value) {
  return String(value ?? "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
}

export function cleanTitle(value) {
  return cleanText(value).slice(0, MAX_TITLE);
}

/**
 * @param {Array<{ id?: string }>} [existing]
 */
export function createId(existing = []) {
  const used = new Set(existing.map((phrase) => phrase.id));
  let id = "";
  do {
    id = `_${Math.random().toString(36).slice(2, 2 + ID_LENGTH)}`;
  } while (used.has(id));
  return id;
}

/**
 * @param {ReturnType<import("../../core/storage.js").createStorage>} store
 */
export function loadPhrases(store) {
  const raw = store.getJson(keys.phrases, []);
  if (!Array.isArray(raw)) return [];

  const phrases = [];
  for (const phrase of raw) {
    if (!phrase || typeof phrase.text !== "string") continue;
    const text = cleanText(phrase.text);
    if (!text) continue;
    phrases.push({
      id: typeof phrase.id === "string" && phrase.id ? phrase.id : createId(phrases),
      title: cleanTitle(phrase.title),
      text,
    });
  }
  return phrases;
}

/**
 * @param {ReturnType<import("../../core/storage.js").createStorage>} store
 * @param {Array<{ id: string, title: string, text: string }>} phrases
 */
export function savePhrases(store, phrases) {
  return store.setJson(keys.phrases, phrases);
}

/**
 * @param {Array<{ id: string }>} phrases
 * @param {string} id
 * @param {number} direction
 */
export function movePhrase(phrases, id, direction) {
  const index = phrases.findIndex((phrase) => phrase.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= phrases.length) return false;
  [phrases[index], phrases[target]] = [phrases[target], phrases[index]];
  return true;
}

/**
 * @param {Array<{ id: string }>} phrases
 * @param {string} id
 */
export function removePhrase(phrases, id) {
  const index = phrases.findIndex((phrase) => phrase.id === id);
  if (index < 0) return null;
  const [phrase] = phrases.splice(index, 1);
  return { phrase, index };
}

/**
 * @param {Array<{ id: string }>} phrases
 * @param {{ id: string }} phrase
 * @param {number} index
 */
export function insertPhrase(phrases, phrase, index) {
  const at = Math.min(Math.max(index, 0), phrases.length);
  phrases.splice(at, 0, phrase);
}

/**
 * Writes the add/edit/duplicate form into the list. Returns false when the text is empty.
 * @param {Array<{ id: string, title: string, text: string }>} phrases
 * @param {{ id: string | null, title: string, text: string, afterId?: string }} form
 */
export function applyForm(phrases, form) {
  const text = cleanText(form.text);
  if (!text) return false;

  const title = cleanTitle(form.title);

  if (form.id) {
    const phrase = phrases.find((entry) => entry.id === form.id);
    if (phrase) {
      phrase.title = title;
      phrase.text = text;
    }
    return true;
  }

  const entry = { id: createId(phrases), title, text };
  const at = form.afterId ? phrases.findIndex((phrase) => phrase.id === form.afterId) : -1;
  if (at === -1) phrases.push(entry);
  else phrases.splice(at + 1, 0, entry);
  return true;
}
