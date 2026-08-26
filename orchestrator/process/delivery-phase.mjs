#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..", "..");
const VALID_PHASES = new Set(["buildout", "maintenance"]);
const FORMAL_REVIEW_STEPS = new Set([
  "review", "formal-review", "spec-review", "architecture-review", "contract-review", "code-review",
]);

const portable = (value) => value.split(path.sep).join("/");
const configFile = (root) => path.join(root, "orchestrator", "process", "reconcile.config.json");

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} 无法解析: ${error.message}`);
  }
}

export function readDeliveryPhase(root = DEFAULT_ROOT) {
  const projectRoot = realpathSync(path.resolve(root));
  const file = configFile(projectRoot);
  if (!existsSync(file)) {
    return { phase: "maintenance", source: "legacy-compat", root: projectRoot, config: {} };
  }
  const config = readJson(file, "reconcile.config.json");
  if (config.delivery_phase == null) {
    return { phase: "maintenance", source: "legacy-compat", root: projectRoot, config };
  }
  if (!VALID_PHASES.has(config.delivery_phase)) {
    throw new Error(`delivery_phase=${JSON.stringify(config.delivery_phase)} 不合法；只能是 buildout|maintenance`);
  }
  return { phase: config.delivery_phase, source: "explicit", root: projectRoot, config };
}

function parseBacklogReviewErrors(root) {
  const file = path.join(root, "BACKLOG.md");
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  let columns = null;
  const errors = [];
  const cells = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim());
  const separator = (line) => /^[|\s:\-]+$/.test(line.trim()) && line.includes("-");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trimStart().startsWith("|") || separator(line)) continue;
    const row = cells(line);
    if (separator(lines[index + 1] ?? "")) {
      columns = {
        id: row.findIndex((value) => value.toUpperCase() === "ID"),
        status: row.findIndex((value) => value.includes("状态")),
        review: row.findIndex((value) => value.includes("审核")),
      };
      continue;
    }
    if (!columns || columns.review < 0 || columns.status < 0) continue;
    const status = row[columns.status] ?? "";
    const review = row[columns.review] ?? "";
    if (status.includes("✅")) continue;
    if (/待审|FAIL|CONCERNS/.test(review)) {
      const id = columns.id >= 0 ? row[columns.id] : `L${index + 1}`;
      errors.push(`${id}: buildout 活动任务不得等待正式审核（审核列=${review}）；改为 —，高影响事项走用户确认`);
    }
  }
  return errors;
}

export function auditDeliveryPhase(root = DEFAULT_ROOT) {
  let state;
  try {
    state = readDeliveryPhase(root);
  } catch (error) {
    return { ok: false, phase: "unknown", source: "invalid", errors: [error.message] };
  }
  const errors = [];
  if (state.phase === "buildout") {
    const modulesFile = path.join(state.root, "orchestrator", "process", "modules.config.json");
    if (existsSync(modulesFile)) {
      try {
        const modules = readJson(modulesFile, "modules.config.json").modules ?? {};
        for (const [moduleId, module] of Object.entries(modules)) {
          for (const rawStep of Array.isArray(module?.tasks) ? module.tasks : []) {
            const step = String(rawStep).trim().toLowerCase().replaceAll("_", "-");
            if (FORMAL_REVIEW_STEPS.has(step)) {
              errors.push(`${moduleId}:${rawStep} 是正式审核步骤；buildout 队列只铺 implementation/acceptance，稳定后再 promote maintenance`);
            }
          }
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
    errors.push(...parseBacklogReviewErrors(state.root));
  }
  if (state.phase === "maintenance" && state.source === "explicit") {
    if (!/^[a-f0-9]{40}$/i.test(state.config.maintenance_baseline_sha ?? "")) {
      errors.push("explicit maintenance 缺 maintenance_baseline_sha；请用 delivery-phase.mjs promote");
    }
    if (!/^DEC-[A-Za-z0-9-]+$/.test(state.config.maintenance_decision ?? "")) {
      errors.push("explicit maintenance 缺 maintenance_decision；请用 delivery-phase.mjs promote");
    }
  }
  return { ok: errors.length === 0, phase: state.phase, source: state.source, errors };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function decisionBlock(text, decisionId) {
  const escaped = decisionId.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
  const marker = `(?:^##\\s+${escaped}\\b|^ID:\\s*${escaped}\\s*$)`;
  const start = text.search(new RegExp(marker, "m"));
  if (start < 0) return "";
  const remainder = text.slice(start);
  const next = remainder.slice(1).search(/^(?:##\s+DEC-|ID:\s*DEC-)/m);
  return next < 0 ? remainder : remainder.slice(0, next + 1);
}

function promote(root, decisionId) {
  const state = readDeliveryPhase(root);
  if (state.phase !== "buildout") throw new Error(`delivery phase 已经是 ${state.phase}；promote 是单向操作`);
  if (!/^DEC-[A-Za-z0-9-]+$/.test(decisionId ?? "")) throw new Error("promote 必须带 --decision DEC-xxx");
  const controlRoot = typeof state.config.control_root === "string" && state.config.control_root
    ? path.resolve(state.root, state.config.control_root)
    : path.join(state.root, "orchestrator");
  const decisionFile = path.join(controlRoot, "DECISION_LOG.md");
  if (!existsSync(decisionFile)) throw new Error(`找不到 ${portable(path.relative(state.root, decisionFile))}`);
  const block = decisionBlock(readFileSync(decisionFile, "utf8"), decisionId);
  if (!block) throw new Error(`找不到 ${decisionId}`);
  if (!/^(?:-\s*)?Owner:\s*user\s*$/im.test(block)) throw new Error(`${decisionId} 必须 Owner: user`);
  if (!/^(?:-\s*)?Status:\s*(?:active|resolved)\s*$/im.test(block)) throw new Error(`${decisionId} 必须 Status: active|resolved`);
  if (!/^(?:-\s*)?Delivery-Phase:\s*maintenance\s*$/im.test(block)) throw new Error(`${decisionId} 必须显式包含 Delivery-Phase: maintenance`);
  let dirty;
  let head;
  try {
    dirty = execFileSync("git", ["status", "--porcelain"], { cwd: state.root, encoding: "utf8" }).trim();
    head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: state.root, encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(`promote 需要可提交的 Git 基线: ${error.message}`);
  }
  if (dirty) throw new Error("promote 前工作树必须干净；maintenance 必须绑定稳定基线");
  if (!/^[a-f0-9]{40}$/i.test(head)) throw new Error("无法解析 maintenance baseline commit");
  const next = {
    ...state.config,
    delivery_phase: "maintenance",
    maintenance_decision: decisionId,
    maintenance_baseline_sha: head,
  };
  const file = configFile(state.root);
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temporary, file);
  return { phase: "maintenance", source: "promoted", decision: decisionId, baseline_sha: head };
}

function main() {
  const command = process.argv[2] ?? "status";
  const json = process.argv.includes("--json");
  const root = flag("--root") ?? DEFAULT_ROOT;
  try {
    if (command === "status") {
      const state = readDeliveryPhase(root);
      const result = { phase: state.phase, source: state.source };
      console.log(json ? JSON.stringify(result) : `${result.phase} (${result.source})`);
      return;
    }
    if (command === "audit") {
      const result = auditDeliveryPhase(root);
      if (json) console.log(JSON.stringify(result));
      else if (result.ok) console.log(`✓ delivery phase ${result.phase} (${result.source})`);
      else for (const error of result.errors) console.error(`✗ ${error}`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    if (command === "promote") {
      const result = promote(root, flag("--decision"));
      console.log(json ? JSON.stringify(result) : `✓ delivery phase → maintenance @ ${result.baseline_sha.slice(0, 12)} (${result.decision})`);
      return;
    }
    throw new Error("用法: delivery-phase.mjs <status|audit|promote> [--root <project>] [--decision DEC-xxx] [--json]");
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
