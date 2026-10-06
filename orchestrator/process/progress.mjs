#!/usr/bin/env node
// orchestrator/process/progress.mjs — GENERIC task queue for the long-running harness.
//
// ⚠️ INIT PER PROJECT. This tool is project-agnostic; it reads `modules.config.json` (which YOU create per
//    project from modules.config.example.json) and `reconcile.config.json` (work_branch). Do NOT commit any
//    one project's modules.config.json into the skill — it is project state.
//
// ⚠️ LESSON (2026-06-22): define each task's `done_signals` against the layer the APP ACTUALLY USES. We once
//    set a repo done-signal to a path the app never imported, so the queue reported "missing", an agent built
//    repositories in the wrong layer, and it was all dead code. VERIFY where real persistence/UI/etc. live
//    BEFORE writing done_signals. A green queue must mean the real thing is done.
//
// Each module declares an ordered `tasks` list and optional `done_signals[step] = [paths]` checked on the
// work branch for interactive queues. Autonomous queues never auto-advance from file presence: every step
// must pass `done` so its order, real commit, and canonical BACKLOG state are checked.
// `step_depends_on[step]` replaces the legacy module-level `depends_on` for that step when the key exists;
// absent keys keep the legacy dependency contract unchanged.
//
// Commands: generate | status | next | schedule | show <module> | batch [N] | block/unblock <m:step> | claim/release | done | verify
//
// `verify <module>` sets that vertical's `e2e_verified: true`. SOLE CALLER = the harness (run.sh) after
// PASS+PASS from both heterogeneous reviewers — the reviewers themselves run read-only and never write it.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskWatchdogErrors } from './autonomy-guard.mjs';
import { taskGovernanceErrors } from './governance-guard.mjs';
import { acquireStateLock } from './state-lock.mjs';
import { auditDeliveryPhase } from './delivery-phase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const OUT = resolve(ORCH, 'progress.json');
const RCFG = resolve(HERE, 'reconcile.config.json');
const MODS = resolve(HERE, 'modules.config.json');
const PARALLEL_ISOLATION = resolve(HERE, 'parallel-isolation.mjs');

