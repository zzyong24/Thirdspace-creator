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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskWatchdogErrors } from './autonomy-guard.mjs';
import { taskGovernanceErrors } from './governance-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const OUT = resolve(ORCH, 'progress.json');
const RCFG = resolve(HERE, 'reconcile.config.json');
const MODS = resolve(HERE, 'modules.config.json');

if (!existsSync(MODS)) {
  console.error('missing orchestrator/process/modules.config.json — copy modules.config.example.json and fill it for THIS project (see the LESSON in this file: verify real layers before writing done_signals).');
  process.exit(2);
}
let branch = 'HEAD';
let reconcileCfg = {};
if (existsSync(RCFG)) { try { reconcileCfg = JSON.parse(readFileSync(RCFG, 'utf8')); branch = reconcileCfg.work_branch || branch; } catch {} }
const modCfg = JSON.parse(readFileSync(MODS, 'utf8')).modules || {};

for (const [id, cfg] of Object.entries(modCfg)) {
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
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
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
const leases = doc.leases || (doc.leases = {});
const controlTaskId = (vertical) => vertical.task_id || modCfg[vertical.id]?.task_id || vertical.id;
const governanceEnabled = existsSync(resolve(ORCH, 'SCOPE_AUTHORIZATIONS.json')) || existsSync(resolve(ORCH, 'COMPLEXITY_LEDGER.json'));
const governanceErrors = (vertical) => governanceEnabled
  ? taskGovernanceErrors(REPO, controlTaskId(vertical), vertical.write_set ?? modCfg[vertical.id]?.write_set ?? []) : [];

function effectiveDependencies(vertical, step) {
  const stepDeps = vertical.step_depends_on ?? modCfg[vertical.id]?.step_depends_on;
  if (stepDeps && Object.prototype.hasOwnProperty.call(stepDeps, step)) return stepDeps[step];
  return Array.isArray(vertical.depends_on) ? vertical.depends_on : (Array.isArray(modCfg[vertical.id]?.depends_on) ? modCfg[vertical.id].depends_on : []);
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
  errors.push(...governanceErrors(vertical));
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
    out.push({ v: v.id, task: v.tasks[i].step, doneCount: v.tasks.filter(t => t.status === 'done').length, write_set: v.write_set ?? modCfg[v.id]?.write_set ?? [] });
  }
  return out.sort((a, b) => b.doneCount - a.doneCount);
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
  const quarantinedGovernance = doc.verticals.flatMap(v => !v.blocked_reason && v.tasks.some(t => t.status !== 'done') && governanceErrors(v).length
    ? v.tasks.filter(t => t.status !== 'done').slice(0, 1).map(t => `${v.id}:${t.step}`) : []);
  if (!r.length) {
    const pending = doc.verticals.some(v => v.tasks.some(t => t.status !== 'done'));
    console.log(JSON.stringify({ status: pending ? 'hold' : 'done', task: null, bypassed_blocked: blocked, quarantined, quarantined_governance: quarantinedGovernance })); process.exit(0);
  }
  console.log(JSON.stringify({ status: 'ready', task: `${r[0].v}:${r[0].task}`, write_set: r[0].write_set, bypassed_blocked: blocked, quarantined, quarantined_governance: quarantinedGovernance })); process.exit(0);
}
if (cmd === 'batch') {
  const N = parseInt(process.argv[3], 10) || 4; const r = ready().slice(0, N);
  if (!r.length) { console.log('No ready tasks.'); process.exit(0); }
  console.log(`BATCH of ${r.length} file-disjoint tasks (one worktree per agent, merge serially):`);
  for (const t of r) console.log(`  ${t.v}:${t.task}`);
  process.exit(0);
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
  tk.status = 'done'; if (commit) (v.commits ||= {})[step] = commit; delete leases[key];
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`marked ${key} done`); process.exit(0);
}
if (cmd === 'block' || cmd === 'unblock') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: block|unblock <module:step> [--reason text]'); process.exit(2); }
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  if (cmd === 'unblock') v.blocked_reason = null;
  else { const ri = process.argv.indexOf('--reason'); const reason = ri > 0 ? process.argv[ri + 1] : ''; if (!reason) { console.error('block requires --reason'); process.exit(2); } v.blocked_reason = reason; }
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`${cmd === 'block' ? 'blocked' : 'unblocked'} ${key}`); process.exit(0);
}
if (cmd === 'verify') {
  const vid = process.argv[3]; if (!vid) { console.error('usage: verify <module>'); process.exit(2); }
  const v = doc.verticals.find(x => x.id === vid);
  if (!v) { console.error(`unknown vertical "${vid}"`); process.exit(2); }
  v.e2e_verified = true;
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`marked ${vid} e2e_verified=true`); process.exit(0);
}
if (cmd === 'claim' || cmd === 'release') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: claim|release <module:step> [--agent <id>]'); process.exit(2); }
  if (cmd === 'release') { delete leases[key]; writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`released ${key}`); process.exit(0); }
  const ai = process.argv.indexOf('--agent'); const agent = ai > 0 ? process.argv[ai + 1] : 'unknown';
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  const eligibility = transitionErrors(v, step);
  if (eligibility.length) { console.error(eligibility.join('\n')); process.exit(1); }
  leases[key] = { agent, since: new Date().toISOString() }; writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`claimed ${key} for ${agent}`); process.exit(0);
}
console.error(`unknown command "${cmd}". Use: generate | status | next | schedule | show | batch | block | unblock | claim | release | done | verify`);
process.exit(2);
