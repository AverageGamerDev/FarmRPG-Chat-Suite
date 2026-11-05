/**
 * Tampermonkey injects GM_notification only when the metadata grants it.
 * `typeof` on a missing binding is safe and falls through to the browser API.
 */
export async function ensureNotificationPermission() {
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

/**
 * @param {string} title
 * @param {string} text
 */
export function notify(title, text) {
  if (typeof GM_notification === "function") {
    GM_notification({ title, text, timeout: 5000 });
    return;
  }

  if (typeof Notification === "function" && Notification.permission === "granted") {
    new Notification(title, { body: text });
  }
}
