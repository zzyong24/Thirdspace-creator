#!/usr/bin/env node
// diff-with-port.mjs
//
// Wrapper that performs the same comparison as diff.mjs but accepts a
// CLI port arg. Phase-3 page agents don't run capture-current.mjs (which
// is locked at port 3100); they capture screenshots from a port-specific
// dev server. This wrapper reads captures from
// `tests/visual/__artifacts__/current/{id}.png` (the canonical location
// the page agent writes to) and writes the diff overlay plus diff
// report into the same canonical `__artifacts__/{diff,diff-report.json}`.
//
// It does NOT modify the locked diff.mjs.
//
// Usage:
//   node scripts/visual/diff-with-port.mjs 3203
//   node scripts/visual/diff-with-port.mjs 3203 dashboard

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(FRONTEND_ROOT, "..");
const UI_DIR = resolve(REPO_ROOT, "ui");
const CURRENT_DIR = resolve(FRONTEND_ROOT, "tests", "visual", "__artifacts__", "current");
const DIFF_DIR = resolve(FRONTEND_ROOT, "tests", "visual", "__artifacts__", "diff");
const REPORT_PATH = resolve(
  FRONTEND_ROOT,
  "tests",
  "visual",
  "__artifacts__",
  "diff-report.json",
);
const ROUTES_TS = resolve(FRONTEND_ROOT, "tests", "fixtures", "routes.ts");

const REFERENCE_W = 1536;
const REFERENCE_H = 1024;
const PIXEL_TOLERANCE = 12;

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
    /\{\s*id:\s*"([^"]+)"[\s\S]*?pathname:\s*"([^"]+)"[\s\S]*?imageSha256:\s*"([0-9a-f]{64})"[\s\S]*?\}/g;
  const routes = [];
  for (const m of source.matchAll(blockRegex)) {
    routes.push({ id: m[1], pathname: m[2], imageSha256: m[3].toLowerCase() });
  }
  return routes;
}

async function readPng(path) {
  const buf = await readFile(path);
  return PNG.sync.read(buf);
}

function ensureRgba(png) {
  if (png.colorType === 6) return png;
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const srcI = (y * png.width + x) * (png.colorType === 2 ? 3 : png.colorType === 0 ? 1 : png.colorType === 4 ? 2 : 4);
      if (png.colorType === 2) {
        out.data[i] = png.data[srcI];
        out.data[i + 1] = png.data[srcI + 1];
        out.data[i + 2] = png.data[srcI + 2];
        out.data[i + 3] = 255;
      } else if (png.colorType === 0) {
        const g = png.data[srcI];
        out.data[i] = g;
        out.data[i + 1] = g;
        out.data[i + 2] = g;
        out.data[i + 3] = 255;
      } else if (png.colorType === 4) {
        const g = png.data[srcI];
        const a = png.data[srcI + 1];
        out.data[i] = g;
        out.data[i + 1] = g;
        out.data[i + 2] = g;
        out.data[i + 3] = a;
      } else if (png.colorType === 3) {
        out.data[i] = 128;
        out.data[i + 1] = 128;
        out.data[i + 2] = 128;
        out.data[i + 3] = 255;
      } else {
        out.data[i] = png.data[srcI] ?? 0;
        out.data[i + 1] = png.data[srcI + 1] ?? 0;
        out.data[i + 2] = png.data[srcI + 2] ?? 0;
        out.data[i + 3] = 255;
      }
    }
  }
  return out;
}

function resampleNearest(src, dst) {
  const sw = src.width;
  const sh = src.height;
  const dw = dst.width;
  const dh = dst.height;
  for (let i = 0; i < dst.data.length; i += 4) {
    dst.data[i] = 255;
    dst.data[i + 1] = 255;
    dst.data[i + 2] = 255;
    dst.data[i + 3] = 255;
  }
  const srcAspect = sw / sh;
  const dstAspect = dw / dh;
  let scaleW = dw;
  let scaleH = dh;
  if (srcAspect > dstAspect) {
    scaleH = Math.round(dw / srcAspect);
  } else {
    scaleW = Math.round(dh * srcAspect);
  }
  const offsetX = Math.floor((dw - scaleW) / 2);
  const offsetY = Math.floor((dh - scaleH) / 2);
  for (let y = 0; y < scaleH; y += 1) {
    const srcY = Math.min(sh - 1, Math.floor((y * sh) / scaleH));
    for (let x = 0; x < scaleW; x += 1) {
      const srcX = Math.min(sw - 1, Math.floor((x * sw) / scaleW));
      const srcIdx = (srcY * sw + srcX) * 4;
      const dstIdx = ((y + offsetY) * dw + (x + offsetX)) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
}

function classifyAndDrawDiff(reference, current, out) {
  const w = out.width;
  const h = out.height;
  let matching = 0;
  let diverging = 0;
  const total = w * h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const rR = reference.data[i];
      const gR = reference.data[i + 1];
      const bR = reference.data[i + 2];
      const rC = current.data[i];
      const gC = current.data[i + 1];
      const bC = current.data[i + 2];
      const dr = Math.abs(rR - rC);
      const dg = Math.abs(gR - gC);
      const db = Math.abs(bR - bC);
      const diverges = dr > PIXEL_TOLERANCE || dg > PIXEL_TOLERANCE || db > PIXEL_TOLERANCE;
      if (diverges) {
        diverging += 1;
        out.data[i] = 230;
        out.data[i + 1] = 30;
        out.data[i + 2] = 60;
        out.data[i + 3] = 255;
      } else {
        matching += 1;
        out.data[i] = Math.round(rR * 0.7 + 80);
        out.data[i + 1] = Math.round(gR * 0.7 + 80);
        out.data[i + 2] = Math.round(bR * 0.7 + 80);
        out.data[i + 3] = 255;
      }
    }
  }
  return { matching, diverging, total };
}

