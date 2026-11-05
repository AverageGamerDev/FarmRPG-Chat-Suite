import { keys } from "./storage.js";

/**
 * @param {string | null | undefined} username
 */
export function sanitizeUsername(username) {
  if (!username) return "";

  let clean = String(username).trim();
  if (clean.startsWith("@")) clean = clean.slice(1);
  if (clean.endsWith(":")) clean = clean.slice(0, -1);
  return clean;
}

/**
 * Profile links encode spaces as "+". Comparison is case-insensitive.
 * @param {string | null | undefined} username
 */
export function normalizeUsername(username) {
  return sanitizeUsername(username).toLowerCase().replace(/\+/g, " ");
}

function defaultAsk(message) {
  return typeof prompt === "function" ? prompt(message) : null;
}

/**
 * Shared username for mentions and own-message highlighting.
 * Stored as JSON so values written by the previous userscript still parse.
 *
 * @param {ReturnType<import("./storage.js").createStorage>} store
 * @param {{ ask?: (message: string) => string | null }} [options]
 */
export function createIdentity(store, { ask = defaultAsk } = {}) {
  let username = null;

  function readStored() {
    const value = store.getJson(keys.username, null);
    return typeof value === "string" && value ? value : null;
  }

  return {
    get() {
      return username;
    },

    /** Load the saved name without prompting. */
    recall() {
      if (username) return username;
      username = readStored();
      return username;
    },

    set(name) {
      username = sanitizeUsername(name);
      store.setJson(keys.username, username);
      return username;
    },

    clear() {
      username = null;
      store.remove(keys.username);
      store.remove(keys.seenMessages);
    },

    /**
     * Reuse the saved name, otherwise ask once. Cancel returns null.
     * @param {string} message
     */
    ensure(message) {
      if (username) return username;

      const stored = readStored();
      if (stored) {
        username = stored;
        return username;
      }

      const input = ask(message);
      if (!input) return null;

      const clean = sanitizeUsername(input);
      if (!clean) return null;
      return this.set(clean);
    },
  };
}
