import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedSet } from "../src/core/bounded-set.js";
import {
  channelLabel,
  normalizeWatchedChannel,
  readChatRoom,
  roomsToPoll,
  shouldPollChat,
  unseenMessages,
} from "../src/core/chat-poll.js";
import {
  CHAT_INPUT_SELECTOR,
  findChatContainer,
  findChatContainers,
  findChatInputs,
  fingerprint,
  messageAuthor,
  messageBody,
  messageProfileName,
  messageText,
} from "../src/core/chat.js";
import { createIdentity, normalizeUsername, sanitizeUsername } from "../src/core/identity.js";
import { createMemoryStorage, keys } from "../src/core/storage.js";
import { planSessionSeparator } from "../src/features/session-markers/index.js";
import { applyUnread, findChatOpenButton, unreadLabel } from "../src/ui/unread.js";
import {
  acceptsTradeSide,
  extractItemNames,
  keywordAlerts,
  matchKeyword,
  normalizeTradeSide,
  parseKeywordInput,
  tradeIntent,
} from "../src/features/keyword-alerts/index.js";
import { friendKey, friendMarks, isFriend, parseFriendInput } from "../src/features/friends/index.js";
import { playerKey, playerMute } from "../src/features/player-mute/index.js";
import { mergeImported, toExportJson } from "../src/features/quick-chat/import-export.js";
import {
  fillTemplate,
  getPlaceholders,
  rememberValues,
} from "../src/features/quick-chat/placeholder-manager.js";
import {
  applyForm,
  cleanText,
  loadPhrases,
  movePhrase,
  removePhrase,
  savePhrases,
} from "../src/features/quick-chat/phrase-manager.js";
import { shouldShowSearch, visiblePhrases } from "../src/features/quick-chat/search.js";
import { activeToolLabel } from "../src/ui/control-panel.js";
import { features } from "../src/features/index.js";
import { parseCssColor, themeFromColor } from "../src/ui/theme.js";

test("username normalization matches profile-link encoding", () => {
  assert.equal(sanitizeUsername(" @Farmer: "), "Farmer");
  assert.equal(normalizeUsername("Cadis+Etrama"), "cadis etrama");
  assert.equal(normalizeUsername("CADIS ETRAMA"), "cadis etrama");
});

test("identity reuses the previous userscript's stored username", () => {
  const store = createMemoryStorage({
    [keys.username]: JSON.stringify("Cadis"),
  });
  const identity = createIdentity(store, { ask: () => "should-not-ask" });

  assert.equal(identity.ensure("prompt"), "Cadis");
  identity.clear();
  assert.equal(store.get(keys.username), null);
  assert.equal(store.get(keys.seenMessages), null);

  const asking = createIdentity(store, { ask: () => " @New: " });
  assert.equal(asking.ensure("prompt"), "New");
  assert.equal(store.getJson(keys.username, null), "New");
});

test("identity stays unset when the prompt is cancelled", () => {
  const identity = createIdentity(createMemoryStorage(), { ask: () => null });
  assert.equal(identity.ensure("prompt"), null);
  assert.equal(identity.get(), null);
});

test("bounded set drops the oldest id and does not refresh duplicates", () => {
  const seen = createBoundedSet(2);
  seen.add("a");
  seen.add("b");
  seen.add("a");
  seen.add("c");

  assert.equal(seen.has("a"), false);
  assert.equal(seen.has("b"), true);
  assert.equal(seen.has("c"), true);
});

test("session separator anchors on the previous message only after a redraw", () => {
  const messages = [{ id: "new" }, { id: "old" }];
  const fingerprintOf = (message) => message.id;

  const steady = planSessionSeparator("old", messages, false, fingerprintOf);
  assert.equal(steady.before, null);
  assert.equal(steady.lastKnown, "new");

  const redraw = planSessionSeparator("old", messages, true, fingerprintOf);
  assert.equal(redraw.before, messages[1]);
  assert.equal(redraw.lastKnown, "new");

  const firstLoad = planSessionSeparator(null, messages, true, fingerprintOf);
  assert.equal(firstLoad.before, null);
  assert.equal(firstLoad.lastKnown, "new");

  const reopened = planSessionSeparator("new", messages, true, fingerprintOf);
  assert.equal(reopened.before, null);
  assert.equal(reopened.lastKnown, "new");
});

