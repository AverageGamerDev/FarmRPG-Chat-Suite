
// ==UserScript==
// @name         FarmRPG Chat Suite
// @namespace    https://farmrpg.com/
// @version      1.0.0
// @description  Chat enhancements and quick chat utilities for FarmRPG
// @author       Cadis Etrama Di Raizel
// @match        https://farmrpg.com/
// @match        https://farmrpg.com/*
// @match        https://*.farmrpg.com/
// @match        https://*.farmrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=farmrpg.com
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(() => {
  // src/core/bounded-set.js
  function createBoundedSet(max) {
    const values = /* @__PURE__ */ new Set();
    return {
      has(value) {
        return values.has(value);
      },
      add(value) {
        if (values.has(value)) return;
        values.add(value);
        const overflow = values.size - max;
        if (overflow <= 0) return;
        const iterator = values.values();
        for (let count = 0; count < overflow; count += 1) {
          values.delete(iterator.next().value);
        }
      },
      clear() {
        values.clear();
      },
      get size() {
        return values.size;
      }
    };
  }

  // src/core/chat.js
  var CHAT_SELECTORS = ["#chatzoneDesktop", "#chatzoneMobile"];
  var CHAT_INPUT_SELECTOR = "#chat_txt_desktop, #chat_txt_mobile, #chat_message_compact, input[id^='chat_txt_']";
  var MESSAGE_SELECTOR = ".chat-txt";
  function findChatContainers(root = document) {
    const found = [];
    for (const selector of CHAT_SELECTORS) {
      found.push(...root.querySelectorAll(selector));
    }
    return found;
  }
  function queryMessages(root = document) {
    return Array.from(root.querySelectorAll(MESSAGE_SELECTOR));
  }
  function messageText(message) {
    const node = message.children[5];
    if (!node) return "";
    return node.innerText || node.textContent || "";
  }
  function messageBody(message) {
    return message.children[5] ?? null;
  }
  var AUTHOR_LINK = 'a[href*="profile.php?user_name="]';
  function authorLabel(node) {
    if (!node) return "";
    const copy = typeof node.cloneNode === "function" ? node.cloneNode(true) : node;
    const badges = typeof copy.querySelectorAll === "function" ? Array.from(copy.querySelectorAll(".fcs-keyword-badge")) : [];
    for (const badge of badges) badge.remove();
    Array.from(copy.children || []).filter((child) => child.classList?.contains("fcs-keyword-badge")).forEach((child) => child.remove());
    return (copy.textContent || "").replace(/\s+/g, " ").trim();
  }
  function messageAuthor(message) {
    const node = message.children[2];
    if (!node) return "Someone";
    const link = node.matches?.(AUTHOR_LINK) ? node : node.querySelector?.(AUTHOR_LINK);
    const fromLink = authorLabel(link);
    if (fromLink) return fromLink;
    const label = authorLabel(node).replace(/\s\[\d[\d,]*\]$/, "");
    return label || "Someone";
  }
  function messageProfileName(message) {
    const link = message.querySelector('a[href^="profile.php?user_name="]');
    const href = link?.getAttribute("href") || "";
    const match = href.match(/user_name=(.+)$/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  function fingerprint(message) {
    const timestamp = message.children[0]?.textContent || "";
    const body = message.children[5];
    const text = body?.textContent || body?.innerText || "";
    return `${timestamp}:${text}`.trim();
  }
  function findChatInputs(root = document) {
    return Array.from(root.querySelectorAll(CHAT_INPUT_SELECTOR));
  }
  function findActiveInput(preferred) {
    if (preferred?.isConnected) return preferred;
    const inputs = findChatInputs();
    return inputs.find((input) => input.offsetParent !== null) || inputs[0] || null;
  }
  function insertIntoChat(preferred, text) {
    const input = findActiveInput(preferred);
    if (!input) return false;
    input.focus();
    const value = input.value;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const suffix = after && !/^\s/.test(after) ? " " : "";
    const insertion = prefix + text + suffix;
    if (typeof input.setRangeText === "function") {
      input.setRangeText(insertion, start, end, "end");
    } else {
      input.value = before + insertion + after;
      const cursor = before.length + insertion.length;
      input.setSelectionRange?.(cursor, cursor);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  // src/core/log.js
  var PREFIX = "[Chat Suite]";
  var log = {
    info(...args) {
      console.log(PREFIX, ...args);
    },
    error(...args) {
      console.error(PREFIX, ...args);
    }
  };

  // src/core/chat-poll.js
  var POLL_MS = 4e3;
  var ROOM_SELECTORS = ["#chatroom_mobile", "#chatroom_desktop", "input.chatroom"];
  var CHAT_CHANNELS = [
    ["help", "Help"],
    ["global", "Global"],
    ["spoilers", "Spoilers"],
    ["trivia", "Trivia"],
    ["giveaways", "Giveaways"],
    ["trade", "Trade"]
  ];
  function normalizeWatchedChannel(value) {
    const id = String(value || "").trim().toLowerCase();
    return CHAT_CHANNELS.some(([room]) => room === id) ? id : "";
  }
  function channelLabel(id) {
    return CHAT_CHANNELS.find(([room]) => room === id)?.[1] || "";
  }
  function roomsToPoll({ currentRoom, watchedRoom, chatHidden }) {
    const current = String(currentRoom || "").trim().toLowerCase();
    const watched = normalizeWatchedChannel(watchedRoom);
    const rooms = [];
    if (chatHidden && current) rooms.push(current);
    if (watched && watched !== current) rooms.push(watched);
    return rooms;
  }
  function shouldPollChat({ desktopVisible, panelOpen }) {
    if (desktopVisible || panelOpen) return false;
    return true;
  }
  function readChatRoom(root = document) {
    for (const selector of ROOM_SELECTORS) {
      const value = root.querySelector(selector)?.value;
      if (value) return value;
    }
    return "";
  }
  function messagesFromChatHtml(html) {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    return Array.from(holder.querySelectorAll(".chat-txt"));
  }
  function unseenMessages(seen2, messages, fingerprintOf = fingerprint) {
    const fresh = [];
    for (const message of messages) {
      const id = fingerprintOf(message);
      if (!id || seen2.has(id)) continue;
      fresh.push(message);
    }
    return fresh;
  }
  function chatPollState(root = document) {
    const desktop = root.querySelector("#chatzoneDesktop");
    const panel = root.querySelector("#mobilechatpanel");
    return {
      desktopVisible: !!desktop && desktop.getClientRects().length > 0,
      panelOpen: !!panel && panel.classList.contains("active")
    };
  }
  function createChatPoll({ onMessages, readWatched = () => "" }) {
    const seen2 = createBoundedSet(500);
    const primed = /* @__PURE__ */ new Set();
    let timer = 0;
    let running = false;
    function remember(messages) {
      for (const message of messages) {
        const id = fingerprint(message);
        if (id) seen2.add(id);
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
      const fresh = unseenMessages(seen2, parsed);
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
        chatHidden: hidden
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
      }
    };
  }
  async function fetchChatHtml(room) {
    const url = `worker.php?go=getchat&room=${encodeURIComponent(room)}&cachebuster=${Date.now()}`;
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return "";
    return response.text();
  }

  // src/core/dom-observer.js
  var listeners = /* @__PURE__ */ new Set();
  var documentObserver = null;
  var scheduled = false;
  function emit() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        log.error("DOM listener failed", error);
      }
    }
  }
  function onDocumentMutations(listener) {
    listeners.add(listener);
    ensureDocumentObserver();
    listener();
    return () => listeners.delete(listener);
  }
  function ensureDocumentObserver() {
    if (documentObserver || !document.body) return;
    documentObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        emit();
      });
    });
    documentObserver.observe(document.body, { childList: true, subtree: true });
  }
  function collectChatMessages(mutations) {
    const messages = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const found = node.classList?.contains("chat-txt") ? [node] : Array.from(node.querySelectorAll?.(MESSAGE_SELECTOR) ?? []);
        for (const message of found) {
          if (seen2.has(message)) continue;
          seen2.add(message);
          messages.push(message);
        }
      }
    }
    return messages;
  }
  function createChatWatcher(onMessages, onReady) {
    const observers = /* @__PURE__ */ new Map();
    function attach() {
      const zones = findChatContainers();
      const live = new Set(zones);
      for (const [zone, observer] of observers) {
        if (live.has(zone) && zone.isConnected) continue;
        observer.disconnect();
        observers.delete(zone);
      }
      for (const zone of zones) {
        if (observers.has(zone)) continue;
        const observer = new MutationObserver((mutations) => {
          const messages = collectChatMessages(mutations);
          if (messages.length === 0) return;
          try {
            onMessages(messages, mutations);
          } catch (error) {
            log.error("chat watcher failed", error);
          }
        });
        observer.observe(zone, { childList: true, subtree: true });
        observers.set(zone, observer);
        log.info("Watching", zone.id || "chat");
        onReady?.();
      }
    }
    return {
      start() {
        onDocumentMutations(attach);
      }
    };
  }

  // src/core/storage.js
  var keys = {
    username: "farmrpg_chat_username",
    seenMessages: "farmrpg_seen_messages",
    keywords: "farmrpg_chat_keywords",
    phrases: "frpgqp_phrases_v1",
    lastValues: "frpgqp_lastvalues_v1",
    enabled: "fcs_enabled_v1",
    watchedChannel: "fcs_watch_channel_v1",
    tradeSide: "fcs_trade_side_v1"
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
  function createStorage(backend = browserStorage()) {
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
      }
    };
  }
  var storage = createStorage();

  // src/core/identity.js
  function sanitizeUsername(username) {
    if (!username) return "";
    let clean = String(username).trim();
    if (clean.startsWith("@")) clean = clean.slice(1);
    if (clean.endsWith(":")) clean = clean.slice(0, -1);
    return clean;
  }
  function normalizeUsername(username) {
    return sanitizeUsername(username).toLowerCase().replace(/\+/g, " ");
  }
  function defaultAsk(message) {
    return typeof prompt === "function" ? prompt(message) : null;
  }
  function createIdentity(store, { ask = defaultAsk } = {}) {
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
      }
    };
  }

  // src/core/notifications.js
  async function ensureNotificationPermission() {
    if (typeof GM_notification === "function") return true;
    if (typeof Notification !== "function") return false;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        return false;
      }
    }
    return Notification.permission === "granted";
  }
  function notify(title, text) {
    if (typeof GM_notification === "function") {
      GM_notification({ title, text, timeout: 5e3 });
      return;
    }
    if (typeof Notification === "function" && Notification.permission === "granted") {
      new Notification(title, { body: text });
    }
  }

  // src/core/feature.js
  function defineFeature(definition) {
    let enabled = false;
    return {
      id: definition.id,
      toggle: definition.toggle ?? null,
      requires: definition.requires ?? null,
      extras: definition.extras ?? [],
      autoStart: Boolean(definition.autoStart),
      isEnabled() {
        return enabled;
      },
      start(ctx) {
        if (enabled) return true;
        if (definition.start?.(ctx) === false) return false;
        enabled = true;
        definition.scanExisting?.(ctx);
        return true;
      },
      stop(ctx) {
        if (!enabled) return;
        enabled = false;
        definition.stop?.(ctx);
      },
      onMessages(messages, mutations, ctx) {
        definition.onMessages?.(messages, mutations, ctx);
      },
      scanExisting(ctx) {
        if (!enabled) return;
        definition.scanExisting?.(ctx);
      }
    };
  }

  // src/features/keyword-alerts/index.js
  var KEYWORD_CLASS = "fcs-keyword";
  var BADGE_CLASS = "fcs-keyword-badge";
  var REPEAT_SALE_MS = 5 * 60 * 1e3;
  var matches = createBoundedSet(100);
  var recentSales = /* @__PURE__ */ new Map();
  var keywords = /* @__PURE__ */ new Set();
  var tradeSideFilter = "both";
  function extractItemNames(textContainer) {
    if (!textContainer?.children?.length) return [];
    const items = [];
    for (const element of textContainer.children) {
      if (!element.matches?.("a")) continue;
      const image = element.children[0];
      if (image?.matches?.("img") && image.alt) items.push(image.alt);
    }
    return items;
  }
  function parseKeywordInput(input) {
    return String(input).split(",").map((keyword) => keyword.trim().toLowerCase().replace(/[()]/g, "")).filter(Boolean);
  }
  function matchKeyword(itemNames, keywordList) {
    for (const item of itemNames) {
      const haystack = String(item).toLowerCase();
      for (const keyword of keywordList) {
        if (haystack.includes(keyword)) return keyword;
      }
    }
    return null;
  }
  function saleKey(author, itemNames) {
    const who = normalizeUsername(author);
    const items = Array.from(
      new Set(
        Array.from(itemNames, (name) => String(name).trim().toLowerCase()).filter(Boolean)
      )
    ).sort();
    if (!who || items.length === 0) return "";
    return `${who}
${items.join("\n")}`;
  }
  function normalizeTradeSide(value) {
    const id = String(value || "").trim().toLowerCase();
    return id === "wts" || id === "wtb" ? id : "both";
  }
  var SELL_WORD = /\b(?:wts|selling|sell)\b/i;
  var BUY_WORD = /\b(?:wtb|buying|buy)\b/i;
  function tradeIntent(text) {
    const value = String(text || "");
    const sell = SELL_WORD.test(value);
    const buy = BUY_WORD.test(value);
    if (sell && buy) return "mixed";
    if (sell) return "wts";
    if (buy) return "wtb";
    return "";
  }
  function acceptsTradeSide(filter, intent) {
    const want = normalizeTradeSide(filter);
    if (want === "both" || !intent || intent === "mixed") return true;
    return intent === want;
  }
  function isRepeatSale(recent, key, now, windowMs = REPEAT_SALE_MS) {
    for (const [id, at] of recent) {
      if (now - at >= windowMs) recent.delete(id);
    }
    if (!key) return false;
    const last = recent.get(key);
    if (last != null && now - last < windowMs) return true;
    recent.set(key, now);
    return false;
  }
  function load(store) {
    const stored = store.getJson(keys.keywords, []);
    keywords = new Set(Array.isArray(stored) ? stored.map((keyword) => String(keyword).toLowerCase()) : []);
    tradeSideFilter = normalizeTradeSide(store.get(keys.tradeSide));
  }
  function saveSide(store, value) {
    tradeSideFilter = normalizeTradeSide(value);
    if (tradeSideFilter === "both") store.remove(keys.tradeSide);
    else store.set(keys.tradeSide, tradeSideFilter);
  }
  function save(store) {
    store.setJson(keys.keywords, Array.from(keywords));
  }
  function badgeHost(author) {
    return author.querySelector?.(".chip-label") || author;
  }
  function applyHighlight(message, keyword) {
    if (message.classList.contains("fcs-pinned")) return;
    message.classList.add(KEYWORD_CLASS);
    const author = message.children[2];
    if (!author) return;
    const host = badgeHost(author);
    let badge = Array.from(host.children).find(
      (child) => child.classList?.contains(BADGE_CLASS)
    );
    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      host.appendChild(badge);
    }
    badge.textContent = `\u{1F514} ${keyword}`;
  }
  function removeHighlights() {
    document.querySelectorAll(`.${KEYWORD_CLASS}`).forEach((message) => {
      message.classList.remove(KEYWORD_CLASS);
    });
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  }
  function writeKeywords(store, text) {
    keywords = new Set(text.trim() ? parseKeywordInput(text) : []);
    save(store);
  }
  function keywordHit(message) {
    const names = extractItemNames(messageBody(message));
    const keyword = matchKeyword(names, keywords);
    if (!keyword) return null;
    if (!acceptsTradeSide(tradeSideFilter, tradeIntent(messageText(message)))) return null;
    return { keyword, names };
  }
  function repaintVisible() {
    removeHighlights();
    for (const message of queryMessages()) {
      const hit = keywordHit(message);
      if (hit) applyHighlight(message, hit.keyword);
    }
  }
  var keywordAlerts = defineFeature({
    id: "keywords",
    toggle: {
      label: "Items",
      hint: "Alert when a watched item is posted"
    },
    requires: "keywords",
    start(ctx) {
      load(ctx.storage);
      if (keywords.size === 0) return false;
      void ctx.ensureNotificationPermission();
      log.info("Keyword watcher started", Array.from(keywords));
      return true;
    },
    stop() {
      matches.clear();
      recentSales.clear();
      removeHighlights();
      log.info("Keyword watcher stopped");
    },
    onMessages(messages, _mutations, ctx) {
      if (keywords.size === 0) return;
      for (const message of messages) {
        const hit = keywordHit(message);
        if (!hit) continue;
        const id = fingerprint(message);
        applyHighlight(message, hit.keyword);
        if (matches.has(id)) continue;
        matches.add(id);
        const seller = messageProfileName(message) || messageAuthor(message);
        if (isRepeatSale(recentSales, saleKey(seller, hit.names), Date.now())) {
          log.info("Repeat sale suppressed", seller);
          continue;
        }
        const room = message.dataset?.fcsRoom;
        const title = room ? `Keyword Alert: "${hit.keyword}" \xB7 ${room}` : `Keyword Alert: "${hit.keyword}"`;
        ctx.notify(title, messageAuthor(message));
        ctx.markUnread?.(id);
        log.info("Keyword match", hit.keyword);
      }
    }
  });
  keywordAlerts.loadFrom = (ctx) => load(ctx.storage);
  keywordAlerts.readText = () => Array.from(keywords).join(", ");
  keywordAlerts.writeText = (ctx, text) => writeKeywords(ctx.storage, text);
  keywordAlerts.readSide = () => tradeSideFilter;
  keywordAlerts.writeSide = (ctx, value) => {
    saveSide(ctx.storage, value);
    if (keywordAlerts.isEnabled()) repaintVisible();
  };

  // src/features/mention-notifications/index.js
  var seen = createBoundedSet(100);
  var mentionNotifications = defineFeature({
    id: "mentions",
    toggle: {
      label: "Mentions",
      hint: "Alert when your name is said"
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
        const title = room ? `You were mentioned! \xB7 ${room}` : "You were mentioned!";
        ctx.notify(title, `${author}: ${text.slice(0, 100)}`);
        ctx.markUnread?.(id);
        log.info("Mention detected", author);
      }
    }
  });

  // src/features/message-pins/index.js
  var TARGET_CLASS = "fcs-pin-target";
  var PINNED_CLASS = "fcs-pinned";
  var BUTTON_CLASS = "fcs-pin-btn";
  var marked = /* @__PURE__ */ new Set();
  function applyPin(message) {
    message.classList.add(TARGET_CLASS, PINNED_CLASS);
  }
  function removePinStyle(message) {
    message.classList.remove(PINNED_CLASS);
  }
  function createButton(message) {
    const button2 = document.createElement("button");
    button2.type = "button";
    button2.className = BUTTON_CLASS;
    button2.textContent = "\u{1F4CC}";
    button2.title = "Mark for later";
    const id = fingerprint(message);
    if (marked.has(id)) {
      applyPin(message);
      button2.classList.add("is-on");
    }
    button2.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePin(message, button2);
    });
    return button2;
  }
  function togglePin(message, button2) {
    const id = fingerprint(message);
    if (marked.has(id)) {
      marked.delete(id);
      removePinStyle(message);
      button2.classList.remove("is-on");
      log.info("Message unpinned");
      return;
    }
    marked.add(id);
    applyPin(message);
    button2.classList.add("is-on");
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
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button2) => button2.remove());
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
    document.querySelectorAll(`.${BUTTON_CLASS}.is-on`).forEach((button2) => {
      button2.classList.remove("is-on");
    });
    log.info("All pins cleared");
  }
  var messagePins = defineFeature({
    id: "pins",
    toggle: {
      label: "Pins",
      hint: "Keep messages on screen until reload"
    },
    extras: [
      {
        id: "clear-pins",
        label: "Clear",
        visible: () => messagePins.isEnabled(),
        run() {
          if (marked.size === 0) return;
          clearAll();
        }
      }
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
    }
  });

  // src/features/own-message-highlighter/index.js
  var OWN_CLASS = "fcs-own";
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
  var ownMessageHighlighter = defineFeature({
    id: "highlight",
    toggle: {
      label: "Highlight",
      hint: "Mark messages you sent"
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
    }
  });

  // src/ui/dom.js
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function button(label, className, onClick, title) {
    const node = el("button", `fcs-qc-btn${className ? ` ${className}` : ""}`, label);
    node.type = "button";
    if (title) node.title = title;
    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return node;
  }

  // src/features/quick-chat/phrase-manager.js
  var MAX_TITLE = 40;
  var ID_LENGTH = 7;
  function cleanText(value) {
    return String(value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  }
  function cleanTitle(value) {
    return cleanText(value).slice(0, MAX_TITLE);
  }
  function createId(existing = []) {
    const used = new Set(existing.map((phrase) => phrase.id));
    let id = "";
    do {
      id = `_${Math.random().toString(36).slice(2, 2 + ID_LENGTH)}`;
    } while (used.has(id));
    return id;
  }
  function loadPhrases(store) {
    const raw = store.getJson(keys.phrases, []);
    if (!Array.isArray(raw)) return [];
    const phrases = [];
    for (const phrase of raw) {
      if (!phrase || typeof phrase.text !== "string") continue;
      const text = cleanText(phrase.text);
      if (!text) continue;
      phrases.push({
        id: typeof phrase.id === "string" && phrase.id ? phrase.id : createId(phrases),
        title: cleanTitle(phrase.title),
        text
      });
    }
    return phrases;
  }
  function savePhrases(store, phrases) {
    return store.setJson(keys.phrases, phrases);
  }
  function movePhrase(phrases, id, direction) {
    const index = phrases.findIndex((phrase) => phrase.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= phrases.length) return false;
    [phrases[index], phrases[target]] = [phrases[target], phrases[index]];
    return true;
  }
  function removePhrase(phrases, id) {
    const index = phrases.findIndex((phrase2) => phrase2.id === id);
    if (index < 0) return null;
    const [phrase] = phrases.splice(index, 1);
    return { phrase, index };
  }
  function insertPhrase(phrases, phrase, index) {
    const at = Math.min(Math.max(index, 0), phrases.length);
    phrases.splice(at, 0, phrase);
  }
  function applyForm(phrases, form) {
    const text = cleanText(form.text);
    if (!text) return false;
    const title = cleanTitle(form.title);
    if (form.id) {
      const phrase = phrases.find((entry2) => entry2.id === form.id);
      if (phrase) {
        phrase.title = title;
        phrase.text = text;
      }
      return true;
    }
    const entry = { id: createId(phrases), title, text };
    const at = form.afterId ? phrases.findIndex((phrase) => phrase.id === form.afterId) : -1;
    if (at === -1) phrases.push(entry);
    else phrases.splice(at + 1, 0, entry);
    return true;
  }

  // src/features/quick-chat/import-export.js
  function toExportJson(phrases) {
    return JSON.stringify(
      phrases.map(({ title, text }) => ({ title, text })),
      null,
      2
    );
  }
  function mergeImported(phrases, data) {
    if (!Array.isArray(data)) {
      throw new Error("Expected a list");
    }
    const existing = new Set(phrases.map((phrase) => phrase.text));
    let added = 0;
    for (const item of data) {
      if (!item || typeof item.text !== "string") continue;
      const text = cleanText(item.text);
      if (!text || existing.has(text)) continue;
      phrases.push({
        id: createId(phrases),
        title: cleanTitle(item.title),
        text
      });
      existing.add(text);
      added += 1;
    }
    return added;
  }

  // src/features/quick-chat/placeholder-manager.js
  var MAX_FILL_VALUE = 200;
  var MAX_LAST_VALUES = 100;
  var PLACEHOLDER_SOURCE = "\\{([A-Za-z0-9_ ]{1,30})\\}";
  function placeholderPattern() {
    return new RegExp(PLACEHOLDER_SOURCE, "g");
  }
  function getPlaceholders(text) {
    const names = [];
    for (const match of String(text).matchAll(placeholderPattern())) {
      const name = match[1].trim();
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }
  function fillTemplate(text, values) {
    return String(text).replace(placeholderPattern(), (match, raw) => {
      const value = values[raw.trim()];
      return typeof value === "string" && value ? value : match;
    });
  }
  function loadLastValues(store) {
    const raw = store.getJson(keys.lastValues, {});
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  }
  function rememberValues(current, values) {
    const next = { ...current };
    for (const [name, value] of Object.entries(values)) {
      delete next[name];
      next[name] = String(value).slice(0, MAX_FILL_VALUE);
    }
    const names = Object.keys(next);
    while (names.length > MAX_LAST_VALUES) delete next[names.shift()];
    return next;
  }
  function saveLastValues(store, values) {
    const next = rememberValues(loadLastValues(store), values);
    return store.setJson(keys.lastValues, next);
  }

  // src/features/quick-chat/search.js
  var SEARCH_THRESHOLD = 8;
  function shouldShowSearch(phrases, editMode) {
    return !editMode && phrases.length > SEARCH_THRESHOLD;
  }
  function visiblePhrases(phrases, query, editMode) {
    const needle = query.trim().toLowerCase();
    if (!shouldShowSearch(phrases, editMode) || !needle) return phrases;
    return phrases.filter(
      (phrase) => phrase.text.toLowerCase().includes(needle) || (phrase.title || "").toLowerCase().includes(needle)
    );
  }

  // src/features/quick-chat/shortcuts.js
  var TOGGLE_CODE = "KeyQ";
  function isTypingTarget(target) {
    return Boolean(target?.closest?.("input, textarea"));
  }
  function onQuickChatKeyDown(event, api) {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === TOGGLE_CODE) {
      if (event.repeat) return;
      if (api.isOpen()) {
        event.preventDefault();
        api.close(true);
        return;
      }
      const opener = api.findVisibleOpener();
      if (opener) {
        event.preventDefault();
        api.open(opener.button, opener.input);
      }
      return;
    }
    if (!api.isOpen()) return;
    if (event.key === "Escape") {
      api.onEscape();
      return;
    }
    if (/^[1-9]$/.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && api.canUseNumberShortcut() && !isTypingTarget(event.target)) {
      const phrase = api.phraseAt(Number(event.key) - 1);
      if (!phrase) return;
      event.preventDefault();
      api.usePhrase(phrase);
    }
  }

  // src/features/quick-chat/ui.js
  function createQuickChatUi(state, commands) {
    const root = el("div", "fcs-panel");
    root.id = "fcs-qc-popup";
    root.tabIndex = -1;
    const status = el("div", "fcs-qc-status");
    let statusTimer = 0;
    root.addEventListener("mousedown", (event) => {
      if (!event.target.closest("input, textarea")) event.preventDefault();
    });
    document.body.appendChild(root);
    function focus() {
      root.focus({ preventScroll: true });
    }
    function position2() {
      if (!state.open || !state.anchor) return;
      const rect = state.anchor.getBoundingClientRect();
      const margin = 8;
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      const left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - width - margin
      );
      let top = rect.top - height - 6;
      if (top < margin) {
        top = Math.min(rect.bottom + 6, window.innerHeight - height - margin);
      }
      root.style.left = `${Math.max(margin, left)}px`;
      root.style.top = `${Math.max(margin, top)}px`;
    }
    function setStatus(message, action, duration = 2500) {
      status.textContent = "";
      clearTimeout(statusTimer);
      if (message) {
        status.appendChild(el("span", "", message));
        if (action) {
          status.appendChild(button(action.label, "fcs-qc-btn-primary", action.onClick));
        }
        statusTimer = setTimeout(() => {
          status.textContent = "";
          position2();
        }, duration);
      }
      position2();
    }
    function shown() {
      return visiblePhrases(state.phrases, state.query, state.editMode);
    }
    function render() {
      root.textContent = "";
      root.appendChild(renderHeader());
      if (state.fill) {
        root.appendChild(renderFill());
      } else if (state.form) {
        root.appendChild(renderForm());
      } else {
        const list = el("div", "fcs-qc-list");
        fillList(list);
        if (shouldShowSearch(state.phrases, state.editMode)) {
          root.appendChild(renderSearch(list));
        }
        root.appendChild(list);
        if (state.editMode) {
          root.appendChild(renderFooter());
        } else if (state.phrases.length > 0) {
          root.appendChild(
            el(
              "div",
              "fcs-qc-hint",
              "Press 1-9 to insert. Alt+Q opens and closes this panel."
            )
          );
        }
      }
      root.appendChild(status);
      position2();
    }
    function renderHeader() {
      const header = el("div", "fcs-qc-header");
      header.appendChild(el("span", "fcs-qc-title", "Quick Chat"));
      const actions = el("div", "fcs-qc-header-actions");
      if (!state.form && !state.fill) {
        actions.appendChild(button("Add", "fcs-qc-btn-primary", () => commands.startForm(null)));
        actions.appendChild(
          button(state.editMode ? "Done" : "Edit", "", () => commands.toggleEdit())
        );
      }
      actions.appendChild(button("Close", "fcs-qc-btn-ghost", () => close(true)));
      header.appendChild(actions);
      return header;
    }
    function renderSearch(list) {
      const input = el("input", "fcs-qc-field");
      input.type = "text";
      input.placeholder = "Search phrases";
      input.autocomplete = "off";
      input.value = state.query;
      input.addEventListener("input", () => {
        state.query = input.value;
        fillList(list);
        position2();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const first = shown()[0];
        if (first) commands.usePhrase(first);
      });
      return input;
    }
    function fillList(list) {
      list.textContent = "";
      if (state.phrases.length === 0) {
        list.appendChild(
          el("div", "fcs-qc-empty", 'No phrases yet. Use "Add" to create one.')
        );
        return;
      }
      const visible = shown();
      if (visible.length === 0) {
        list.appendChild(el("div", "fcs-qc-empty", "No matches."));
        return;
      }
      visible.forEach((phrase, index) => {
        list.appendChild(
          state.editMode ? renderEditRow(phrase, state.phrases.indexOf(phrase)) : renderUseRow(phrase, index)
        );
      });
    }
    function renderUseRow(phrase, index) {
      const item = el("button", "fcs-qc-item");
      item.type = "button";
      item.title = phrase.text;
      const badge = el(
        "span",
        `fcs-qc-num${index < 9 ? "" : " fcs-qc-num-hidden"}`,
        String(index + 1)
      );
      item.appendChild(badge);
      const body = el("span", "fcs-qc-item-body");
      const isTemplate = getPlaceholders(phrase.text).length > 0;
      if (phrase.title || isTemplate) {
        const top = el("span", "fcs-qc-item-top");
        if (phrase.title) top.appendChild(el("span", "fcs-qc-item-title", phrase.title));
        if (isTemplate) top.appendChild(el("span", "fcs-qc-tag", "fill-in"));
        body.appendChild(top);
      }
      body.appendChild(el("span", "fcs-qc-item-text", phrase.text));
      item.appendChild(body);
      item.addEventListener("click", () => commands.usePhrase(phrase));
      return item;
    }
    function renderEditRow(phrase, index) {
      const row = el("div", "fcs-qc-edit-row");
      const label = el("div", "fcs-qc-edit-label", phrase.title || phrase.text);
      label.title = phrase.text;
      row.appendChild(label);
      const actions = el("div", "fcs-qc-edit-actions");
      const up = button("\u25B2", "", () => commands.movePhrase(phrase.id, -1), "Move up");
      up.disabled = index === 0;
      const down = button("\u25BC", "", () => commands.movePhrase(phrase.id, 1), "Move down");
      down.disabled = index === state.phrases.length - 1;
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(button("Edit", "", () => commands.startForm(phrase)));
      actions.appendChild(
        button("Duplicate", "", () => commands.startForm(phrase, true), "Create a copy to edit")
      );
      actions.appendChild(
        button("Delete", "fcs-qc-btn-danger", () => commands.deletePhrase(phrase.id))
      );
      row.appendChild(actions);
      return row;
    }
    function renderForm() {
      const form = el("div", "fcs-qc-form");
      const heading = state.form.id ? "Edit phrase" : state.form.afterId ? "New phrase (copy)" : "New phrase";
      form.appendChild(el("div", "fcs-qc-form-heading", heading));
      const title = el("input", "fcs-qc-field");
      title.type = "text";
      title.placeholder = "Title (optional)";
      title.maxLength = MAX_TITLE;
      title.autocomplete = "off";
      title.value = state.form.title;
      title.addEventListener("input", () => {
        state.form.title = title.value;
      });
      const text = el("textarea", "fcs-qc-field fcs-qc-textarea");
      text.placeholder = "Phrase to insert into chat";
      text.rows = 3;
      text.value = state.form.text;
      text.addEventListener("input", () => {
        state.form.text = text.value;
      });
      text.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commands.submitForm();
      });
      const actions = el("div", "fcs-qc-form-actions");
      actions.appendChild(button("Save", "fcs-qc-btn-primary", () => commands.submitForm()));
      actions.appendChild(button("Cancel", "", () => commands.cancelForm()));
      form.appendChild(title);
      form.appendChild(text);
      form.appendChild(
        el(
          "div",
          "fcs-qc-hint",
          "Tip: write {name} where you want a fill-in blank, e.g. Selling {item} for {price}."
        )
      );
      form.appendChild(actions);
      setTimeout(() => text.focus(), 0);
      return form;
    }
    function renderFill() {
      const { phrase, names, values } = state.fill;
      const wrap = el("div", "fcs-qc-form");
      wrap.appendChild(
        el("div", "fcs-qc-form-heading", phrase.title || "Fill in the blanks")
      );
      const preview = el("div", "fcs-qc-preview");
      const fields = /* @__PURE__ */ Object.create(null);
      const updatePreview = () => {
        preview.textContent = commands.previewFill(values);
      };
      for (const name of names) {
        const row = el("label", "fcs-qc-fill-row");
        row.appendChild(el("span", "fcs-qc-fill-label", name));
        const input = el("input", "fcs-qc-field");
        input.type = "text";
        input.maxLength = MAX_FILL_VALUE;
        input.autocomplete = "off";
        input.value = values[name];
        input.addEventListener("input", () => {
          values[name] = input.value;
          updatePreview();
        });
        input.addEventListener("focus", () => input.select());
        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commands.submitFill(fields);
        });
        fields[name] = input;
        row.appendChild(input);
        wrap.appendChild(row);
      }
      updatePreview();
      wrap.appendChild(preview);
      const actions = el("div", "fcs-qc-form-actions");
      actions.appendChild(
        button("Insert", "fcs-qc-btn-primary", () => commands.submitFill(fields))
      );
      actions.appendChild(button("Back", "", () => commands.cancelFill()));
      wrap.appendChild(actions);
      setTimeout(() => fields[names[0]]?.focus(), 0);
      return wrap;
    }
    function renderFooter() {
      const footer = el("div", "fcs-qc-footer");
      footer.appendChild(button("Export", "", () => commands.exportPhrases(), "Copy all phrases as JSON"));
      footer.appendChild(button("Import", "", () => commands.importPhrases(), "Paste phrases from JSON"));
      return footer;
    }
    function open(anchor, input) {
      state.anchor = anchor;
      state.target = input;
      state.open = true;
      state.editMode = false;
      state.form = null;
      state.fill = null;
      state.query = "";
      root.style.display = "flex";
      render();
      focus();
    }
    function close(refocusChat = false) {
      state.open = false;
      state.editMode = false;
      state.form = null;
      state.fill = null;
      state.query = "";
      root.style.display = "none";
      setStatus("");
      if (refocusChat) commands.focusChat?.();
    }
    function toggle(anchor, input) {
      if (state.open && state.anchor === anchor) close(false);
      else open(anchor, input);
    }
    return {
      root,
      render,
      open,
      close,
      toggle,
      focus,
      position: position2,
      setStatus,
      isOpen: () => state.open,
      contains: (node) => root.contains(node)
    };
  }

  // src/features/quick-chat/index.js
  var ROW_CLASS = "fcs-qc-row";
  var OPEN_CLASS = "fcs-qc-open";
  var quickChat = {
    id: "quick-chat",
    /**
     * @param {import("../../core/feature.js").SuiteContext} ctx
     */
    mount(ctx) {
      const storage2 = ctx.storage;
      const boundInputs = /* @__PURE__ */ new WeakMap();
      const state = {
        phrases: loadPhrases(storage2),
        open: false,
        editMode: false,
        form: null,
        fill: null,
        query: "",
        anchor: null,
        target: null
      };
      let ui;
      function persist() {
        if (!savePhrases(storage2, state.phrases)) {
          ui.setStatus("Could not save (storage unavailable)");
        }
      }
      const commands = {
        focusChat() {
          findActiveInput(state.target)?.focus();
        },
        previewFill(values) {
          const cleaned = /* @__PURE__ */ Object.create(null);
          for (const name of state.fill.names) cleaned[name] = cleanText(values[name]);
          return fillTemplate(state.fill.phrase.text, cleaned);
        },
        usePhrase(phrase) {
          const names = getPlaceholders(phrase.text);
          if (names.length === 0) {
            if (insertIntoChat(state.target, phrase.text)) ui.close(false);
            else ui.setStatus("Open the chat first");
            return;
          }
          const last = loadLastValues(storage2);
          const values = /* @__PURE__ */ Object.create(null);
          for (const name of names) {
            values[name] = typeof last[name] === "string" ? last[name] : "";
          }
          state.fill = { phrase, names, values };
          ui.render();
        },
        toggleEdit() {
          state.editMode = !state.editMode;
          ui.render();
        },
        startForm(phrase, duplicate = false) {
          if (!phrase) {
            state.form = { id: null, title: "", text: "" };
          } else if (duplicate) {
            state.form = {
              id: null,
              title: phrase.title,
              text: phrase.text,
              afterId: phrase.id
            };
          } else {
            state.form = { id: phrase.id, title: phrase.title, text: phrase.text };
          }
          ui.render();
        },
        cancelForm() {
          state.form = null;
          ui.render();
        },
        submitForm() {
          if (!applyForm(state.phrases, state.form)) {
            ui.setStatus("Enter some text first");
            return;
          }
          persist();
          state.form = null;
          ui.render();
        },
        cancelFill() {
          state.fill = null;
          ui.render();
          ui.focus();
        },
        submitFill(fields) {
          const { phrase, names, values } = state.fill;
          const cleaned = /* @__PURE__ */ Object.create(null);
          for (const name of names) cleaned[name] = cleanText(values[name]);
          const missing = names.find((name) => !cleaned[name]);
          if (missing) {
            ui.setStatus("Fill all fields");
            fields[missing]?.focus();
            return;
          }
          if (!saveLastValues(storage2, cleaned)) {
            log.error("Could not save last fill-in values");
          }
          const finalText = cleanText(fillTemplate(phrase.text, cleaned));
          if (insertIntoChat(state.target, finalText)) ui.close(false);
          else ui.setStatus("Open the chat first");
        },
        movePhrase(id, direction) {
          if (!movePhrase(state.phrases, id, direction)) return;
          persist();
          ui.render();
        },
        deletePhrase(id) {
          const removed = removePhrase(state.phrases, id);
          if (!removed) return;
          persist();
          ui.render();
          ui.setStatus(
            "Phrase deleted.",
            {
              label: "Undo",
              onClick: () => {
                if (state.phrases.some((phrase) => phrase.id === removed.phrase.id)) return;
                insertPhrase(state.phrases, removed.phrase, removed.index);
                persist();
                ui.render();
                ui.setStatus("Phrase restored.");
              }
            },
            6e3
          );
        },
        async exportPhrases() {
          const json = toExportJson(state.phrases);
          try {
            await navigator.clipboard.writeText(json);
            ui.setStatus("Copied to clipboard");
          } catch {
            prompt("Copy your phrases:", json);
          }
        },
        importPhrases() {
          const raw = prompt("Paste exported phrases (JSON):");
          if (!raw) return;
          try {
            const added = mergeImported(state.phrases, JSON.parse(raw));
            persist();
            ui.render();
            ui.setStatus(`Imported ${added} phrase${added === 1 ? "" : "s"}`);
          } catch {
            ui.setStatus("Import failed: invalid JSON");
          }
        }
      };
      ui = createQuickChatUi(state, commands);
      function findVisibleOpener() {
        return Array.from(document.querySelectorAll(`.${OPEN_CLASS}`)).find(
          (node) => node.offsetParent !== null
        ) ?? null;
      }
      function ensureButtons() {
        for (const input of findChatInputs()) {
          const row = input.closest("li") || input.parentElement;
          if (!row?.parentElement) continue;
          const next = row.nextElementSibling;
          if (next?.classList.contains(ROW_CLASS)) {
            const existing = next.querySelector(`.${OPEN_CLASS}`);
            if (existing) boundInputs.set(existing, input);
            continue;
          }
          const holder = el(row.tagName === "LI" ? "li" : "div", ROW_CLASS);
          const openButton = el("button", OPEN_CLASS, "Quick Chat");
          openButton.type = "button";
          openButton.title = "Open Quick Chat (Alt+Q)";
          boundInputs.set(openButton, input);
          openButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            ui.toggle(openButton, boundInputs.get(openButton) ?? input);
          });
          holder.appendChild(openButton);
          row.after(holder);
        }
      }
      onDocumentMutations(() => {
        ensureButtons();
        if (state.open && state.anchor && !state.anchor.isConnected) ui.close(false);
      });
      document.addEventListener("pointerdown", (event) => {
        if (!state.open) return;
        const target = event.target;
        if (ui.contains(target)) return;
        if (target.closest?.(`.${OPEN_CLASS}`)) return;
        ui.close(false);
      });
      document.addEventListener("keydown", (event) => {
        onQuickChatKeyDown(event, {
          isOpen: () => state.open,
          close: (refocus) => ui.close(refocus),
          open: (button2, input) => ui.open(button2, input),
          findVisibleOpener: () => {
            const button2 = findVisibleOpener();
            if (!button2) return null;
            return { button: button2, input: boundInputs.get(button2) ?? null };
          },
          onEscape: () => {
            if (state.fill) commands.cancelFill();
            else if (state.form) commands.cancelForm();
            else if (state.query) {
              state.query = "";
              ui.render();
              ui.focus();
            } else ui.close(true);
          },
          canUseNumberShortcut: () => !state.editMode && !state.form && !state.fill,
          phraseAt: (index) => visiblePhrases(state.phrases, state.query, state.editMode)[index],
          usePhrase: (phrase) => commands.usePhrase(phrase)
        });
      });
      window.addEventListener("resize", () => ui.position());
      log.info("Quick Chat ready");
    }
  };

  // src/features/session-markers/index.js
  var SEPARATOR_CLASS = "fcs-separator";
  function planSessionSeparator(lastKnown, messages, chatWasCleared2, fingerprintOf) {
    const newest = fingerprintOf(messages[0]);
    if (!chatWasCleared2 || !lastKnown) {
      return { lastKnown: newest, before: null };
    }
    const before = messages.find((message) => fingerprintOf(message) === lastKnown) ?? null;
    if (!before || before === messages[0]) {
      return { lastKnown: newest, before: null };
    }
    return { lastKnown: newest, before };
  }
  function chatWasCleared(mutations) {
    return mutations.some((mutation) => mutation.removedNodes.length > 0);
  }
  function insertSeparator(beforeMessage) {
    const previous = beforeMessage.previousElementSibling;
    if (previous?.classList.contains(SEPARATOR_CLASS)) return;
    const separator = document.createElement("div");
    separator.className = SEPARATOR_CLASS;
    separator.textContent = "\u2500\u2500\u2500 New Messages \u2500\u2500\u2500";
    beforeMessage.parentElement?.insertBefore(separator, beforeMessage);
    log.info("Session separator inserted");
  }
  var anchors = /* @__PURE__ */ new WeakMap();
  var fallbackAnchor = null;
  var sessionMarkers = defineFeature({
    id: "separator",
    autoStart: true,
    toggle: {
      label: "Session",
      hint: "Mark where new messages start"
    },
    start() {
      log.info("Session separator started");
      return true;
    },
    stop() {
      document.querySelectorAll(`.${SEPARATOR_CLASS}`).forEach((node) => node.remove());
      log.info("Session separator stopped");
    },
    onMessages(messages, mutations) {
      if (!messages[0]?.isConnected) return;
      const zone = messages[0]?.closest?.("#chatzoneDesktop, #chatzoneMobile") ?? null;
      const previous = zone ? anchors.get(zone) ?? null : fallbackAnchor;
      const plan = planSessionSeparator(
        previous,
        messages,
        chatWasCleared(mutations),
        fingerprint
      );
      if (zone) anchors.set(zone, plan.lastKnown);
      else fallbackAnchor = plan.lastKnown;
      if (plan.before) insertSeparator(plan.before);
    }
  });

  // src/features/index.js
  var features = [
    mentionNotifications,
    ownMessageHighlighter,
    sessionMarkers,
    messagePins,
    keywordAlerts,
    quickChat
  ];

  // src/ui/control-panel.js
  var FOOTER_SELECTOR = "#bottom .footer-btn-row";
  var NAVBAR_SELECTOR = ".navbar-inner.navbar-on-center .right";
  var PREFERRED_ORDER = ["mentions", "highlight", "pins", "separator", "keywords"];
  function activeToolLabel(features2) {
    return orderedFeatures(features2).filter((feature) => feature.isEnabled?.()).map((feature) => feature.toggle.label || feature.id);
  }
  function mountControlPanel(features2, ctx) {
    restoreEnabled(features2, ctx);
    const menu = buildMenu(features2, ctx);
    let open = false;
    let anchor = null;
    function paint2() {
      for (const row of menu.rows) {
        row.input.checked = row.feature.isEnabled();
        for (const extra of row.extras) {
          extra.node.hidden = extra.spec.visible ? !extra.spec.visible() : false;
        }
      }
      const names = activeToolLabel(features2);
      for (const label of document.querySelectorAll(".fcs-active")) {
        label.textContent = names.join(" \xB7 ");
        label.hidden = names.length === 0;
        label.title = names.join(", ");
      }
      document.querySelectorAll(".fcs-menu-btn").forEach((buttonNode) => {
        buttonNode.classList.toggle("is-open", open);
      });
    }
    function persist() {
      const enabled = features2.filter((feature) => feature.isEnabled?.()).map((feature) => feature.id);
      ctx.storage.setJson(keys.enabled, enabled);
      paint2();
    }
    function toggleFeature(feature, input) {
      if (input.checked) {
        if (feature.requires === "username" && !ctx.identity.recall()) {
          input.checked = false;
          menu.setStatus("Add your username first");
          menu.username?.focus();
          return;
        }
        if (feature.requires === "keywords" && !feature.readText?.()) {
          input.checked = false;
          menu.setStatus("Add an item name first");
          menu.keywords?.focus();
          return;
        }
        if (feature.start(ctx) === false) input.checked = false;
        else menu.setStatus("");
      } else {
        feature.stop(ctx);
        menu.setStatus("");
      }
      persist();
    }
    menu.onToggle = toggleFeature;
    menu.onReset = () => {
      if (!confirm("Reset your username and turn off every chat tool?")) return;
      for (const feature of features2) {
        if (feature.isEnabled?.()) feature.stop(ctx);
      }
      ctx.identity.clear();
      if (menu.username) menu.username.value = "";
      persist();
    };
    menu.afterChange = persist;
    function openMenu(buttonNode) {
      anchor = buttonNode;
      open = true;
      featureById(features2, "keywords")?.loadFrom?.(ctx);
      if (menu.username) menu.username.value = ctx.identity.recall() || "";
      if (menu.keywords) menu.keywords.value = featureById(features2, "keywords")?.readText?.() || "";
      if (menu.tradeSide) menu.tradeSide.value = featureById(features2, "keywords")?.readSide?.() || "both";
      menu.root.hidden = false;
      position(menu.root, buttonNode);
      paint2();
    }
    function closeMenu() {
      open = false;
      menu.root.hidden = true;
      menu.setStatus("");
      paint2();
    }
    onDocumentMutations(() => {
      ensureLauncher((buttonNode) => {
        if (open && anchor === buttonNode) closeMenu();
        else openMenu(buttonNode);
      });
      ensureStatus();
      paint2();
      if (open && anchor && !anchor.isConnected) closeMenu();
      else if (open && anchor) position(menu.root, anchor);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!open) return;
      const target = event.target;
      if (menu.root.contains(target)) return;
      if (target.closest?.(".fcs-menu-btn")) return;
      closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (open && event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
      if (open && anchor) position(menu.root, anchor);
    });
    paint2();
  }
  function orderedFeatures(features2) {
    const byId = new Map(features2.map((feature) => [feature.id, feature]));
    const listed = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const id of PREFERRED_ORDER) {
      const feature = byId.get(id);
      if (!feature?.toggle) continue;
      listed.push(feature);
      seen2.add(feature.id);
    }
    for (const feature of features2) {
      if (seen2.has(feature.id) || !feature.toggle) continue;
      listed.push(feature);
    }
    return listed;
  }
  function featureById(features2, id) {
    return features2.find((feature) => feature.id === id);
  }
  function restoreEnabled(features2, ctx) {
    const saved = ctx.storage.getJson(keys.enabled, null);
    for (const feature of features2) {
      const shouldStart = Array.isArray(saved) ? saved.includes(feature.id) : Boolean(feature.autoStart);
      if (shouldStart) feature.start(ctx);
    }
    ctx.storage.setJson(
      keys.enabled,
      features2.filter((feature) => feature.isEnabled?.()).map((feature) => feature.id)
    );
  }
  function ensureLauncher(onClick) {
    const row = document.querySelector(FOOTER_SELECTOR);
    if (!row || row.querySelector(".fcs-menu-btn")) return;
    const launcher = document.createElement("a");
    launcher.href = "#";
    launcher.className = "button footer-btn fcs-menu-btn";
    launcher.title = "Chat Suite";
    launcher.setAttribute("aria-label", "Chat Suite");
    launcher.innerHTML = '<i class="fa-solid fa-sliders fa-fw" aria-hidden="true"></i>';
    launcher.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(launcher);
    });
    row.appendChild(launcher);
  }
  function ensureStatus() {
    const right = document.querySelector(NAVBAR_SELECTOR);
    if (!right) return;
    let label = document.querySelector(".fcs-active");
    if (!label) {
      label = document.createElement("span");
      label.className = "fcs-active";
    }
    if (label.parentElement !== right) right.insertBefore(label, right.firstChild);
  }
  function position(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const barTop = document.querySelector("#bottom")?.getBoundingClientRect().top;
    const limit = Math.min(rect.top, barTop ?? rect.top);
    const margin = 8;
    menu.style.maxHeight = `${Math.max(160, limit - margin * 2)}px`;
    menu.style.overflowY = "auto";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - margin
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(margin, limit - height - margin)}px`;
  }
  function buildWatchControl(ctx) {
    const saved = normalizeWatchedChannel(ctx.storage.get(keys.watchedChannel));
    const field = el("label", "fcs-menu-watch");
    field.appendChild(el("span", "fcs-menu-label", "Watched channel"));
    field.appendChild(el("span", "fcs-menu-hint", "Keeps alerting while you are in another room"));
    const select = el("select", "fcs-menu-field");
    select.appendChild(option("", "Current room"));
    for (const [id, label] of CHAT_CHANNELS) select.appendChild(option(id, label));
    select.value = saved;
    select.addEventListener("change", () => {
      const next = normalizeWatchedChannel(select.value);
      if (next) ctx.storage.set(keys.watchedChannel, next);
      else ctx.storage.remove(keys.watchedChannel);
    });
    field.appendChild(select);
    return field;
  }
  function buildTradeSide(feature, ctx, api) {
    feature.loadFrom?.(ctx);
    const field = el("label", "fcs-menu-side");
    field.appendChild(el("span", "fcs-menu-label", "Trade side"));
    field.appendChild(el("span", "fcs-menu-hint", "Drop the half of Trade you are not looking for"));
    const select = el("select", "fcs-menu-field");
    select.appendChild(option("both", "Both"));
    select.appendChild(option("wts", "WTS"));
    select.appendChild(option("wtb", "WTB"));
    select.value = feature.readSide();
    select.addEventListener("change", () => feature.writeSide(ctx, select.value));
    api.tradeSide = select;
    field.appendChild(select);
    return field;
  }
  function option(value, label) {
    const node = el("option", "", label);
    node.value = value;
    return node;
  }
  function buildMenu(features2, ctx) {
    const root = el("div", "fcs-panel fcs-menu");
    root.hidden = true;
    root.appendChild(el("div", "fcs-menu-title", "Chat Suite"));
    root.appendChild(buildWatchControl(ctx));
    const rows = [];
    let username = null;
    let keywords2 = null;
    let statusTimer = 0;
    const status = el("div", "fcs-menu-status");
    if (features2.some((feature) => feature.requires === "username")) {
      username = el("input", "fcs-menu-field");
      username.type = "text";
      username.placeholder = "Your username";
      username.autocomplete = "off";
      username.addEventListener("input", () => {
        ctx.identity.set(username.value);
        if (!ctx.identity.recall()) {
          for (const feature of features2) {
            if (feature.requires === "username" && feature.isEnabled()) feature.stop(ctx);
          }
        }
        api.afterChange?.();
      });
      username.addEventListener("change", () => {
        const highlight = featureById(features2, "highlight");
        if (highlight?.isEnabled()) highlight.scanExisting?.(ctx);
      });
      root.appendChild(username);
    }
    const api = {
      root,
      rows,
      username,
      keywords: keywords2,
      onToggle: null,
      onReset: null,
      afterChange: null,
      setStatus(message) {
        status.textContent = message || "";
        clearTimeout(statusTimer);
        if (message) statusTimer = setTimeout(() => {
          status.textContent = "";
        }, 2500);
      }
    };
    for (const feature of orderedFeatures(features2)) {
      const row = el("label", "fcs-menu-row");
      const copy = el("span", "fcs-menu-copy");
      copy.appendChild(el("span", "fcs-menu-label", feature.toggle.label || feature.id));
      if (feature.toggle.hint) copy.appendChild(el("span", "fcs-menu-hint", feature.toggle.hint));
      const input = el("input", "fcs-switch");
      input.type = "checkbox";
      input.addEventListener("change", () => api.onToggle?.(feature, input));
      row.appendChild(copy);
      const extraNodes = [];
      for (const spec of feature.extras ?? []) {
        const node = button(spec.label, "", () => spec.run(ctx));
        node.hidden = true;
        extraNodes.push({ spec, node });
        row.appendChild(node);
      }
      row.appendChild(input);
      root.appendChild(row);
      rows.push({ feature, input, extras: extraNodes });
      if (feature.requires === "keywords" && feature.writeText) {
        keywords2 = el("input", "fcs-menu-field");
        keywords2.type = "text";
        keywords2.placeholder = "dragon egg, trade";
        keywords2.autocomplete = "off";
        keywords2.addEventListener("input", () => {
          feature.writeText(ctx, keywords2.value);
          if (!feature.readText() && feature.isEnabled()) feature.stop(ctx);
          api.afterChange?.();
        });
        root.appendChild(keywords2);
        api.keywords = keywords2;
        if (feature.readSide && feature.writeSide) root.appendChild(buildTradeSide(feature, ctx, api));
      }
    }
    const reset = button("Reset", "fcs-qc-btn-danger", () => api.onReset?.());
    const footer = el("div", "fcs-menu-footer");
    footer.appendChild(reset);
    root.appendChild(footer);
    root.appendChild(status);
    root.addEventListener("mousedown", (event) => {
      if (!event.target.closest("input, textarea, button, select")) event.preventDefault();
    });
    document.body.appendChild(root);
    return api;
  }

  // src/ui/styles/tokens.css
  var tokens_default = '/*\n  Color tokens for every feature. Edit this file only.\n  theme.js sets data-fcs-theme="light|dark" on <html> from the page background.\n  One accent (harvest orange) covers actions, your messages, pins, and the session mark.\n  Item alerts use the leaf green. Danger is only for delete and reset.\n*/\n\n:root,\n:root[data-fcs-theme="light"] {\n  color-scheme: light;\n  --fcs-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  --fcs-radius-sm: 4px;\n  --fcs-radius: 6px;\n  --fcs-radius-lg: 10px;\n\n  --fcs-surface: #f6f3ec;\n  --fcs-raised: #fffcf8;\n  --fcs-raised-hover: #efeae1;\n  --fcs-border: #ddd4c6;\n  --fcs-shadow: 0 6px 24px rgba(48, 36, 16, 0.14);\n  --fcs-overlay: #fffcf8;\n  --fcs-overlay-border: #d5ccbe;\n\n  --fcs-text: #241f18;\n  --fcs-muted: #6f675c;\n\n  --fcs-accent: #f97316;\n  --fcs-accent-text: #c2410c;\n  --fcs-on-accent: #1c140c;\n  --fcs-accent-soft: rgba(249, 115, 22, 0.16);\n\n  --fcs-danger: #b42318;\n  --fcs-danger-solid: #9f2d22;\n  --fcs-on-danger: #fff;\n  --fcs-danger-soft: rgba(180, 35, 24, 0.12);\n\n  --fcs-keyword: #2f6b45;\n  --fcs-on-keyword: #fff;\n  --fcs-keyword-soft: rgba(47, 107, 69, 0.14);\n}\n\n:root[data-fcs-theme="dark"] {\n  color-scheme: dark;\n  --fcs-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  --fcs-radius-sm: 4px;\n  --fcs-radius: 6px;\n  --fcs-radius-lg: 10px;\n\n  --fcs-surface: #262e29;\n  --fcs-raised: #313b35;\n  --fcs-raised-hover: #3a463f;\n  --fcs-border: #46534b;\n  --fcs-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);\n  --fcs-overlay: #313b35;\n  --fcs-overlay-border: #46534b;\n\n  --fcs-text: #eef2e8;\n  --fcs-muted: #a9b6a6;\n\n  --fcs-accent: #fb7a24;\n  --fcs-accent-text: #fb7a24;\n  --fcs-on-accent: #1d1a14;\n  --fcs-accent-soft: rgba(251, 122, 36, 0.18);\n\n  --fcs-danger: #f08a7d;\n  --fcs-danger-solid: #9f2d22;\n  --fcs-on-danger: #fff;\n  --fcs-danger-soft: rgba(240, 138, 125, 0.16);\n\n  --fcs-keyword: #9dcc8a;\n  --fcs-on-keyword: #142016;\n  --fcs-keyword-soft: rgba(157, 204, 138, 0.16);\n}\n';

  // src/ui/styles/suite.css
  var suite_default = '.fcs-panel {\n  position: fixed;\n  z-index: 100000;\n  box-sizing: border-box;\n  background: var(--fcs-surface);\n  color: var(--fcs-text);\n  border: 1px solid var(--fcs-border);\n  border-radius: var(--fcs-radius-lg);\n  box-shadow: var(--fcs-shadow);\n  font-family: var(--fcs-font);\n  font-size: 13px;\n}\n\n.fcs-menu {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  width: min(300px, calc(100vw - 16px));\n  max-height: min(70vh, calc(100vh - 80px));\n  overflow-y: auto;\n  padding: 10px;\n}\n\n.fcs-menu[hidden] {\n  display: none;\n}\n\n.fcs-menu-title {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.fcs-menu-watch,\n.fcs-menu-side {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.fcs-menu-watch .fcs-menu-label,\n.fcs-menu-side .fcs-menu-label {\n  font-size: 12px;\n}\n\n.fcs-menu-field {\n  box-sizing: border-box;\n  width: 100%;\n  padding: 6px 8px;\n  font: inherit;\n  font-size: 12px;\n  color: var(--fcs-text);\n  background: var(--fcs-raised);\n  border: 1px solid var(--fcs-border);\n  border-radius: var(--fcs-radius);\n}\n\n.fcs-menu-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 2px;\n  cursor: pointer;\n}\n\n.fcs-menu-copy {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n  flex: 1;\n}\n\n.fcs-menu-label {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.fcs-menu-hint {\n  font-size: 11px;\n  color: var(--fcs-muted);\n}\n\n.fcs-switch {\n  appearance: none;\n  flex-shrink: 0;\n  width: 36px;\n  height: 22px;\n  margin: 0;\n  border-radius: 999px;\n  background: var(--fcs-border);\n  position: relative;\n  cursor: pointer;\n}\n\n.fcs-switch::after {\n  content: "";\n  position: absolute;\n  top: 3px;\n  left: 3px;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: var(--fcs-raised);\n  transition: transform 0.15s ease;\n}\n\n.fcs-switch:checked {\n  background: var(--fcs-accent);\n}\n\n.fcs-switch:checked::after {\n  transform: translateX(14px);\n}\n\n.fcs-switch:focus-visible {\n  outline: 2px solid var(--fcs-accent-text);\n  outline-offset: 2px;\n}\n\n.fcs-menu-footer {\n  display: flex;\n  justify-content: flex-end;\n  padding-top: 4px;\n  border-top: 1px solid var(--fcs-border);\n}\n\n.fcs-menu-status {\n  min-height: 14px;\n  font-size: 11px;\n  color: var(--fcs-accent-text);\n}\n\n.fcs-menu-status:empty {\n  display: none;\n}\n\n#bottom a.fcs-menu-btn.is-open {\n  box-shadow: inset 0 -3px 0 var(--fcs-accent);\n}\n\n#bottom .fcs-has-unread {\n  position: relative;\n}\n\n.fcs-unread {\n  position: absolute;\n  top: 1px;\n  right: 1px;\n  min-width: 16px;\n  height: 16px;\n  padding: 0 4px;\n  box-sizing: border-box;\n  border-radius: 999px;\n  background: var(--fcs-accent);\n  color: var(--fcs-on-accent);\n  font-family: var(--fcs-font);\n  font-size: 10px;\n  font-weight: 700;\n  line-height: 16px;\n  text-align: center;\n  pointer-events: none;\n  z-index: 2;\n}\n\n.fcs-unread[hidden] {\n  display: none;\n}\n\n.navbar .fcs-active {\n  display: inline-block;\n  max-width: 34vw;\n  margin-right: 8px;\n  overflow: hidden;\n  color: var(--fcs-accent);\n  font-family: var(--fcs-font);\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 1.2;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  vertical-align: middle;\n}\n\n.navbar .fcs-active[hidden] {\n  display: none;\n}\n\n.chat-txt.fcs-own {\n  border: 3px solid var(--fcs-accent-text);\n  border-radius: var(--fcs-radius);\n  padding: 2px;\n}\n\n.chat-txt.fcs-keyword {\n  border-left: 4px solid var(--fcs-keyword);\n  background-color: var(--fcs-keyword-soft);\n  padding-left: 8px;\n}\n\n.chat-txt.fcs-pin-target {\n  position: relative;\n}\n\n.chat-txt.fcs-pinned {\n  background-color: var(--fcs-accent-soft);\n  border: 3px solid var(--fcs-accent-text);\n  border-radius: var(--fcs-radius);\n  padding: 4px;\n}\n\n.chat-txt > button.fcs-pin-btn {\n  position: absolute;\n  right: 4px;\n  top: 4px;\n  width: auto;\n  min-width: 32px;\n  min-height: 32px;\n  margin: 0;\n  background: var(--fcs-overlay);\n  border: 1px solid var(--fcs-overlay-border);\n  border-radius: var(--fcs-radius-sm);\n  padding: 2px 6px;\n  cursor: pointer;\n  font-size: 14px;\n  line-height: 1;\n  opacity: 0.7;\n  z-index: 10;\n  transition: opacity 0.2s, transform 0.2s;\n}\n\n.chat-txt > button.fcs-pin-btn:hover,\n.chat-txt > button.fcs-pin-btn.is-on {\n  opacity: 1;\n}\n\n.chat-txt > button.fcs-pin-btn:hover {\n  transform: scale(1.1);\n}\n\n.fcs-keyword-badge {\n  display: inline-block;\n  background: var(--fcs-keyword);\n  color: var(--fcs-on-keyword);\n  font-size: 10px;\n  padding: 2px 6px;\n  border-radius: var(--fcs-radius-sm);\n  margin-left: 8px;\n  font-weight: bold;\n}\n\n.chat-txt .chip-label .fcs-keyword-badge {\n  flex: 0 0 auto;\n  align-self: center;\n  vertical-align: middle;\n}\n\n.fcs-separator {\n  text-align: center;\n  margin: 12px 0;\n  font-size: 12px;\n  color: var(--fcs-accent-text);\n  font-weight: bold;\n  opacity: 0.9;\n  padding: 4px 0;\n}\n';

  // src/ui/styles/quick-chat.css
  var quick_chat_default = ".fcs-qc-row {\n  list-style: none;\n  padding: 2px 15px 6px;\n}\n\n.fcs-qc-open {\n  width: 100%;\n  padding: 5px 8px;\n  font-size: 12px;\n  font-family: inherit;\n  color: var(--fcs-text);\n  background: var(--fcs-surface);\n  border: 1px solid var(--fcs-border);\n  border-left: 3px solid var(--fcs-accent-text);\n  border-radius: 6px;\n  cursor: pointer;\n}\n\n.fcs-qc-open:hover {\n  background: var(--fcs-raised);\n}\n\n#fcs-qc-popup {\n  display: none;\n  flex-direction: column;\n  gap: 6px;\n  width: min(360px, calc(100vw - 16px));\n  max-height: min(70vh, 520px);\n  padding: 8px;\n  outline: none;\n}\n\n#fcs-qc-popup button:focus-visible,\n#fcs-qc-popup input:focus-visible,\n#fcs-qc-popup textarea:focus-visible,\n.fcs-qc-open:focus-visible {\n  outline: 2px solid var(--fcs-accent-text);\n  outline-offset: 1px;\n}\n\n.fcs-qc-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 6px;\n  padding-bottom: 6px;\n  border-bottom: 1px solid var(--fcs-border);\n}\n\n.fcs-qc-title {\n  color: var(--fcs-text);\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.fcs-qc-header-actions {\n  display: flex;\n  gap: 4px;\n}\n\n.fcs-qc-btn {\n  padding: 3px 7px;\n  font-size: 11px;\n  font-family: inherit;\n  color: var(--fcs-text);\n  background: var(--fcs-raised);\n  border: 1px solid var(--fcs-border);\n  border-radius: 5px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.fcs-qc-btn:hover {\n  background: var(--fcs-raised-hover);\n}\n\n.fcs-qc-btn:disabled {\n  opacity: 0.35;\n  cursor: default;\n}\n\n.fcs-qc-btn-primary {\n  color: var(--fcs-on-accent);\n  background: var(--fcs-accent);\n  border-color: var(--fcs-accent);\n  font-weight: 600;\n}\n\n.fcs-qc-btn-primary:hover {\n  background: var(--fcs-accent);\n  filter: brightness(1.1);\n}\n\n.fcs-qc-btn-danger {\n  color: var(--fcs-danger);\n  border-color: var(--fcs-danger);\n  background: transparent;\n}\n\n.fcs-qc-btn-danger:hover {\n  background: var(--fcs-danger-soft);\n}\n\n.fcs-qc-btn-ghost {\n  background: none;\n  border-color: transparent;\n  color: var(--fcs-muted);\n}\n\n.fcs-qc-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n.fcs-qc-empty {\n  color: var(--fcs-muted);\n  font-size: 12px;\n  font-style: italic;\n  padding: 4px 2px;\n}\n\n.fcs-qc-item {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  padding: 6px 8px;\n  text-align: left;\n  font-family: inherit;\n  color: var(--fcs-text);\n  background: var(--fcs-raised);\n  border: 1px solid var(--fcs-border);\n  border-left: 3px solid transparent;\n  border-radius: 6px;\n  cursor: pointer;\n}\n\n.fcs-qc-item:hover {\n  background: var(--fcs-raised-hover);\n  border-left-color: var(--fcs-accent-text);\n}\n\n.fcs-qc-num {\n  flex-shrink: 0;\n  width: 16px;\n  font-size: 10px;\n  line-height: 16px;\n  text-align: center;\n  color: var(--fcs-muted);\n  border: 1px solid var(--fcs-border);\n  border-radius: 4px;\n}\n\n.fcs-qc-num-hidden {\n  visibility: hidden;\n}\n\n.fcs-qc-item-body {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  flex: 1;\n  min-width: 0;\n}\n\n.fcs-qc-item-top {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.fcs-qc-item-title {\n  min-width: 0;\n  font-size: 12px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.fcs-qc-tag {\n  margin-left: auto;\n  flex-shrink: 0;\n  padding: 0 6px;\n  font-size: 10px;\n  color: var(--fcs-accent-text);\n  border: 1px solid var(--fcs-accent-text);\n  border-radius: 8px;\n}\n\n.fcs-qc-item-text {\n  display: block;\n  font-size: 12px;\n  color: var(--fcs-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.fcs-qc-edit-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 6px;\n  background: var(--fcs-raised);\n  border: 1px solid var(--fcs-border);\n  border-radius: 6px;\n}\n\n.fcs-qc-edit-label {\n  flex: 1 1 100px;\n  min-width: 0;\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.fcs-qc-edit-actions {\n  display: flex;\n  gap: 3px;\n  flex-shrink: 0;\n}\n\n.fcs-qc-form {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n.fcs-qc-form-heading {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--fcs-text);\n}\n\n.fcs-qc-field {\n  box-sizing: border-box;\n  width: 100%;\n  padding: 5px 7px;\n  font-size: 12px;\n  font-family: inherit;\n  color: var(--fcs-text);\n  background: var(--fcs-raised);\n  border: 1px solid var(--fcs-border);\n  border-radius: 5px;\n}\n\n.fcs-qc-textarea {\n  resize: vertical;\n}\n\n.fcs-qc-form-actions,\n.fcs-qc-footer {\n  display: flex;\n  gap: 4px;\n}\n\n.fcs-qc-footer {\n  padding-top: 6px;\n  border-top: 1px solid var(--fcs-border);\n}\n\n.fcs-qc-fill-row {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}\n\n.fcs-qc-fill-label {\n  font-size: 11px;\n  color: var(--fcs-muted);\n}\n\n.fcs-qc-preview {\n  padding: 6px 8px;\n  font-size: 12px;\n  color: var(--fcs-text);\n  background: var(--fcs-raised);\n  border: 1px dashed var(--fcs-border);\n  border-radius: 5px;\n  word-break: break-word;\n}\n\n.fcs-qc-hint {\n  font-size: 11px;\n  color: var(--fcs-muted);\n}\n\n.fcs-qc-status {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 14px;\n  font-size: 11px;\n  color: var(--fcs-accent-text);\n}\n\n.fcs-qc-status:empty {\n  display: none;\n}\n";

  // src/ui/theme.js
  var DARK_LUMINANCE = 0.4;
  function themeFromColor(color) {
    if (!color || color.a < 0.5) return null;
    return luminance(color) < DARK_LUMINANCE ? "dark" : "light";
  }
  function parseCssColor(value) {
    const match = String(value).match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/
    );
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === void 0 ? 1 : Number(match[4])
    };
  }
  function luminance({ r, g, b }) {
    const channel = (value) => {
      const scaled = value / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }
  function firstOpaque(start) {
    let node = start;
    while (node) {
      const theme = themeFromColor(parseCssColor(getComputedStyle(node).backgroundColor));
      if (theme) return theme;
      node = node.parentElement;
    }
    return null;
  }
  function detectTheme() {
    const fromPage = firstOpaque(document.querySelector(".page-content")) ?? firstOpaque(document.body);
    if (fromPage) return fromPage;
    if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  function applyTheme() {
    const next = detectTheme();
    if (document.documentElement.dataset.fcsTheme !== next) {
      document.documentElement.dataset.fcsTheme = next;
    }
    return next;
  }
  function watchTheme() {
    applyTheme();
    const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    media?.addEventListener?.("change", applyTheme);
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    }
  }

  // src/ui/styles.js
  var STYLE_ID = "fcs-styles";
  function injectStyles() {
    watchTheme();
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${tokens_default}
${suite_default}
${quick_chat_default}`;
    (document.head || document.documentElement).appendChild(style);
  }

  // src/ui/unread.js
  var BADGE_CLASS2 = "fcs-unread";
  var MARKED_CLASS = "fcs-has-unread";
  function findChatOpenButton(root = document) {
    const direct = root.querySelector("#openchatbtn, #bottom a.open-panel, #bottom [data-panel='right']");
    if (direct) return direct;
    const row = root.querySelector("#bottom .footer-btn-row");
    if (!row) return null;
    return Array.from(row.querySelectorAll("a, button")).find((node) => {
      if (node.classList?.contains("fcs-menu-btn")) return false;
      const hint = [
        node.id,
        node.className,
        node.getAttribute?.("href") || "",
        node.getAttribute?.("aria-label") || ""
      ].join(" ").toLowerCase();
      return hint.includes("chat");
    }) ?? null;
  }
  function unreadLabel(count) {
    if (!count || count < 1) return "";
    if (count > 9) return "9+";
    return String(count);
  }
  function applyUnread(count, id, chatHidden, seen2) {
    if (!chatHidden) {
      const changed = count !== 0;
      if (changed) seen2.clear();
      return { count: 0, changed };
    }
    if (!id || seen2.has(id)) return { count, changed: false };
    seen2.add(id);
    return { count: count + 1, changed: true };
  }
  function mountUnreadMark() {
    const seen2 = createBoundedSet(200);
    let count = 0;
    let badge = null;
    let panel = null;
    let panelObserver = null;
    function chatHidden() {
      return shouldPollChat(chatPollState());
    }
    function paint2() {
      const button2 = findChatOpenButton();
      if (!button2) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = BADGE_CLASS2;
      }
      if (badge.parentElement !== button2) button2.appendChild(badge);
      const label = unreadLabel(count);
      badge.textContent = label;
      badge.hidden = !label;
      badge.title = label ? `${count} new chat alert${count === 1 ? "" : "s"}` : "";
      button2.classList.toggle(MARKED_CLASS, Boolean(label));
    }
    function note(id) {
      const next = applyUnread(count, id, chatHidden(), seen2);
      count = next.count;
      if (next.changed) paint2();
    }
    function sync() {
      if (!chatHidden() && count !== 0) {
        count = 0;
        seen2.clear();
      }
      paint2();
      watchPanel();
    }
    function watchPanel() {
      const next = document.querySelector("#mobilechatpanel");
      if (next === panel) return;
      panelObserver?.disconnect();
      panel = next;
      if (!panel) return;
      panelObserver = new MutationObserver(sync);
      panelObserver.observe(panel, { attributes: true, attributeFilter: ["class", "style"] });
    }
    onDocumentMutations(sync);
    document.addEventListener("click", (event) => {
      const button2 = findChatOpenButton();
      if (!button2?.contains(event.target)) return;
      count = 0;
      seen2.clear();
      paint2();
    });
    return { note };
  }

  // src/main.js
  function boot() {
    const unread = mountUnreadMark();
    const ctx = {
      storage,
      identity: createIdentity(storage),
      notify,
      markUnread: unread.note,
      ensureNotificationPermission
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
    const poll = createChatPoll({
      onMessages: deliver,
      readWatched: () => normalizeWatchedChannel(storage.get(keys.watchedChannel))
    });
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
      }
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
})();
