#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRuntimeInventory,
  compareRuntimeInventories,
} from "./runtime-inventory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..", "..");
const DEFAULT_ROOT = resolve(FRONTEND, "src-tauri", "sidecar");
const LEGAL_BASENAME =
  /^(?:licen[cs]e|notice|copying|copyright|authors)(?:[._-].*)?$/i;
const TEST_DIRECTORY =
  /(?:^|\/)(?:__tests__|test|tests|testing|fixture|fixtures|example|examples|docs)(?:\/|$)/i;

const slash = (value) => value.replace(/\\/g, "/");

export function classifyRuntimePruneCandidate(relativePath) {
  const path = slash(relativePath).replace(/^\.\/+/, "");
  const basename = path.slice(path.lastIndexOf("/") + 1);

  if (!path || path.startsWith("../") || LEGAL_BASENAME.test(basename)) {
    return null;
  }
  if (/\.map$/i.test(basename)) return "source-map";
  if (/\.d\.(?:ts|mts|cts)$/i.test(basename)) return "type-declaration";
  if (/^readme(?:[._-].*)?$/i.test(basename)) return "documentation";
  if (TEST_DIRECTORY.test(path)) return "test-fixture";
  return null;
}

export function planRuntimePrune(inventory) {
  const candidates = [...(inventory.files ?? []), ...(inventory.symlinks ?? [])]
    .map((entry) => {
      const reason = classifyRuntimePruneCandidate(entry.path);
      return reason
        ? {
            path: slash(entry.path),
            bytes: entry.bytes ?? 0,
            reason,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const byReason = {};
  for (const entry of candidates) {
    byReason[entry.reason] ??= { files: 0, bytes: 0 };
    byReason[entry.reason].files += 1;
    byReason[entry.reason].bytes += entry.bytes;
  }

  return {
    schemaVersion: 1,
    summary: {
      candidateFileCount: candidates.length,
      candidateBytes: candidates.reduce((sum, entry) => sum + entry.bytes, 0),
      byReason: Object.fromEntries(
        Object.entries(byReason).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    candidates,
  };
}

function resolveWithinRoot(root, relativePath) {
  const absoluteRoot = resolve(root);
  if (isAbsolute(relativePath)) {
    throw new Error(`候选路径必须是相对路径:${relativePath}`);
  }
  const target = resolve(absoluteRoot, relativePath);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`候选路径越过 runtime root:${relativePath}`);
  }
  return { absoluteRoot, target };
}

function removeEmptyParents(root, start) {
  let current = start;
  while (current !== root && current.startsWith(`${root}${sep}`)) {
    if (!existsSync(current) || !lstatSync(current).isDirectory()) break;
    if (readdirSync(current).length > 0) break;
    rmdirSync(current);
    current = dirname(current);
  }
}

export function applyRuntimePrunePlan(root, plan) {
  const absoluteRoot = resolve(root);
  let removed = 0;
  let missing = 0;

  for (const entry of plan.candidates ?? []) {
    const { target } = resolveWithinRoot(absoluteRoot, entry.path);
    if (!existsSync(target)) {
      missing += 1;
      continue;
    }
    const stat = lstatSync(target);
    if (stat.isDirectory()) {
      throw new Error(`删除计划只能包含文件或符号链接:${entry.path}`);
    }
    unlinkSync(target);
    removed += 1;
    removeEmptyParents(absoluteRoot, dirname(target));
  }

  return { removed, missing };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const root = resolve(flag("--root") ?? DEFAULT_ROOT);
  const apply = process.argv.includes("--apply");
  const baseline = await buildRuntimeInventory(root);
  const plan = planRuntimePrune(baseline);
  const report = {
    root,
    mode: apply ? "apply" : "dry-run",
    baseline: baseline.summary,
    plan: plan.summary,
  };

  if (apply) {
    report.apply = applyRuntimePrunePlan(root, plan);
    const candidate = await buildRuntimeInventory(root);
    report.candidate = candidate.summary;
    report.comparison = compareRuntimeInventories(baseline, candidate);
  }

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[runtime-prune-rat] ${error?.stack ?? error}`);
    process.exit(1);
  });
}
