#!/usr/bin/env node
// diff.mjs
//
// Compares the "current implementation" captures produced by
// `capture-current.mjs` against the Controller-approved
// reference PNGs from `ui/`, and writes:
//   - tests/visual/__artifacts__/diff/<route-id>.png
//       A red-highlight overlay on top of the reference image,
//       showing every pixel that diverges by more than the
//       configured threshold. The reference and current images
//       are normalised to a common size before comparison so a
//       page that has grown taller than the reference does not
//       blow up the diff; the diff image is always the reference
//       dimensions.
//   - tests/visual/__artifacts__/diff-report.json
//       A single machine-readable report covering all 17 routes,
//       ranked from worst to best diff ratio. This is the file
//       the Phase-1 controller reads to decide which pages are
//       ready for Controller sign-off.
//
// We use pngjs (already installed as a devDep) so the script
// has no native dependencies. Resizing is done with a simple
// nearest-or-bilinear approach; for a 1536x1024 reference and
// a slightly larger current capture, the result is still
// good enough to spot structural divergence, which is all we
// need at the "is the implementation in the right ballpark?"
// stage.
//
// Usage:
//   pnpm visual:diff
//
// Exit codes:
//   0  - pipeline ran end-to-end (diff results live in the report).
//   1  - a hard infrastructure error (missing reference, etc).
//   2  - missing `current` captures — run capture-current first.

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
const PIXEL_TOLERANCE = 12; // per-channel difference tolerated

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
  if (png.colorType === 6) return png; // already RGBA
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
        // Palette — fill with grey as a defensive fallback.
        out.data[i] = 128;
        out.data[i + 1] = 128;
        out.data[i + 2] = 128;
        out.data[i + 3] = 255;
      } else {
        out.data[i] = png.data[srcI] ?? 0;
        out.data[i + 1] = png.data[srcI + 1] ?? 0;
        out.data[i + 2] = png.data[srcI + 2] ?? 0;
        out.data[i + 3] = png.data[srcI + 3] ?? 255;
      }
    }
  }
  return out;
}

/**
 * Resize a source PNG into a destination buffer using a simple
 * nearest-neighbour sampler. The result is always written into
 * `dst` (an existing PNG of the target size), and the destination
 * is filled with the source's pixel data scaled to the new size.
 * If the aspect ratio differs we letterbox the source to the
 * destination using white; this is a *visual* pipeline, not a
 * perception-preserving one, but for "did the implementation
 * land in the right ballpark?" it is sufficient.
 */
function resampleNearest(src, dst) {
  const sw = src.width;
  const sh = src.height;
  const dw = dst.width;
  const dh = dst.height;

  // Initialise the destination to white so any out-of-source
  // margins are visible.
  for (let i = 0; i < dst.data.length; i += 4) {
    dst.data[i] = 255;
    dst.data[i + 1] = 255;
    dst.data[i + 2] = 255;
    dst.data[i + 3] = 255;
  }

  // Fit src into dst preserving aspect ratio, then centre.
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
  // Both `reference` and `current` must be the same size as `out`.
  // Returns counts of: matching pixels, diverging pixels, total.
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
        // Draw a red overlay on top of the reference so a
        // reviewer can spot the divergence at a glance.
        out.data[i] = 230;
        out.data[i + 1] = 30;
        out.data[i + 2] = 60;
        out.data[i + 3] = 255;
      } else {
        matching += 1;
        // Lighten the reference slightly so matching pixels
        // recede behind the diff.
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
  if (!existsSync(UI_DIR)) {
    console.error(`[diff] UI directory not found: ${UI_DIR}`);
    process.exit(1);
  }
  if (!existsSync(CURRENT_DIR)) {
    console.error(
      `[diff] No current captures found at ${CURRENT_DIR}. ` +
        `Run \`pnpm visual:capture-current\` first.`,
    );
    process.exit(2);
  }

  const routesSource = await readFile(ROUTES_TS, "utf8");
  const routes = parseRoutes(routesSource);
  console.log(`[diff] Parsed ${routes.length} routes from routes.ts`);

  await mkdir(DIFF_DIR, { recursive: true });

  const results = [];
  for (const route of routes) {
    const filename = ID_TO_FILENAME[route.id];
    const refPath = filename ? join(UI_DIR, filename) : null;
    const currentPath = join(CURRENT_DIR, `${route.id}.png`);

    const baseEntry = {
      id: route.id,
      pathname: route.pathname,
      reference: refPath,
      current: currentPath,
      referenceSha256: route.imageSha256,
    };

    if (!refPath || !existsSync(refPath)) {
      results.push({ ...baseEntry, status: "MISSING_REFERENCE", diffRatio: 1 });
      console.error(`[diff] ${route.id}: missing reference at ${refPath}`);
      continue;
    }
    if (!existsSync(currentPath)) {
      results.push({ ...baseEntry, status: "MISSING_CURRENT", diffRatio: 1 });
      console.error(`[diff] ${route.id}: missing current capture at ${currentPath}`);
      continue;
    }

    try {
      const refPng = ensureRgba(await readPng(refPath));
      const curPng = ensureRgba(await readPng(currentPath));

      if (
        refPng.width !== REFERENCE_W ||
        refPng.height !== REFERENCE_H
      ) {
        // The reference imagery is supposed to be 1536x1024 — if
        // it isn't, surface that loud and clear so the Controller
        // knows the comparison is unsound.
        console.warn(
          `[diff] ${route.id}: reference is ${refPng.width}x${refPng.height}, ` +
            `expected ${REFERENCE_W}x${REFERENCE_H}`,
        );
      }

      // Normalise both to the reference dimensions. The output
      // canvas mirrors the reference.
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
        `[diff] ${route.id}: ${(diverging / total * 100).toFixed(2)}% diverging ` +
          `(${diverging}/${total} px)`,
      );
    } catch (err) {
      results.push({
        ...baseEntry,
        status: "ERROR",
        diffRatio: 1,
        error: err?.message ?? String(err),
      });
      console.error(`[diff] ${route.id}: error: ${err?.message ?? err}`);
    }
  }

  // Rank worst-first so the Controller can read the report top
  // down: top of the list is the most divergent page.
  const ranked = [...results].sort((a, b) => b.diffRatio - a.diffRatio);

  const summary = {
    generatedAt: new Date().toISOString(),
    pixelTolerance: PIXEL_TOLERANCE,
    referenceDimensions: { width: REFERENCE_W, height: REFERENCE_H },
    total: routes.length,
    ok: results.filter((r) => r.status === "OK").length,
    missingReference: results.filter((r) => r.status === "MISSING_REFERENCE").length,
    missingCurrent: results.filter((r) => r.status === "MISSING_CURRENT").length,
    errors: results.filter((r) => r.status === "ERROR").length,
    worstDiffRatio: ranked[0]?.diffRatio ?? 0,
    bestDiffRatio: ranked[ranked.length - 1]?.diffRatio ?? 0,
    ranked,
  };

  await writeFile(REPORT_PATH, JSON.stringify(summary, null, 2), "utf8");
  console.log(
    `[diff] ${summary.ok}/${summary.total} compared. ` +
      `Worst ${(summary.worstDiffRatio * 100).toFixed(2)}%, ` +
      `best ${(summary.bestDiffRatio * 100).toFixed(2)}%. ` +
      `Report: ${relative(FRONTEND_ROOT, REPORT_PATH)}`,
  );
}

main().catch((err) => {
  console.error("[diff] Unexpected error:", err);
  process.exit(2);
});
