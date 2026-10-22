#!/usr/bin/env node
// orchestrator/process/reconcile.mjs  (skill template — copied into each project)
// Executable gate / drift detector for the product-to-code-orchestrator control artifacts.
// Validates the manifest, checks build-claims against git+fs reality on the work branch, enforces the
// blocking-consistency rule, and flags staleness vs the decision log. Exit 0=clean, 1=drift, 2=missing.
//
// Required per-project config: orchestrator/process/reconcile.config.json
//   { "work_branch": "feat/x", "receipt_policy": "required",
//     "program_completion_required": false, "probes": [] }
// Missing/legacy receipt policy or a missing topology classification fails closed. `init-project.sh`
// creates the config; projects add probes whose stage IDs and paths come from their current manifest.
// --profile quick --read-only: deterministic control audit, never a full verification claim.
// --profile full (default): also runs project lesson commands and applicable live verification.
// --read-only prohibits telemetry writes and all entry points that can run project commands.

import { readFileSync, existsSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { tallyLessonStats } from './lessons-stats.mjs';
import { neverFiredFindings, selfRefFindings, quarantineFindings, computeMetrics, parseLedgerRules, buildReuseCandidate, buildLessonObservation, lessonLifecycleFindings, partitionEvolutionEvents, emitDeadLetterWarn } from './evolution-guards.mjs';
import { runAllAntiChecks } from './anti-check.mjs';
import { readNewEvents, archiveConsumed } from './run-events.mjs';
import { appendJsonlUnique } from './lessonctl.mjs';
import { auditReviewReceipts } from './reviewctl.mjs';
import { auditFrontendReceipts } from './frontend-validation.mjs';
import { auditGovernance, governanceDebtReport } from './governance-guard.mjs';
import { auditAutonomy, auditWatchdog } from './autonomy-guard.mjs';
import { auditResearchGates } from './research-gate.mjs';
import { auditDeliveryPhase } from './delivery-phase.mjs';
import { runLessonChecks } from './lesson-runner.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const CONFIG = resolve(HERE, 'reconcile.config.json');

const VALID_STATUS = ['not-started','draft','needs-user-confirmation','blocked','passed','compact','accepted-risk','invalidated'];
const VALID_GATE_STATUS = ['not-run', 'pass', 'fail', 'accepted-risk'];
const CONCISE = process.argv.includes('--concise');
const READ_ONLY = process.argv.includes('--read-only');
const CONSOLIDATE = process.argv.includes('--consolidate');
const ANTI_CHECK = process.argv.includes('--anti-check');
const args = process.argv.slice(2);
let PROFILE = 'full';
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--profile') PROFILE = args[++index];
  else if (arg.startsWith('--profile=')) PROFILE = arg.slice('--profile='.length);
  else if (!['--concise', '--read-only', '--consolidate', '--anti-check'].includes(arg)) {
    console.error(`Unknown reconcile option: ${arg}`);
    process.exit(2);
  }
}
if (!['quick', 'full'].includes(PROFILE)) {
  console.error('reconcile --profile must be quick or full (default: full).');
  process.exit(2);
}
if ((READ_ONLY || PROFILE === 'quick') && (CONSOLIDATE || ANTI_CHECK)) {
  console.error('quick/read-only audit cannot run --consolidate or --anti-check: these operations write project state.');
  process.exit(2);
}
const RUN_EXECUTABLE_CHECKS = PROFILE === 'full' && !READ_ONLY;
const AUDIT_ONLY = !RUN_EXECUTABLE_CHECKS;
// Even Git's optional index refresh must not write during a read-only control audit.
if (AUDIT_ONLY) process.env.GIT_OPTIONAL_LOCKS = '0';
const skippedChecks = AUDIT_ONLY
  ? ['project lesson commands', 'asset example execution', 'program fresh verification and execution-record updates']
  : [];
const COMPACT_DESIGN_NOTES = 'skipped-by-DEC-000 (class S); compact DESIGN stays inside PRODUCT_SPEC.md';

// control_root (optional, repo-relative): directory holding the control artifacts (manifest, logs,
// registry). Defaults to the orchestrator/ folder (the standard layout) so existing projects keep working.
let cfg = { work_branch: null, probes: [], control_root: null };
let configReadError = null;
if (existsSync(CONFIG)) {
  try {
    cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) };
    if (cfg.receipt_policy != null && !['legacy', 'required'].includes(cfg.receipt_policy))
      throw new Error(`receipt_policy=${JSON.stringify(cfg.receipt_policy)} is not legacy|required`);
    if (cfg.program_completion_required != null && typeof cfg.program_completion_required !== 'boolean')
      throw new Error('program_completion_required 必须是 boolean');
    if (cfg.lessons != null && !Array.isArray(cfg.lessons))
      throw new Error('lessons 必须是数组');
  } catch (e) {
    configReadError = e.message;
  }
}
if (!configReadError && cfg.receipt_policy !== 'required') {
  configReadError =
    `receipt_policy=${JSON.stringify(cfg.receipt_policy ?? '(missing)')} is not required; ` +
    'legacy/unconfigured projects are fail-closed — run strict-receipts-migrate.mjs apply';
}
if (
  !configReadError &&
  cfg.receipt_policy === 'required' &&
  typeof cfg.program_completion_required !== 'boolean'
) {
  configReadError =
    'program_completion_required 必须显式为 boolean：single=false，multi=true；' +
    '不得用缺字段默认跳过跨项目完成门';
}

const CONTROL_ROOT = cfg.control_root ? resolve(REPO, cfg.control_root) : ORCH;
const MANIFEST = resolve(CONTROL_ROOT, 'ARTIFACT_MANIFEST.yaml');
const DECLOG = resolve(CONTROL_ROOT, 'DECISION_LOG.md');

const findings = [];
const err  = (m) => findings.push({ level: 'ERROR', m });
const warn = (m) => findings.push({ level: 'WARN',  m });
const ok   = (m) => findings.push({ level: 'OK',    m });
if (configReadError) err(`reconcile.config.json invalid — refusing legacy fallback: ${configReadError}`);

const deliveryState = auditDeliveryPhase(REPO);
{
  if (!deliveryState.ok) {
    for (const message of deliveryState.errors) err(`delivery phase: ${message}`);
  } else {
    ok(`delivery phase: ${deliveryState.phase} (${deliveryState.source})`);
  }
}

