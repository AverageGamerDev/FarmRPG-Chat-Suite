import { createBoundedSet } from "../../core/bounded-set.js";
import { fingerprint, messageAuthor, messageText } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { log } from "../../core/log.js";

const seen = createBoundedSet(100);

export const mentionNotifications = defineFeature({
  id: "mentions",
  toggle: {
    label: "Mentions",
    hint: "Alert when your name is said",
  },
  requires: "username",

  start(ctx) {
    const username = ctx.identity.recall();
    if (!username) return false;

    void ctx.ensureNotificationPermission();
    log.info("Mention watcher started for", username);
    return true;
  },

  stop() {
    seen.clear();
    log.info("Mention watcher stopped");
  },

  onMessages(messages, _mutations, ctx) {
    const username = ctx.identity.get();
    if (!username) return;

    const needle = username.toLowerCase();

    for (const message of messages) {
      const text = messageText(message);
      if (!text || !text.toLowerCase().includes(needle)) continue;

      const id = fingerprint(message);
      if (seen.has(id)) continue;
      seen.add(id);

      const author = messageAuthor(message);
      const room = message.dataset?.fcsRoom;
      const title = room ? `You were mentioned! · ${room}` : "You were mentioned!";
      ctx.notify(title, `${author}: ${text.slice(0, 100)}`);
      ctx.markUnread?.(id);
      log.info("Mention detected", author);
    }
  },
});
