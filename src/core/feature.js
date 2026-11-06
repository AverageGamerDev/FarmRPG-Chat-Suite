/**
 * Chat features share one shape so a new tool is a module plus a registry line.
 *
 * Pipeline features implement start / stop / onMessages and optional scanExisting.
 * Always-on tools implement mount and skip the message pipeline.
 * Menu rows set `toggle.label`. `requires` is "username" or "keywords".
 * Optional `extras` are actions on that row. Colors live in tokens.css.
 *
 * @typedef {Object} SuiteContext
 * @property {import("./storage.js").createStorage extends Function ? ReturnType<import("./storage.js").createStorage> : never} storage
 * @property {ReturnType<import("./identity.js").createIdentity>} identity
 * @property {(title: string, text: string) => void} notify
 * @property {(id: string) => void} [markUnread]
 * @property {() => Promise<boolean>} ensureNotificationPermission
 */

/**
 * @param {Object} definition
 * @param {string} definition.id
 * @param {{ label: string, hint?: string }} [definition.toggle]
 * @param {"username" | "keywords"} [definition.requires]
 * @param {boolean} [definition.autoStart]
 * @param {Array<Object>} [definition.extras]
 * @param {(ctx: SuiteContext) => boolean | void} [definition.start]
 * @param {(ctx: SuiteContext) => void} [definition.stop]
 * @param {(messages: Element[], mutations: MutationRecord[], ctx: SuiteContext) => void} [definition.onMessages]
 * @param {(ctx: SuiteContext) => void} [definition.scanExisting]
 */
export function defineFeature(definition) {
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
    },
  };
}
