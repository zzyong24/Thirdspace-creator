#!/usr/bin/env node
// orchestrator/process/progress.mjs — refined per-module task queue for the autonomous harness.
//
// CRUD is not enough. Each module is decomposed by ARCHETYPE (see modules.config.json) into an ordered task
// list that adds data-sourcing and/or cross-module business-flow tasks beyond persistence:
//   repo → [data-source] → [flow] → frontend → e2e   (only the applicable subset per module)
// Status is DERIVED from work-branch reality where detectable (repo, frontend); data-source/flow/e2e are
// human/evaluator-set (can't be inferred from file existence) and preserved across regenerate.
//
// Usage:
//   node orchestrator/process/progress.mjs generate          # rebuild progress.json from config + work branch
//   node orchestrator/process/progress.mjs status             # per-module task grid
//   node orchestrator/process/progress.mjs next               # the ONE next small task (isolated session)
//   node orchestrator/process/progress.mjs show <vertical>    # tasks + data-source + flows + OSS refs
//   node orchestrator/process/progress.mjs batch [N]          # N file-disjoint ready tasks (parallel)
//   node orchestrator/process/progress.mjs claim <v:step> --agent <id>  |  release <v:step>
//
// PARALLELISM: across verticals (file-disjoint, one worktree per agent); serial within a vertical; only the
// 6 barrel files are shared — see harness/PARALLEL.md.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const OUT = resolve(ORCH, 'progress.json');
const CONFIG = resolve(HERE, 'reconcile.config.json');
const MODULES = resolve(HERE, 'modules.config.json');

let branch = 'feat/service-contract';
if (existsSync(CONFIG)) { try { branch = JSON.parse(readFileSync(CONFIG, 'utf8')).work_branch || branch; } catch {} }
if (!existsSync(MODULES)) { console.error('missing modules.config.json'); process.exit(2); }
const modCfg = JSON.parse(readFileSync(MODULES, 'utf8')).modules;

