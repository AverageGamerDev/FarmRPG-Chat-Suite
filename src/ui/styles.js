import tokensCss from "./styles/tokens.css";
import suiteCss from "./styles/suite.css";
import quickChatCss from "./styles/quick-chat.css";
import { watchTheme } from "./theme.js";

const STYLE_ID = "fcs-styles";

export function injectStyles() {
  watchTheme();
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${tokensCss}\n${suiteCss}\n${quickChatCss}`;
  (document.head || document.documentElement).appendChild(style);
}