test("closed mobile chat is polled and an open chat is left to the game", () => {
  assert.equal(shouldPollChat({ desktopVisible: false, panelOpen: false }), true);
  assert.equal(shouldPollChat({ desktopVisible: false, panelOpen: true }), false);
  assert.equal(shouldPollChat({ desktopVisible: true, panelOpen: false }), false);
  assert.equal(normalizeWatchedChannel(" Trade "), "trade");
  assert.equal(normalizeWatchedChannel("nope"), "");
  assert.equal(channelLabel("giveaways"), "Giveaways");
  assert.deepEqual(
    roomsToPoll({ currentRoom: "help", watchedRoom: "trade", chatHidden: false }),
    ["trade"],
  );
  assert.deepEqual(
    roomsToPoll({ currentRoom: "trade", watchedRoom: "trade", chatHidden: true }),
    ["trade"],
  );
  assert.deepEqual(
    roomsToPoll({ currentRoom: "help", watchedRoom: "", chatHidden: true }),
    ["help"],
  );

  const room = readChatRoom({
    querySelector(selector) {
      if (selector === "#chatroom_mobile") return { value: "trade" };
      return null;
    },
  });
  assert.equal(room, "trade");

  const seen = createBoundedSet(10);
  seen.add("old");
  const fresh = unseenMessages(seen, [{ id: "old" }, { id: "new" }], (message) => message.id);
  assert.deepEqual(fresh.map((message) => message.id), ["new"]);
});

test("unread mark counts hidden alerts once and clears when chat is open", () => {
  const seen = createBoundedSet(10);
  let state = applyUnread(0, "mention", true, seen);
  assert.equal(state.count, 1);
  state = applyUnread(state.count, "mention", true, seen);
  assert.equal(state.count, 1);
  assert.equal(state.changed, false);
  state = applyUnread(state.count, "lemon", true, seen);
  assert.equal(state.count, 2);
  assert.equal(unreadLabel(state.count), "2");
  assert.equal(unreadLabel(12), "9+");
  assert.equal(unreadLabel(0), "");

  state = applyUnread(state.count, "later", false, seen);
  assert.equal(state.count, 0);

  const button = findChatOpenButton({
    querySelector(selector) {
      if (selector.startsWith("#openchatbtn")) return { id: "openchatbtn" };
      return null;
    },
  });
  assert.equal(button.id, "openchatbtn");
});

test("desktop and mobile chat zones are both watched", () => {
  const desktop = { id: "chatzoneDesktop" };
  const mobile = { id: "chatzoneMobile" };
  const root = {
    querySelectorAll(selector) {
      if (selector === "#chatzoneDesktop") return [desktop];
      if (selector === "#chatzoneMobile") return [mobile];
      return [];
    },
  };

  assert.deepEqual(findChatContainers(root), [desktop, mobile]);
  assert.equal(findChatContainer(root), desktop);
});

test("mobile composer is a chat input", () => {
  assert.match(CHAT_INPUT_SELECTOR, /#chat_message_compact/);
  const input = { id: "chat_message_compact" };
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, CHAT_INPUT_SELECTOR);
      return [input];
    },
  };
  assert.deepEqual(findChatInputs(root), [input]);
});

function authorNode(text, { link = false, query = null } = {}) {
  const node = {
    textContent: text,
    children: [],
    classList: { contains: () => false },
    matches: (selector) => link && selector.includes("user_name"),
    querySelector: () => query,
    querySelectorAll: () => [],
  };
  node.cloneNode = () => authorNode(text, { link });
  return node;
}

test("mobile chat messages keep the desktop child slots", () => {
  const body = {
    innerText: "@Duckster sorry",
    textContent: "@Duckster sorry lemon",
    children: [
      {
        matches: (selector) => selector === "a",
        children: [{ matches: (selector) => selector === "img", alt: "Lemon" }],
      },
      { matches: () => false, children: [] },
    ],
  };
  const authorLink = authorNode("Farmer Choupisson", { link: true });
  authorLink.getAttribute = () => "profile.php?user_name=Farmer+Choupisson";
  const chip = authorNode(" Farmer Choupisson  [200] ", { query: authorLink });
  const message = {
    children: [{ textContent: "04:01:04 PM" }, {}, chip, {}, {}, body],
    querySelector: (selector) =>
      selector.startsWith('a[href^="profile.php?user_name="]') ? authorLink : null,
  };

  assert.equal(messageText(message), "@Duckster sorry");
  assert.equal(messageBody(message), body);
  assert.equal(messageAuthor(message), "Farmer Choupisson");
  assert.equal(messageProfileName(message), "Farmer+Choupisson");
  assert.equal(fingerprint(message), "04:01:04 PM:@Duckster sorry lemon");
  assert.deepEqual(extractItemNames(body), ["Lemon"]);

  const desktop = {
    children: [{}, {}, authorNode("Cadis", { link: true })],
  };
  assert.equal(messageAuthor(desktop), "Cadis");

  const plain = {
    children: [{}, {}, authorNode("Zwinkster [1,200]")],
  };
  assert.equal(messageAuthor(plain), "Zwinkster");
});

