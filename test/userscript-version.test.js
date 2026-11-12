import assert from "node:assert/strict";
import test from "node:test";
import { bumpMajor, bumpMinor } from "../scripts/userscript-version.js";

test("a feature raises the major version and a small change raises the minor", () => {
  assert.equal(bumpMajor("1.0.1"), "2.0.0");
  assert.equal(bumpMajor("1.4.2"), "2.0.0");
  assert.equal(bumpMinor("1.0.1"), "1.1.0");
  assert.equal(bumpMinor("1.9.4"), "1.10.0");
});
