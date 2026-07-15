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
// work branch (file-derivable steps auto-advance). Steps without a signal are human/evaluator-set via `done`.
//
// Commands: generate | status | next | show <module> | batch [N] | claim <m:step> --agent <id> | release <m:step> | done <m:step> [--commit <h>] | verify <module>
//
// `verify <module>` sets that vertical's `e2e_verified: true`. SOLE CALLER = the harness (run.sh) after
// PASS+PASS from both heterogeneous reviewers — the reviewers themselves run read-only and never write it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
if (existsSync(RCFG)) { try { branch = JSON.parse(readFileSync(RCFG, 'utf8')).work_branch || branch; } catch {} }
const modCfg = JSON.parse(readFileSync(MODS, 'utf8')).modules || {};

const onBranch = (p) => { try { execSync(`git cat-file -e ${branch}:${p}`, { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; } };

function deriveStatus(step, cfg, prevMap) {
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
    return {
      id, archetype: cfg.archetype || [],
      tasks: (cfg.tasks || []).map(step => ({ step, status: deriveStatus(step, cfg, prevMap) })),
      blocked_reason: prevById[id]?.blocked_reason ?? null,
      commits: prevById[id]?.commits ?? {},
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

function ready() {
  const out = [];
  for (const v of doc.verticals) {
    if (v.blocked_reason) continue;
    const i = v.tasks.findIndex(t => t.status !== 'done');
    if (i < 0) continue;
    if (i > 0 && v.tasks[i - 1].status !== 'done') continue;
    if (leases[`${v.id}:${v.tasks[i].step}`]) continue;
    out.push({ v: v.id, task: v.tasks[i].step, doneCount: v.tasks.filter(t => t.status === 'done').length });
  }
  return out.sort((a, b) => b.doneCount - a.doneCount);
}

if (cmd === 'status') {
  const s = doc.summary; console.log(`progress.json — tasks ${s.tasks_done}/${s.tasks_total} done · complete ${s.verticals_complete}/${s.verticals}`);
  for (const v of doc.verticals) console.log(`  ${v.id.padEnd(18)} ${v.tasks.map(t => `${t.step}:${t.status === 'done' ? '✓' : '·'}`).join(' ')}${v.blocked_reason ? `  [BLOCKED: ${v.blocked_reason}]` : ''}`);
  process.exit(0);
}
if (cmd === 'next') {
  const r = ready(); if (!r.length) { console.log('ALL DONE (no unblocked, unleased, ready tasks).'); process.exit(0); }
  console.log(`NEXT: ${r[0].v}:${r[0].task}`);
  console.log(`  see: progress.mjs show ${r[0].v}   |   isolation: ONE fresh \`claude -p\` session; this task only, verify, commit, stop.`);
  process.exit(0);
}
if (cmd === 'batch') {
  const N = parseInt(process.argv[3], 10) || 4; const r = ready().slice(0, N);
  if (!r.length) { console.log('No ready tasks.'); process.exit(0); }
  console.log(`BATCH of ${r.length} file-disjoint tasks (one worktree per agent, merge serially):`);
  for (const t of r) console.log(`  ${t.v}:${t.task}`);
  process.exit(0);
}
if (cmd === 'done') {
  const key = process.argv[3]; if (!key || !key.includes(':')) { console.error('usage: done <module:step> [--commit <hash>]'); process.exit(2); }
  const [vid, step] = key.split(':'); const v = doc.verticals.find(x => x.id === vid); const tk = v?.tasks.find(x => x.step === step);
  if (!tk) { console.error(`unknown task ${key}`); process.exit(2); }
  tk.status = 'done'; const ci = process.argv.indexOf('--commit'); if (ci > 0) (v.commits ||= {})[step] = process.argv[ci + 1]; delete leases[key];
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`marked ${key} done`); process.exit(0);
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
  if (leases[key]) { console.error(`ALREADY LEASED: ${key} by ${leases[key].agent}`); process.exit(1); }
  leases[key] = { agent, since: new Date().toISOString() }; writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`claimed ${key} for ${agent}`); process.exit(0);
}
console.error(`unknown command "${cmd}". Use: generate | status | next | show | batch | claim | release | done | verify`);
process.exit(2);