function die(code) {
  const order = { ERROR: 0, WARN: 1, OK: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  if (AUDIT_ONLY) {
    console.log(`Coverage: ${PROFILE}${READ_ONLY ? ' read-only' : ''} control audit only; full verification NOT RUN (incomplete coverage).`);
    console.log(`Skipped: ${skippedChecks.join('; ')}. Run an authorized \`reconcile.mjs --profile full\` for executable checks.`);
  }
  if (CONCISE) {
    const errs = findings.filter(f => f.level === 'ERROR').length;
    const warns = findings.filter(f => f.level === 'WARN').length;
    const oks = findings.filter(f => f.level === 'OK').length;
    if (!errs && !warns) {
      console.log(`✓ reconcile clean — ${oks} check(s)${AUDIT_ONLY ? '; control audit only' : ''}.`);
      process.exit(code ?? 0);
    }
    if (!errs) {
      const warnings = findings.filter(f => f.level === 'WARN');
      const limit = 3;
      console.log(`! reconcile completed with warnings — ${warns} warning(s), ${oks} check(s).`);
      for (const finding of warnings.slice(0, limit)) {
        const oneLine = String(finding.m).replace(/\s+/g, ' ').trim();
        const clipped = oneLine.length > 360 ? `${oneLine.slice(0, 359)}…` : oneLine;
        console.log(`  ! ${clipped}`);
      }
      if (warnings.length > limit) console.log(`  … ${warnings.length - limit} more warning(s) omitted.`);
      console.log('Run `node orchestrator/process/reconcile.mjs` for the full report.');
      process.exit(code ?? 0);
    }
    const errors = findings.filter(f => f.level === 'ERROR');
    const limit = 5;
    console.log(`✗ reconcile failed — ${errs} error(s), ${warns} warning(s).`);
    for (const finding of errors.slice(0, limit)) {
      const oneLine = String(finding.m).replace(/\s+/g, ' ').trim();
      const clipped = oneLine.length > 360 ? `${oneLine.slice(0, 359)}…` : oneLine;
      console.log(`  ✗ ${clipped}`);
    }
    if (errors.length > limit) console.log(`  … ${errors.length - limit} more error(s) omitted.`);
    console.log('Run `node orchestrator/process/reconcile.mjs` for the full report.');
    process.exit(code ?? 1);
  }
  const icon = { ERROR: '✗', WARN: '!', OK: '✓' };
  console.log('\n── orchestrator reconcile ─────────────────────────────');
  for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
  const errs = findings.filter(f => f.level === 'ERROR').length;
  const warns = findings.filter(f => f.level === 'WARN').length;
  console.log('───────────────────────────────────────────────────────');
  console.log(`${errs} error(s), ${warns} warning(s).`);
  console.log(errs ? '✗ DRIFT: manifest does not reconcile with reality.' : AUDIT_ONLY ? '✓ Control audit passed; full verification remains unperformed.' : '✓ Manifest reconciles with reality.');
  process.exit(code ?? (errs ? 1 : 0));
}

const REQUIRED = ['ARTIFACT_MANIFEST.yaml','DECISION_LOG.md'];
for (const f of REQUIRED) {
  if (existsSync(resolve(CONTROL_ROOT, f))) ok(`required artifact present: ${f}`);
  else err(`required control artifact MISSING: ${f} (control root: ${CONTROL_ROOT})`);
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
function splitInlineMap(body, stageId) {
  const tokens = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (quote === '"' && char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[' || char === '{' || char === '(') {
      depth += 1;
      continue;
    }
    if (char === ']' || char === '}' || char === ')') {
      if (depth === 0) err(`stage ${stageId}: malformed inline object`);
      else depth -= 1;
      continue;
    }
    if (char === ',' && depth === 0) {
      tokens.push(body.slice(start, index));
      start = index + 1;
    }
  }
  if (quote || escaped || depth !== 0) err(`stage ${stageId}: malformed inline object`);
  tokens.push(body.slice(start));
  return tokens;
}

{
  let inStages = false, cur = null;
  for (const line of text.split('\n')) {
    if (/^stages:\s*$/.test(line)) { inStages = true; continue; }
    if (!inStages) continue;
    if (/^[a-z_]+:\s*$/.test(line)) break;
    // inline-map form: `  "id": { status: "x", gate_status: "y", ... }` (one line)
    const inline = line.match(/^  "([^"]+)":\s*\{(.*)\}\s*$/);
    if (inline) {
      if (Object.hasOwn(stages, inline[1])) {
        err(`duplicate stage key "${inline[1]}"`);
        cur = null;
        continue;
      }
      const fields = splitInlineMap(inline[2], inline[1]).flatMap((token) => {
        const match = token.match(
          /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*([\s\S]*?)\s*$/,
        );
        if (!match) {
          err(`stage ${inline[1]}: malformed inline field`);
          return [];
        }
        return [{ key: match[1], rawValue: match[2] }];
      });
      const valuesFor = (key) => fields
        .filter((field) => field.key === key)
        .map((field) => {
          const match = field.rawValue.match(
            /^(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))$/,
          );
          return match ? (match[1] || match[2] || match[3]) : null;
        });
      const scalarFor = (key) => {
        const matches = fields.filter((field) => field.key === key);
        if (matches.length !== 1) return null;
        const raw = matches[0].rawValue;
        const quoted = raw.match(/^(?:"([^"]*)"|'([^']*)')$/);
        if (quoted) return quoted[1] ?? quoted[2];
        return /^[^,#\s]+$/.test(raw) ? raw : null;
      };
      const statuses = valuesFor('status');
      const gateStatuses = valuesFor('gate_status');
      const statusKeyCount = statuses.length;
      const gateStatusKeyCount = gateStatuses.length;
      if (statusKeyCount > 1) err(`stage ${inline[1]}: duplicate inline status keys`);
      if (gateStatusKeyCount > 1) err(`stage ${inline[1]}: duplicate inline gate_status keys`);
      if (statusKeyCount === 1 && statuses[0] === null)
        err(`stage ${inline[1]}: inline status has an empty or unsupported value`);
      if (gateStatusKeyCount === 1 && gateStatuses[0] === null)
        err(`stage ${inline[1]}: inline gate_status has an empty or unsupported value`);
      const st = statuses[0] || null;
      const gs = gateStatuses[0] || null;
      stages[inline[1]] = {
        status: st,
        gate_status: gs,
        gate: scalarFor('gate'),
        notes: scalarFor('notes'),
        _status_seen: statusKeyCount > 0,
        _gate_status_seen: gateStatusKeyCount > 0,
      };
      cur = null;
      continue;
    }
    // block form: `  "id":` then indented `status:` / `gate_status:` lines
    const head = line.match(/^  "([^"]+)":\s*(?:#.*)?$/);
    if (head) {
      if (Object.hasOwn(stages, head[1])) {
        err(`duplicate stage key "${head[1]}"`);
        cur = null;
        continue;
      }
      cur = head[1];
      stages[cur] = {
        status: null,
        gate_status: null,
        gate: null,
        notes: null,
        _status_seen: false,
        _gate_status_seen: false,
      };
      continue;
    }
    const unsupportedStage = line.match(/^  "([^"]+)":\s*(.+?)\s*$/);
    if (unsupportedStage) {
      if (Object.hasOwn(stages, unsupportedStage[1])) {
        err(`duplicate stage key "${unsupportedStage[1]}"`);
      } else {
        stages[unsupportedStage[1]] = {
          status: null,
          gate_status: null,
          gate: null,
          notes: null,
          _status_seen: false,
          _gate_status_seen: false,
        };
        err(`stage ${unsupportedStage[1]} must use a block or inline object`);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (/^    status\s*:/.test(line)) {
      if (stages[cur]._status_seen) err(`stage ${cur}: duplicate block status keys`);
      stages[cur]._status_seen = true;
      const st = line.match(/^    status\s*:\s*(?:"([\w-]+)"|([\w-]+))\s*(?:#.*)?$/);
      if (st) stages[cur].status = st[1] || st[2];
      else err(`stage ${cur}: block status has an empty or unsupported value`);
      continue;
    }
    if (/^    gate_status\s*:/.test(line)) {
      if (stages[cur]._gate_status_seen) err(`stage ${cur}: duplicate block gate_status keys`);
      stages[cur]._gate_status_seen = true;
      const gs = line.match(
        /^    gate_status\s*:\s*(?:"([\w-]+)"|([\w-]+))\s*(?:#.*)?$/,
      );
      if (gs) stages[cur].gate_status = gs[1] || gs[2];
      else err(`stage ${cur}: block gate_status has an empty or unsupported value`);
      continue;
    }
    if (/^    gate\s*:/.test(line)) {
      const gate = line.match(/^    gate\s*:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))\s*(?:#.*)?$/);
      if (gate) stages[cur].gate = gate[1] || gate[2] || gate[3];
      continue;
    }
    if (/^    notes\s*:/.test(line)) {
      const notes = line.match(/^    notes\s*:\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/);
      if (notes) stages[cur].notes = (notes[1] ?? notes[2] ?? notes[3] ?? '').trim();
    }
  }
}

// Product authorization is distinct from process authorization. These hard guards reject
// REV-ADD laundering, unledgered runtime/trust-boundary growth, fake L2 claims, and no-progress churn.
let governanceErrors = [], autonomyErrors = [], watchdogErrors = [];
try { governanceErrors = auditGovernance(REPO, { scope: 'active' }); } catch (error) { governanceErrors = [`audit crashed: ${error.message}`]; }
try { autonomyErrors = auditAutonomy(REPO); } catch (error) { autonomyErrors = [`audit crashed: ${error.message}`]; }
try { watchdogErrors = auditWatchdog(REPO, { scope: 'active' }); } catch (error) { watchdogErrors = [`audit crashed: ${error.message}`]; }
for (const message of governanceErrors) err(`governance: ${message}`);
for (const message of autonomyErrors) err(`autonomy preflight: ${message}`);
for (const message of watchdogErrors) err(`delivery watchdog: ${message}`);
if (!governanceErrors.length) ok('governance-guard: scope authorization + complexity budget clean.');
try { for (const debt of governanceDebtReport(REPO)) warn(`governance debt: ${debt}`); }
catch (error) { warn(`governance debt report unavailable: ${error.message}`); }
if (!autonomyErrors.length && !watchdogErrors.length) ok('autonomy-guard: execution claim + delivery progress clean.');
const stageIds = Object.keys(stages);
if (stageIds.length) ok(`parsed ${stageIds.length} stages`);
else if (/^stages:\s*$/m.test(text) && /^\s*-\s+id:\s*/m.test(text))
  err('manifest uses the legacy LIST-of-stages form (`stages:` then `- id:`). Canonical is a MAP of stage-id keys (`stages:` then `  "<stage-id>":` at 2-space indent). reconcile parses ZERO stages from the list form, so its drift/consistency checks silently no-op. Convert it — see templates/ARTIFACT_MANIFEST_TEMPLATE.yaml.');
else err('could not parse any stages (format changed?)');

const CANONICAL_STAGE_IDS = ['1-plan', '2-contract', '3-design', '4-build', '5-ship'];
for (const id of CANONICAL_STAGE_IDS) {
  if (!Object.hasOwn(stages, id)) {
    err(`canonical stage "${id}" is missing — stage IDs are enforcement keys and cannot be renamed`);
  }
}

for (const [id, s] of Object.entries(stages)) {
  if (!s.status) err(`stage ${id}: required status is missing`);
  else if (!VALID_STATUS.includes(s.status)) err(`stage ${id}: invalid status "${s.status}"`);
  if (s.gate_status && !VALID_GATE_STATUS.includes(s.gate_status))
    err(`stage ${id}: invalid gate_status "${s.gate_status}"`);
}

// A stage marked passed whose gate never ran is exactly the laundering this tool exists to catch.
for (const [id, s] of Object.entries(stages))
  if (s.status === 'passed' && s.gate_status !== 'pass')
    err(`stage ${id} is "passed" but gate_status is "${s.gate_status ?? 'unset'}" — a stage cannot pass a gate that never ran (run the gate, record the result).`);

// `compact` is a physical S-class representation, not a softer spelling of risk acceptance.
// Keep the capability narrow and exact so a model cannot use it to skip arbitrary stages/gates.
const compactDesignBlock = (
  text.match(/\n  "3-design":\n([\s\S]*?)(?=\n  "4-build":)/)?.[1] ?? ''
);
const compactDesignNotes = compactDesignBlock.match(/^    notes:\s*"([^"]*)"\s*$/m)?.[1] ?? null;
const scaleClass = text.match(/^scale_class:\s*"?([SML])"?\s*$/m)?.[1] ?? null;
const decisionLogText = existsSync(DECLOG) ? readFileSync(DECLOG, 'utf8') : '';
const decisionBlocks = new Map();
for (const match of decisionLogText.matchAll(/(?:^|\n)ID:\s*(DEC-[A-Za-z0-9_-]+)\s*\n([\s\S]*?)(?=\n(?:ID:\s*DEC-|```)|$)/g)) {
  const entries = decisionBlocks.get(match[1]) ?? [];
  entries.push(match[2]);
  decisionBlocks.set(match[1], entries);
}
const compactDecisionBlock = (
  decisionLogText.match(/(?:^|\n)ID:\s*DEC-000\s*\n([\s\S]*?)(?=\n(?:ID:\s*DEC-|```)|$)/)?.[1] ?? ''
);
const compactDecisionIsLegal = (
  /^Owner:\s*user\s*$/m.test(compactDecisionBlock) &&
  /^Status:\s*active\s*$/m.test(compactDecisionBlock) &&
  /^Decision:.*Scale triage class = S(?:;|\.|\s|$)/m.test(compactDecisionBlock)
);
const compactDesignIsLegal = (
  stages['3-design']?.status === 'compact' &&
  stages['3-design']?.gate_status === 'not-run' &&
  scaleClass === 'S' &&
  compactDesignNotes === COMPACT_DESIGN_NOTES &&
  compactDecisionIsLegal
);
for (const [id, stage] of Object.entries(stages)) {
  if (stage.status !== 'compact') continue;
  if (id !== '3-design') {
    err(`stage ${id}: compact is only valid for 3-design in a scale_class S project under DEC-000`);
    continue;
  }
  if (scaleClass !== 'S') err(`stage 3-design: compact requires exact scale_class S (found ${scaleClass ?? 'unset'})`);
  if (stage.gate_status !== 'not-run') err(`stage 3-design: compact requires gate_status not-run (found ${stage.gate_status ?? 'unset'})`);
  if (compactDesignNotes !== COMPACT_DESIGN_NOTES)
    err(`stage 3-design: compact notes must be exactly "${COMPACT_DESIGN_NOTES}"`);
  if (!compactDecisionIsLegal)
    err('stage 3-design: compact requires active user-owned DEC-000 with exact Scale triage class = S');
}

// accepted-risk is evidence of a failed, actually attempted gate plus an explicit user decision.
// It is never a synonym for `passed`, and a prose note cannot manufacture the authority.
const decisionField = (block, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim() ?? null;
};
const meaningfulDecisionField = (block, label) => {
  const value = decisionField(block, label);
  return Boolean(value && !/^(?:none|n\/?a|tbd|todo|待定|<[^>]+>)$/i.test(value));
};
for (const [id, stage] of Object.entries(stages)) {
  const hasAcceptedRisk = stage.status === 'accepted-risk' || stage.gate_status === 'accepted-risk';
  if (!hasAcceptedRisk) continue;
  if (stage.status !== 'accepted-risk' || stage.gate_status !== 'accepted-risk') {
    err(`stage ${id}: accepted-risk requires both status and gate_status to be "accepted-risk" after an attempted gate`);
  }
  const decisionId = stage.notes?.match(/(?:^|;\s*)accepted-risk:\s*(DEC-[A-Za-z0-9_-]+)(?:\s*;|$)/i)?.[1] ?? null;
  if (!decisionId) {
    err(`stage ${id}: accepted-risk notes must bind exactly one decision as "accepted-risk: DEC-NNN"`);
    continue;
  }
  const blocks = decisionBlocks.get(decisionId) ?? [];
  if (blocks.length !== 1) {
    err(`stage ${id}: accepted-risk ${decisionId} must resolve to exactly one Decision Log entry`);
    continue;
  }
  const block = blocks[0];
  if (!new RegExp(`^Stage:\\s*${id}(?:\\s|$)`, 'm').test(block))
    err(`stage ${id}: accepted-risk ${decisionId} must be bound to this exact stage`);
  if (!/^Type:\s*accepted-risk\s*$/m.test(block))
    err(`stage ${id}: accepted-risk ${decisionId} requires Type: accepted-risk`);
  if (!/^Owner:\s*user\s*$/m.test(block))
    err(`stage ${id}: accepted-risk ${decisionId} requires Owner: user (agent-owned decisions cannot accept product risk)`);
  if (!/^Status:\s*active\s*$/m.test(block))
    err(`stage ${id}: accepted-risk ${decisionId} requires Status: active`);
  for (const label of ['Violation', 'Why needed', 'Simpler alternative rejected because']) {
    if (!meaningfulDecisionField(block, label))
      err(`stage ${id}: accepted-risk ${decisionId} requires explicit "${label}:" evidence`);
  }
  const attemptedGate = decisionField(block, 'Gate-Attempt');
  if (!stage.gate || attemptedGate !== stage.gate)
    err(`stage ${id}: accepted-risk ${decisionId} Gate-Attempt must exactly match manifest gate "${stage.gate ?? 'unset'}"`);
  const evidenceRef = decisionField(block, 'Gate-Evidence');
  let evidenceIsReal = false;
  if (evidenceRef && !/^(?:none|n\/?a|tbd|todo|待定|<[^>]+>)$/i.test(evidenceRef)) {
    const evidencePath = resolve(REPO, evidenceRef);
    const fromRoot = relative(REPO, evidencePath);
    if (!fromRoot.startsWith('..') && existsSync(evidencePath)) {
      try {
        const evidenceStat = statSync(evidencePath);
        evidenceIsReal = evidenceStat.isFile() && evidenceStat.size > 0;
      }
      catch { evidenceIsReal = false; }
    }
  }
  if (!evidenceIsReal)
    err(`stage ${id}: accepted-risk ${decisionId} requires an existing non-empty repo-relative Gate-Evidence file proving the gate was attempted`);
}

// S may declare the compact DESIGN representation during PLAN, so a fresh init remains valid.
// Once CONTRACT is approved, BUILD is dependency-eligible and compact DESIGN must be real, not
// a placeholder: one filled IA row plus an implementation-usable interaction sketch are required.
const contractApproved = (
  ['passed', 'accepted-risk'].includes(stages['2-contract']?.status ?? '') &&
  ['pass', 'accepted-risk'].includes(stages['2-contract']?.gate_status ?? '')
);
if (compactDesignIsLegal && contractApproved) {
  const productSpecPath = resolve(REPO, 'PRODUCT_SPEC.md');
  let iaSection = '';
  if (existsSync(productSpecPath)) {
    const productSpec = readFileSync(productSpecPath, 'utf8');
    iaSection = productSpec.match(/^##\s+7\.\s+[^\n]*\bIA\b[^\n]*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/mi)?.[1] ?? '';
  }
  const placeholder = (value) => {
    const normalized = value?.trim().replace(/^`|`$/g, '') ?? '';
    return !normalized || /^(?:-|—|none|n\/?a|tbd|todo|待定|<[^>]+>)$/i.test(normalized);
  };
  const hasFilledIa = iaSection.split('\n').some((line) => {
    if (!/^\s*\|/.test(line) || !/IA-[A-Za-z0-9_-]+/.test(line)) return false;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/`/g, '').trim());
    return cells.length >= 5 && /^IA-[A-Za-z0-9_-]+$/.test(cells[0]) && cells.slice(1, 5).every((cell) => !placeholder(cell));
  });
  const sketches = [...iaSection.matchAll(/^\s*-?\s*(?:Compact sketch|页面草图|交互草图)\s*[:：]\s*(.+?)\s*$/gim)]
    .map((match) => match[1].trim());
  if (!hasFilledIa)
    err('stage 3-design: compact DESIGN became downstream-eligible but PRODUCT_SPEC.md lacks a filled IA row (entry, user action, FLOW, and empty/error next step)');
  if (!sketches.some((sketch) => !placeholder(sketch)))
    err('stage 3-design: compact DESIGN became downstream-eligible but PRODUCT_SPEC.md lacks a concrete Compact sketch / 页面草图 / 交互草图');
}

// v3 sequence guard: no DESIGN/BUILD work before the contract stage actually passed its gate
// (machine form of stage-router's precondition — prose alone was bypassable).
{
  const contract = stages['2-contract'];
  if (contract) for (const dn of ['3-design', '4-build', '5-ship']) {
    const st = stages[dn]?.status;
    const compactScaleSkip = dn === '3-design' && compactDesignIsLegal;
    if (st && st !== 'not-started' && !compactScaleSkip && !['passed', 'accepted-risk'].includes(contract.status ?? ''))
      err(`stage ${dn} has started (status "${st}") but 2-contract is "${contract.status ?? 'unset'}" — no UI/build against an unapproved contract (v3 Contract-First).`);
  }
}

// CHANGE_IMPACT.md is conditional by design (docs/change-control: created when an approved artifact
// changes). Its absence on a fresh project is fine; once any stage is invalidated it becomes required.
{
  const CHANGE_IMPACT = resolve(CONTROL_ROOT, 'CHANGE_IMPACT.md');
  // invalidated_by is non-empty when: inline list with content (`invalidated_by: ["03-x"]`) or a
  // block list (`invalidated_by:` newline `  - ...`). Same-line-only matching — `\s` would cross
  // into the next key on empty block form and misfire on `notes:`.
  const hasInvalidation = Object.values(stages).some(s => s.status === 'invalidated')
    || /invalidated_by:[ \t]*\[[ \t]*["'A-Za-z0-9]/.test(text)
    || /invalidated_by:[ \t]*\r?\n[ \t]+-[ \t]/.test(text);
  if (existsSync(CHANGE_IMPACT)) ok('CHANGE_IMPACT.md present');
  else if (hasInvalidation) err('stages carry invalidated state but orchestrator/CHANGE_IMPACT.md is MISSING — record the change impact before reworking downstream.');
  else ok('CHANGE_IMPACT.md absent — OK (no invalidations yet; it is created on the first approved-artifact change)');
}

const cgStatus = (text.match(/^consistency_gate:\s*\n\s*status:\s*"?([\w-]+)"?/m) || [])[1];
const blocksBlock = (text.match(/blocks:\s*\[([^\]]*)\]/) || [])[1] || '';
const blocked = blocksBlock.split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean);

// Executable consistency check: do NOT trust the self-filled consistency_gate.status flag alone.
// Run orphan-scan.mjs (bidirectional trace computation over ID_REGISTRY + TRACEABILITY_MATRIX) and
// fold its verdict in. If its control artifacts are present and it computes a broken release-critical
// chain (exit 1), that is drift even if the manifest claims consistency_gate.status: pass.
const ORPHAN = resolve(HERE, 'orphan-scan.mjs');
let scanCode = null;
const ID_REGISTRY = resolve(CONTROL_ROOT, 'ID_REGISTRY.md');
const TRACEABILITY = resolve(CONTROL_ROOT, 'TRACEABILITY_MATRIX.md');
if (existsSync(ID_REGISTRY) !== existsSync(TRACEABILITY)) {
  err('traceability is partially activated: ID_REGISTRY.md and TRACEABILITY_MATRIX.md must appear together.');
} else if (!existsSync(ID_REGISTRY)) {
  ok('traceability inactive — buildout uses code, tests, Git, and the current task as evidence.');
} else if (existsSync(ORPHAN)) {
  // spawnSync (argv array, not a shell string) so an install path containing a space can't word-split
  // into a spurious module-not-found that reconcile would misreport as DRIFT.
  const r = spawnSync('node', [ORPHAN], { cwd: REPO, stdio: 'ignore' });
  if (r.error) { warn(`orphan-scan.mjs could not be spawned (${r.error.message}) — consistency falls back to the self-attested flag.`); scanCode = null; }
  else scanCode = r.status;
  if (scanCode === null) { /* spawn failed; warned above */ }
  else if (scanCode === 0) ok('orphan-scan.mjs: bidirectional trace clean (computed, not attested).');
  else if (scanCode === 2) warn('orphan-scan.mjs: control artifacts missing/unreadable — run it standalone to see why.');
  else {
    err('orphan-scan.mjs computed a broken/non-canonical trace chain (exit 1). Run `node orchestrator/process/orphan-scan.mjs` for the failing rows. This OVERRIDES a self-attested consistency_gate.status: pass.');
    if (cgStatus !== 'fail') err(`consistency_gate.status is "${cgStatus ?? 'unset'}" but orphan-scan FAILED — the flag is laundering a broken chain. Set status: fail and list the blocked stage(s).`);
  }
} else {
  warn('orphan-scan.mjs not found beside reconcile.mjs — falling back to the self-attested consistency_gate flag only.');
}

// asset-check.mjs (sibling executable). The reuse-asset library has its own integrity gate:
// frontmatter required-fields, ASSET_INDEX↔card consistency (drift), candidate≠active, and
// license fail-closed. Fold its verdict in. Per "full done right" §6 this is WARN-biased: a hard
// ERROR here would let an asset-library hygiene issue block an unrelated project's reconcile, so
// we WARN-surface asset-check's exit 1 rather than exit 1 from reconcile on its behalf.
const ASSET_CHECK = resolve(HERE, 'asset-check.mjs');
if (existsSync(ASSET_CHECK)) {
  const r = spawnSync(process.execPath, [ASSET_CHECK, ...(AUDIT_ONLY ? ['--static'] : [])], { cwd: REPO, stdio: 'ignore' });
  if (r.error) warn(`asset-check.mjs could not be spawned (${r.error.message}).`);
  else if (r.status === 0) ok(`asset-check.mjs: reuse-asset library ${AUDIT_ONLY ? 'static ' : ''}integrity clean.`);
  else warn(`asset-check.mjs reported asset-library drift (exit ${r.status}). Run \`node orchestrator/process/asset-check.mjs\` for details. (WARN-biased: does not block reconcile.)`);
} else {
  warn('asset-check.mjs not found beside reconcile.mjs — asset-library integrity unchecked.');
}

// boundary-scan.mjs (sibling executable). Physical-architecture guard — SYSTEM_ARCHITECTURE.md made
// executable. ERROR-biased like orphan-scan: a NEW structural violation past the ratchet baseline is
// drift and must block. Self-skips (exit 0) when there is no boundaries.config.json (S-class / not yet
// configured), so this wire is safe to keep on every project.
const BOUNDARY_SCAN = resolve(HERE, 'boundary-scan.mjs');
if (existsSync(BOUNDARY_SCAN)) {
  const r = spawnSync('node', [BOUNDARY_SCAN, '--quiet'], { cwd: REPO, stdio: 'ignore' });
  if (r.error) warn(`boundary-scan.mjs could not be spawned (${r.error.message}).`);
  else if (r.status === 0) ok('boundary-scan.mjs: no NEW physical-architecture violation (or guard not configured).');
  else err('boundary-scan.mjs found NEW structural violation(s) past baseline (exit 1). Run `node orchestrator/process/boundary-scan.mjs` for the offending files; after an intentional refactor, `--update-baseline` (with a DEC). Rules: orchestrator/SYSTEM_ARCHITECTURE.md.');
}

// backlog-health.mjs (sibling executable). BACKLOG hygiene guard (size / line-length / completed-row
// bloat). Two-tier wire: exit 1 (over hard limit) stays WARN-biased like asset-check — hygiene debt,
// doesn't block unrelated work. exit 2 (RUNAWAY: >2× hard limit) is an ERROR — a ledger that big taxes
// EVERY session's context and edits, so "unrelated work" no longer exists; and the mechanical fix is one
// command (backlog-compact.mjs), so blocking is cheap to satisfy.
const BACKLOG_HEALTH = resolve(HERE, 'backlog-health.mjs');
if (existsSync(BACKLOG_HEALTH)) {
  const r = spawnSync(process.execPath, [BACKLOG_HEALTH, '--json'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (r.error) warn(`backlog-health.mjs could not be spawned (${r.error.message}).`);
  else {
    if (r.status === 2) err('backlog-health.mjs: BACKLOG RUNAWAY (exit 2, >2× hard limit) — compact the ledger before further work.');
    try {
      const report = JSON.parse(r.stdout);
      const issues = (report.findings ?? []).filter(finding => finding.level !== 'OK');
      for (const finding of issues) warn(`backlog-health.mjs: ${finding.m}`);
      if (!issues.length && r.status === 0) ok('backlog-health.mjs: BACKLOG within size/line limits (or absent).');
      else if (!issues.length && r.status !== 2) warn(`backlog-health.mjs reported an incomplete audit (exit ${r.status}).`);
    } catch {
      warn(`backlog-health.mjs: audit output unreadable (exit ${r.status}); run it standalone for details.`);
    }
  }
}

// Review/acceptance receipts are the CI backstop for edits that bypass taskctl or the optional
// editor hook. Every project is fail-closed: legacy/missing receipt_policy is a migration error,
// while receipt_policy=required additionally rejects missing columns, stale hashes, or forged state.
{
  const BACKLOG = resolve(REPO, 'BACKLOG.md');
  if (!existsSync(BACKLOG)) {
    warn('BACKLOG.md absent — review/frontend receipt audit skipped.');
  } else {
    if (deliveryState.phase === 'buildout') {
      ok('buildout: formal review inactive; delivery-phase audit keeps the active queue review-free.');
    } else {
      try {
        const reviewErrors = auditReviewReceipts({ root: REPO, backlogFile: BACKLOG });
        if (reviewErrors.length) {
          for (const message of reviewErrors) err(`review receipt: ${message}`);
        } else ok('reviewctl: review receipts + current snapshots + event chain reconcile.');
      } catch (e) {
        err(`review receipt audit could not run: ${e.message}`);
      }
    }
    try {
      const frontendErrors = auditFrontendReceipts({ root: REPO, backlogFile: BACKLOG });
      if (frontendErrors.length) {
        for (const message of frontendErrors) err(`frontend receipt: ${message}`);
      } else ok('frontend-validation: journey receipts reconcile (or no UI receipts yet).');
    } catch (e) {
      err(`frontend receipt audit could not run: ${e.message}`);
    }
  }
}

// Research-First Gate: an implementation task with an open technical-blocker circuit breaker must
// stay paused. Research evidence may still be in progress, but manually unblocking the task or losing
// its linked research task/card is deterministic drift.
{
  try {
    const research = auditResearchGates(REPO);
    if (!research.ok) {
      for (const message of research.errors) err(`research gate: ${message}`);
    } else if (research.open.length) {
      ok(`research-gate: implementation paused for ${research.open.join(', ')}; bounded research may continue.`);
    } else ok('research-gate: no open technical blocker.');
  } catch (e) {
    err(`research gate audit could not run: ${e.message}`);
  }
}

// Knowledge-layer guards (sibling executables). All three self-skip (exit 0) when the project has no
// knowledge.config.json / docs tree, so the wires are safe everywhere. WARN-biased during the calibration
// window (new gates start as warnings — migration strategy); gate 14/SHIP treats a red drift as fail.
//   knowledge-drift  — derived docs (CONTRACTS.generated.md) stale vs contract sources = knowledge lying.
//   knowledge-coverage — feature modules missing README / truth markers / AC tables.
//   docs-health — broken relative links, canonical docs citing archive/, missing truth markers.
for (const [scriptName, label] of [
  ['knowledge-drift.mjs', 'derived docs stale vs contract — regenerate via feature-sync.mjs'],
  ['knowledge-coverage.mjs', 'feature docs incomplete (README / truth marker / AC table)'],
  ['docs-health.mjs', 'docs hygiene (broken links / archive leakage / truth markers)'],
]) {
  const P = resolve(HERE, scriptName);
  if (!existsSync(P)) continue;
  // Ask children to expose issues through status, then preserve their WARN-biased policy here.
  // Previously default exit 0 + ignored output made missing docs look clean.
  const r = spawnSync(process.execPath, [P, '--strict'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (r.error) warn(`${scriptName} could not be spawned (${r.error.message}).`);
  else if (r.status === 0) ok(`${scriptName}: clean (or knowledge layer not enabled).`);
  else {
    const detail = `${r.stdout || ''}\n${r.stderr || ''}`.trim().slice(-1200);
    warn(`${scriptName}: ${label}. ${detail} (WARN-biased calibration window.)`);
  }
}

if (cgStatus === 'fail') {
  if (!blocked.length) warn('consistency_gate is fail but lists no `blocks:` — it cannot block anything.');
  for (const b of blocked) {
    const st = stages[b]?.status;
    if (st === 'passed') err(`consistency_gate=fail but blocked stage ${b} is "passed" (snapshot-laundering). Use accepted-risk + DEC entry, or close the chain.`);
    else ok(`consistency_gate blocks ${b} (status ${st}) — OK`);
  }
}

let gitOk = true;
try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: REPO, stdio: 'ignore' }); } catch { gitOk = false; }
const branch = workBranch || 'HEAD';
let branchOk = gitOk;
if (gitOk && workBranch) {
  try { execFileSync('git', ['rev-parse', '--verify', branch], { cwd: REPO, stdio: 'ignore' }); }
  catch { branchOk = false; warn(`work_branch "${branch}" not found locally — skipping reality probes.`); }
}
const existsOnBranch = (p) => {
  try { execFileSync('git', ['cat-file', '-e', `${branch}:${p}`], { cwd: REPO, stdio: 'ignore' }); return true; }
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
  const updatedIsDate = /^\d{4}-\d{2}-\d{2}/.test(updatedAt);
  // String comparison is only meaningful when BOTH sides are ISO dates; run-ids/placeholders would
  // silently never trigger DRIFT ('2' < '<'), so report the check as inconclusive instead of green.
  if (!updatedIsDate)
    warn(`staleness check inconclusive: manifest updated_at="${updatedAt}" is not an ISO date (run-id/placeholder).`);
  else if (!latest)
    warn('staleness check inconclusive: DECISION_LOG has no parseable `Date: YYYY-MM-DD` lines.');
  else if (latest > updatedAt)
    err(`DRIFT: manifest updated_at=${updatedAt} is older than newest DECISION_LOG Date=${latest} — reconcile the stage rows.`);
  else ok(`updated_at (${updatedAt}) is >= newest decision (${latest}).`);
}

if (currentStage && !stages[currentStage])
  warn(`current_stage "${currentStage}" is not a stage id in the manifest.`);

// Lessons guard checks (self-evolving loop). Each active lesson in reconcile.config.json
// "lessons" carries an executable GuardCheck; re-running them in full reconciliation turns a past
// pitfall into a gate — a non-zero exit from `check` means the pitfall RECURRED => ERROR =>
// exit 1, so the same mistake can only happen once. `check:"manual"`/empty = un-automatable
// lesson (WARN). Human-readable backing records live in <control_root>/LESSON_LEDGER.md.
const calibrationOn = cfg.calibration_mode !== false;
let results = [];
let nextStats = {};
if (RUN_EXECUTABLE_CHECKS && Array.isArray(cfg.lessons) && cfg.lessons.length) {
  const run = await runLessonChecks(cfg.lessons, {
    cwd: REPO,
    policy: cfg.lesson_execution,
    onEvent(event) {
      if (event.type === 'start') console.log(`→ lesson ${event.led}: start (execution budget ${event.timeoutMs} ms)`);
      else {
        console.log(`${event.outcome === 'hold' ? '✓' : '✗'} lesson ${event.led}: ${event.outcome} (${event.durationMs} ms)`);
        if (event.outcome !== 'hold') {
          const detail = `${event.stdout || ''}\n${event.stderr || ''}`.trim().slice(-4000);
          if (detail) console.log(detail);
        }
      }
    },
  });
  if (!run.ok) {
    for (const message of run.errors) err(message);
    err('lesson checks NOT RUN: declare lesson_execution.minimum_timeout_ms and default_timeout_ms (or each lesson.timeout_ms) from the project command budgets. Cleanup/settlement default to 1000 ms each; overall_timeout_ms is computed unless an external deadline is configured.');
    die(1);
  } else {
    results = run.results;
    for (const [index, result] of results.entries()) {
      const lesson = cfg.lessons[index];
      if (result.outcome === 'manual') warn(`lesson ${result.led}: manual guard (no executable check) — verify by hand: ${lesson.what || ''}`);
      else if (result.outcome === 'hold') ok(`lesson ${result.led}: guard holds (${result.durationMs} ms; ${lesson.what || ''})`);
      else if (result.outcome === 'fire') err(`lesson ${result.led} RECURRED — ${lesson.onFail || lesson.what || 'guard check failed'} (${result.durationMs} ms, exit ${result.status})`);
      else err(`lesson ${result.led}: ${result.outcome}; guard result is incomplete, NOT PASS (${result.durationMs} ms).`);
    }
    // Incomplete/timed-out execution is not proof that a historical failure recurred.
    const STATS = resolve(CONTROL_ROOT, '.lessons-stats.json');
    const prevStats = existsSync(STATS) ? JSON.parse(readFileSync(STATS, 'utf8')) : {};
    nextStats = tallyLessonStats(prevStats, results.filter(result => ['hold', 'fire', 'manual'].includes(result.outcome)), new Date().toISOString());
    writeFileSync(STATS, JSON.stringify(nextStats, null, 2));
    if (results.some(result => result.outcome === 'cancelled')) die(1);
  }
}

// 防腐三守卫 + 度量(仅 --consolidate / run 收口跑;全 WARN,绝不 ERROR;阈值动作 calibration-gated)。
if (CONSOLIDATE) {
  if (calibrationOn) warn('[calibration] calibration-mode ON(默认)— 所有阈值动作只 print would,不 act。攒够 N 真实 run 后人工 flip + 回填阈值(最高风险动作,留痕)。');
  const staleDays = cfg.stale_age_days ?? 90;
  const ledgerRules = parseLedgerRules(resolve(CONTROL_ROOT, 'LESSON_LEDGER.md'));
  for (const f of neverFiredFindings(cfg.lessons ?? [], nextStats, new Date(), staleDays)) findings.push(f);
  for (const f of selfRefFindings(ledgerRules, cfg.lessons ?? [])) findings.push(f);
  for (const f of lessonLifecycleFindings(ledgerRules, cfg.lessons ?? [])) findings.push(f);
  for (const f of quarantineFindings(cfg.lessons ?? [], cfg.quarantine_threshold ?? 3, calibrationOn)) findings.push(f);
  const METRICS = resolve(CONTROL_ROOT, 'METRICS.md');
  if (existsSync(METRICS)) {
    const m = computeMetrics({ stats: nextStats, activeRules: (cfg.lessons ?? []).filter((l) => l.check && l.check !== 'manual').map((l) => l.led), thisRunFired: results.filter((r) => r.outcome === 'fire').map((r) => r.led), totalRuns: cfg.total_runs ?? 0 });
    appendFileSync(METRICS, `| ${new Date().toISOString()} | ${cfg.total_runs ?? 0} | ${m.repeatFailureRate} | ${m.guardHitRate} | calibrating | calibrating |\n`);
  }
}

// antiCheck 全守卫元验证(揪假绿稻草人)。会写工作树(setup/teardown),只在 --anti-check / --consolidate
// 显式跑,绝不进平时高频路径。WARN-only:假绿 → WARN,无 antiCheck → WARN(full 要求全覆盖)。
if (ANTI_CHECK || CONSOLIDATE) {
  for (const r of runAllAntiChecks(cfg.lessons, REPO)) {
    if (r.status === 'false-green') findings.push(r.finding);
    else if (r.status === 'uncovered') warn(`lesson ${r.led}: 无 antiCheck — full 要求全守卫覆盖(补复现态断言)。`);
  }
}

// 完整消费 RUN_EVENTS：eval_red → LESSON_INBOX(observation，不自动晋升)；可复用事件 → REUSE_OUTBOX。
// 先分流、幂等写入、最后按原始总行数归档，避免 filter 后按错误行数归档导致失败事件丢失。
if (CONSOLIDATE) {
  const OUTBOX = resolve(CONTROL_ROOT, 'REUSE_OUTBOX.jsonl');
  const INBOX = resolve(CONTROL_ROOT, 'LESSON_INBOX.jsonl');
  const partition = partitionEvolutionEvents(readNewEvents(CONTROL_ROOT));
  const observations = partition.lessonEvents.map((ev) => buildLessonObservation(ev, { project: cfg.project ?? 'unknown' }));
  const reuseCandidates = partition.reuseEvents.map((ev, index) => buildReuseCandidate(ev, { project: cfg.project ?? 'unknown', seq: index + 1 }));
  const observed = appendJsonlUnique(INBOX, observations);
  const emitted = appendJsonlUnique(OUTBOX, reuseCandidates);
  if (observed) ok(`captured ${observed} lesson observation(s) → LESSON_INBOX.jsonl`);
  if (emitted) ok(`emitted ${emitted} reuse candidate(s) → REUSE_OUTBOX.jsonl`);
  if (partition.ignoredEvents.length) warn(`RUN_EVENTS 有 ${partition.ignoredEvents.length} 条未知事件已归档；请确认是否需新增显式映射。`);
  if (partition.consumedCount) archiveConsumed(CONTROL_ROOT, partition.consumedCount);
  const lines = existsSync(OUTBOX) ? readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean).length : 0;
  const dl = emitDeadLetterWarn({ outboxLines: lines, consumedMarker: cfg.outbox_consumed ?? 0, rounds: cfg.outbox_idle_rounds ?? 0 });
  if (dl) findings.push(dl);
}

// Conditional product-program gate. During BUILD the coordinator may legitimately have no release set or
// execution yet, so its existence alone does not make every reconcile red. Once SHIP claims readiness/pass,
// however, per-repository green status is insufficient: the current cross-project execution must reconcile.
{
  const programConfig = resolve(ORCH, 'program', 'program.config.json');
  const programCompletionRequired = cfg.program_completion_required === true;
  if (programCompletionRequired && !existsSync(programConfig)) {
    err('program_completion_required=true，但 orchestrator/program/program.config.json 缺失；拒绝跳过跨项目完成门禁。');
  }
  if (existsSync(programConfig)) {
    const ship = stages['5-ship'];
    const claimsShip =
      ['needs-user-confirmation', 'passed', 'accepted-risk'].includes(ship?.status ?? '') ||
      ['pass', 'accepted-risk'].includes(ship?.gate_status ?? '');
    if (!claimsShip) {
      ok('program control plane detected; cross-project GO will become mandatory when 5-ship claims readiness.');
    } else {
      const programGate = resolve(HERE, 'program-gate.mjs');
      if (!existsSync(programGate)) {
        err('5-ship claims readiness but program-gate.mjs is missing — update the vendored engine.');
      } else if (AUDIT_ONLY) {
        warn('5-ship claims readiness: control audit does not re-run deployed program verification. Full coverage is incomplete; no cross-project GO is issued by this audit.');
      } else {
        const result = spawnSync(process.execPath, [programGate, '--audit'], {
          cwd: REPO,
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
        });
        if (result.error) {
          err(`5-ship program-gate could not start: ${result.error.message}`);
        } else if (result.status !== 0) {
          const detail = (result.stderr || result.stdout || `exit ${result.status}`)
            .trim()
            .slice(0, 4000);
          err(`5-ship cross-project program-gate is NO-GO:\n${detail}`);
        } else {
          ok('5-ship cross-project program-gate: current deployed release passed fresh verification.');
        }
      }
    }
  }
}

die();
