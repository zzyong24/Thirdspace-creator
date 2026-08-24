#!/usr/bin/env node
// Fail-closed autonomous preflight + deterministic delivery watchdog.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const SELF = fileURLToPath(import.meta.url);
const json = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const lines = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) : [];
const digestFile = (f) => fs.existsSync(f) ? createHash("sha256").update(fs.readFileSync(f)).digest("hex") : "missing";
const digestEvents = (events) => createHash("sha256")
  .update(events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : ""))
  .digest("hex");
const git = (root, args, fallback = "missing") => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); } catch { return fallback; } };

function completedTaskIds(root) {
  const file = path.join(root, "BACKLOG.md");
  if (!fs.existsSync(file)) return new Set();
  const completed = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const task = cells.find((cell) => /^T-[A-Za-z0-9._-]+$/.test(cell));
    if (task && cells.some((cell) => cell.includes("✅"))) completed.add(task);
  }
  return completed;
}

function deliveryState(root) {
  const cfgFile = path.join(root, "orchestrator", "DELIVERY_GUARD.json");
  let cfg = { max_review_cycles_per_task: 2, max_stalled_iterations: 2, max_review_events_per_task: 6, review_cycle_baselines: {} };
  try { if (fs.existsSync(cfgFile)) cfg = { ...cfg, ...json(cfgFile) }; } catch (e) { return { cfg, configError: `DELIVERY_GUARD invalid: ${e.message}` }; }
  const review = lines(path.join(root, "orchestrator", "review-events.ndjson"));
  const byTask = new Map();
  for (const event of review) {
    if (!event.task_id) continue;
    const events = byTask.get(event.task_id) ?? [];
    events.push(event); byTask.set(event.task_id, events);
  }
  return { cfg, byTask, completed: completedTaskIds(root), iters: lines(path.join(root, "orchestrator", "AUTONOMY_EVENTS.ndjson")) };
}

function baselineForTask(cfg, task, events) {
  const marker = cfg.review_cycle_baselines?.[task];
  if (!marker) return { remaining: events, errors: [] };
  const count = marker.review_event_count;
  const expected = marker.review_events_sha256;
  const errors = [];
  if (!["isolated", "quarantined"].includes(marker.status) || !Number.isInteger(count) || count < 1 || count > events.length || !/^[a-f0-9]{64}$/i.test(expected ?? "") || !String(marker.reason ?? "").trim()) {
    errors.push(`${task}: review-cycle baseline marker invalid; require status=isolated|quarantined, positive prefix count, sha256, and reason`);
    return { remaining: events, errors };
  }
  const actual = digestEvents(events.slice(0, count));
  if (actual !== expected.toLowerCase()) errors.push(`${task}: review-cycle baseline hash mismatch — historical marker was changed/tampered`);
  return { remaining: events.slice(count), errors };
}

