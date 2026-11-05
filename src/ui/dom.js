/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {string} label
 * @param {string} [className]
 * @param {() => void} onClick
 * @param {string} [title]
 */
export function button(label, className, onClick, title) {
  const node = el("button", `fcs-qc-btn${className ? ` ${className}` : ""}`, label);
  node.type = "button";
  if (title) node.title = title;
  node.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return node;
}
