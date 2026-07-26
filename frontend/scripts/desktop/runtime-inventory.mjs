#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..", "..");
const DEFAULT_ROOT = resolve(FRONTEND, "src-tauri", "sidecar");
const DEFAULT_OUT = resolve(
  FRONTEND,
  "src-tauri",
  "target",
  "runtime-reports",
  "runtime-inventory.json",
);

const slash = (value) => value.replace(/\\/g, "/");

export function classifyRuntimeOwner(relativePath) {
  const path = slash(relativePath).replace(/^\.\/+/, "");
  if (
    path.startsWith("frontend/browsers/") ||
    path.includes("/playwright/.local-browsers/")
  ) {
    return "browser";
  }
  if (
    /^frontend\/bin\/(?:ffmpeg|ffprobe)(?:\.exe)?$/.test(path) ||
    path.includes("/ffmpeg-static/") ||
    path.includes("/ffprobe-static/")
  ) {
    return "media";
  }
  if (
    /(?:^|\/)(?:@xenova\/transformers|onnxruntime(?:-node|-common)?)(?:\/|$)/.test(
      path,
    ) ||
    path.includes("/transformers.js/")
  ) {
    return "local-ai";
  }
  if (
    path.startsWith("server.app/") ||
    path.startsWith("lib/") ||
    path.startsWith("frontend/node_modules/") ||
    path.startsWith("node_modules/")
  ) {
    return "node-runtime";
  }
  if (
    path === "frontend/server.js" ||
    path.startsWith("frontend/.next/") ||
    path.startsWith("frontend/public/") ||
    path.startsWith("backend/")
  ) {
    return "app-code";
  }
  return "runtime-other";
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function emptyOwnerSummary() {
  return { files: 0, symlinks: 0, bytes: 0 };
}

function roundedPct(value) {
  return Math.round(value * 100) / 100;
}

function reductionPct(before, after) {
  if (!Number.isFinite(before) || before <= 0) return 0;
  return roundedPct(((before - after) / before) * 100);
}

export async function buildRuntimeInventory(root) {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) {
    throw new Error(`Runtime 目录不存在:${absoluteRoot}`);
  }

  const paths = [];
  let directoryCount = 0;
  const walk = (dir) => {
    directoryCount += 1;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(dir, entry.name);
      const rel = slash(relative(absoluteRoot, path));
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        paths.push({
          type: "symlink",
          path,
          rel,
          target: slash(readlinkSync(path)),
        });
      } else if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile()) {
        paths.push({ type: "file", path, rel, bytes: stat.size });
      }
    }
  };
  walk(absoluteRoot);

  const files = [];
  const symlinks = [];
  const byOwner = {};
  const duplicateIndex = new Map();

  for (const entry of paths.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const owner = classifyRuntimeOwner(entry.rel);
    byOwner[owner] ??= emptyOwnerSummary();
    if (entry.type === "symlink") {
      byOwner[owner].symlinks += 1;
      symlinks.push({
        path: entry.rel,
        target: entry.target,
        owner,
      });
      continue;
    }

    const sha256 = await sha256File(entry.path);
    const record = {
      path: entry.rel,
      bytes: entry.bytes,
      sha256,
      owner,
    };
    files.push(record);
    byOwner[owner].files += 1;
    byOwner[owner].bytes += entry.bytes;
    const key = `${sha256}:${entry.bytes}`;
    const group = duplicateIndex.get(key) ?? {
      sha256,
      bytes: entry.bytes,
      paths: [],
      owners: new Set(),
    };
    group.paths.push(entry.rel);
    group.owners.add(owner);
    duplicateIndex.set(key, group);
  }

  const duplicates = [...duplicateIndex.values()]
    .filter((group) => group.paths.length > 1)
    .map((group) => ({
      sha256: group.sha256,
      bytesEach: group.bytes,
      copies: group.paths.length,
      duplicateBytes: group.bytes * (group.paths.length - 1),
      owners: [...group.owners].sort(),
      paths: group.paths.sort(),
    }))
    .sort(
      (a, b) =>
        b.duplicateBytes - a.duplicateBytes ||
        a.paths[0].localeCompare(b.paths[0]),
    );

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const duplicateBytes = duplicates.reduce(
    (sum, group) => sum + group.duplicateBytes,
    0,
  );

  return {
    schemaVersion: 1,
    root: absoluteRoot,
    generatedAt: new Date().toISOString(),
    summary: {
      directoryCount,
      fileCount: files.length,
      symlinkCount: symlinks.length,
      totalBytes,
      duplicateGroupCount: duplicates.length,
      duplicateBytes,
      duplicateRatioPct:
        totalBytes === 0 ? 0 : roundedPct((duplicateBytes / totalBytes) * 100),
      byOwner: Object.fromEntries(
        Object.entries(byOwner).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    files,
    symlinks,
    duplicates,
  };
}

export function compareRuntimeInventories(baseline, candidate) {
  const before = baseline.summary;
  const after = candidate.summary;
  const report = {
    baseline: {
      fileCount: before.fileCount,
      totalBytes: before.totalBytes,
      duplicateBytes: before.duplicateBytes,
    },
    candidate: {
      fileCount: after.fileCount,
      totalBytes: after.totalBytes,
      duplicateBytes: after.duplicateBytes,
    },
    fileCountReductionPct: reductionPct(
      before.fileCount,
      after.fileCount,
    ),
    totalBytesReductionPct: reductionPct(
      before.totalBytes,
      after.totalBytes,
    ),
    duplicateBytesReductionPct: reductionPct(
      before.duplicateBytes,
      after.duplicateBytes,
    ),
  };
  report.gates = {
    fileCountReductionAtLeast30: report.fileCountReductionPct >= 30,
    duplicateBytesReductionAtLeast80:
      report.duplicateBytesReductionPct >= 80,
  };
  return report;
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const root = resolve(flag("--root") ?? DEFAULT_ROOT);
  const out = resolve(flag("--out") ?? DEFAULT_OUT);
  const inventory = await buildRuntimeInventory(root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  const { summary } = inventory;
  console.log(`[runtime-inventory] root=${root}`);
  console.log(
    `[runtime-inventory] files=${summary.fileCount} symlinks=${summary.symlinkCount} bytes=${summary.totalBytes}`,
  );
  console.log(
    `[runtime-inventory] duplicateGroups=${summary.duplicateGroupCount} duplicateBytes=${summary.duplicateBytes} ratio=${summary.duplicateRatioPct}%`,
  );
  console.log(`[runtime-inventory] report=${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[runtime-inventory] ${error?.stack ?? error}`);
    process.exit(1);
  });
}