function gitText(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
let ignoreCaseCache;
function repositoryIgnoresCase() {
  if (ignoreCaseCache !== undefined) return ignoreCaseCache;
  try { ignoreCaseCache = gitText(['config', '--bool', 'core.ignorecase']) === 'true'; }
  catch { ignoreCaseCache = false; }
  return ignoreCaseCache;
}

function isSafeRepoPattern(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  if (value.startsWith('/') || value.startsWith('~') || value.includes('\\') || /[\0\r\n:]/.test(value)) return false;
  const recursive = value.endsWith('/**');
  const base = recursive ? value.slice(0, -3) : value;
  if (!base || base.endsWith('/') || /[*?{}]/.test(base) || (recursive && (base.includes('[') || base.includes(']')))) return false;
  return base.split('/').every(part => part && part !== '.' && part !== '..');
}

function validatePathSet(moduleId, field, value) {
  if (value == null) return;
  if (!Array.isArray(value) || value.some(pattern => !isSafeRepoPattern(pattern))) {
    console.error(`${moduleId}: ${field} must contain only safe repo-relative files or terminal /** prefixes`);
    process.exit(2);
  }
}

function validateResources(moduleId, value) {
  if (value == null) return;
  if (!Array.isArray(value) || value.some(resource => typeof resource !== 'string' || !resource.trim() || resource !== resource.trim() || /[\0\r\n]/.test(resource))) {
    console.error(`${moduleId}: exclusive_resources must be an array of non-empty resource names`);
    process.exit(2);
  }
}

function validateStepMap(moduleId, cfg, field, validator) {
  const value = cfg[field];
  if (value == null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    console.error(`${moduleId}: ${field} must be an object keyed by declared step`); process.exit(2);
  }
  const steps = new Set(Array.isArray(cfg.tasks) ? cfg.tasks : []);
  for (const [step, entries] of Object.entries(value)) {
    if (!steps.has(step)) {
      console.error(`${moduleId}: ${field}.${step} names an undeclared step`); process.exit(2);
    }
    validator(`${moduleId}.${step}`, entries);
  }
}

function configuredBoundary(cfg, step, field, stepField) {
  if (cfg?.[stepField] && Object.prototype.hasOwnProperty.call(cfg[stepField], step)) return cfg[stepField][step];
  return Array.isArray(cfg?.[field]) ? cfg[field] : [];
}

if (!existsSync(MODS)) {
  console.error('missing orchestrator/process/modules.config.json — copy modules.config.example.json and fill it for THIS project (see the LESSON in this file: verify real layers before writing done_signals).');
  process.exit(2);
}
let branch = 'HEAD';
let reconcileCfg = {};
if (existsSync(RCFG)) { try { reconcileCfg = JSON.parse(readFileSync(RCFG, 'utf8')); branch = reconcileCfg.work_branch || branch; } catch {} }
const modCfg = JSON.parse(readFileSync(MODS, 'utf8')).modules || {};

const deliveryAudit = auditDeliveryPhase(REPO);
if (!deliveryAudit.ok) {
  for (const error of deliveryAudit.errors) console.error(`delivery phase: ${error}`);
  process.exit(2);
}

for (const [id, cfg] of Object.entries(modCfg)) {
  validatePathSet(id, 'write_set', cfg.write_set);
  validatePathSet(id, 'read_set', cfg.read_set);
  validateResources(id, cfg.exclusive_resources);
  validateStepMap(id, cfg, 'step_write_set', (label, value) => validatePathSet(label, 'step_write_set', value));
  validateStepMap(id, cfg, 'step_read_set', (label, value) => validatePathSet(label, 'step_read_set', value));
  validateStepMap(id, cfg, 'step_exclusive_resources', (label, value) => validateResources(label, value));
  for (const step of Array.isArray(cfg.tasks) ? cfg.tasks : []) {
    const writes = configuredBoundary(cfg, step, 'write_set', 'step_write_set');
    const reads = configuredBoundary(cfg, step, 'read_set', 'step_read_set');
    if (!writes.length && !reads.length) {
      console.error(`${id}:${step} must declare a non-empty read_set or write_set boundary`); process.exit(2);
    }
  }
  if (cfg.isolated_workspace != null && typeof cfg.isolated_workspace !== 'boolean') {
    console.error(`${id}: isolated_workspace must be boolean when provided`); process.exit(2);
  }
  if (cfg.step_depends_on == null) continue;
  if (!cfg.step_depends_on || typeof cfg.step_depends_on !== 'object' || Array.isArray(cfg.step_depends_on)) {
    console.error(`${id}: step_depends_on must be an object keyed by declared step`); process.exit(2);
  }
  const steps = new Set(Array.isArray(cfg.tasks) ? cfg.tasks : []);
  for (const [step, deps] of Object.entries(cfg.step_depends_on)) {
    if (!steps.has(step) || !Array.isArray(deps) || deps.some(dep => typeof dep !== 'string' || !dep.trim())) {
      console.error(`${id}: step_depends_on.${step} must be an array of non-empty dependency references for a declared step`); process.exit(2);
    }
  }
}

const onBranch = (p) => { try { execSync(`git cat-file -e ${branch}:${p}`, { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; } };

function commitExists(commit) { try { execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; } }

function deriveStatus(step, cfg, prevMap, prevCommits) {
  if (reconcileCfg.execution_mode === 'autonomous') return prevMap[step] === 'done' && commitExists(prevCommits[step]) ? 'done' : 'pending';
  const sigs = cfg.done_signals && cfg.done_signals[step];
  if (Array.isArray(sigs) && sigs.length) return sigs.some(onBranch) ? 'done' : 'pending';
  return prevMap[step] === 'done' ? 'done' : 'pending'; // no signal → manual/evaluator-set, preserved
}

const cmd = process.argv[2] || 'status';
const load = () => existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const save = (value) => {
  const temporary = `${OUT}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, OUT);
};
const mutatingCommands = new Set(['generate', 'done', 'block', 'unblock', 'verify', 'claim', 'release']);
if (mutatingCommands.has(cmd)) {
  try {
    acquireStateLock(REPO, { operation: `progress:${cmd}` });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (cmd === 'generate') {
  const prev = load();
  const prevById = Object.fromEntries((prev?.verticals || []).map(v => [v.id, v]));
  const verticals = Object.entries(modCfg).map(([id, cfg]) => {
    const prevMap = Object.fromEntries((Array.isArray(prevById[id]?.tasks) ? prevById[id].tasks : []).map(t => [t.step, t.status]));
    const prevCommits = prevById[id]?.commits ?? {};
    return {
      id, archetype: cfg.archetype || [],
      task_id: cfg.task_id || id,
      tasks: (cfg.tasks || []).map(step => ({ step, status: deriveStatus(step, cfg, prevMap, prevCommits) })),
      blocked_reason: prevById[id]?.blocked_reason ?? null,
      depends_on: Array.isArray(cfg.depends_on) ? cfg.depends_on : [],
      step_depends_on: cfg.step_depends_on && typeof cfg.step_depends_on === 'object' ? cfg.step_depends_on : {},
      write_set: Array.isArray(cfg.write_set) ? cfg.write_set : [],
      read_set: Array.isArray(cfg.read_set) ? cfg.read_set : [],
      exclusive_resources: Array.isArray(cfg.exclusive_resources) ? cfg.exclusive_resources : [],
      step_write_set: cfg.step_write_set && typeof cfg.step_write_set === 'object' ? cfg.step_write_set : {},
      step_read_set: cfg.step_read_set && typeof cfg.step_read_set === 'object' ? cfg.step_read_set : {},
      step_exclusive_resources: cfg.step_exclusive_resources && typeof cfg.step_exclusive_resources === 'object' ? cfg.step_exclusive_resources : {},
      ...(cfg.isolated_workspace != null ? { isolated_workspace: cfg.isolated_workspace === true } : {}),
      commits: prevCommits,
      // preserve the harness-written verification flag across regenerations (only when it existed before —
      // never fabricate a false for verticals that were simply never judged).
      ...(prevById[id]?.e2e_verified !== undefined ? { e2e_verified: prevById[id].e2e_verified } : {}),
    };
  });
  let d = 0, t = 0; for (const v of verticals) for (const x of v.tasks) { t++; if (x.status === 'done') d++; }
  const doc = {
    meta: { purpose: 'Per-module task queue (generic; signals from modules.config.json). One task = one isolated session.', work_branch: branch },
    summary: { verticals: verticals.length, tasks_done: d, tasks_total: t, tasks_pending: t - d, verticals_complete: verticals.filter(v => v.tasks.every(x => x.status === 'done')).length },
    verticals, leases: {},
  };
  const byId = Object.fromEntries(verticals.map(v => [v.id, v]));
  for (const [k, l] of Object.entries(prev?.leases || {})) { const [vid, st] = k.split(':'); const tk = byId[vid]?.tasks.find(x => x.step === st); if (tk && tk.status !== 'done') doc.leases[k] = l; }
  save(doc);
  const s = doc.summary; console.log(`Wrote ${OUT}\n${s.verticals} modules · tasks ${s.tasks_done}/${s.tasks_total} done · complete ${s.verticals_complete}/${s.verticals}`);
  process.exit(0);
}

if (cmd === 'show') {
  const id = process.argv[3]; const cfg = modCfg[id];
  if (!cfg) { console.error(`unknown module "${id}"`); process.exit(2); }
  const v = load()?.verticals.find(x => x.id === id);
  console.log(`# ${id}   archetype: ${(cfg.archetype || []).join(', ')}`);
  if (cfg.data_source) console.log(`data-source: ${cfg.data_source}`);
  if (cfg.flows) console.log(`flows:       ${cfg.flows}`);
  if (cfg.oss) console.log(`OSS refs:    ${cfg.oss.join('  |  ')}`);
  console.log(`tasks:       ${(v?.tasks || (cfg.tasks || []).map(s => ({ step: s, status: '?' }))).map(t => `${t.step}:${t.status === 'done' ? '✓' : '·'}`).join('  ')}`);
  process.exit(0);
}

const doc = load();
if (!doc) { console.error('progress.json not found — run: progress.mjs generate'); process.exit(2); }
function assertProgressTopology() {
  const actual = new Map((doc.verticals || []).map(vertical => [vertical.id, vertical]));
  const errors = [];
  for (const [id, cfg] of Object.entries(modCfg)) {
    const vertical = actual.get(id);
    if (!vertical) { errors.push(`missing vertical ${id}`); continue; }
    const expectedTaskId = cfg.task_id || id;
    if ((vertical.task_id || id) !== expectedTaskId) errors.push(`${id} task_id changed`);
    const expectedSteps = Array.isArray(cfg.tasks) ? cfg.tasks : [];
    const actualSteps = Array.isArray(vertical.tasks) ? vertical.tasks.map(task => task.step) : [];
    if (JSON.stringify(actualSteps) !== JSON.stringify(expectedSteps)) errors.push(`${id} steps changed`);
    actual.delete(id);
  }
  for (const id of actual.keys()) errors.push(`removed vertical ${id}`);
  if (errors.length) {
    console.error(`progress/modules.config topology drift; run progress.mjs generate: ${errors.join(', ')}`);
    process.exit(2);
  }
}
assertProgressTopology();
for (const vertical of doc.verticals || []) {
  validatePathSet(vertical.id, 'write_set', vertical.write_set);
  validatePathSet(vertical.id, 'read_set', vertical.read_set);
  validateResources(vertical.id, vertical.exclusive_resources);
  if (vertical.isolated_workspace != null && typeof vertical.isolated_workspace !== 'boolean') {
    console.error(`${vertical.id}: isolated_workspace must be boolean when provided`); process.exit(2);
  }
}
const leases = doc.leases || (doc.leases = {});
const controlTaskId = (vertical) => vertical.task_id || modCfg[vertical.id]?.task_id || vertical.id;
function effectiveBoundary(vertical, step, field, stepField) {
  const configured = modCfg[vertical.id];
  if (configured) return configuredBoundary(configured, step, field, stepField);
  if (vertical?.[stepField] && Object.prototype.hasOwnProperty.call(vertical[stepField], step)) return vertical[stepField][step];
  return Array.isArray(vertical?.[field]) ? vertical[field] : [];
}
const governanceEnabled = existsSync(resolve(ORCH, 'SCOPE_AUTHORIZATIONS.json')) || existsSync(resolve(ORCH, 'COMPLEXITY_LEDGER.json'));
const governanceErrors = (vertical, step) => governanceEnabled
  ? taskGovernanceErrors(REPO, controlTaskId(vertical), effectiveBoundary(vertical, step, 'write_set', 'step_write_set')) : [];

function effectiveDependencies(vertical, step) {
  const stepDeps = modCfg[vertical.id]?.step_depends_on ?? vertical.step_depends_on;
  if (stepDeps && Object.prototype.hasOwnProperty.call(stepDeps, step)) return stepDeps[step];
  return Array.isArray(modCfg[vertical.id]?.depends_on) ? modCfg[vertical.id].depends_on : (Array.isArray(vertical.depends_on) ? vertical.depends_on : []);
}

function dependencyDone(dep) {
  const [depV, depStep] = String(dep).split(':'); const target = doc.verticals.find(x => x.id === depV);
  return !!target && (depStep ? target.tasks.find(t => t.step === depStep)?.status === 'done' : target.tasks.every(t => t.status === 'done'));
}

function transitionErrors(vertical, step, { agent = '', allowOwnedLease = false } = {}) {
  const errors = []; const current = vertical.tasks.find(t => t.status !== 'done')?.step;
  if (current !== step) errors.push(`${vertical.id}:${step} is not the current pending step`);
  if (vertical.blocked_reason) errors.push(`${vertical.id}:${step} is blocked: ${vertical.blocked_reason}`);
  errors.push(...taskWatchdogErrors(REPO, controlTaskId(vertical)));
  errors.push(...governanceErrors(vertical, step));
  for (const dep of effectiveDependencies(vertical, step)) if (!dependencyDone(dep)) errors.push(`${vertical.id}:${step} dependency not done: ${dep}`);
  const lease = leases[`${vertical.id}:${step}`];
  if (lease && !(allowOwnedLease && agent && lease.agent === agent)) errors.push(`${vertical.id}:${step} is leased by ${lease.agent}; pass matching --agent to done or release it`);
  return errors;
}

function ready() {
  const out = [];
  for (const v of doc.verticals) {
    const i = v.tasks.findIndex(t => t.status !== 'done');
    if (i < 0) continue;
    const step = v.tasks[i].step;
    if (transitionErrors(v, step).length) continue;
    out.push({
      v: v.id,
      task: v.tasks[i].step,
      task_id: controlTaskId(v),
      doneCount: v.tasks.filter(t => t.status === 'done').length,
      write_set: effectiveBoundary(v, step, 'write_set', 'step_write_set'),
      read_set: effectiveBoundary(v, step, 'read_set', 'step_read_set'),
      exclusive_resources: effectiveBoundary(v, step, 'exclusive_resources', 'step_exclusive_resources'),
    });
  }
  return out.sort((a, b) => b.doneCount - a.doneCount);
}

function patternParts(pattern) {
  return pattern.endsWith('/**') ? { base: pattern.slice(0, -3), recursive: true } : { base: pattern, recursive: false };
}

function patternsOverlap(left, right) {
  const a = patternParts(left); const b = patternParts(right);
  let leftBase = a.base; let rightBase = b.base;
  const ignoreCase = repositoryIgnoresCase();
  if (ignoreCase) { leftBase = leftBase.toLowerCase(); rightBase = rightBase.toLowerCase(); }
  if (!a.recursive && !b.recursive) return leftBase === rightBase;
  if (a.recursive && b.recursive) return leftBase === rightBase || leftBase.startsWith(`${rightBase}/`) || rightBase.startsWith(`${leftBase}/`);
  const recursiveBase = a.recursive ? leftBase : rightBase;
  const exactBase = a.recursive ? rightBase : leftBase;
  return exactBase === recursiveBase || exactBase.startsWith(`${recursiveBase}/`);
}

function setsOverlap(left, right) {
  return left.some(a => right.some(b => patternsOverlap(a, b)));
}

function tasksConflict(left, right) {
  return setsOverlap(left.write_set, right.write_set)
    || setsOverlap(left.write_set, right.read_set)
    || setsOverlap(left.read_set, right.write_set)
    || left.exclusive_resources.some(resource => right.exclusive_resources.includes(resource));
}

function isolationFor(task) {
  if (!task.write_set.length) return 'shared';
  return 'auto';
}

function conflictFreeBatch(limit) {
  const selected = [];
  for (const candidate of ready()) {
    if (selected.length >= limit) break;
    if (!selected.some(existing => tasksConflict(existing, candidate))) selected.push(candidate);
  }
  return selected;
}

if (cmd === 'status') {
  const s = doc.summary; console.log(`progress.json — tasks ${s.tasks_done}/${s.tasks_total} done · complete ${s.verticals_complete}/${s.verticals}`);
  for (const v of doc.verticals) console.log(`  ${v.id.padEnd(18)} ${v.tasks.map(t => `${t.step}:${t.status === 'done' ? '✓' : '·'}`).join(' ')}${v.blocked_reason ? `  [BLOCKED: ${v.blocked_reason}]` : ''}`);
  process.exit(0);
}
if (cmd === 'next') {
  const r = ready(); if (!r.length) {
    const pending = doc.verticals.some(v => v.tasks.some(t => t.status !== 'done'));
    console.log(pending ? 'HOLD (pending tasks are blocked, leased, or dependency-gated).' : 'ALL DONE.'); process.exit(0);
  }
  console.log(`NEXT: ${r[0].v}:${r[0].task}`);
  console.log(`  see: progress.mjs show ${r[0].v}   |   isolation: ONE fresh \`claude -p\` session; this task only, verify, commit, stop.`);
  process.exit(0);
}
if (cmd === 'schedule') {
  const r = ready();
  const blocked = doc.verticals.flatMap(v => v.blocked_reason ? v.tasks.filter(t => t.status !== 'done').slice(0, 1).map(t => `${v.id}:${t.step}`) : []);
  const quarantined = doc.verticals.flatMap(v => !v.blocked_reason && v.tasks.some(t => t.status !== 'done') && taskWatchdogErrors(REPO, controlTaskId(v)).length
    ? v.tasks.filter(t => t.status !== 'done').slice(0, 1).map(t => `${v.id}:${t.step}`) : []);
  const quarantinedGovernance = doc.verticals.flatMap(v => {
    const pending = v.tasks.find(t => t.status !== 'done');
    return !v.blocked_reason && pending && governanceErrors(v, pending.step).length ? [`${v.id}:${pending.step}`] : [];
  });
  if (!r.length) {
    const pending = doc.verticals.some(v => v.tasks.some(t => t.status !== 'done'));
    console.log(JSON.stringify({ status: pending ? 'hold' : 'done', task: null, bypassed_blocked: blocked, quarantined, quarantined_governance: quarantinedGovernance })); process.exit(0);
  }
  console.log(JSON.stringify({ status: 'ready', task: `${r[0].v}:${r[0].task}`, write_set: r[0].write_set, bypassed_blocked: blocked, quarantined, quarantined_governance: quarantinedGovernance })); process.exit(0);
}
if (cmd === 'batch') {
  const args = process.argv.slice(3); const json = args.includes('--json');
  const requested = args.find(arg => /^\d+$/.test(arg)); const N = requested ? Number.parseInt(requested, 10) : 4;
  const r = conflictFreeBatch(N > 0 ? N : 4);
  const tasks = r.map(item => ({
    task: `${item.v}:${item.task}`,
    task_id: item.task_id,
    module: item.v,
    step: item.task,
    write_set: item.write_set,
    read_set: item.read_set,
    exclusive_resources: item.exclusive_resources,
    isolation: isolationFor(item),
  }));
  if (json) {
    const pending = doc.verticals.some(v => v.tasks.some(t => t.status !== 'done'));
    console.log(JSON.stringify({ status: tasks.length ? 'ready' : (pending ? 'hold' : 'done'), tasks })); process.exit(0);
  }
  if (!tasks.length) { console.log('No ready tasks.'); process.exit(0); }
  console.log(`BATCH of ${tasks.length} conflict-free tasks (main session integrates serially):`);
  for (const task of tasks) console.log(`  ${task.task}  [isolation: ${task.isolation}]`);
  process.exit(0);
}

function hasParallelLease(lease) {
  return lease && typeof lease === 'object' && ['isolation_kind', 'workspace_root', 'branch', 'base_sha', 'wave_id', 'merge_index']
    .some(field => Object.prototype.hasOwnProperty.call(lease, field));
}

function safeControlRoot() {
  const value = reconcileCfg.control_root || 'orchestrator';
  if (!isSafeRepoPattern(value) || value.endsWith('/**')) {
    console.error(`reconcile.config control_root must be a safe repo-relative directory: ${value}`); process.exit(2);
  }
  return value.replace(/\/$/, '');
}

const CONTROL_ROOT = safeControlRoot();
const RESERVED_EXACT = new Set(['AGENTS.md', 'BACKLOG.md', 'ARTIFACT_MANIFEST.yaml', 'DECISION_LOG.md']);
function reservedControlPath(relative) {
  return RESERVED_EXACT.has(relative)
    || relative === 'orchestrator'
    || relative.startsWith('orchestrator/')
    || relative === CONTROL_ROOT
    || relative.startsWith(`${CONTROL_ROOT}/`);
}

function modulesConfigMatchesBase(base) {
  const relative = resolve(MODS).slice(resolve(REPO).length + 1).split('\\').join('/');
  try {
    execFileSync('git', ['cat-file', '-e', `${base}:${relative}`], { cwd: REPO, stdio: 'ignore' });
    execFileSync('git', ['diff', '--quiet', base, '--', relative], { cwd: REPO, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function parallelDoneErrors(vertical, step, rawCommit, lease, key) {
  if (!hasParallelLease(lease)) return [];
  const errors = [];
  if (!['branch', 'worktree'].includes(lease.isolation_kind)) {
    errors.push(`${key}: shared/read-only helpers cannot advance the autonomous queue`);
    return errors;
  }
  let commit = '';
  try { commit = gitText(['rev-parse', '--verify', `${rawCommit}^{commit}`]); }
  catch { errors.push(`${key}: parallel commit does not exist: ${rawCommit}`); return errors; }
  if (commit === lease.base_sha) errors.push(`${key}: parallel done requires an integrated candidate after base_sha`);
  let head = '';
  try { head = gitText(['rev-parse', '--verify', 'HEAD^{commit}']); }
  catch { errors.push(`${key}: cannot resolve integration HEAD`); }
  if (head && commit !== head) errors.push(`${key}: parallel commit must equal current integration HEAD ${head}`);
  try { execFileSync('git', ['merge-base', '--is-ancestor', lease.base_sha, commit], { cwd: REPO, stdio: 'ignore' }); }
  catch { errors.push(`${key}: integrated commit is not descended from lease base_sha`); }
  try {
    const parents = gitText(['rev-list', '--parents', '-n', '1', commit]).split(/\s+/);
    if (parents.length !== 2) errors.push(`${key}: integrated candidate must be one non-merge commit`);
  } catch { errors.push(`${key}: cannot inspect integrated commit lineage`); }
  if (!modulesConfigMatchesBase(lease.base_sha)) errors.push(`${key}: modules.config changed after lease base; release and replan`);
  const lower = Object.entries(leases).find(([otherKey, other]) => (
    otherKey !== key
    && hasParallelLease(other)
    && other.wave_id === lease.wave_id
    && Number.isInteger(other.merge_index)
    && other.merge_index < lease.merge_index
  ));
  if (lower) errors.push(`${key}: lower merge_index still active in ${lease.wave_id}: ${lower[0]}`);
  let changed = [];
  try {
    changed = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\0').filter(Boolean);
  } catch { errors.push(`${key}: cannot inspect integrated candidate diff`); }
  if (!changed.length) errors.push(`${key}: integrated candidate has no changed files`);
  const writeSet = effectiveBoundary(vertical, step, 'write_set', 'step_write_set');
  for (const relative of changed) {
    if (!isSafeRepoPattern(relative) || reservedControlPath(relative)) {
      errors.push(`${key}: integrated candidate touches reserved/unsafe path ${relative}`);
      continue;
    }
    if (!writeSet.some(pattern => patternsOverlap(pattern, relative))) {
      errors.push(`${key}: integrated candidate path outside current-step write_set: ${relative}`);
    }
  }
  return errors;
}

if (cmd === 'done') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: done <module:step> [--commit <hash>] [--agent <lease-owner>]'); process.exit(2); }
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  const requestedIndex = v.tasks.findIndex(x => x.step === step);
  const ai = process.argv.indexOf('--agent'); const agent = ai > 0 ? process.argv[ai + 1] : '';
  const eligibility = transitionErrors(v, step, { agent, allowOwnedLease: true });
  if (eligibility.length) { console.error(eligibility.join('\n')); process.exit(1); }
  const isFinalStep = requestedIndex === v.tasks.length - 1;
  const ci = process.argv.indexOf('--commit'); const commit = ci > 0 ? process.argv[ci + 1] : '';
  if (reconcileCfg.execution_mode === 'autonomous') {
    if (!commit) { console.error('autonomous done requires --commit <real-hash>'); process.exit(1); }
    try { execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO, stdio: 'ignore' }); }
    catch { console.error(`commit does not exist: ${commit}`); process.exit(1); }
    const backlog = resolve(REPO, 'BACKLOG.md'); const board = existsSync(backlog) ? readFileSync(backlog, 'utf8') : '';
    const boardTaskId = controlTaskId(v);
    const row = board.split(/\r?\n/).find(line => line.includes(`| ${boardTaskId} |`));
    if (isFinalStep && (!row || !row.includes('✅'))) {
      console.error(`${boardTaskId}: final progress step requires BACKLOG ✅`); process.exit(1);
    }
    if (!isFinalStep && (!row || !row.includes('🔨'))) {
      console.error(`${boardTaskId}: intermediate progress step requires BACKLOG 🔨; it cannot close, pause, or leave the product task queued`); process.exit(1);
    }
  }
  const parallelErrors = parallelDoneErrors(v, step, commit, leases[key], key);
  if (parallelErrors.length) { console.error(parallelErrors.join('\n')); process.exit(1); }
  tk.status = 'done'; if (commit) (v.commits ||= {})[step] = commit; delete leases[key];
  save(doc); console.log(`marked ${key} done`); process.exit(0);
}
if (cmd === 'block' || cmd === 'unblock') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: block|unblock <module:step> [--reason text]'); process.exit(2); }
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  if (cmd === 'unblock') v.blocked_reason = null;
  else { const ri = process.argv.indexOf('--reason'); const reason = ri > 0 ? process.argv[ri + 1] : ''; if (!reason) { console.error('block requires --reason'); process.exit(2); } v.blocked_reason = reason; }
  save(doc); console.log(`${cmd === 'block' ? 'blocked' : 'unblocked'} ${key}`); process.exit(0);
}
if (cmd === 'verify') {
  const vid = process.argv[3]; if (!vid) { console.error('usage: verify <module>'); process.exit(2); }
  const v = doc.verticals.find(x => x.id === vid);
  if (!v) { console.error(`unknown vertical "${vid}"`); process.exit(2); }
  v.e2e_verified = true;
  save(doc); console.log(`marked ${vid} e2e_verified=true`); process.exit(0);
}
if (cmd === 'claim' || cmd === 'release') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: claim|release <module:step> [--agent <id>]'); process.exit(2); }
  if (cmd === 'release') { delete leases[key]; save(doc); console.log(`released ${key}`); process.exit(0); }
  const ai = process.argv.indexOf('--agent'); const agent = ai > 0 ? process.argv[ai + 1] : 'unknown';
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  const eligibility = transitionErrors(v, step);
  if (eligibility.length) { console.error(eligibility.join('\n')); process.exit(1); }
  const parallelFlags = [
    ['--isolation', 'isolation_kind'],
    ['--workspace-root', 'workspace_root'],
    ['--branch', 'branch'],
    ['--base-sha', 'base_sha'],
    ['--wave-id', 'wave_id'],
    ['--merge-index', 'merge_index'],
  ];
  const parallelValues = {};
  let parallelFieldsPresent = 0;
  for (const [flag, field] of parallelFlags) {
    const index = process.argv.indexOf(flag);
    if (index < 0) continue;
    parallelFieldsPresent++;
    parallelValues[field] = process.argv[index + 1];
  }
  if (parallelFieldsPresent > 0 && parallelFieldsPresent !== parallelFlags.length) {
    const missing = parallelFlags.filter(([, field]) => parallelValues[field] == null).map(([flag]) => flag);
    console.error(`parallel claim requires the complete execution lease; missing: ${missing.join(', ')}`); process.exit(2);
  }
  if (parallelFieldsPresent > 0) {
    if (!['shared', 'branch', 'worktree'].includes(parallelValues.isolation_kind)) {
      console.error('parallel claim --isolation must be shared, branch, or worktree'); process.exit(2);
    }
    if (parallelValues.isolation_kind === 'shared') {
      console.error('shared read-only agents are auxiliary; they cannot claim or advance a progress step'); process.exit(2);
    }
    for (const field of ['workspace_root', 'branch', 'wave_id']) {
      if (typeof parallelValues[field] !== 'string' || !parallelValues[field].trim()) {
        console.error(`parallel claim ${field} must be non-empty`); process.exit(2);
      }
    }
    if (!/^[a-f0-9]{40}$/i.test(parallelValues.base_sha) || !commitExists(parallelValues.base_sha)) {
      console.error('parallel claim base_sha must be an existing full commit hash'); process.exit(2);
    }
    let integrationHead = '';
    try {
      integrationHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    } catch {
      console.error('parallel claim cannot resolve the current integration HEAD'); process.exit(2);
    }
    if (parallelValues.base_sha !== integrationHead) {
      console.error(`parallel claim base_sha is stale: expected current HEAD ${integrationHead}`); process.exit(2);
    }
    if (!modulesConfigMatchesBase(parallelValues.base_sha)) {
      console.error('parallel claim requires modules.config to match the committed base_sha; commit/replan first'); process.exit(2);
    }
    if (!/^\d+$/.test(parallelValues.merge_index)) {
      console.error('parallel claim merge_index must be a non-negative integer'); process.exit(2);
    }
    parallelValues.merge_index = Number.parseInt(parallelValues.merge_index, 10);
    for (const [otherKey, other] of Object.entries(leases)) {
      if (!hasParallelLease(other) || other.wave_id !== parallelValues.wave_id) continue;
      if (other.base_sha !== parallelValues.base_sha) {
        console.error(`parallel wave ${parallelValues.wave_id} must use one base_sha; ${otherKey} differs`); process.exit(2);
      }
      if (other.merge_index === parallelValues.merge_index) {
        console.error(`parallel wave ${parallelValues.wave_id} has duplicate merge_index ${parallelValues.merge_index}`); process.exit(2);
      }
    }
    const canonicalTaskId = controlTaskId(v);
    const proofArgs = [
      PARALLEL_ISOLATION,
      'select',
      '--root', REPO,
      '--tasks', canonicalTaskId,
      '--requested', parallelValues.isolation_kind,
      '--json',
    ];
    if (parallelValues.isolation_kind !== 'shared') {
      proofArgs.push('--workspace', `${canonicalTaskId}=${parallelValues.workspace_root}`);
    }
    let proof;
    try {
      proof = JSON.parse(execFileSync(process.execPath, proofArgs, {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
    } catch (error) {
      const detail = error?.stdout?.toString().trim() || error?.stderr?.toString().trim() || error.message;
      console.error(`parallel claim workspace proof failed: ${detail}`); process.exit(2);
    }
    const provenTask = proof.tasks?.find(item => item.task_id === canonicalTaskId);
    if (proof.selected_mode !== parallelValues.isolation_kind || provenTask?.isolation !== parallelValues.isolation_kind) {
      console.error(`parallel claim workspace proof rejected: ${(proof.reason_codes || []).join(', ') || proof.selected_mode}`); process.exit(2);
    }
    if (parallelValues.isolation_kind !== 'shared') {
      const provenWorkspace = proof.workspaces?.find(item => item.task_id === canonicalTaskId);
      if (
        !provenWorkspace
        || provenWorkspace.branch !== parallelValues.branch
        || provenWorkspace.head !== parallelValues.base_sha
      ) {
        console.error('parallel claim workspace proof does not match branch/base lease'); process.exit(2);
      }
      parallelValues.workspace_root = provenWorkspace.workspace;
    }
  }
  leases[key] = {
    agent,
    since: new Date().toISOString(),
    ...(parallelFieldsPresent > 0 ? parallelValues : {}),
  };
  save(doc); console.log(`claimed ${key} for ${agent}`); process.exit(0);
}
console.error(`unknown command "${cmd}". Use: generate | status | next | schedule | show | batch | block | unblock | claim | release | done | verify`);
process.exit(2);
