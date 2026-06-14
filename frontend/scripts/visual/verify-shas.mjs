#!/usr/bin/env node
// verify-shas.mjs
//
// Verifies that the SHA-256 of every PNG in /ui matches the
// `imageSha256` field on the corresponding RouteSpec in
// tests/fixtures/routes.ts.
//
// This script is the gatekeeper between the Controller-approved
// reference imagery and the visual regression test pipeline:
//  - It NEVER mutates routes.ts.
//  - It writes a JSON report to tests/visual/__artifacts__/shas.json.
//  - It exits non-zero if ANY image is missing or has a mismatched hash
//    so CI (or the developer) can fail fast.
//
// Usage:
//   node scripts/visual/verify-shas.mjs
//
// This script depends only on Node built-ins (crypto) and small
// file-system reads. No external libraries are required.

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");
const UI_DIR = resolve(REPO_ROOT, "ui");
const ROUTES_TS = resolve(FRONTEND_ROOT, "tests", "fixtures", "routes.ts");
const REPORT_PATH = resolve(
  FRONTEND_ROOT,
  "tests",
  "visual",
  "__artifacts__",
  "shas.json",
);

// Maps `id` from routes.ts → on-disk PNG filename under /ui.
// Keep in sync with the Controller's "参考图位置" mapping.
const ID_TO_FILENAME = {
  dashboard: "Dashboard.png",
  projects: "Projects.png",
  "project-overview": "Project Overview.png",
  "research-workspace": "Research Workspace.png",
  "planning-workspace": "Planning Workspace.png",
  "script-workspace": "Script Workspace.png",
  "production-workspace": "Production Workspace.png",
  "publishing-workspace": "Publishing Workspace.png",
  "analytics-review": "Analytics & Review.png",
  knowledge: "Knowledge & Memory.png",
  assets: "Assets Center.png",
  "publishing-center": "Publishing Center.png",
  experience: "Experience Center.png",
  search: "search.png",
  settings: "Settings.png",
  "new-project-overlay": "New Project.png",
  "ai-copilot-overlay": "AIchat.png",
};

/**
 * Parse routes.ts *without* a TS toolchain by regex-extracting the
 * `{ id: "X", ..., imageSha256: "Y" }` objects. The file is authored
 * by the Controller and uses a stable, well-known shape.
 */
function parseRoutes(source) {
  // We expect blocks like:
  //   {
  //     id: "dashboard",
  //     ...
  //     imageSha256: "7a1fb9a5d07050f6744231fb16d49f1c26a0bf953441c214d780bbb0e1247bab",
  //   }
  const blockRegex =
    /\{\s*id:\s*"([^"]+)"[\s\S]*?imageSha256:\s*"([0-9a-f]{64})"[\s\S]*?\}/g;
  const routes = [];
  for (const m of source.matchAll(blockRegex)) {
    routes.push({ id: m[1], imageSha256: m[2].toLowerCase() });
  }
  return routes;
}

async function sha256OfFile(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex").toLowerCase();
}

async function main() {
  if (!existsSync(UI_DIR)) {
    console.error(`[verify-shas] UI directory not found: ${UI_DIR}`);
    process.exit(2);
  }
  if (!existsSync(ROUTES_TS)) {
    console.error(`[verify-shas] routes.ts not found: ${ROUTES_TS}`);
    process.exit(2);
  }

  const routesSource = await readFile(ROUTES_TS, "utf8");
  const routes = parseRoutes(routesSource);

  if (routes.length === 0) {
    console.error(`[verify-shas] No routes parsed from ${ROUTES_TS}`);
    process.exit(2);
  }

  console.log(`[verify-shas] Parsed ${routes.length} routes from routes.ts`);

  const results = [];
  let mismatches = 0;
  let missingFiles = 0;
  let unmapped = 0;

  for (const route of routes) {
    const filename = ID_TO_FILENAME[route.id];
    if (!filename) {
      unmapped += 1;
      results.push({
        id: route.id,
        expectedSha256: route.imageSha256,
        actualSha256: null,
        filename: null,
        status: "UNMAPPED",
        note: `No UI filename mapping for route id "${route.id}"`,
      });
      continue;
    }
    const filePath = join(UI_DIR, filename);
    if (!existsSync(filePath)) {
      missingFiles += 1;
      results.push({
        id: route.id,
        expectedSha256: route.imageSha256,
        actualSha256: null,
        filename,
        status: "MISSING",
        note: `File not found at ${filePath}`,
      });
      continue;
    }

    const actual = await sha256OfFile(filePath);
    const ok = actual === route.imageSha256;
    if (!ok) mismatches += 1;
    results.push({
      id: route.id,
      expectedSha256: route.imageSha256,
      actualSha256: actual,
      filename,
      status: ok ? "MATCH" : "MISMATCH",
      note: null,
    });
  }

  const summary = {
    total: routes.length,
    matches: results.filter((r) => r.status === "MATCH").length,
    mismatches,
    missingFiles,
    unmapped,
    ok: mismatches === 0 && missingFiles === 0 && unmapped === 0,
    generatedAt: new Date().toISOString(),
    results,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(summary, null, 2), "utf8");

  // Print a compact human summary.
  for (const r of results) {
    const tag = r.status === "MATCH" ? "OK  " : "FAIL";
    console.log(
      `[verify-shas] ${tag}  ${r.id.padEnd(24)} ${r.filename ?? "(none)"}`,
    );
  }
  console.log(
    `[verify-shas] Summary: ${summary.matches}/${summary.total} matched, ` +
      `${mismatches} mismatches, ${missingFiles} missing, ${unmapped} unmapped`,
  );
  console.log(`[verify-shas] Report written to ${REPORT_PATH}`);

  if (!summary.ok) {
    console.error(
      "[verify-shas] FAIL: at least one reference image SHA-256 is out of sync with routes.ts. " +
        "If the Controller has re-approved the imagery, update routes.ts. " +
        "This subagent does NOT update routes.ts automatically.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[verify-shas] Unexpected error:", err);
  process.exit(2);
});
