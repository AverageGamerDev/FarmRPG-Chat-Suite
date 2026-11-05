import { el, button } from "../../ui/dom.js";
import { getPlaceholders } from "./placeholder-manager.js";
import { MAX_TITLE } from "./phrase-manager.js";
import { MAX_FILL_VALUE } from "./placeholder-manager.js";
import { shouldShowSearch, visiblePhrases } from "./search.js";

/**
 * Popup view. Phrase rules live in the command object; this file only draws.
 *
 * @param {Object} state
 * @param {Object} commands
 */
export function createQuickChatUi(state, commands) {
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

  function position() {
    if (!state.open || !state.anchor) return;

    const rect = state.anchor.getBoundingClientRect();
    const margin = 8;
    const width = root.offsetWidth;
    const height = root.offsetHeight;

    const left = Math.min(
      Math.max(margin, rect.left),
      window.innerWidth - width - margin,
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
        position();
      }, duration);
    }

    position();
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
            "Press 1-9 to insert. Alt+Q opens and closes this panel.",
          ),
        );
      }
    }

    root.appendChild(status);
    position();
  }

  function renderHeader() {
    const header = el("div", "fcs-qc-header");
    header.appendChild(el("span", "fcs-qc-title", "Quick Chat"));

    const actions = el("div", "fcs-qc-header-actions");
    if (!state.form && !state.fill) {
      actions.appendChild(button("Add", "fcs-qc-btn-primary", () => commands.startForm(null)));
      actions.appendChild(
        button(state.editMode ? "Done" : "Edit", "", () => commands.toggleEdit()),
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
      position();
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
        el("div", "fcs-qc-empty", 'No phrases yet. Use "Add" to create one.'),
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
        state.editMode
          ? renderEditRow(phrase, state.phrases.indexOf(phrase))
          : renderUseRow(phrase, index),
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
      String(index + 1),
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
      button("Duplicate", "", () => commands.startForm(phrase, true), "Create a copy to edit"),
    );
    actions.appendChild(
      button("Delete", "fcs-qc-btn-danger", () => commands.deletePhrase(phrase.id)),
    );

    row.appendChild(actions);
    return row;
  }

  function renderForm() {
    const form = el("div", "fcs-qc-form");
    const heading = state.form.id
      ? "Edit phrase"
      : state.form.afterId
        ? "New phrase (copy)"
        : "New phrase";
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
        "Tip: write {name} where you want a fill-in blank, e.g. Selling {item} for {price}.",
      ),
    );
    form.appendChild(actions);

    setTimeout(() => text.focus(), 0);
    return form;
  }

  function renderFill() {
    const { phrase, names, values } = state.fill;
    const wrap = el("div", "fcs-qc-form");
    wrap.appendChild(
      el("div", "fcs-qc-form-heading", phrase.title || "Fill in the blanks"),
    );

    const preview = el("div", "fcs-qc-preview");
    const fields = Object.create(null);

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
      button("Insert", "fcs-qc-btn-primary", () => commands.submitFill(fields)),
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
    position,
    setStatus,
    isOpen: () => state.open,
    contains: (node) => root.contains(node),
  };
}
