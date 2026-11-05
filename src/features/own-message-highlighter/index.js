import { messageProfileName, queryMessages } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { normalizeUsername } from "../../core/identity.js";
import { log } from "../../core/log.js";

const OWN_CLASS = "fcs-own";

function paint(messages, username) {
  if (!username) return;
  const mine = normalizeUsername(username);

  for (const message of messages) {
    const profileName = messageProfileName(message);
    if (!profileName || normalizeUsername(profileName) !== mine) continue;
    message.classList.add(OWN_CLASS);
  }
}

function clearPaint() {
  document.querySelectorAll(`.${OWN_CLASS}`).forEach((message) => {
    message.classList.remove(OWN_CLASS);
  });
}

export const ownMessageHighlighter = defineFeature({
  id: "highlight",
  toggle: {
    label: "Highlight",
    hint: "Mark messages you sent",
  },
  requires: "username",

  start(ctx) {
    const username = ctx.identity.recall();
    if (!username) return false;

    log.info("Highlighter started for", username);
    return true;
  },

  stop() {
    clearPaint();
    log.info("Highlighter stopped");
  },

  onMessages(messages, _mutations, ctx) {
    paint(messages, ctx.identity.get());
  },

  scanExisting(ctx) {
    paint(queryMessages(), ctx.identity.get());
  },
});
