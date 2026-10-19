#!/usr/bin/env node
// capture-current.mjs
//
// Captures a 1536x1024 full-page screenshot of every route in
// tests/fixtures/routes.ts against a local Next.js dev server.
//
// Why a separate script?
//   - The Playwright `visual` test suite enforces the Controller-
//     approved reference image and exits non-zero on any diff.
//     We need a non-failing pipeline to bootstrap the *current*
//     implementation render so that subsequent diff comparisons
//     (see diff.mjs) have an authoritative "what does the code
//     produce today?" artifact.
//   - The captured PNGs are written to
//     tests/visual/__artifacts__/current/<route-id>.png and are
//     NEVER read by toHaveScreenshot(). They are diagnostic
//     output, not a baseline.
//
// Usage:
//   pnpm dev --hostname 127.0.0.1 --port 3201  # in one terminal
//   pnpm visual:capture-current               # in another
//
//   # or let this script boot the dev server itself:
//   pnpm visual:capture-current --boot
//
// Exits non-zero only on hard infrastructure errors (dev server
// won't start, Chromium failed to launch, etc). Per-route failures
// are recorded in tests/visual/__artifacts__/current/index.json
// so the caller can decide what to do.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");
const OUT_DIR = resolve(FRONTEND_ROOT, "tests", "visual", "__artifacts__", "current");
const ROUTES_TS = resolve(FRONTEND_ROOT, "tests", "fixtures", "routes.ts");
const PORT = 3201;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1536, height: 1024 };

const NO_PROXY = "127.0.0.1,localhost";
const PROXY_ENV = {
  ...process.env,
  NO_PROXY,
  no_proxy: NO_PROXY,
};

const require = createRequire(import.meta.url);
const ROUTES = requireFreshRoutes(ROUTES_TS);

function parseRoutes(source) {
  const blockRegex =
    /\{\s*id:\s*"([^"]+)"[\s\S]*?pathname:\s*"([^"]+)"[\s\S]*?\}/g;
  const routes = [];
  for (const m of source.matchAll(blockRegex)) {
    routes.push({ id: m[1], pathname: m[2] });
  }
  return routes;
}

function requireFreshRoutes(tsPath) {
  // Avoid TS toolchain. Use a tiny on-the-fly transpile via the
  // dev-mode Next compiler? No — we just need the *array* of routes,
  // not the TypeScript types. A regex parse is sufficient because
  // routes.ts is a single const literal with a stable shape.
  const { readFileSync } = require("node:fs");
  const source = readFileSync(tsPath, "utf8");
  return parseRoutes(source);
}

async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  timeoutMs = Math.max(120_000, timeoutMs);
  const deadline = start + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      // Any HTTP response (including 4xx) is good enough — the
      // server is listening and serving.
      if (res.status >= 200 && res.status < 600) return;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error(`Dev server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function bootDevServer() {
  console.log(`[capture-current] Booting Next.js dev server on port ${PORT}…`);
  const child = spawn(
    "pnpm",
    ["dev", "--hostname", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: FRONTEND_ROOT,
      env: PROXY_ENV,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  await waitForServer(BASE_URL);
  return child;
}

async function loadPlaywright() {
  // playwright is shipped as part of @playwright/test's deps.
  // Resolve it relative to the frontend workspace to avoid
  // accidental global-install mismatches.
  //
  // pnpm's hoisting can leave `playwright` unreachable from
  // `frontend/node_modules/playwright` even when it's listed as
  // a transitive dep of @playwright/test, so we walk the pnpm
  // store directly when the public path is missing.
  const candidates = [
    resolve(FRONTEND_ROOT, "node_modules", "playwright"),
    resolve(FRONTEND_ROOT, "node_modules", "playwright-core"),
    resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright@1.60.0", "node_modules", "playwright"),
    resolve(REPO_ROOT, "node_modules", ".pnpm", "playwright-core@1.60.0", "node_modules", "playwright-core"),
  ];
  let lastErr = null;
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return require(c);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw new Error(
    `Could not find playwright/playwright-core. Last error: ${lastErr?.message ?? lastErr}`,
  );
}

async function main() {
  const shouldBoot = process.argv.includes("--boot");
  await mkdir(OUT_DIR, { recursive: true });

  let serverProcess = null;
  if (shouldBoot) {
    serverProcess = await bootDevServer();
  } else {
    console.log(`[capture-current] Reusing dev server at ${BASE_URL}…`);
    await waitForServer(BASE_URL, 120_000).catch(() => {
      throw new Error(
        `No dev server detected at ${BASE_URL}. Re-run with --boot to start one.`,
      );
    });
  }

  console.log("[capture-current] Loading Playwright…");
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
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);

  // Block any external network so the visual capture is hermetic.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(url)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  const index = {
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    baseUrl: BASE_URL,
    results: [],
  };

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.pathname}`;
    const outPath = join(OUT_DIR, `${route.id}.png`);
    const startedAt = Date.now();
    try {
      console.log(`[capture-current] ${route.id} → ${url}`);
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      // Give the client a brief moment to hydrate, but avoid
      // networkidle so the run is not held hostage by long-poll
      // requests. Animations are disabled in the config so this
      // does not need to be long.
      await page.waitForLoadState("load", { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(500);

      await page.screenshot({ path: outPath, fullPage: true });
      index.results.push({
        id: route.id,
        pathname: route.pathname,
        status: response ? response.status() : null,
        output: outPath,
        durationMs: Date.now() - startedAt,
        ok: true,
        error: null,
      });
      console.log(
        `[capture-current]   OK  (${Date.now() - startedAt}ms) → ${outPath}`,
      );
    } catch (err) {
      index.results.push({
        id: route.id,
        pathname: route.pathname,
        status: null,
        output: null,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: err?.message ?? String(err),
      });
      console.error(
        `[capture-current]   FAIL ${route.id}: ${err?.message ?? err}`,
      );
    }
  }

  await browser.close();
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }

  const indexPath = join(OUT_DIR, "index.json");
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  console.log(`[capture-current] Index written to ${indexPath}`);

  const ok = index.results.filter((r) => r.ok).length;
  const fail = index.results.length - ok;
  console.log(
    `[capture-current] Done: ${ok} captured, ${fail} failed (out of ${index.results.length})`,
  );
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[capture-current] Unexpected error:", err);
  process.exit(2);
});
