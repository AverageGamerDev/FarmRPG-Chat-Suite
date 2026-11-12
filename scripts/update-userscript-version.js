import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bumpMajor, bumpMinor } from "./userscript-version.js";

const bump = process.argv[2] === "major" ? bumpMajor : process.argv[2] === "minor" ? bumpMinor : null;
if (!bump) {
  console.error("Usage: node scripts/update-userscript-version.js <major|minor>");
  process.exit(1);
}

const raw = readFileSync("package.json", "utf8");
const current = JSON.parse(raw).version;
const next = bump(current);
const updated = raw.replace(/"version":\s*"[^"]+"/, `"version": "${next}"`);
if (updated === raw) {
  console.error("package.json has no version field");
  process.exit(1);
}

writeFileSync("package.json", updated);
execFileSync("node", ["esbuild.config.js"], { stdio: "inherit" });
console.log(`${current} → ${next}`);
console.log("Commit and push main for Tampermonkey to offer this version.");
