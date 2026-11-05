import { findActiveInput, findChatInputs, insertIntoChat } from "../../core/chat.js";
import { log } from "../../core/log.js";
import { onDocumentMutations } from "../../core/dom-observer.js";
import { el } from "../../ui/dom.js";
import { mergeImported, toExportJson } from "./import-export.js";
import {
  fillTemplate,
  getPlaceholders,
  loadLastValues,
  saveLastValues,
} from "./placeholder-manager.js";
import {
  applyForm,
  cleanText,
  insertPhrase,
  loadPhrases,
  movePhrase,
  removePhrase,
  savePhrases,
} from "./phrase-manager.js";
import { visiblePhrases } from "./search.js";
import { onQuickChatKeyDown } from "./shortcuts.js";
import { createQuickChatUi } from "./ui.js";

const ROW_CLASS = "fcs-qc-row";
const OPEN_CLASS = "fcs-qc-open";

export const quickChat = {
  id: "quick-chat",

  /**
   * @param {import("../../core/feature.js").SuiteContext} ctx
   */
  mount(ctx) {
    const storage = ctx.storage;
    const boundInputs = new WeakMap();

    const state = {
      phrases: loadPhrases(storage),
      open: false,
      editMode: false,
      form: null,
      fill: null,
      query: "",
      anchor: null,
      target: null,
    };

    let ui;

    function persist() {
      if (!savePhrases(storage, state.phrases)) {
        ui.setStatus("Could not save (storage unavailable)");
      }
    }

    const commands = {
      focusChat() {
        findActiveInput(state.target)?.focus();
      },

      previewFill(values) {
        const cleaned = Object.create(null);
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

        const last = loadLastValues(storage);
        const values = Object.create(null);
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
            afterId: phrase.id,
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
        const cleaned = Object.create(null);
        for (const name of names) cleaned[name] = cleanText(values[name]);

        const missing = names.find((name) => !cleaned[name]);
        if (missing) {
          ui.setStatus("Fill all fields");
          fields[missing]?.focus();
          return;
        }

        if (!saveLastValues(storage, cleaned)) {
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
            },
          },
          6000,
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
      },
    };

    ui = createQuickChatUi(state, commands);

    function findVisibleOpener() {
      return (
        Array.from(document.querySelectorAll(`.${OPEN_CLASS}`)).find(
          (node) => node.offsetParent !== null,
        ) ?? null
      );
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
        open: (button, input) => ui.open(button, input),
        findVisibleOpener: () => {
          const button = findVisibleOpener();
          if (!button) return null;
          return { button, input: boundInputs.get(button) ?? null };
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
        usePhrase: (phrase) => commands.usePhrase(phrase),
      });
    });

    window.addEventListener("resize", () => ui.position());
    log.info("Quick Chat ready");
  },
};
