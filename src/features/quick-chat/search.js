/** Search appears once the list is long enough that scrolling becomes the slow path. */
export const SEARCH_THRESHOLD = 8;

/**
 * @param {Array<{ text: string, title?: string }>} phrases
 * @param {boolean} editMode
 */
export function shouldShowSearch(phrases, editMode) {
  return !editMode && phrases.length > SEARCH_THRESHOLD;
}

/**
 * Edit mode always shows the full list so move-up / move-down swaps real neighbours.
 * @param {Array<{ text: string, title?: string }>} phrases
 * @param {string} query
 * @param {boolean} editMode
 */
export function visiblePhrases(phrases, query, editMode) {
  const needle = query.trim().toLowerCase();
  if (!shouldShowSearch(phrases, editMode) || !needle) return phrases;

  return phrases.filter(
    (phrase) =>
      phrase.text.toLowerCase().includes(needle) ||
      (phrase.title || "").toLowerCase().includes(needle),
  );
}