test("item keywords match image names, not free text", () => {
  assert.deepEqual(parseKeywordInput("Dragon Egg, (Trade), , rare"), [
    "dragon egg",
    "trade",
    "rare",
  ]);

  const body = {
    children: [
      {
        matches: (selector) => selector === "a",
        children: [{ matches: (selector) => selector === "img", alt: "Dragon Egg" }],
      },
      { matches: () => false, children: [] },
    ],
  };

  assert.deepEqual(extractItemNames(body), ["Dragon Egg"]);
  assert.equal(matchKeyword(extractItemNames(body), ["egg", "stone"]), "egg");
  assert.equal(matchKeyword(["Apple"], ["egg"]), null);
});

test("trade side drops only the other half of a post", () => {
  assert.equal(tradeIntent("WTS 500"), "wts");
  assert.equal(tradeIntent("wtb: please"), "wtb");
  assert.equal(tradeIntent("SELLING lemon"), "wts");
  assert.equal(tradeIntent("sell Lemon"), "wts");
  assert.equal(tradeIntent("Buying lemon"), "wtb");
  assert.equal(tradeIntent("want to BUY"), "wtb");
  assert.equal(tradeIntent("WTS apples, WTB rope"), "mixed");
  assert.equal(tradeIntent("buying or selling"), "mixed");
  assert.equal(tradeIntent("nice lemon"), "");
  assert.equal(tradeIntent("seller buyer"), "");
  assert.equal(acceptsTradeSide("wts", "wtb"), false);
  assert.equal(acceptsTradeSide("wts", "wts"), true);
  assert.equal(acceptsTradeSide("wts", ""), true);
  assert.equal(acceptsTradeSide("wts", "mixed"), true);
  assert.equal(acceptsTradeSide("both", "wtb"), true);
  assert.equal(acceptsTradeSide("wtb", "wts"), false);
  assert.equal(normalizeTradeSide("WTS"), "wts");
  assert.equal(normalizeTradeSide("nope"), "both");

  const store = createMemoryStorage();
  keywordAlerts.writeSide({ storage: store }, "wtb");
  assert.equal(store.get(keys.tradeSide), "wtb");
  assert.equal(keywordAlerts.readSide(), "wtb");
  keywordAlerts.writeSide({ storage: store }, "both");
  assert.equal(store.get(keys.tradeSide), null);
  assert.equal(keywordAlerts.readSide(), "both");
});

test("friends match a profile name and stay listed until removed", () => {
  assert.equal(friendKey("Ada Seller"), "ada seller");
  assert.equal(friendKey("Ada+Seller"), "ada seller");
  assert.equal(friendKey("Someone"), "");
  assert.deepEqual(parseFriendInput("Ada Seller, ada seller, , Bea [200]"), [
    { id: "ada seller", label: "Ada Seller" },
    { id: "bea", label: "Bea" },
  ]);
  assert.equal(isFriend([{ id: "ada seller", label: "Ada Seller" }], "Ada+Seller"), true);
  assert.equal(isFriend([{ id: "ada seller", label: "Ada Seller" }], "Bea"), false);

  const store = createMemoryStorage();
  const ctx = { storage: store };
  assert.equal(friendMarks.addNames(ctx, "Ada Seller, Bea"), 2);
  assert.equal(friendMarks.addNames(ctx, "ada seller"), 0);
  assert.equal(friendMarks.start(ctx), true);
  friendMarks.remove(ctx, "ada seller");
  assert.deepEqual(friendMarks.readFriends(), [{ id: "bea", label: "Bea" }]);
  friendMarks.remove(ctx, "bea");
  assert.equal(friendMarks.isEnabled(), false);
  assert.equal(store.get(keys.friends), null);
});

test("a muted player stays muted until they are unmuted", () => {
  assert.equal(playerKey("Farmer+Choupisson", "Farmer Choupisson"), "farmer choupisson");
  assert.equal(playerKey("", "Someone"), "");

  const store = createMemoryStorage();
  const ctx = { storage: store };
  playerMute.mute(ctx, "Farmer+Choupisson", "Farmer Choupisson");
  assert.equal(playerMute.blocks("Farmer Choupisson"), false);

  playerMute.start(ctx);
  assert.equal(playerMute.blocks("farmer choupisson"), true);
  assert.equal(playerMute.blocks("Farmer+Choupisson"), true);
  assert.deepEqual(playerMute.readMuted(), [
    { id: "farmer choupisson", label: "Farmer Choupisson" },
  ]);

  playerMute.unmute(ctx, "farmer choupisson");
  assert.equal(store.get(keys.mutedPlayers), null);
  assert.equal(playerMute.blocks("Farmer Choupisson"), false);
  assert.deepEqual(playerMute.readMuted(), []);
  playerMute.stop();
});

