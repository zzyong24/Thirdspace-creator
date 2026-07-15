#!/usr/bin/env node
// orchestrator/process/orphan-scan.mjs  (skill template — copied into each project)
// EXECUTABLE bidirectional orphan scan for the consistency gate. Parses ID_REGISTRY.md +
// TRACEABILITY_MATRIX.md and COMPUTES the verdict instead of trusting a self-filled manifest flag.
//   (a) downstream→upstream: every PAGE/COMP/API/TEST traces to an upstream FR/NFR/FLOW/DEC.
//   (b) upstream→downstream: every confirmed FR / core-path FLOW has >=1 API|PAGE AND >=1 TEST.
// A broken release-critical chain (an FR with no API/PAGE, or with no TEST) is exit 1.
//
// Exit 0=clean, 1=broken-chain/orphan/non-canonical-data, 2=missing required artifact.
//
// Stack-agnostic: no language assumptions, only `node:` builtins. Per-project tuning is via
// orchestrator/process/orphan-scan.config.json (all keys optional):
//   {
//     "control_dir": ".",                       // dir holding ID_REGISTRY.md + TRACEABILITY_MATRIX.md,
//                                               //   RESOLVED RELATIVE TO THE ORCHESTRATOR DIR (where
//                                               //   reconcile.mjs reads control artifacts). "." = the
//                                               //   orchestrator dir itself; e.g. "../control" if they
//                                               //   live in a sibling control/ folder.
//     "upstream_prefixes": ["FR","NFR","FLOW","DEC"],   // what counts as "upstream intent"
//     "downstream_prefixes": ["PAGE","COMP","API","TEST"], // what must trace upstream
//     "realizing_prefixes": ["API","PAGE","COMP"],  // a confirmed FR needs >=1 of these
//     "test_prefixes": ["TEST","TC","INT"],         // ...AND >=1 of these
//     "confirmed_statuses": ["OK","DEFERRED","RISK","BROKEN"], // matrix rows considered "confirmed" requirements
//     "release_critical_statuses": ["OK","BROKEN"], // a broken chain in these statuses FAILS the gate
//     "id_registry": "ID_REGISTRY.md",
//     "traceability_matrix": "TRACEABILITY_MATRIX.md"
//   }
// Defaults above are sensible for the JS/TS reference stack; a Python/pytest project can, e.g., add "PYTEST"
// to test_prefixes. Nothing is hardcoded to a language.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const CONFIG = resolve(HERE, 'orphan-scan.config.json');

const DEFAULTS = {
  control_dir: '.',
  upstream_prefixes: ['FR', 'NFR', 'FLOW', 'DEC'],
  rule_prefixes: ['BR'],                              // business rules are requirement-like (need realizing+test)
  downstream_prefixes: ['PAGE', 'PG', 'COMP', 'API', 'TEST'],
  realizing_prefixes: ['API', 'PAGE', 'PG', 'COMP'],
  test_prefixes: ['TEST', 'TC', 'INT'],
  // Classification prefers the registry Type column (robust to prefix vocab like PG vs PAGE); prefix is the fallback.
  realizing_types: ['page', 'api', 'component', 'comp', 'screen', 'endpoint', 'route', 'service'],
  test_types: ['test'],
  justification_prefixes: ['DEC', 'RISK'],            // a DEFERRED/RISK row must link one of these, else it's a silent drop
  confirmed_statuses: ['OK', 'DEFERRED', 'RISK', 'BROKEN', 'PLANNED'],  // PLANNED = confirmed at PLAN, not yet built (v3 stage 1-3); resolved to OK/DEFERRED/RISK before SHIP
  release_critical_statuses: ['OK', 'BROKEN'],
  id_registry: 'ID_REGISTRY.md',
  traceability_matrix: 'TRACEABILITY_MATRIX.md',
};

let cfg = { ...DEFAULTS };
if (existsSync(CONFIG)) {
  try { cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }; }
  catch (e) { /* fall through; reported below */ }
}

// Allow `--control-dir <path>` / `--registry <file>` / `--matrix <file>` overrides for standalone runs.
// The configured control_dir resolves against the ORCHESTRATOR dir (ORCH) to match reconcile.mjs, which
// reads the control artifacts from there. A `--control-dir` CLI value resolves against the user's CWD
// (standard CLI convention) so an ad-hoc `--control-dir ./selftest/control` does what the user expects.
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const cliDir = flag('--control-dir');
const controlDir = cliDir ? resolve(process.cwd(), cliDir) : resolve(ORCH, cfg.control_dir);
const REGISTRY = resolve(controlDir, flag('--registry') || cfg.id_registry);
const MATRIX = resolve(controlDir, flag('--matrix') || cfg.traceability_matrix);

