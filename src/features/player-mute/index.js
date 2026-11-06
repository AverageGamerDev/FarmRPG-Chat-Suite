import { messageAuthor, messageProfileName, queryMessages } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { normalizeUsername } from "../../core/identity.js";
import { log } from "../../core/log.js";
import { keys } from "../../core/storage.js";

const TARGET_CLASS = "fcs-mute-target";
const COLLAPSED_CLASS = "fcs-muted";
const BUTTON_CLASS = "fcs-mute-btn";
const BAR_CLASS = "fcs-mute-bar";

/** @type {Map<string, string>} */
let muted = new Map();
/** @type {import("../../core/feature.js").SuiteContext | null} */
let ctxRef = null;
const listeners = new Set();

/**
 * Stable id for a player. Profile encoding and the visible name match.
 * "Someone" is not a player.
 * @param {string | null | undefined} profile
 * @param {string | null | undefined} author
 */
export function playerKey(profile, author) {
  const id = normalizeUsername(profile || author);
  if (!id || id === "someone") return "";
  return id;
}

/**
 * @param {Element} message
 */
export function messagePlayerKey(message) {
  return playerKey(messageProfileName(message), messageAuthor(message));
}

function readList() {
  return Array.from(muted, ([id, label]) => ({ id, label }));
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      log.error("mute list", error);
    }
  }
}

/**
 * @param {import("../../core/storage.js").createStorage extends Function ? ReturnType<import("../../core/storage.js").createStorage> : never} store
 */
function load(store) {
  const stored = store.getJson(keys.mutedPlayers, []);
  muted = new Map();
  if (!Array.isArray(stored)) return;

  for (const entry of stored) {
    if (typeof entry === "string") {
      const id = playerKey(entry);
      if (id) muted.set(id, entry);
      continue;
    }
    const id = playerKey(entry?.id, entry?.label);
    if (id) muted.set(id, String(entry?.label || id));
  }
}

/**
 * @param {import("../../core/storage.js").createStorage extends Function ? ReturnType<import("../../core/storage.js").createStorage> : never} store
 */
function save(store) {
  if (muted.size === 0) store.remove(keys.mutedPlayers);
  else store.setJson(keys.mutedPlayers, readList());
}

function canTouchPage() {
  return typeof document !== "undefined";
}

/**
 * @param {Element} message
 * @param {string} label
 */
function collapse(message, label) {
  message.classList.add(TARGET_CLASS, COLLAPSED_CLASS);
  let bar = Array.from(message.children).find((child) => child.classList?.contains(BAR_CLASS));
  if (!bar) {
    bar = document.createElement("div");
    bar.className = BAR_CLASS;
    const name = document.createElement("span");
    name.className = "fcs-mute-label";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fcs-mute-unmute";
    button.textContent = "Unmute";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = messagePlayerKey(message);
      if (id && ctxRef) unmutePlayer(ctxRef, id);
    });
    bar.append(name, button);
    message.appendChild(bar);
  }
  const name = bar.querySelector(".fcs-mute-label");
  if (name) name.textContent = label;
}

/**
 * @param {Element} message
 */
function expand(message) {
  message.classList.remove(COLLAPSED_CLASS);
  Array.from(message.children)
    .filter((child) => child.classList?.contains(BAR_CLASS))
    .forEach((bar) => bar.remove());
}

/**
 * @param {Element} message
 */
function ensureMuteButton(message) {
  const id = messagePlayerKey(message);
  if (!id) return;
  if (Array.from(message.children).some((child) => child.classList?.contains(BUTTON_CLASS))) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.textContent = "Mute";
  button.title = "Collapse this player and skip their alerts";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!ctxRef) return;
    mutePlayer(ctxRef, id, messageAuthor(message));
  });
  message.classList.add(TARGET_CLASS);
  message.appendChild(button);
}

function applyAll() {
  if (!canTouchPage()) return;
  for (const message of queryMessages()) {
    ensureMuteButton(message);
    const id = messagePlayerKey(message);
    if (id && muted.has(id)) collapse(message, muted.get(id) || id);
    else expand(message);
  }
}

function removeChrome() {
  if (!canTouchPage()) return;
  document.querySelectorAll(`.${BUTTON_CLASS}, .${BAR_CLASS}`).forEach((node) => node.remove());
  document.querySelectorAll(`.${COLLAPSED_CLASS}`).forEach((message) => {
    message.classList.remove(COLLAPSED_CLASS);
  });
  document.querySelectorAll(`.${TARGET_CLASS}`).forEach((message) => {
    message.classList.remove(TARGET_CLASS);
  });
}

/**
 * @param {import("../../core/feature.js").SuiteContext} ctx
 * @param {string} id
 * @param {string} label
 */
function mutePlayer(ctx, id, label) {
  const key = playerKey(id, label);
  if (!key) return;
  muted.set(key, label || key);
  save(ctx.storage);
  applyAll();
  notify();
  log.info("Player muted", key);
}

/**
 * @param {import("../../core/feature.js").SuiteContext} ctx
 * @param {string} id
 */
function unmutePlayer(ctx, id) {
  const key = playerKey(id);
  if (!key || !muted.has(key)) return;
  muted.delete(key);
  save(ctx.storage);
  applyAll();
  notify();
  log.info("Player unmuted", key);
}

export const playerMute = defineFeature({
  id: "mute",
  toggle: {
    label: "Mute",
    hint: "Collapse a player and skip their alerts",
  },

  start(ctx) {
    ctxRef = ctx;
    load(ctx.storage);
    log.info("Player mute started", muted.size);
    return true;
  },

  stop() {
    removeChrome();
    log.info("Player mute stopped");
  },

  onMessages(messages) {
    for (const message of messages) {
      ensureMuteButton(message);
      const id = messagePlayerKey(message);
      if (id && muted.has(id)) collapse(message, muted.get(id) || id);
      else expand(message);
    }
  },

  scanExisting() {
    applyAll();
  },
});

/**
 * True while Mute is on and this player is in the saved list.
 * @param {string | null | undefined} name
 */
playerMute.blocks = (name) => playerMute.isEnabled() && muted.has(playerKey(name));
playerMute.readMuted = () => readList();
playerMute.mute = (ctx, id, label) => mutePlayer(ctx, id, label);
playerMute.unmute = (ctx, id) => unmutePlayer(ctx, id);
playerMute.subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
