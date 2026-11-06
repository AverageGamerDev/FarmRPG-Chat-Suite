import { CHAT_CHANNELS, normalizeWatchedChannel } from "../core/chat-poll.js";
import { keys } from "../core/storage.js";
import { onDocumentMutations } from "../core/dom-observer.js";
import { button, el } from "./dom.js";

const FOOTER_SELECTOR = "#bottom .footer-btn-row";
const NAVBAR_SELECTOR = ".navbar-inner.navbar-on-center .right";
const PREFERRED_ORDER = ["mentions", "highlight", "pins", "separator", "keywords"];

/**
 * Names of the tools that are currently on, in menu order.
 * @param {Array<Object>} features
 */
export function activeToolLabel(features) {
  return orderedFeatures(features)
    .filter((feature) => feature.isEnabled?.())
    .map((feature) => feature.toggle.label || feature.id);
}

/**
 * Footer launcher, settings menu, and the navbar label of active tools.
 * Quick Chat keeps its own button beside the chat input.
 *
 * @param {Array<Object>} features
 * @param {import("../core/feature.js").SuiteContext} ctx
 */
export function mountControlPanel(features, ctx) {
  restoreEnabled(features, ctx);

  const menu = buildMenu(features, ctx);
  let open = false;
  let anchor = null;

  function paint() {
    for (const row of menu.rows) {
      row.input.checked = row.feature.isEnabled();
      for (const extra of row.extras) {
        extra.node.hidden = extra.spec.visible ? !extra.spec.visible() : false;
      }
    }

    const names = activeToolLabel(features);
    for (const label of document.querySelectorAll(".fcs-active")) {
      label.textContent = names.join(" · ");
      label.hidden = names.length === 0;
      label.title = names.join(", ");
    }

    document.querySelectorAll(".fcs-menu-btn").forEach((buttonNode) => {
      buttonNode.classList.toggle("is-open", open);
    });
  }

  function persist() {
    const enabled = features.filter((feature) => feature.isEnabled?.()).map((feature) => feature.id);
    ctx.storage.setJson(keys.enabled, enabled);
    paint();
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
    for (const feature of features) {
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
    featureById(features, "keywords")?.loadFrom?.(ctx);
    if (menu.username) menu.username.value = ctx.identity.recall() || "";
    if (menu.keywords) menu.keywords.value = featureById(features, "keywords")?.readText?.() || "";
    menu.root.hidden = false;
    position(menu.root, buttonNode);
    paint();
  }

  function closeMenu() {
    open = false;
    menu.root.hidden = true;
    menu.setStatus("");
    paint();
  }

  onDocumentMutations(() => {
    ensureLauncher((buttonNode) => {
      if (open && anchor === buttonNode) closeMenu();
      else openMenu(buttonNode);
    });
    ensureStatus();
    paint();
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

  paint();
}

/**
 * @param {Array<Object>} features
 */
export function orderedFeatures(features) {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const listed = [];
  const seen = new Set();

  for (const id of PREFERRED_ORDER) {
    const feature = byId.get(id);
    if (!feature?.toggle) continue;
    listed.push(feature);
    seen.add(feature.id);
  }

  for (const feature of features) {
    if (seen.has(feature.id) || !feature.toggle) continue;
    listed.push(feature);
  }

  return listed;
}

function featureById(features, id) {
  return features.find((feature) => feature.id === id);
}

function restoreEnabled(features, ctx) {
  const saved = ctx.storage.getJson(keys.enabled, null);
  for (const feature of features) {
    const shouldStart = Array.isArray(saved) ? saved.includes(feature.id) : Boolean(feature.autoStart);
    if (shouldStart) feature.start(ctx);
  }
  ctx.storage.setJson(
    keys.enabled,
    features.filter((feature) => feature.isEnabled?.()).map((feature) => feature.id),
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
    window.innerWidth - width - margin,
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

function option(value, label) {
  const node = el("option", "", label);
  node.value = value;
  return node;
}

function buildMenu(features, ctx) {
  const root = el("div", "fcs-panel fcs-menu");
  root.hidden = true;
  root.appendChild(el("div", "fcs-menu-title", "Chat Suite"));
  root.appendChild(buildWatchControl(ctx));

  const rows = [];
  let username = null;
  let keywords = null;
  let statusTimer = 0;
  const status = el("div", "fcs-menu-status");

  if (features.some((feature) => feature.requires === "username")) {
    username = el("input", "fcs-menu-field");
    username.type = "text";
    username.placeholder = "Your username";
    username.autocomplete = "off";
    username.addEventListener("input", () => {
      ctx.identity.set(username.value);
      if (!ctx.identity.recall()) {
        for (const feature of features) {
          if (feature.requires === "username" && feature.isEnabled()) feature.stop(ctx);
        }
      }
      api.afterChange?.();
    });
    username.addEventListener("change", () => {
      const highlight = featureById(features, "highlight");
      if (highlight?.isEnabled()) highlight.scanExisting?.(ctx);
    });
    root.appendChild(username);
  }

  const api = {
    root,
    rows,
    username,
    keywords,
    onToggle: null,
    onReset: null,
    afterChange: null,
    setStatus(message) {
      status.textContent = message || "";
      clearTimeout(statusTimer);
      if (message) statusTimer = setTimeout(() => {
        status.textContent = "";
      }, 2500);
    },
  };

  for (const feature of orderedFeatures(features)) {
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
      keywords = el("input", "fcs-menu-field");
      keywords.type = "text";
      keywords.placeholder = "dragon egg, trade";
      keywords.autocomplete = "off";
      keywords.addEventListener("input", () => {
        feature.writeText(ctx, keywords.value);
        if (!feature.readText() && feature.isEnabled()) feature.stop(ctx);
        api.afterChange?.();
      });
      root.appendChild(keywords);
      api.keywords = keywords;
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
