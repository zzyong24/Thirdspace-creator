#!/usr/bin/env node
// capture-with-port.mjs
//
// Wrapper around capture-current.mjs that accepts a CLI port arg.
// Used by Phase 2 shared-visual-layer calibration. Does NOT modify
// the locked capture-current.mjs / diff.mjs scripts.
//
// Usage:
//   node scripts/visual/capture-with-port.mjs 3202 dashboard /
//   node scripts/visual/capture-with-port.mjs 3202 projects /projects
//   node scripts/visual/capture-with-port.mjs 3202 research /projects/ai-native-browser/research

import { mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");
const OUT_DIR = resolve(FRONTEND_ROOT, "tests", "visual", "__artifacts__");

const [, , portArg, nameArg, pathArg] = process.argv;
if (!portArg || !nameArg || !pathArg) {
  console.error(
    "Usage: node scripts/visual/capture-with-port.mjs <port> <name> <pathname>",
  );
  process.exit(2);
}

const PORT = Number(portArg);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1536, height: 1024 };

const require = createRequire(import.meta.url);

async function loadPlaywright() {
  const { existsSync } = require("node:fs");
  const candidates = [
    resolve(FRONTEND_ROOT, "node_modules", "playwright"),
    resolve(FRONTEND_ROOT, "node_modules", "playwright-core"),
    resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright@1.60.0", "node_modules", "playwright"),
    resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright-core@1.60.0", "node_modules", "playwright-core"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return require(c);
      } catch {
        // continue
      }
    }
  }
  throw new Error("Could not find playwright");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // wait for server
  const start = Date.now();
  let ready = false;
  while (Date.now() - start < 30_000) {
    try {
      const res = await fetch(BASE_URL, { redirect: "manual" });
      if (res.status >= 200 && res.status < 600) {
        ready = true;
        break;
      }
    } catch {
      // not ready
    }
    await sleep(500);
  }
  if (!ready) {
    throw new Error(`Server did not become ready at ${BASE_URL}`);
  }

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(url)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${pathArg}`;
  console.log(`[capture-with-port] ${nameArg} → ${url}`);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const outPath = join(OUT_DIR, `shared-${nameArg}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`[capture-with-port]   OK → ${outPath}`);
  await browser.close();
}

main().catch((err) => {
  console.error("[capture-with-port] Error:", err);
  process.exit(2);
});
