import { friendMarks } from "./friends/index.js";
import { keywordAlerts } from "./keyword-alerts/index.js";
import { mentionNotifications } from "./mention-notifications/index.js";
import { messagePins } from "./message-pins/index.js";
import { ownMessageHighlighter } from "./own-message-highlighter/index.js";
import { playerMute } from "./player-mute/index.js";
import { quickChat } from "./quick-chat/index.js";
import { sessionMarkers } from "./session-markers/index.js";

/**
 * Registry of suite tools. Pipeline order matches the original enhancer:
 * mentions, own-message highlight, friends, session separator, pins, item keywords, then mute.
 * Quick chat is always on and does not read the message stream.
 *
 * To add a feature: implement the contract in src/core/feature.js and append it here.
 */
export const features = [
  mentionNotifications,
  ownMessageHighlighter,
  friendMarks,
  sessionMarkers,
  messagePins,
  keywordAlerts,
  playerMute,
  quickChat,
];
