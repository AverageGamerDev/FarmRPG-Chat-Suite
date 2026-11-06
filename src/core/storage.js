/**
 * localStorage keys kept stable so data saved by the earlier userscripts
 * still loads in the suite.
 */
export const keys = {
  username: "farmrpg_chat_username",
  seenMessages: "farmrpg_seen_messages",
  keywords: "farmrpg_chat_keywords",
  phrases: "frpgqp_phrases_v1",
  lastValues: "frpgqp_lastvalues_v1",
  enabled: "fcs_enabled_v1",
  watchedChannel: "fcs_watch_channel_v1",
  tradeSide: "fcs_trade_side_v1",
};

function browserStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__fcs_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null} backend
 */
export function createStorage(backend = browserStorage()) {
  return {
    get(key) {
      if (!backend) return null;
      try {
        return backend.getItem(key);
      } catch (error) {
        console.error("[Chat Suite] storage read failed", error);
        return null;
      }
    },

    set(key, value) {
      if (!backend) return false;
      try {
        backend.setItem(key, String(value));
        return true;
      } catch (error) {
        console.error("[Chat Suite] storage write failed", error);
        return false;
      }
    },

    remove(key) {
      if (!backend) return;
      try {
        backend.removeItem(key);
      } catch (error) {
        console.error("[Chat Suite] storage remove failed", error);
      }
    },

    getJson(key, fallback) {
      const raw = this.get(key);
      if (raw == null || raw === "") return fallback;
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.error("[Chat Suite] invalid JSON in", key, error);
        return fallback;
      }
    },

    setJson(key, value) {
      return this.set(key, JSON.stringify(value));
    },
  };
}

export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return createStorage({
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  });
}

export const storage = createStorage();