test("phrases round-trip through the original storage key", () => {
  const store = createMemoryStorage();
  const phrases = [];
  assert.equal(applyForm(phrases, { id: null, title: "  Sell  ", text: "Selling\napples" }), true);
  assert.equal(phrases[0].text, "Selling apples");
  assert.equal(phrases[0].title, "Sell");

  assert.equal(savePhrases(store, phrases), true);
  const loaded = loadPhrases(store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].text, "Selling apples");
  assert.equal(cleanText("  a \n b  "), "a b");
});

test("phrase reorder, delete, and duplicate-after keep list position", () => {
  const phrases = [
    { id: "a", title: "", text: "one" },
    { id: "b", title: "", text: "two" },
  ];

  assert.equal(movePhrase(phrases, "b", -1), true);
  assert.deepEqual(phrases.map((phrase) => phrase.id), ["b", "a"]);
  assert.equal(movePhrase(phrases, "b", -1), false);

  assert.equal(
    applyForm(phrases, { id: null, title: "copy", text: "two", afterId: "b" }),
    true,
  );
  assert.deepEqual(phrases.map((phrase) => phrase.text), ["two", "two", "one"]);

  const removed = removePhrase(phrases, "a");
  assert.equal(removed.phrase.text, "one");
  assert.equal(phrases.some((phrase) => phrase.id === "a"), false);
});

test("import skips duplicate text and export drops local ids", () => {
  const phrases = [{ id: "a", title: "Have", text: "hello" }];
  const added = mergeImported(phrases, [
    { title: "Have", text: "hello" },
    { title: "New", text: "  goodbye \n friend " },
    { title: "Skip" },
  ]);

  assert.equal(added, 1);
  assert.equal(phrases[1].text, "goodbye friend");
  assert.deepEqual(JSON.parse(toExportJson(phrases)), [
    { title: "Have", text: "hello" },
    { title: "New", text: "goodbye friend" },
  ]);
  assert.throws(() => mergeImported(phrases, { text: "nope" }), /Expected a list/);
});

test("fill-in blanks keep empty tokens and remember the latest values", () => {
  assert.deepEqual(getPlaceholders("Sell {item} for {price} and {item}"), ["item", "price"]);
  assert.equal(fillTemplate("Sell {item}", { item: "" }), "Sell {item}");
  assert.equal(fillTemplate("Sell { item }", { item: "Egg" }), "Sell Egg");

  let values = {};
  for (let index = 0; index < 100; index += 1) values[`k${index}`] = String(index);
  values = rememberValues(values, { k0: "fresh" });
  assert.equal(Object.keys(values).at(-1), "k0");
  assert.equal(values.k0, "fresh");

  values = rememberValues(values, { extra: "x" });
  assert.equal(values.k1, undefined);
  assert.equal(values.k0, "fresh");
  assert.equal(values.extra, "x");
  assert.equal(Object.keys(values).length, 100);
});

test("search stays hidden until the list is long, and edit mode shows every row", () => {
  const phrases = Array.from({ length: 8 }, (_, index) => ({
    title: "",
    text: `phrase ${index}`,
  }));

  assert.equal(shouldShowSearch(phrases, false), false);
  phrases.push({ title: "Rare", text: "apples" });
  assert.equal(shouldShowSearch(phrases, false), true);
  assert.equal(shouldShowSearch(phrases, true), false);

  const matches = visiblePhrases(phrases, "rare", false);
  assert.deepEqual(matches.map((phrase) => phrase.text), ["apples"]);
  assert.equal(visiblePhrases(phrases, "rare", true).length, phrases.length);
});

test("theme follows an opaque page background", () => {
  assert.equal(themeFromColor(parseCssColor("rgb(38, 46, 41)")), "dark");
  assert.equal(themeFromColor(parseCssColor("rgb(246, 243, 236)")), "light");
  assert.equal(themeFromColor(parseCssColor("rgba(0, 0, 0, 0)")), null);
});

test("active tool label uses menu names of enabled tools", () => {
  const sample = [
    { id: "mentions", toggle: { label: "Mentions" }, isEnabled: () => true },
    { id: "highlight", toggle: { label: "Highlight" }, isEnabled: () => false },
    { id: "separator", toggle: { label: "Session" }, isEnabled: () => true },
  ];
  assert.deepEqual(activeToolLabel(sample), ["Mentions", "Session"]);
});

test("feature registry exposes the original tools", () => {
  assert.deepEqual(
    features.map((feature) => feature.id),
    ["mentions", "highlight", "friends", "separator", "pins", "keywords", "mute", "quick-chat"],
  );
  assert.equal(features.find((feature) => feature.id === "separator").autoStart, true);
  assert.equal(typeof features.find((feature) => feature.id === "quick-chat").mount, "function");
});
