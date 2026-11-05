import { cleanText, cleanTitle, createId } from "./phrase-manager.js";

/**
 * Clipboard payload. Ids stay local; a pasted copy gets new ones on import.
 * @param {Array<{ title: string, text: string }>} phrases
 */
export function toExportJson(phrases) {
  return JSON.stringify(
    phrases.map(({ title, text }) => ({ title, text })),
    null,
    2,
  );
}

/**
 * Appends phrases whose text is not already saved. Invalid entries are skipped.
 * @param {Array<{ id: string, title: string, text: string }>} phrases
 * @param {unknown} data
 * @returns {number} how many phrases were added
 */
export function mergeImported(phrases, data) {
  if (!Array.isArray(data)) {
    throw new Error("Expected a list");
  }

  const existing = new Set(phrases.map((phrase) => phrase.text));
  let added = 0;

  for (const item of data) {
    if (!item || typeof item.text !== "string") continue;

    const text = cleanText(item.text);
    if (!text || existing.has(text)) continue;

    phrases.push({
      id: createId(phrases),
      title: cleanTitle(item.title),
      text,
    });
    existing.add(text);
    added += 1;
  }

  return added;
}
