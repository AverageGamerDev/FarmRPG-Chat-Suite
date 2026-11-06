import { createChatPoll } from "./core/chat-poll.js";
import { createChatWatcher } from "./core/dom-observer.js";
import { createIdentity } from "./core/identity.js";
import { log } from "./core/log.js";
import { ensureNotificationPermission, notify } from "./core/notifications.js";
import { storage } from "./core/storage.js";
import { features } from "./features/index.js";
import { mountControlPanel } from "./ui/control-panel.js";
import { injectStyles } from "./ui/styles.js";

function boot() {
  const ctx = {
    storage,
    identity: createIdentity(storage),
    notify,
    ensureNotificationPermission,
  };

  function deliver(messages, mutations) {
    for (const feature of features) {
      if (!feature.isEnabled?.() || !feature.onMessages) continue;
      try {
        feature.onMessages(messages, mutations, ctx);
      } catch (error) {
        log.error(feature.id, error);
      }
    }
  }

  const poll = createChatPoll({ onMessages: deliver });

  const watcher = createChatWatcher(
    (messages, mutations) => {
      poll.remember(messages);
      deliver(messages, mutations);
    },
    () => {
      for (const feature of features) {
        try {
          feature.scanExisting?.(ctx);
        } catch (error) {
          log.error(feature.id, error);
        }
      }
    },
  );

  injectStyles();
  watcher.start();
  poll.start();

  for (const feature of features) {
    try {
      feature.mount?.(ctx);
    } catch (error) {
      log.error(feature.id, error);
    }
  }

  mountControlPanel(features, ctx);
  log.info("FarmRPG Chat Suite ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