const findings = [];
let parseErrors = 0; // data-parse failures ONLY (non-canonical / unparseable) — these abort the verdict.
const err  = (m) => findings.push({ level: 'ERROR', m });
const perr = (m) => { parseErrors++; findings.push({ level: 'ERROR', m }); }; // parse-level error
const warn = (m) => findings.push({ level: 'WARN',  m });
const ok   = (m) => findings.push({ level: 'OK',    m });

function die(code) {
  const order = { ERROR: 0, WARN: 1, OK: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ERROR: '✗', WARN: '!', OK: '✓' };
  console.log('\n── orchestrator orphan-scan (bidirectional) ───────────');
  for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
  const errs = findings.filter(f => f.level === 'ERROR').length;
  const warns = findings.filter(f => f.level === 'WARN').length;
  console.log('───────────────────────────────────────────────────────');
  console.log(`${errs} error(s), ${warns} warning(s).`);
  console.log(errs ? '✗ ORPHAN SCAN FAILED: a release-critical trace chain is broken or data is non-canonical.'
                   : '✓ Orphan scan clean: every chain traces both directions.');
  process.exit(code ?? (errs ? 1 : 0));
}

// ── Canonical-block extraction ────────────────────────────────────────────────
// We DO NOT regex arbitrary prose. The machine-checkable data must live in a fenced block:
//   ```id-registry ... ```   and   ```traceability ... ```
// Inside the block: a GFM pipe table with a fixed header (validated below), comma-separated IDs,
// literal token NONE for "no link", ranges via PFX-LO..HI, slash-joined ids split on " / ".
// If the block is absent we emit a clear "non-canonical / cannot parse" ERROR — never a false pass.
function extractFenced(text, lang) {
  const re = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```', 'm');
  const m = text.match(re);
  return m ? m[1] : null;
}

// Parse a GFM pipe table into rows of trimmed cells. Skips the `---` separator row. Tolerates
// optional leading/trailing pipes and surrounding whitespace.
function parsePipeTable(block) {
  const rows = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || !line.includes('|')) continue;
    if (/^\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue; // separator row
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    rows.push(cells);
  }
  return rows;
}

// Expand a single cell of comma/whitespace-separated ID tokens into concrete IDs.
//   "NONE" / "" → []   |   "FR-create, FR-list" → [FR-create, FR-list]
//   "TC-LIST-1..5" → [TC-LIST-1..TC-LIST-5]   |   "ENT-Task / ENT-User" → [ENT-Task, ENT-User]
// Returns { ids, bad } where `bad` holds tokens that look like data but are NOT canonical IDs
// (e.g. an emoji or free prose) so the caller can FAIL rather than silently drop them.
// An ID is PFX-segment(s): one prefix then >=1 hyphen-joined alnum segment, e.g. FR-create,
// API-list, TC-LIST-3, TC-UPD-1. Multi-segment hyphenated ids are explicitly allowed.
const ID_RE = /^[A-Z]{2,6}(?:-[A-Za-z0-9]+)+$/;
// A range is STEM-LO..HI where STEM ends in a hyphen and LO/HI are pure integers,
// e.g. TC-LIST-1..5 → TC-LIST-1..TC-LIST-5, INT-1..6 → INT-1..INT-6.
const RANGE_RE = /^([A-Z]{2,6}(?:-[A-Za-z0-9]+)*-)(\d+)\.\.(\d+)$/;
function expandIds(cell) {
  const ids = [];
  const bad = [];
  const trimmed = (cell || '').trim();
  if (trimmed === '') return { ids, bad };
  // split on commas AND " / " (slash-joined ids), keep range tokens intact (no split on '..').
  const toks = trimmed.split(/\s*,\s*|\s+\/\s+/).map(t => t.trim()).filter(Boolean);
  for (const t of toks) {
    if (t.toUpperCase() === 'NONE') continue;   // no-link sentinel — valid anywhere in a cell, not a bad token
    if (ID_RE.test(t)) { ids.push(t); continue; }
    const r = t.match(RANGE_RE);
    if (r) {
      const [, stem, lo, hi] = r;
      const a = parseInt(lo, 10), b = parseInt(hi, 10);
      if (a <= b && (b - a) <= 999) { for (let n = a; n <= b; n++) ids.push(`${stem}${n}`); continue; }
    }
    bad.push(t);
  }
  return { ids, bad };
}

const prefixOf = (id) => (id.match(/^([A-Z]{2,6})-/) || [])[1] || null;
const inSet = (id, prefixes) => prefixes.includes(prefixOf(id));

// ── Load + presence ───────────────────────────────────────────────────────────
let fatal = false;
for (const f of [REGISTRY, MATRIX]) {
  if (existsSync(f)) ok(`control artifact present: ${basename(f)}`);
  else { err(`MISSING control artifact: ${f}`); fatal = true; }
}
if (fatal) die(2);

const regText = readFileSync(REGISTRY, 'utf8');
const matText = readFileSync(MATRIX, 'utf8');

// ── ARTIFACT_MANIFEST schema-drift surface (explicit finding, recommend the fix) ─────────────────
// reconcile.mjs parses a MAP-of-stages (`stages:` then `  "id":`) with a `consistency_gate:` block.
// A legacy LIST-of-stages manifest (`- id:` rows, `release_blocking:`) is incompatible: reconcile
// silently parses ZERO stages from it, so every drift check no-ops. If a manifest sits beside the
// control artifacts, detect that legacy form here and surface it as an explicit finding.
{
  const manifest = resolve(controlDir, 'ARTIFACT_MANIFEST.yaml');
  if (existsSync(manifest)) {
    const mtext = readFileSync(manifest, 'utf8');
    const hasStagesKey = /^stages:\s*$/m.test(mtext);
    const listForm = /^\s*-\s+id:\s*/m.test(mtext);
    const mapForm = /^\s{2}"[^"]+":\s*$/m.test(mtext);
    const hasCG = /^consistency_gate:\s*$/m.test(mtext);
    if (hasStagesKey && listForm && !mapForm) {
      err(`ARTIFACT_MANIFEST.yaml uses a LIST-of-stages (\`- id:\`); reconcile.mjs expects a MAP-of-stages (\`stages:\` then \`  "<id>":\`). reconcile.mjs parses ZERO stages from this form. FIX: convert to the map form in templates/ARTIFACT_MANIFEST_TEMPLATE.yaml, or teach reconcile.mjs to read both. Tracked as schema drift.`);
    }
    if (!hasCG) {
      warn(`ARTIFACT_MANIFEST.yaml has no \`consistency_gate:\` block — reconcile.mjs cannot enforce the blocking rule. The orphan-scan verdict here must be wired into that block (status + blocks).`);
    }
  } else {
    warn(`no ARTIFACT_MANIFEST.yaml beside the control artifacts — cannot cross-check schema form.`);
  }
}

