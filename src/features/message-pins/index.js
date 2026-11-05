import { fingerprint, queryMessages } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { log } from "../../core/log.js";

const TARGET_CLASS = "fcs-pin-target";
const PINNED_CLASS = "fcs-pinned";
const BUTTON_CLASS = "fcs-pin-btn";

const marked = new Set();

function applyPin(message) {
  message.classList.add(TARGET_CLASS, PINNED_CLASS);
}

function removePinStyle(message) {
  message.classList.remove(PINNED_CLASS);
}

/**
 * @param {Element} message
 */
function createButton(message) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.textContent = "📌";
  button.title = "Mark for later";

  const id = fingerprint(message);
  if (marked.has(id)) {
    applyPin(message);
    button.classList.add("is-on");
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePin(message, button);
  });

  return button;
}

function togglePin(message, button) {
  const id = fingerprint(message);

  if (marked.has(id)) {
    marked.delete(id);
    removePinStyle(message);
    button.classList.remove("is-on");
    log.info("Message unpinned");
    return;
  }

  marked.add(id);
  applyPin(message);
  button.classList.add("is-on");
  log.info("Message pinned");
}

function hasPinButton(message) {
  return Array.from(message.children).some((child) => child.classList?.contains(BUTTON_CLASS));
}

function addButtons(messages) {
  for (const message of messages) {
    if (hasPinButton(message)) continue;
    message.classList.add(TARGET_CLASS);
    message.appendChild(createButton(message));
  }
}

function removeButtons() {
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
  document.querySelectorAll(`.${PINNED_CLASS}`).forEach((message) => {
    message.classList.remove(PINNED_CLASS);
  });
  document.querySelectorAll(`.${TARGET_CLASS}`).forEach((message) => {
    message.classList.remove(TARGET_CLASS);
  });
}

function clearAll() {
  marked.clear();
  document.querySelectorAll(`.${PINNED_CLASS}`).forEach((message) => {
    message.classList.remove(PINNED_CLASS);
  });
  document.querySelectorAll(`.${BUTTON_CLASS}.is-on`).forEach((button) => {
    button.classList.remove("is-on");
  });
  log.info("All pins cleared");
}

export const messagePins = defineFeature({
  id: "pins",
  toggle: {
    label: "Pins",
    hint: "Keep messages on screen until reload",
  },
  extras: [
    {
      id: "clear-pins",
      label: "Clear",
      visible: () => messagePins.isEnabled(),
      run() {
        if (marked.size === 0) return;
        clearAll();
      },
    },
  ],

  start() {
    log.info("Message pins started");
    return true;
  },

  stop() {
    removeButtons();
    marked.clear();
    log.info("Message pins stopped");
  },

  onMessages(messages) {
    addButtons(messages);
  },

  scanExisting() {
    addButtons(queryMessages());
  },
});
