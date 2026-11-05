const TOGGLE_CODE = "KeyQ";

function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea"));
}

/**
 * Alt+Q toggles the panel from anywhere.
 * Escape steps back one level: fill-in, form, search query, then close.
 * 1-9 inserts a visible phrase while the list is showing.
 *
 * @param {KeyboardEvent} event
 * @param {{
 *   isOpen: () => boolean,
 *   close: (refocus?: boolean) => void,
 *   open: (button: HTMLElement, input: HTMLInputElement | null) => void,
 *   findVisibleOpener: () => { button: HTMLElement, input: HTMLInputElement | null } | null,
 *   onEscape: () => void,
 *   canUseNumberShortcut: () => boolean,
 *   phraseAt: (index: number) => { id: string, title: string, text: string } | undefined,
 *   usePhrase: (phrase: { id: string, title: string, text: string }) => void,
 * }} api
 */
export function onQuickChatKeyDown(event, api) {
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

  if (
    /^[1-9]$/.test(event.key) &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    api.canUseNumberShortcut() &&
    !isTypingTarget(event.target)
  ) {
    const phrase = api.phraseAt(Number(event.key) - 1);
    if (!phrase) return;
    event.preventDefault();
    api.usePhrase(phrase);
  }
}
