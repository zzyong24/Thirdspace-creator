#!/usr/bin/env node
// orchestrator/process/reconcile.mjs  (skill template — copied into each project)
// Executable gate / drift detector for the product-to-code-orchestrator control artifacts.
// Validates the manifest, checks build-claims against git+fs reality on the work branch, enforces the
// blocking-consistency rule, and flags staleness vs the decision log. Exit 0=clean, 1=drift, 2=missing.
//
// Per-project config (optional): orchestrator/process/reconcile.config.json
//   { "work_branch": "feat/x", "probes": [ { "stage": "16-backend-tdd", "path": "backend/src" } ] }
// If absent, work_branch is read from the manifest and probes default to empty (structural + consistency +
// staleness checks still run).

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const MANIFEST = resolve(ORCH, 'ARTIFACT_MANIFEST.yaml');
const DECLOG = resolve(ORCH, 'DECISION_LOG.md');
const CONFIG = resolve(HERE, 'reconcile.config.json');

const VALID_STATUS = ['not-started','draft','needs-user-confirmation','blocked','passed','accepted-risk','invalidated'];

let cfg = { work_branch: null, probes: [] };
if (existsSync(CONFIG)) { try { cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }; } catch (e) { /* ignore */ } }

const findings = [];
const err  = (m) => findings.push({ level: 'ERROR', m });
const warn = (m) => findings.push({ level: 'WARN',  m });
const ok   = (m) => findings.push({ level: 'OK',    m });

function die(code) {
  const order = { ERROR: 0, WARN: 1, OK: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ERROR: '✗', WARN: '!', OK: '✓' };
  console.log('\n── orchestrator reconcile ─────────────────────────────');
  for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
  const errs = findings.filter(f => f.level === 'ERROR').length;
  const warns = findings.filter(f => f.level === 'WARN').length;
  console.log('───────────────────────────────────────────────────────');
  console.log(`${errs} error(s), ${warns} warning(s).`);
  console.log(errs ? '✗ DRIFT: manifest does not reconcile with reality.' : '✓ Manifest reconciles with reality.');
  process.exit(code ?? (errs ? 1 : 0));
}

const REQUIRED = ['ARTIFACT_MANIFEST.yaml','ID_REGISTRY.md','DECISION_LOG.md','TRACEABILITY_MATRIX.md','CHANGE_IMPACT.md'];
for (const f of REQUIRED) {
  if (existsSync(resolve(ORCH, f))) ok(`required artifact present: ${f}`);
  else err(`required control artifact MISSING: orchestrator/${f}`);
}
if (!existsSync(MANIFEST)) die(2);
const text = readFileSync(MANIFEST, 'utf8');

const topScalar = (key) => {
  const m = text.match(new RegExp(`^  ${key}:\\s*"?([^"#\\n]+?)"?\\s*(?:#.*)?$`, 'm'));
  return m ? m[1].trim() : null;
};
const workBranch = cfg.work_branch || topScalar('work_branch');
const updatedAt  = topScalar('updated_at');
const currentStage = topScalar('current_stage');

const stages = {};
{
  let inStages = false, cur = null;
  for (const line of text.split('\n')) {
    if (/^stages:\s*$/.test(line)) { inStages = true; continue; }
    if (!inStages) continue;
    if (/^[a-z_]+:\s*$/.test(line)) break;
    const head = line.match(/^  "([^"]+)":\s*(?:#.*)?$/);
    if (head) { cur = head[1]; stages[cur] = { status: null, gate_status: null }; continue; }
    if (!cur) continue;
    const st = line.match(/^    status:\s*"?([\w-]+)"?/);
    if (st) { stages[cur].status = st[1]; continue; }
    const gs = line.match(/^    gate_status:\s*"?([\w-]+)"?/);
    if (gs) stages[cur].gate_status = gs[1];
  }
}
const stageIds = Object.keys(stages);
stageIds.length ? ok(`parsed ${stageIds.length} stages`) : err('could not parse any stages (format changed?)');

for (const [id, s] of Object.entries(stages))
  if (s.status && !VALID_STATUS.includes(s.status)) err(`stage ${id}: invalid status "${s.status}"`);

const cgStatus = (text.match(/^consistency_gate:\s*\n\s*status:\s*"?([\w-]+)"?/m) || [])[1];
const blocksBlock = (text.match(/blocks:\s*\[([^\]]*)\]/) || [])[1] || '';
const blocked = blocksBlock.split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean);
if (cgStatus === 'fail') {
  if (!blocked.length) warn('consistency_gate is fail but lists no `blocks:` — it cannot block anything.');
  for (const b of blocked) {
    const st = stages[b]?.status;
    if (st === 'passed') err(`consistency_gate=fail but blocked stage ${b} is "passed" (snapshot-laundering). Use accepted-risk + DEC entry, or close the chain.`);
    else ok(`consistency_gate blocks ${b} (status ${st}) — OK`);
  }
}

let gitOk = true;
try { execSync('git rev-parse --git-dir', { cwd: REPO, stdio: 'ignore' }); } catch { gitOk = false; }
const branch = workBranch || 'HEAD';
let branchOk = gitOk;
if (gitOk && workBranch) {
  try { execSync(`git rev-parse --verify ${branch}`, { cwd: REPO, stdio: 'ignore' }); }
  catch { branchOk = false; warn(`work_branch "${branch}" not found locally — skipping reality probes.`); }
}
const existsOnBranch = (p) => {
  try { execSync(`git cat-file -e ${branch}:${p}`, { cwd: REPO, stdio: 'ignore' }); return true; }
  catch { return false; }
};
if (gitOk && branchOk && cfg.probes.length) {
  for (const probe of cfg.probes) {
    const s = stages[probe.stage];
    if (!s) { warn(`probe references unknown stage ${probe.stage}`); continue; }
    const present = existsOnBranch(probe.path);
    const claimsNothing = (s.status === 'not-started' || s.status === 'blocked');
    if (present && claimsNothing)
      err(`DRIFT: ${probe.stage} is "${s.status}" but ${probe.path} EXISTS on ${branch} — stage understates reality.`);
    else if (!present && !claimsNothing)
      err(`DRIFT: ${probe.stage} is "${s.status}" but ${probe.path} is MISSING on ${branch} — stage overstates reality.`);
    else
      ok(`probe ${probe.stage} ↔ ${probe.path}: consistent (status ${s.status}, present ${present})`);
  }
} else if (!cfg.probes.length) {
  warn('no probes configured (orchestrator/process/reconcile.config.json) — reality probes skipped.');
} else {
  warn('git/work_branch unavailable — reality probes skipped.');
}

if (existsSync(DECLOG) && updatedAt) {
  const dates = [...readFileSync(DECLOG, 'utf8').matchAll(/^Date:\s*(\d{4}-\d{2}-\d{2})/gm)].map(m => m[1]).sort();
  const latest = dates.at(-1);
  if (latest && latest > updatedAt)
    err(`DRIFT: manifest updated_at=${updatedAt} is older than newest DECISION_LOG Date=${latest} — reconcile the stage rows.`);
  else ok(`updated_at (${updatedAt}) is >= newest decision (${latest}).`);
}

if (currentStage && !stages[currentStage])
  warn(`current_stage "${currentStage}" is not a stage id in the manifest.`);

die();