const onBranch = (p) => { try { execSync(`git cat-file -e ${branch}:${p}`, { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; } };
const someOnBranch = (cands) => cands.some(onBranch);
const variants = (n) => [n, n.endsWith('s') ? n.slice(0, -1) : n + 's'];

const repoSig = (id) => someOnBranch(variants(id).map(v => `backend/src/repositories/${v}-repository.ts`))
                     && someOnBranch(variants(id).map(v => `backend/src/repositories/${v}-repository.test.ts`));
const feSig   = (id) => someOnBranch(variants(id).map(v => `frontend/src/server/modules/${v}/${v}.persistence-client.test.ts`));

function deriveStatus(step, id, prevMap) {
  if (step === 'repo') return repoSig(id) ? 'done' : 'pending';
  if (step === 'frontend') return feSig(id) ? 'done' : 'pending';
  return prevMap[step] === 'done' ? 'done' : 'pending'; // data-source / flow / e2e: manual, preserved
}

const cmd = process.argv[2] || 'status';
const load = () => existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;

if (cmd === 'generate') {
  const prev = load();
  const prevById = Object.fromEntries((prev?.verticals || []).map(v => [v.id, v]));
  const verticals = Object.entries(modCfg).map(([id, cfg]) => {
    const prevTasks = Array.isArray(prevById[id]?.tasks) ? prevById[id].tasks : [];
    const prevMap = Object.fromEntries(prevTasks.map(t => [t.step, t.status]));
    return {
      id,
      archetype: cfg.archetype,
      tasks: cfg.tasks.map(step => ({ step, status: deriveStatus(step, id, prevMap) })),
      blocked_reason: prevById[id]?.blocked_reason ?? null,
      commits: prevById[id]?.commits ?? {},
    };
  });
  let tDone = 0, tTotal = 0;
  for (const v of verticals) for (const t of v.tasks) { tTotal++; if (t.status === 'done') tDone++; }
  const doc = {
    meta: {
      purpose: 'Refined task queue (per-module archetype). One task = ONE isolated `claude -p` session. Run `progress.mjs show <vertical>` for data-source/flow/OSS. DERIVED — regenerate, do not hand-edit repo/frontend signals.',
      work_branch: branch,
      task_order: 'repo → [data-source] → [flow] → frontend → e2e (applicable subset per module)',
    },
    summary: {
      verticals: verticals.length,
      tasks_done: tDone, tasks_total: tTotal, tasks_pending: tTotal - tDone,
      verticals_complete: verticals.filter(v => v.tasks.every(t => t.status === 'done')).length,
    },
    verticals,
    leases: {},
  };
  const byId = Object.fromEntries(verticals.map(v => [v.id, v]));
  for (const [key, lease] of Object.entries(prev?.leases || {})) {
    const [vid, step] = key.split(':');
    const t = byId[vid]?.tasks.find(x => x.step === step);
    if (t && t.status !== 'done') doc.leases[key] = lease;
  }
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  const s = doc.summary;
  console.log(`Wrote ${OUT}\n${s.verticals} verticals · tasks ${s.tasks_done}/${s.tasks_total} done · ${s.tasks_pending} pending · complete ${s.verticals_complete}/${s.verticals}`);
  process.exit(0);
}

if (cmd === 'show') {
  const id = process.argv[3];
  const cfg = modCfg[id];
  if (!cfg) { console.error(`unknown vertical "${id}"`); process.exit(2); }
  const doc = load(); const v = doc?.verticals.find(x => x.id === id);
  console.log(`# ${id}   archetype: ${cfg.archetype.join(', ')}`);
  console.log(`data-source: ${cfg.data_source}`);
  console.log(`flows:       ${cfg.flows}`);
  console.log(`OSS refs:    ${cfg.oss.join('  |  ')}`);
  console.log(`tasks:       ${(v?.tasks || cfg.tasks.map(s => ({step:s,status:'?'}))).map(t => `${t.step}:${t.status==='done'?'✓':'·'}`).join('  ')}`);
  process.exit(0);
}

const doc = load();
if (!doc) { console.error('progress.json not found — run: progress.mjs generate'); process.exit(2); }
const leases = doc.leases || (doc.leases = {});

function readyTasks() {
  const out = [];
  for (const v of doc.verticals) {
    if (v.blocked_reason) continue;
    const idx = v.tasks.findIndex(t => t.status !== 'done');
    if (idx < 0) continue;
    if (idx > 0 && v.tasks[idx - 1].status !== 'done') continue; // dep not met
    const step = v.tasks[idx].step;
    if (leases[`${v.id}:${step}`]) continue;
    out.push({ v: v.id, task: step, doneCount: v.tasks.filter(t => t.status === 'done').length });
  }
  return out.sort((a, b) => b.doneCount - a.doneCount);
}

if (cmd === 'status') {
  const s = doc.summary;
  console.log(`progress.json — tasks ${s.tasks_done}/${s.tasks_total} done · ${s.tasks_pending} pending · complete ${s.verticals_complete}/${s.verticals}`);
  for (const v of doc.verticals) {
    const grid = v.tasks.map(t => `${t.step}:${t.status === 'done' ? '✓' : '·'}`).join(' ');
    const blk = v.blocked_reason ? `  [BLOCKED: ${v.blocked_reason}]` : '';
    console.log(`  ${v.id.padEnd(18)} ${grid}${blk}`);
  }
  process.exit(0);
}

if (cmd === 'next') {
  const r = readyTasks();
  if (!r.length) { console.log('ALL DONE (no unblocked, unleased, dependency-ready tasks).'); process.exit(0); }
  const n = r[0];
  console.log(`NEXT: ${n.v}:${n.task}`);
  console.log(`  see: node orchestrator/process/progress.mjs show ${n.v}   (data-source · flows · OSS to borrow)`);
  console.log(`  isolation: ONE fresh \`claude -p\` session; implement only this task, verify, commit, stop.`);
  process.exit(0);
}

if (cmd === 'batch') {
  const N = parseInt(process.argv[3], 10) || 4;
  const r = readyTasks().slice(0, N);
  if (!r.length) { console.log('No ready tasks.'); process.exit(0); }
  console.log(`BATCH of ${r.length} file-disjoint tasks (one git worktree per agent, merge serially):`);
  for (const t of r) console.log(`  ${t.v}:${t.task}   claim: progress.mjs claim ${t.v}:${t.task} --agent <id>`);
  console.log('NOTE: do NOT parallelize the 6 barrel files (harness/PARALLEL.md) — regenerate/serialize at merge.');
  process.exit(0);
}

if (cmd === 'done') {
  // mark a task done + record its commit. Needed for data-source/flow/e2e (not file-derived);
  // for repo/frontend it's redundant (generate re-derives from signals) but harmless.
  const key = process.argv[3];
  if (!key || !key.includes(':')) { console.error('usage: done <vertical:step> [--commit <hash>]'); process.exit(2); }
  const [vid, step] = key.split(':');
  const v = doc.verticals.find(x => x.id === vid);
  const t = v?.tasks.find(x => x.step === step);
  if (!t) { console.error(`unknown task ${key}`); process.exit(2); }
  t.status = 'done';
  const ci = process.argv.indexOf('--commit');
  if (ci > 0) (v.commits ||= {})[step] = process.argv[ci + 1];
  delete leases[key];
  doc.summary.tasks_done = doc.verticals.reduce((n, x) => n + x.tasks.filter(z => z.status === 'done').length, 0);
  doc.summary.tasks_pending = doc.summary.tasks_total - doc.summary.tasks_done;
  doc.summary.verticals_complete = doc.verticals.filter(x => x.tasks.every(z => z.status === 'done')).length;
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`marked ${key} done${ci > 0 ? ` (commit ${process.argv[ci + 1]})` : ''}`);
  process.exit(0);
}

if (cmd === 'claim' || cmd === 'release') {
  const key = process.argv[3];
  if (!key || !key.includes(':')) { console.error('usage: claim|release <vertical:step> [--agent <id>]'); process.exit(2); }
  if (cmd === 'release') { delete leases[key]; writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`released ${key}`); process.exit(0); }
  const ai = process.argv.indexOf('--agent');
  const agent = ai > 0 ? process.argv[ai + 1] : 'unknown';
  if (leases[key]) { console.error(`ALREADY LEASED: ${key} by ${leases[key].agent} — run \`batch\` for another.`); process.exit(1); }
  leases[key] = { agent, since: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`claimed ${key} for ${agent}`);
  process.exit(0);
}

console.error(`unknown command "${cmd}". Use: generate | status | next | show | batch | claim | release`);
process.exit(2);
