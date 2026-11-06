import { messageProfileName, queryMessages } from "../../core/chat.js";
import { defineFeature } from "../../core/feature.js";
import { normalizeUsername, sanitizeUsername } from "../../core/identity.js";
import { log } from "../../core/log.js";
import { keys } from "../../core/storage.js";

const FRIEND_CLASS = "fcs-friend";

/** @type {Map<string, string>} */
let friendsById = new Map();
const listeners = new Set();

/**
 * Visible name, without a leading @ or a trailing chip level such as [200].
 * @param {string | null | undefined} name
 */
export function friendLabel(name) {
  return sanitizeUsername(name).replace(/\s\[\d[\d,]*\]$/, "").replace(/\s+/g, " ").trim();
}

/**
 * Stable id. Profile encoding and the visible name match. "Someone" is not a friend.
 * @param {string | null | undefined} name
 */
export function friendKey(name) {
  const id = normalizeUsername(friendLabel(name));
  if (!id || id === "someone") return "";
  return id;
}

/**
 * Names separated by commas. Duplicates inside the input are dropped.
 * @param {string | null | undefined} input
 */
export function parseFriendInput(input) {
  const seen = new Set();
  const people = [];
  for (const part of String(input || "").split(",")) {
    const label = friendLabel(part);
    const id = friendKey(label);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    people.push({ id, label });
  }
  return people;
}

/**
 * @param {Iterable<{ id: string }>} list
 * @param {string | null | undefined} profile
 */
export function isFriend(list, profile) {
  const id = friendKey(profile);
  if (!id) return false;
  for (const person of list) {
    if (person.id === id) return true;
  }
  return false;
}

function readList() {
  return Array.from(friendsById, ([id, label]) => ({ id, label }));
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      log.error("friend list", error);
    }
  }
}

function load(store) {
  const stored = store.getJson(keys.friends, []);
  friendsById = new Map();
  if (!Array.isArray(stored)) return;
  for (const entry of stored) {
    const label = friendLabel(typeof entry === "string" ? entry : entry?.label || entry?.id);
    const id = friendKey(label);
    if (id) friendsById.set(id, label);
  }
}

function save(store) {
  if (friendsById.size === 0) store.remove(keys.friends);
  else store.setJson(keys.friends, readList());
}

function canTouchPage() {
  return typeof document !== "undefined";
}

function clearPaint() {
  if (!canTouchPage()) return;
  document.querySelectorAll(`.${FRIEND_CLASS}`).forEach((message) => {
    message.classList.remove(FRIEND_CLASS);
  });
}

/**
 * @param {Element[]} messages
 */
function paint(messages) {
  for (const message of messages) {
    const profile = messageProfileName(message);
    if (!isFriend(readList(), profile)) continue;
    message.classList.add(FRIEND_CLASS);
  }
}

function paintAll() {
  if (!canTouchPage()) return;
  clearPaint();
  if (!friendMarks.isEnabled()) return;
  paint(queryMessages());
}

/**
 * @param {import("../../core/feature.js").SuiteContext} ctx
 * @param {string} text
 */
function addNames(ctx, text) {
  let added = 0;
  for (const person of parseFriendInput(text)) {
    if (friendsById.has(person.id)) continue;
    friendsById.set(person.id, person.label);
    added += 1;
  }
  if (!added) return 0;
  save(ctx.storage);
  paintAll();
  notify();
  log.info("Friends added", added);
  return added;
}

/**
 * @param {import("../../core/feature.js").SuiteContext} ctx
 * @param {string} id
 */
function removeFriend(ctx, id) {
  const key = friendKey(id);
  if (!key || !friendsById.has(key)) return;
  friendsById.delete(key);
  save(ctx.storage);
  if (friendMarks.isEnabled() && friendsById.size === 0) friendMarks.stop(ctx);
  else paintAll();
  notify();
  log.info("Friend removed", key);
}

export const friendMarks = defineFeature({
  id: "friends",
  toggle: {
    label: "Friends",
    hint: "Mark messages from people you list",
  },
  requires: "friends",

  start(ctx) {
    load(ctx.storage);
    if (friendsById.size === 0) return false;
    log.info("Friends started", friendsById.size);
    return true;
  },

  stop() {
    clearPaint();
    log.info("Friends stopped");
  },

  onMessages(messages) {
    paint(messages);
  },

  scanExisting() {
    if (!canTouchPage()) return;
    paint(queryMessages());
  },
});

friendMarks.loadFrom = (ctx) => load(ctx.storage);
friendMarks.readFriends = () => readList();
friendMarks.addNames = (ctx, text) => addNames(ctx, text);
friendMarks.remove = (ctx, id) => removeFriend(ctx, id);
friendMarks.subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
