#!/usr/bin/env node
// install-baselines.mjs
//
// ONE-TIME bootstrap: copies the Controller-approved reference PNGs
// from /ui into tests/visual/__screenshots__/reference-images/ so the
// Playwright `toHaveScreenshot` baseline matcher can find them.
//
// IMPORTANT — authority rules
// ----------------------------
//   * This script is the ONLY sanctioned way to populate the
//     reference-images directory. Subagents must NEVER run
//     `playwright --update-snapshots`, must NEVER copy from
//     `tests/visual/__artifacts__/current/`, and must NEVER replace
//     a file here with a derived PNG.
//   * The reference-images directory is .gitignored locally for the
//     initial bootstrap. After the Controller performs the first
//     end-to-end review, the directory IS committed to the repo as
//     the authoritative baseline.
//   * If you re-run this script it will REFUSE to overwrite existing
//     files unless `--force` is passed. This prevents accidentally
//     reverting a Controller-approved baseline to an earlier image.
//
// Usage:
//   node scripts/visual/install-baselines.mjs           # initial install
//   node scripts/visual/install-baselines.mjs --force   # forced re-install
//
// Exits non-zero if any reference image is missing or its hash
// disagrees with the routes.ts registry. We never want a stale
// baseline in the visual diff pipeline.

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");
const UI_DIR = resolve(REPO_ROOT, "ui");
const ROUTES_TS = resolve(FRONTEND_ROOT, "tests", "fixtures", "routes.ts");
const BASELINES_DIR = resolve(
  FRONTEND_ROOT,
  "tests",
  "visual",
  "__screenshots__",
  "reference-images",
);
const INSTALL_MANIFEST = join(BASELINES_DIR, "INSTALL-MANIFEST.json");

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

function parseRoutes(source) {
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
  const force = process.argv.includes("--force");

  if (!existsSync(UI_DIR)) {
    console.error(`[install-baselines] UI directory not found: ${UI_DIR}`);
    process.exit(2);
  }
  if (!existsSync(ROUTES_TS)) {
    console.error(`[install-baselines] routes.ts not found: ${ROUTES_TS}`);
    process.exit(2);
  }

  const routesSource = await readFile(ROUTES_TS, "utf8");
  const routes = parseRoutes(routesSource);
  console.log(
    `[install-baselines] Parsed ${routes.length} routes from routes.ts`,
  );
  if (routes.length !== 17) {
    console.error(
      `[install-baselines] Expected 17 routes, parsed ${routes.length}.`,
    );
    process.exit(2);
  }

  await mkdir(BASELINES_DIR, { recursive: true });

  // Detect pre-existing baselines.
  const existingManifest = existsSync(INSTALL_MANIFEST)
    ? JSON.parse(await readFile(INSTALL_MANIFEST, "utf8"))
    : null;
  if (existingManifest && !force) {
    console.error(
      "[install-baselines] Reference baselines already exist. " +
        "Re-running would overwrite Controller-approved artifacts. " +
        "Pass --force ONLY if you have explicit Controller sign-off.",
    );
    process.exit(3);
  }

  const installed = [];
  const failures = [];
  for (const route of routes) {
    const filename = ID_TO_FILENAME[route.id];
    if (!filename) {
      failures.push({ id: route.id, reason: "No UI filename mapping" });
      continue;
    }
    const sourcePath = join(UI_DIR, filename);
    if (!existsSync(sourcePath)) {
      failures.push({ id: route.id, reason: `Missing source ${sourcePath}` });
      continue;
    }
    const actualSha = await sha256OfFile(sourcePath);
    if (actualSha !== route.imageSha256) {
      failures.push({
        id: route.id,
        reason: `SHA-256 mismatch (got ${actualSha}, want ${route.imageSha256})`,
      });
      continue;
    }
    const baselineName = `reference-${route.id}.png`;
    const baselinePath = join(BASELINES_DIR, baselineName);
    await copyFile(sourcePath, baselinePath);
    installed.push({
      id: route.id,
      source: sourcePath,
      baseline: baselinePath,
      sha256: actualSha,
    });
  }

  const manifest = {
    installedAt: new Date().toISOString(),
    installedBy: "scripts/visual/install-baselines.mjs",
    note:
      "These PNGs are the Controller-approved visual regression baseline. " +
      "Subagents must NOT regenerate them with --update-snapshots.",
    entries: installed,
  };
  await writeFile(INSTALL_MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

  console.log(
    `[install-baselines] Installed ${installed.length} reference baselines.`,
  );
  for (const entry of installed) {
    console.log(`  + ${entry.id}  ${entry.baseline}`);
  }
  if (failures.length > 0) {
    console.error(`[install-baselines] ${failures.length} failure(s):`);
    for (const f of failures) {
      console.error(`  ! ${f.id}: ${f.reason}`);
    }
    process.exit(1);
  }
  if (installed.length !== 17) {
    console.error(
      `[install-baselines] Expected to install 17 baselines, installed ${installed.length}.`,
    );
    process.exit(1);
  }
  console.log(
    `[install-baselines] Manifest written to ${INSTALL_MANIFEST}. ` +
      "Commit the contents of tests/visual/__screenshots__/reference-images/ " +
      "to lock the Controller-approved baseline.",
  );
}

main().catch((err) => {
  console.error("[install-baselines] Unexpected error:", err);
  process.exit(2);
});
