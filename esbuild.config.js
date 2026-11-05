import { build, context } from "esbuild";

const isWatchMode = process.argv.includes("--watch");

const userscriptMetadata = `
// ==UserScript==
// @name         FarmRPG Chat Suite
// @namespace    https://farmrpg.com/
// @version      1.0.0
// @description  Chat enhancements and quick chat utilities for FarmRPG
// @author       Cadis Etrama Di Raizel
// @match        https://farmrpg.com/
// @match        https://farmrpg.com/*
// @match        https://*.farmrpg.com/
// @match        https://*.farmrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=farmrpg.com
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==
`;

const buildOptions = {
  entryPoints: ["src/main.js"],
  outfile: "dist/farmrpg-chat-suite.user.js",

  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",

  loader: {
    ".css": "text",
  },

  banner: {
    js: userscriptMetadata,
  },

  sourcemap: false,
  minify: false,
  legalComments: "none",
};

async function run() {
  if (isWatchMode) {
    const ctx = await context(buildOptions);
    await ctx.watch();

    console.log("Watching for changes...");
    return;
  }

  await build(buildOptions);
  console.log("Build completed successfully.");
}

run().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
