import { createBoundedSet } from "./bounded-set.js";
import { fingerprint, queryMessages } from "./chat.js";
import { log } from "./log.js";

const POLL_MS = 4000;
const ROOM_SELECTORS = ["#chatroom_mobile", "#chatroom_desktop", "input.chatroom"];

/** Room ids match the game's channel links and worker.php?go=getchat&room=. */
export const CHAT_CHANNELS = [
  ["help", "Help"],
  ["global", "Global"],
  ["spoilers", "Spoilers"],
  ["trivia", "Trivia"],
  ["giveaways", "Giveaways"],
  ["trade", "Trade"],
];

/**
 * A saved room id, or "" when alerts should follow the room on screen.
 * @param {string | null | undefined} value
 */
export function normalizeWatchedChannel(value) {
  const id = String(value || "").trim().toLowerCase();
  return CHAT_CHANNELS.some(([room]) => room === id) ? id : "";
}

/**
 * @param {string} id
 */
export function channelLabel(id) {
  return CHAT_CHANNELS.find(([room]) => room === id)?.[1] || "";
}

/**
 * Rooms to fetch this tick. The hidden current room still alerts.
 * A chosen room is added only while the player is somewhere else.
 * @param {{ currentRoom?: string, watchedRoom?: string, chatHidden: boolean }} state
 */
export function roomsToPoll({ currentRoom, watchedRoom, chatHidden }) {
  const current = String(currentRoom || "").trim().toLowerCase();
  const watched = normalizeWatchedChannel(watchedRoom);
  const rooms = [];
  if (chatHidden && current) rooms.push(current);
  if (watched && watched !== current) rooms.push(watched);
  return rooms;
}

/**
 * The game only writes new rows into the chat while that chat is on screen.
 * On mobile the panel is closed most of the time, so mentions and item alerts
 * poll worker.php?go=getchat and run against the new rows. The first snapshot
 * is treated as history. The session line stays put until a connected zone redraws.
 *
 * @param {{ desktopVisible: boolean, panelOpen: boolean }} state
 */
export function shouldPollChat({ desktopVisible, panelOpen }) {
  if (desktopVisible || panelOpen) return false;
  return true;
}

/**
 * @param {ParentNode} [root]
 */
export function readChatRoom(root = document) {
  for (const selector of ROOM_SELECTORS) {
    const value = root.querySelector(selector)?.value;
    if (value) return value;
  }
  return "";
}

/**
 * @param {string} html
 */
export function messagesFromChatHtml(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return Array.from(holder.querySelectorAll(".chat-txt"));
}

/**
 * Rows whose fingerprint has not been remembered yet.
 * @param {{ has: (id: string) => boolean }} seen
 * @param {Element[]} messages
 * @param {(message: Element) => string} [fingerprintOf]
 */
export function unseenMessages(seen, messages, fingerprintOf = fingerprint) {
  const fresh = [];
  for (const message of messages) {
    const id = fingerprintOf(message);
    if (!id || seen.has(id)) continue;
    fresh.push(message);
  }
  return fresh;
}

/**
 * @param {ParentNode} [root]
 */
export function chatPollState(root = document) {
  const desktop = root.querySelector("#chatzoneDesktop");
  const panel = root.querySelector("#mobilechatpanel");
  return {
    desktopVisible: !!desktop && desktop.getClientRects().length > 0,
    panelOpen: !!panel && panel.classList.contains("active"),
  };
}

/**
 * @param {{
 *   onMessages: (messages: Element[], mutations: MutationRecord[]) => void,
 *   readWatched?: () => string,
 * }} options
 */
export function createChatPoll({ onMessages, readWatched = () => "" }) {
  const seen = createBoundedSet(500);
  const primed = new Set();
  let timer = 0;
  let running = false;

  function remember(messages) {
    for (const message of messages) {
      const id = fingerprint(message);
      if (id) seen.add(id);
    }
  }

  async function pollRoom(room, current) {
    const html = await fetchChatHtml(room);
    if (!html) return;

    const parsed = messagesFromChatHtml(html);
    const label = channelLabel(room);
    if (label && room !== current) {
      for (const message of parsed) message.dataset.fcsRoom = label;
    }

    if (!primed.has(room)) {
      remember(parsed);
      if (room === current) remember(queryMessages());
      primed.add(room);
      return;
    }

    const fresh = unseenMessages(seen, parsed);
    if (fresh.length === 0) return;
    remember(fresh);
    onMessages(fresh, []);
  }

  async function tick() {
    if (running) return;

    const hidden = shouldPollChat(chatPollState());
    if (!hidden) remember(queryMessages());

    const current = readChatRoom().trim().toLowerCase();
    const rooms = roomsToPoll({
      currentRoom: current,
      watchedRoom: readWatched(),
      chatHidden: hidden,
    });
    if (rooms.length === 0) return;

    running = true;
    try {
      for (const room of rooms) {
        try {
          await pollRoom(room, current);
        } catch (error) {
          log.error("chat poll failed", room, error);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    remember,
    start() {
      remember(queryMessages());
      tick();
      timer = window.setInterval(tick, POLL_MS);
    },
    stop() {
      window.clearInterval(timer);
    },
  };
}

/**
 * @param {string} room
 */
async function fetchChatHtml(room) {
  const url = `worker.php?go=getchat&room=${encodeURIComponent(room)}&cachebuster=${Date.now()}`;
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) return "";
  return response.text();
}
