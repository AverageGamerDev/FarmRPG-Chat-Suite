import { createBoundedSet } from "./bounded-set.js";
import { fingerprint, queryMessages } from "./chat.js";
import { log } from "./log.js";

const POLL_MS = 4000;
const ROOM_SELECTORS = ["#chatroom_mobile", "#chatroom_desktop", "input.chatroom"];

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
 * @param {{ onMessages: (messages: Element[], mutations: MutationRecord[]) => void }} options
 */
export function createChatPoll({ onMessages }) {
  const seen = createBoundedSet(500);
  let primed = false;
  let timer = 0;
  let running = false;

  function remember(messages) {
    for (const message of messages) {
      const id = fingerprint(message);
      if (id) seen.add(id);
    }
  }

  async function tick() {
    if (running) return;

    if (!shouldPollChat(chatPollState())) {
      remember(queryMessages());
      primed = true;
      return;
    }

    const room = readChatRoom();
    if (!room) return;

    running = true;
    try {
      const html = await fetchChatHtml(room);
      if (!html) return;

      const parsed = messagesFromChatHtml(html);
      if (!primed) {
        remember(queryMessages());
        remember(parsed);
        primed = true;
        return;
      }

      const fresh = unseenMessages(seen, parsed);
      if (fresh.length === 0) return;
      remember(fresh);
      onMessages(fresh, []);
    } catch (error) {
      log.error("chat poll failed", error);
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
