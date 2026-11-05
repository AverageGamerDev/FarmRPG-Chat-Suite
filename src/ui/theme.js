const DARK_LUMINANCE = 0.4;

/**
 * "dark" or "light" from an opaque rgb color, or null when the color is missing
 * or too transparent to trust.
 * @param {{ r: number, g: number, b: number, a: number } | null | undefined} color
 */
export function themeFromColor(color) {
  if (!color || color.a < 0.5) return null;
  return luminance(color) < DARK_LUMINANCE ? "dark" : "light";
}

/**
 * @param {string} value
 */
export function parseCssColor(value) {
  const match = String(value).match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
  );
  if (!match) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
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

/**
 * Match the game page. If the page has no opaque background, follow the OS.
 */
export function detectTheme() {
  const fromPage =
    firstOpaque(document.querySelector(".page-content")) ?? firstOpaque(document.body);
  if (fromPage) return fromPage;

  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme() {
  const next = detectTheme();
  if (document.documentElement.dataset.fcsTheme !== next) {
    document.documentElement.dataset.fcsTheme = next;
  }
  return next;
}

/**
 * Re-apply when the game swaps its theme class or the OS scheme changes.
 */
export function watchTheme() {
  applyTheme();

  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener?.("change", applyTheme);

  const observer = new MutationObserver(applyTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  }
}
