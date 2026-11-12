/**
 * @param {string} version
 * @returns {[number, number, number] | null}
 */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param {string} version
 */
function parts(version) {
  const parsed = parseVersion(version);
  if (!parsed) throw new Error(`Cannot bump version ${version}`);
  return parsed;
}

/**
 * New feature. 1.0.1 becomes 2.0.0.
 * @param {string} version
 */
export function bumpMajor(version) {
  const [major] = parts(version);
  return `${major + 1}.0.0`;
}

/**
 * Small fix or change. 1.0.1 becomes 1.1.0.
 * @param {string} version
 */
export function bumpMinor(version) {
  const [major, minor] = parts(version);
  return `${major}.${minor + 1}.0`;
}