// ── Parse ID_REGISTRY canonical block ───────────────────────────────────────────
const REG_HEADER = ['id', 'type', 'defined in', 'source ids'];
const registry = new Map(); // id -> { type, definedIn, sources:[] }
{
  const block = extractFenced(regText, 'id-registry');
  if (block == null) {
    perr(`ID_REGISTRY.md has no \`\`\`id-registry fenced block — NON-CANONICAL. Cannot parse free-form prose safely. Add the canonical block (see templates/ID_REGISTRY_TEMPLATE.md). Refusing to guess.`);
  } else {
    const rows = parsePipeTable(block);
    if (!rows.length) { perr('id-registry block has no table rows.'); }
    else {
      const header = rows[0].map(h => h.toLowerCase());
      const idx = Object.fromEntries(REG_HEADER.map(h => [h, header.indexOf(h)]));
      const missing = REG_HEADER.filter(h => idx[h] < 0);
      if (missing.length) {
        perr(`id-registry header is non-canonical; missing column(s): ${missing.join(', ')}. Expected exactly: ${REG_HEADER.join(' | ')}.`);
      } else {
        for (const cells of rows.slice(1)) {
          const idCell = cells[idx['id']] || '';
          const { ids, bad } = expandIds(idCell);
          if (bad.length) perr(`ID_REGISTRY id column non-canonical token(s): ${bad.join(', ')} (row "${idCell}"). Use PFX-name, ranges PFX-LO..HI, slash " / ", or NONE.`);
          for (const id of ids) {
            const { ids: srcIds, bad: srcBad } = expandIds(cells[idx['source ids']] || '');
            if (srcBad.length) warn(`ID_REGISTRY ${id} has non-canonical Source IDs token(s): ${srcBad.join(', ')}.`);
            registry.set(id, { type: (cells[idx['type']] || '').toLowerCase(), definedIn: cells[idx['defined in']] || '', sources: srcIds });
          }
        }
        ok(`parsed ${registry.size} canonical IDs from ID_REGISTRY.`);
      }
    }
  }
}