async function main() {
  const portArg = process.argv[2];
  const idFilter = process.argv[3];
  if (!portArg) {
    console.error(
      "Usage: node scripts/visual/diff-with-port.mjs <port> [route-id-filter]",
    );
    process.exit(2);
  }

  if (!existsSync(UI_DIR)) {
    console.error(`[diff-with-port] UI directory not found: ${UI_DIR}`);
    process.exit(1);
  }
  if (!existsSync(CURRENT_DIR)) {
    console.error(
      `[diff-with-port] No current captures found at ${CURRENT_DIR}.`,
    );
    process.exit(2);
  }

  const routesSource = await readFile(ROUTES_TS, "utf8");
  const routes = parseRoutes(routesSource);
  console.log(`[diff-with-port] Parsed ${routes.length} routes from routes.ts`);

  await mkdir(DIFF_DIR, { recursive: true });

  const results = [];
  for (const route of routes) {
    if (idFilter && route.id !== idFilter) continue;
    const filename = ID_TO_FILENAME[route.id];
    const refPath = filename ? join(UI_DIR, filename) : null;
    const currentPath = join(CURRENT_DIR, `${route.id}.png`);

    const baseEntry = {
      id: route.id,
      pathname: route.pathname,
      reference: refPath,
      current: currentPath,
      referenceSha256: route.imageSha256,
      port: Number(portArg),
    };

    if (!refPath || !existsSync(refPath)) {
      results.push({ ...baseEntry, status: "MISSING_REFERENCE", diffRatio: 1 });
      console.error(`[diff-with-port] ${route.id}: missing reference`);
      continue;
    }
    if (!existsSync(currentPath)) {
      results.push({ ...baseEntry, status: "MISSING_CURRENT", diffRatio: 1 });
      console.error(`[diff-with-port] ${route.id}: missing current capture at ${currentPath}`);
      continue;
    }

    try {
      const refPng = ensureRgba(await readPng(refPath));
      const curPng = ensureRgba(await readPng(currentPath));

      const refNorm =
        refPng.width === REFERENCE_W && refPng.height === REFERENCE_H
          ? refPng
          : (() => {
              const out = new PNG({ width: REFERENCE_W, height: REFERENCE_H });
              resampleNearest(refPng, out);
              return out;
            })();
      const curNorm = new PNG({ width: REFERENCE_W, height: REFERENCE_H });
      resampleNearest(curPng, curNorm);

      const out = new PNG({ width: REFERENCE_W, height: REFERENCE_H });
      const { matching, diverging, total } = classifyAndDrawDiff(
        refNorm,
        curNorm,
        out,
      );

      const diffPath = join(DIFF_DIR, `${route.id}.png`);
      await writeFile(diffPath, PNG.sync.write(out));

      const currentSha = createHash("sha256")
        .update(await readFile(currentPath))
        .digest("hex");

      results.push({
        ...baseEntry,
        status: "OK",
        diffPath,
        currentSha256: currentSha,
        refWidth: refPng.width,
        refHeight: refPng.height,
        curWidth: curPng.width,
        curHeight: curPng.height,
        matching,
        diverging,
        total,
        diffRatio: diverging / total,
      });
      console.log(
        `[diff-with-port] ${route.id}: ${(diverging / total * 100).toFixed(2)}% diverging ` +
          `(${diverging}/${total} px)`,
      );
    } catch (err) {
      results.push({
        ...baseEntry,
        status: "ERROR",
        diffRatio: 1,
        error: err?.message ?? String(err),
      });
      console.error(`[diff-with-port] ${route.id}: error: ${err?.message ?? err}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    pixelTolerance: PIXEL_TOLERANCE,
    referenceDimensions: { width: REFERENCE_W, height: REFERENCE_H },
    port: Number(portArg),
    total: results.length,
    ok: results.filter((r) => r.status === "OK").length,
    missingReference: results.filter((r) => r.status === "MISSING_REFERENCE").length,
    missingCurrent: results.filter((r) => r.status === "MISSING_CURRENT").length,
    errors: results.filter((r) => r.status === "ERROR").length,
    worstDiffRatio: results.reduce(
      (m, r) => (r.status === "OK" && r.diffRatio > m ? r.diffRatio : m),
      0,
    ),
    bestDiffRatio: results.reduce(
      (m, r) => (r.status === "OK" && r.diffRatio < m ? r.diffRatio : m),
      1,
    ),
    results,
  };

  await writeFile(REPORT_PATH, JSON.stringify(summary, null, 2), "utf8");
  console.log(
    `[diff-with-port] ${summary.ok}/${summary.total} compared. ` +
      `Report: ${relative(FRONTEND_ROOT, REPORT_PATH)}`,
  );
}

main().catch((err) => {
  console.error("[diff-with-port] Unexpected error:", err);
  process.exit(2);
});