function reviewErrors(cfg, task, events) {
  const baseline = baselineForTask(cfg, task, events);
  if (baseline.errors.length) return baseline.errors;
  if (cfg.review_cycle_baselines?.[task] && baseline.remaining.length) {
    return [`${task}: ${baseline.remaining.length} new review event(s) after historical baseline — historical authorization does not cover new changes`];
  }
  if (cfg.review_cycle_baselines?.[task]?.status === "quarantined") {
    return [`${task}: historical review lineage remains quarantined; exact baseline preserves history but is not authorization to resume`];
  }
  const initialCycles = baseline.remaining.filter((event) => event.review_kind === "initial").length;
  const explicitCycles = new Set(baseline.remaining.map((event) => event.cycle).filter((cycle) => cycle != null)).size;
  const cycles = initialCycles || explicitCycles || (baseline.remaining.length ? 1 : 0);
  if (cycles > cfg.max_review_cycles_per_task || baseline.remaining.length > cfg.max_review_events_per_task) {
    return [`${task}: ${cycles} review cycles / ${baseline.remaining.length} events exceeds lineage budget — task quarantine / HALT_REPLAN`];
  }
  return [];
}
function snapshot(root, taskId) {
  const decision = path.join(root, "orchestrator", "DECISION_LOG.md");
  const manifest = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const status = git(root, ["status", "--porcelain"], "");
  return {
    at: new Date().toISOString(), task_id: taskId,
    head: git(root, ["rev-parse", "HEAD"]),
    progress: digestFile(path.join(root, "orchestrator", "progress.json")),
    board: digestFile(path.join(root, "BACKLOG.md")),
    changed_files: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
    active_decisions: fs.existsSync(decision) ? (fs.readFileSync(decision, "utf8").match(/^Status:\s*active\s*$/gmi) ?? []).length : 0,
    invalidations: fs.existsSync(manifest) ? (fs.readFileSync(manifest, "utf8").match(/invalidated/gi) ?? []).length : 0,
  };
}
function claimedLevel(root) {
  const cfgFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  let cfg = {}; try { if (fs.existsSync(cfgFile)) cfg = json(cfgFile); } catch {}
  const prose = ["orchestrator/ARTIFACT_MANIFEST.yaml", "orchestrator/DECISION_LOG.md"].flatMap((f) => fs.existsSync(path.join(root, f)) ? [fs.readFileSync(path.join(root, f), "utf8")] : []).join("\n");
  const proseLevel = prose.match(/\bL([2-4])\b[^\n]*(?:autonom|自治)/i)?.[1];
  return { cfg, level: cfg.autonomy_level ?? (proseLevel ? `L${proseLevel}` : "interactive"), proseClaim: !!proseLevel };
}
export function auditAutonomy(root) {
  const errors = []; const { cfg, level, proseClaim } = claimedLevel(root);
  const autonomous = /^L[2-4]$/.test(level) || cfg.execution_mode === "autonomous" || proseClaim;
  if (!autonomous) return errors;
  if (cfg.execution_mode !== "autonomous" || !/^L[2-4]$/.test(cfg.autonomy_level ?? "")) errors.push("L2/L3/L4 prose claim requires reconcile.config execution_mode=autonomous + autonomy_level; otherwise downgrade to interactive");
  const progress = path.join(root, "orchestrator", "progress.json");
  const modules = path.join(root, "orchestrator", "process", "modules.config.json");
  if (!fs.existsSync(progress)) errors.push("missing orchestrator/progress.json");
  if (!fs.existsSync(modules)) errors.push("missing orchestrator/process/modules.config.json");
  let mod = null, prog = null;
  try { if (fs.existsSync(modules)) mod = json(modules); } catch (e) { errors.push(`modules.config.json invalid: ${e.message}`); }
  try { if (fs.existsSync(progress)) prog = json(progress); } catch (e) { errors.push(`progress.json invalid: ${e.message}`); }
  const moduleEntries = Object.entries(mod?.modules ?? {});
  const moduleMap = new Map(moduleEntries);
  if (mod && !moduleEntries.length) errors.push("modules.config.json has no task split");
  for (const [id, m] of moduleEntries) {
    if (!Array.isArray(m.tasks) || !m.tasks.length) errors.push(`${id}: no tasks`);
    if (!Array.isArray(m.write_set) || !m.write_set.length) errors.push(`${id}: missing write_set`);
    const steps = new Set((m.tasks ?? []).map(raw => typeof raw === "string" ? raw : raw?.step).filter(Boolean));
    if (m.step_depends_on != null) {
      if (!m.step_depends_on || typeof m.step_depends_on !== "object" || Array.isArray(m.step_depends_on)) errors.push(`${id}: step_depends_on must be an object keyed by declared step`);
      else for (const [step, deps] of Object.entries(m.step_depends_on)) {
        if (!steps.has(step) || !Array.isArray(deps)) { errors.push(`${id}: step_depends_on.${step} must be an array for a declared step`); continue; }
        for (const dep of deps) {
          const [targetId, targetStep, ...extra] = String(dep).split(":"); const target = moduleMap.get(targetId);
          const targetSteps = new Set((target?.tasks ?? []).map(raw => typeof raw === "string" ? raw : raw?.step).filter(Boolean));
          if (typeof dep !== "string" || !dep.trim() || extra.length || !target || (targetStep && !targetSteps.has(targetStep))) errors.push(`${id}: step_depends_on.${step} has unknown dependency ${dep}`);
        }
      }
    }
    for (const raw of m.tasks ?? []) {
      const step = typeof raw === "string" ? raw : raw.step;
      const verify = m.verify_commands?.[step] ?? mod.verify_commands?.[step];
      if (!step || !verify) errors.push(`${id}:${step ?? "?"} missing verify command`);
    }
  }
  if (prog && !Array.isArray(prog.verticals)) errors.push("progress.json missing verticals");
  try { execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, stdio: "ignore" }); } catch { errors.push("git committable baseline missing HEAD"); }
  return errors;
}
export function auditWatchdog(root, options = {}) {
  const state = deliveryState(root);
  if (state.configError) return [state.configError];
  const { cfg, byTask, completed, iters } = state;
  const errors = [];
  // Marker integrity is global control-plane integrity. A task debt is not: it is checked only
  // for the selected/active task, or for all incomplete tasks in an explicit standalone watchdog audit.
  for (const [task, marker] of Object.entries(cfg.review_cycle_baselines ?? {})) {
    if (!marker || typeof marker !== "object") { errors.push(`${task}: review-cycle baseline marker invalid`); continue; }
    errors.push(...baselineForTask(cfg, task, byTask.get(task) ?? []).errors);
  }
  let targets;
  if (options.taskId) targets = new Set([options.taskId]);
  else if (options.scope === "active") {
    const pending = path.join(root, "orchestrator", ".autonomy-iteration.json");
    let active = ""; try { if (fs.existsSync(pending)) active = json(pending).task_id ?? ""; } catch (error) { errors.push(`active iteration baseline invalid: ${error.message}`); }
    targets = new Set(active ? [String(active).split(":", 1)[0]] : []);
  } else targets = new Set([...byTask.keys(), ...iters.map((event) => event.task_id).filter(Boolean)]);
  for (const task of targets) {
    if (completed.has(task)) continue;
    errors.push(...reviewErrors(cfg, task, byTask.get(task) ?? []));
  }
  for (const event of iters) {
    const task = String(event.task_id ?? "").split(":", 1)[0];
    if (!targets.has(event.task_id) && !targets.has(task)) continue;
    if (completed.has(task)) continue;
    if ((event.after_changed_files ?? 0) > (cfg.max_changed_files_per_iteration ?? 40)) errors.push(`${event.task_id}: changed-file growth ${event.after_changed_files} exceeds budget — HALT_REPLAN`);
    if ((event.after_active_decisions ?? 0) > (cfg.max_active_decisions_per_task ?? 3)) errors.push(`${event.task_id}: active DEC churn ${event.after_active_decisions} exceeds budget — HALT_REPLAN`);
    if ((event.after_invalidations ?? 0) > (cfg.max_invalidations_per_task ?? 3)) errors.push(`${event.task_id}: invalidation count ${event.after_invalidations} exceeds budget — HALT_REPLAN`);
  }
  for (let i = cfg.max_stalled_iterations; i <= iters.length; i++) {
    const w = iters.slice(i - cfg.max_stalled_iterations, i); const t = w[0]?.task_id;
    const task = String(t ?? "").split(":", 1)[0];
    if ((targets.has(t) || targets.has(task)) && !completed.has(task) && t && w.every((e) => e.task_id === t && e.before_head === e.after_head && e.before_progress === e.after_progress && e.before_board === e.after_board)) errors.push(`${t}: ${cfg.max_stalled_iterations} consecutive iterations without board/progress/commit transition — HALT_REPLAN`);
  }
  return errors;
}
export function taskWatchdogErrors(root, taskId) {
  return auditWatchdog(root, { taskId: String(taskId).split(":", 1)[0] });
}
function main() {
  const args = process.argv.slice(2), command = args[0] ?? "audit", i = args.indexOf("--root"), root = path.resolve(i >= 0 ? args[i + 1] : process.cwd());
  const ti = args.indexOf("--task"), taskId = ti >= 0 ? args[ti + 1] : "";
  const ri = args.indexOf("--reason"), reason = ri >= 0 ? args[ri + 1] : "";
  const pending = path.join(root, "orchestrator", ".autonomy-iteration.json");
  if (command === "baseline-marker") {
    if (!taskId || !String(reason).trim()) { console.error("baseline-marker requires --task and --reason"); process.exit(2); }
    const mi = args.indexOf("--mode"), mode = mi >= 0 ? args[mi + 1] : "quarantined";
    if (!["isolated", "quarantined"].includes(mode)) { console.error("baseline-marker --mode must be isolated or quarantined"); process.exit(2); }
    const events = lines(path.join(root, "orchestrator", "review-events.ndjson")).filter((event) => event.task_id === taskId);
    if (!events.length) { console.error(`${taskId}: no review events to quarantine`); process.exit(1); }
    console.log(JSON.stringify({ status: mode, review_event_count: events.length, review_events_sha256: digestEvents(events), reason: String(reason).trim() }, null, 2));
    return;
  }
  if (command === "begin") {
    if (!taskId) { console.error("begin requires --task"); process.exit(2); }
    fs.writeFileSync(pending, `${JSON.stringify(snapshot(root, taskId), null, 2)}\n`, { flag: "wx" });
    console.log(`✓ iteration baseline recorded for ${taskId}`); return;
  }
  if (command === "finish") {
    if (!fs.existsSync(pending)) { console.error("missing iteration baseline; run begin first"); process.exit(2); }
    const before = json(pending); if (taskId && taskId !== before.task_id) { console.error("iteration task mismatch"); process.exit(2); }
    const after = snapshot(root, before.task_id);
    const event = {
      schema: "autonomy-iteration/v1", task_id: before.task_id, started_at: before.at, finished_at: after.at,
      before_head: before.head, after_head: after.head, before_progress: before.progress, after_progress: after.progress,
      before_board: before.board, after_board: after.board,
      before_changed_files: before.changed_files, after_changed_files: after.changed_files,
      before_active_decisions: before.active_decisions, after_active_decisions: after.active_decisions,
      before_invalidations: before.invalidations, after_invalidations: after.invalidations,
      commit_transition: before.head !== after.head,
      board_transition: before.progress !== after.progress || before.board !== after.board,
    };
    fs.appendFileSync(path.join(root, "orchestrator", "AUTONOMY_EVENTS.ndjson"), `${JSON.stringify(event)}\n`); fs.unlinkSync(pending);
    const errors = auditWatchdog(root);
    if (!event.commit_transition || !event.board_transition) errors.unshift(`${before.task_id}: iteration requires both a new commit and board/progress transition; files/tests/DEC growth is not progress`);
    if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
    console.log(`✓ iteration receipt: commit + board/progress advanced for ${before.task_id}`); return;
  }
  const errors = command === "watchdog"
    ? auditWatchdog(root)
    : command === "task-preflight"
      ? (taskId ? taskWatchdogErrors(root, taskId) : ["task-preflight requires --task"])
      : [...auditAutonomy(root), ...auditWatchdog(root, { scope: "active" })];
  if (errors.length) { console.error(`autonomy-guard HALT (${errors.length})\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`); process.exit(1); }
  console.log("✓ autonomy preflight/watchdog clean");
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) main();