// ── Parse TRACEABILITY_MATRIX canonical block ────────────────────────────────────
// Canonical columns (fixed, lowercased for matching): product | flow | entity | page | api | test | status
// `page` and `api` are the realizing layers; `test` the coverage layer; `status` a fixed enum token.
const MAT_HEADER = ['product', 'flow', 'entity', 'page', 'api', 'test', 'status'];
const MAT_STATUS = new Set(['OK', 'BROKEN', 'DEFERRED', 'RISK', 'PLANNED']);
const matrixRows = []; // { product:[], flow:[], page:[], api:[], test:[], status, raw }
{
  const block = extractFenced(matText, 'traceability');
  if (block == null) {
    perr(`TRACEABILITY_MATRIX.md has no \`\`\`traceability fenced block — NON-CANONICAL. Cannot parse free-form prose / emoji safely. Add the canonical block (see templates/TRACEABILITY_MATRIX_TEMPLATE.md). Refusing to guess.`);
  } else {
    const rows = parsePipeTable(block);
    if (!rows.length) { perr('traceability block has no table rows.'); }
    else {
      const header = rows[0].map(h => h.toLowerCase());
      const idx = Object.fromEntries(MAT_HEADER.map(h => [h, header.indexOf(h)]));
      const missing = MAT_HEADER.filter(h => idx[h] < 0);
      if (missing.length) {
        perr(`traceability header is non-canonical; missing column(s): ${missing.join(', ')}. Expected exactly: ${MAT_HEADER.join(' | ')}.`);
      } else {
        for (const cells of rows.slice(1)) {
          const col = (name) => expandIds(cells[idx[name]] || '');
          const rawStatus = (cells[idx['status']] || '').trim().toUpperCase();
          if (!MAT_STATUS.has(rawStatus)) {
            perr(`traceability row "${(cells[idx['product']] || cells[0] || '').slice(0,40)}" has non-canonical Status "${cells[idx['status']]}". Use one literal token of: ${[...MAT_STATUS].join(', ')} (no emoji).`);
            continue;
          }
          const product = col('product'); const flow = col('flow');
          const page = col('page'); const api = col('api'); const test = col('test');
          for (const [name, r] of [['product', product], ['flow', flow], ['page', page], ['api', api], ['test', test]]) {
            if (r.bad.length) perr(`traceability row "${cells[idx['product']]}" column ${name} non-canonical token(s): ${r.bad.join(', ')}. Use IDs, ranges, " / ", or NONE.`);
          }
          matrixRows.push({
            product: product.ids, flow: flow.ids, page: page.ids, api: api.ids, test: test.ids,
            status: rawStatus, label: (cells[idx['product']] || '').trim(),
          });
        }
        ok(`parsed ${matrixRows.length} canonical traceability rows.`);
      }
    }
  }
}

// If the DATA could not be parsed canonically, do not pretend to a verdict — fail now with the
// "non-canonical / cannot parse" errors rather than a false pass. (Other ERRORs, e.g. manifest
// schema drift, are real findings but do not invalidate the bidirectional computation, so the
// scan still runs and reports the chain results alongside them.)
if (parseErrors) die(1);

// ── classification: prefer the registry Type column (robust to PG vs PAGE), fall back to prefix.
// CRUCIAL: an id only counts as realizing/test if it EXISTS in the registry — a fabricated token like
// `TC-FAKE` named in a matrix cell must NOT satisfy a chain (that was a false-green hole).
const typeOf = (id) => registry.get(id)?.type || '';
const isRealizingId = (id) => registry.has(id) && (cfg.realizing_types.includes(typeOf(id)) || inSet(id, cfg.realizing_prefixes));
const isTestId      = (id) => registry.has(id) && (cfg.test_types.includes(typeOf(id)) || inSet(id, cfg.test_prefixes));
const isDownstream  = (id) => cfg.downstream_prefixes.includes(prefixOf(id)) || inSet(id, cfg.test_prefixes)
  || cfg.realizing_types.includes(typeOf(id)) || cfg.test_types.includes(typeOf(id));

// ── (a) downstream → upstream: no unrequested work ───────────────────────────────
// Every realizing/test id referenced in the matrix must EXIST in the registry and trace (transitively via
// Source IDs) to at least one upstream FR/NFR/FLOW/DEC. Absent from the registry → fabricated; no upstream
// reach → orphan (unrequested scope).
function reachesUpstream(id, seen = new Set()) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (inSet(id, cfg.upstream_prefixes)) return true;
  const entry = registry.get(id);
  if (!entry) return false;
  return entry.sources.some(s => reachesUpstream(s, seen));
}

const downstreamIds = new Set();
for (const r of matrixRows) for (const id of [...r.page, ...r.api, ...r.test]) downstreamIds.add(id);
let orphanCount = 0;
for (const id of downstreamIds) {
  if (!isDownstream(id)) continue; // only scrutinize realizing/test ids
  if (!registry.has(id)) { err(`FABRICATED/UNREGISTERED: ${id} appears in the matrix but is NOT in ID_REGISTRY — a chain cannot rest on an id that does not exist.`); orphanCount++; continue; }
  if (!reachesUpstream(id)) { err(`ORPHAN (downstream→upstream): ${id} traces to no upstream ${cfg.upstream_prefixes.join('/')} — unrequested scope.`); orphanCount++; }
}
if (!orphanCount) ok(`downstream→upstream: all ${downstreamIds.size} downstream ids exist and trace to upstream intent.`);

// ── (b) upstream → downstream: no dropped requirement ────────────────────────────
// Every confirmed requirement row (product/flow names an FR/NFR/FLOW/DEC or a business-rule BR) needs >=1
// realizing op AND >=1 REAL (registered) test in the SAME row. A release-critical gap is a BROKEN CHAIN
// (exit 1). A DEFERRED/RISK gap is allowed ONLY if the row links a DEC/RISK justification — otherwise it is
// a silent drop and fails too (that was a false-green hole: writing "DEFERRED" dropped a requirement).
const requirementPrefixes = [...cfg.upstream_prefixes, ...cfg.rule_prefixes];
const realizing = (r) => [...r.page, ...r.api].some(isRealizingId);
const tested    = (r) => r.test.some(isTestId);
const justified = (r, ups) => {
  const rowIds = [...r.product, ...r.flow, ...r.page, ...r.api, ...r.test];
  if (rowIds.some(id => inSet(id, cfg.justification_prefixes))) return true;
  return ups.some(u => { const e = registry.get(u); return e && e.sources.some(s => inSet(s, cfg.justification_prefixes)); });
};
let brokenCritical = 0, brokenNoncritical = 0;
for (const r of matrixRows) {
  const ups = [...r.product, ...r.flow].filter(id => inSet(id, requirementPrefixes));
  if (!ups.length) continue;
  if (!cfg.confirmed_statuses.includes(r.status)) continue; // unconfirmed rows are not yet a chain
  for (const id of r.test) if (inSet(id, cfg.test_prefixes) && !registry.has(id))
    err(`row ${ups.join(',')} cites test ${id} that is NOT in ID_REGISTRY — fabricated coverage, not a real test.`);
  const hasReal = realizing(r), hasTest = tested(r);
  if (hasReal && hasTest) { ok(`chain OK: ${ups.join(',')} → realizing + test (status ${r.status}).`); continue; }
  const gaps = [];
  if (!hasReal) gaps.push(`no realizing op`);
  if (!hasTest) gaps.push(`no real ${cfg.test_prefixes.join('/')}`);
  const msg = `BROKEN CHAIN (upstream→downstream): ${ups.join(',')} → ${gaps.join(' AND ')} (status ${r.status}).`;
  if (cfg.release_critical_statuses.includes(r.status)) { err(msg + ' Release-critical: gate cannot pass.'); brokenCritical++; }
  else if (r.status === 'PLANNED') { warn(`chain pending: ${ups.join(',')} is PLANNED (confirmed, not yet built) — fine during PLAN..BUILD; must resolve to OK/DEFERRED/RISK before SHIP (gate 14).`); brokenNoncritical++; }
  else if (!justified(r, ups)) { err(msg + ` Status ${r.status} drops a requirement WITHOUT a ${cfg.justification_prefixes.join('/')} link — silent drop, not allowed.`); brokenCritical++; }
  else { warn(msg + ` Status ${r.status}, justified by a ${cfg.justification_prefixes.join('/')} link — recorded, not a hard fail.`); brokenNoncritical++; }
}
if (!brokenCritical && !brokenNoncritical) ok('upstream→downstream: every confirmed requirement has a realizing op + a real test.');

// ── Cross-check: registry FRs that never appear as a matrix row at all ──────────────────
for (const [id] of registry) {
  if (!inSet(id, ['FR'])) continue;
  const appears = matrixRows.some(r => r.product.includes(id) || r.flow.includes(id));
  if (!appears) warn(`FR ${id} is in ID_REGISTRY but has NO row in the traceability matrix — untraced requirement.`);
}

die();
