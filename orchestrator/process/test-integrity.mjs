#!/usr/bin/env node
// orchestrator/process/test-integrity.mjs  (skill template — copied into each project)
// Deterministic GATE that protects the judging criteria from being WEAKENED (慢学AI 2nd principle:
// "judging criteria cannot be tampered"). The prose rule "never weaken an existing assertion to go green"
// (harness/coding-agent.md) was previously unenforced — verify-task.sh just ran the suite, and a *weakened*
// test still goes green. This gate runs BEFORE the suite and FAILS (exit 1) when tests are being weakened.
//
// It compares the WORK BRANCH working tree (or HEAD) against a BASE ref and fails when, in CHANGED test files:
//   1) total assertion-count or test-case-count DROPS (criteria deleted/gutted),
//   2) skip/only markers INCREASE (.skip/.only/xit/xdescribe/...) — silently disabling judgment,
//   3) type/lint suppressions INCREASE in COMMENTS, anywhere (@ts-ignore/eslint-disable/# type: ignore/...),
//   4) a coverage threshold is LOWERED in the coverage config.
// Net-new tests, honest refactors that keep counts, and *raising* thresholds all pass clean.
//
// SCOPE — be honest about what this can and cannot do. It is a fast, mechanical gate against BLUNT weakening
// (deleting/skipping tests, adding suppressions, lowering coverage, dropping assertion COUNT). It does NOT
// detect SEMANTIC loosening that keeps the count flat — e.g. `assert.equal(x, 'Cory')` → `assert.ok(true)`,
// or an expected value edited to match broken code. Counting is necessary, not sufficient. Catching loosening
// is the job of the heterogeneous evaluator (evaluator.md / evaluator-rebuttal.md) and of MUTATION TESTING
// (Stryker/PIT/mutmut) — coverage says the code ran, mutation says the test would actually catch a bug. Run
// this gate as the cheap deterministic floor; do not claim it proves criteria are un-tampered.
//
// STACK-AGNOSTIC. Everything language-specific is config (see test-integrity.config.example.json). Defaults
// target JS/TS but a Python/pytest or Go project just ships its own testGlobs/keywords/patterns.
//
// To count code vs comments honestly it strips string literals (so an `assert` inside a string/array literal
// is NOT counted as an assertion) and counts suppression directives only inside COMMENTS (so listing
// "@ts-ignore" as a pattern string — as THIS file does — is not mistaken for a real suppression). It also
// excludes its own tooling + docs from inspection via excludeGlobs.
//
// Exit 0=clean, 1=weakening detected, 2=missing prerequisite (no git / unreadable config).

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');
const REPO = resolve(ORCH, '..');
const CONFIG = resolve(HERE, 'test-integrity.config.json');
const RCFG = resolve(HERE, 'reconcile.config.json');

// ── defaults (JS/TS-leaning, ALL overridable via config) ───────────────────────────────────────────────
const DEFAULTS = {
  base_ref: null,                       // null → auto (merge-base with work_branch, then HEAD~1, then HEAD)
  work_branch: null,                    // null → read from reconcile.config.json
  // Paths to SKIP entirely (substring, case-insensitive). The gate protects a project's tests, not the
  // orchestrator's own tooling or its prose docs (both legitimately contain pattern strings / examples).
  excludeGlobs: ['orchestrator/process/', '/docs/', 'docs/', 'node_modules/', '.md'],
  // Which changed files count as "tests" (substring vs repo-relative path, case-insensitive).
  testGlobs: ['.test.', '.spec.', '_test.', 'test_', '/tests/', '/__tests__/', 'tests/'],
  // Assertion call-sites (anchored to call shapes, NOT bare words, to avoid identifier inflation like
  // `shouldRetry` matching `should`). Counted as occurrences in CODE (comments/strings excluded).
  assertionKeywords: ['assert(', 'assert.', 'expect(', '.should.', 'should(', 'assertEqual', 'assertTrue',
    'assertRaises', 'assertThat', 'require.Equal', 'require.NoError', 't.is(', 't.deepEqual(', 'XCTAssert',
    'EXPECT_', 'ASSERT_'],
  // Test-case declarations (call-site shapes). One count per match, in CODE only.
  testCaseKeywords: ['it(', 'it.each', 'test(', 'test.each', 'describe(', 'def test_', 'func Test', '@Test', 'Scenario:'],
  // Skip/only markers — an INCREASE (in CODE) is weakening (silently disabling judgment).
  skipPatterns: ['.skip(', '.skip ', '.only(', '.only ', 'xit(', 'xdescribe(', 'fit(', 'fdescribe(',
    'test.skip', 'it.skip', 'describe.skip', 'test.only', 'it.only', 'describe.only',
    '@pytest.mark.skip', '@pytest.mark.xfail', '@unittest.skip', 't.Skip(', 'testing.Short()'],
  // Type/lint suppressions that hide failures — an INCREASE (in COMMENTS) is weakening, counted anywhere.
  ignorePatterns: ['@ts-ignore', '@ts-expect-error', 'eslint-disable', 'eslint-disable-next-line',
    'nolint', 'nosec', 'type: ignore', 'noqa', 'istanbul ignore', 'c8 ignore', 'v8 ignore', 'prettier-ignore'],
  // Comment lead-ins used to separate code from comments. `#` only counts at a token boundary (so JS private
  // fields `this.#x` are not mistaken for a comment). `--` is NOT a default (it collides with JS `i--`).
  lineComments: ['//', '#'],
  // Exact, audited test relocations/retirements. Each group must name the deleted source tests, the
  // replacement tests, and a non-empty reason. The replacement aggregate must retain at least as many
  // test cases and assertions as the deleted aggregate; this is intentionally NOT a glob/baseline escape.
  testMigrations: [],
  // Exact, audited suppression increases. Each entry is path + literal directive + maximum net increase
  // + reason. Broad globs and reason-less allowances are rejected.
  suppressionAllowances: [],
  // Coverage config to scan for LOWERED thresholds. Keys matched as the LEFT identifier before `:` / `=`.
  coverageConfigPath: null,             // e.g. "vitest.config.ts" | "jest.config.js" | "pyproject.toml" | ".nycrc"
  coverageThresholdKeys: ['statements', 'branches', 'functions', 'lines', 'fail_under'],
};

const findings = [];
const err  = (m) => findings.push({ level: 'ERROR', m });
const warn = (m) => findings.push({ level: 'WARN',  m });
const ok   = (m) => findings.push({ level: 'OK',    m });

function die(code) {
  const order = { ERROR: 0, WARN: 1, OK: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ERROR: '✗', WARN: '!', OK: '✓' };
  console.log('\n── test-integrity (anti-tamper gate) ──────────────────');
  for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
  const errs = findings.filter(f => f.level === 'ERROR').length;
  const warns = findings.filter(f => f.level === 'WARN').length;
  console.log('───────────────────────────────────────────────────────');
  console.log(`${errs} error(s), ${warns} warning(s).`);
  console.log(errs ? '✗ TAMPER: judging criteria are being WEAKENED — fix the tests, don\'t weaken them.'
                   : '✓ No blunt weakening detected (count/skip/suppress/coverage). NB: semantic loosening that keeps counts is NOT checked here — see header.');
  process.exit(code ?? (errs ? 1 : 0));
}

// ── load config ────────────────────────────────────────────────────────────────────────────────────────
let cfg = { ...DEFAULTS };
if (existsSync(CONFIG)) {
  try { cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }; ok('config: test-integrity.config.json loaded'); }
  catch (e) { warn(`config unreadable (${e.message}) — using built-in JS/TS defaults`); }
} else {
  warn('no test-integrity.config.json — using built-in JS/TS defaults (copy .example.json to tune your stack)');
}
if (!cfg.work_branch && existsSync(RCFG)) {
  try { cfg.work_branch = JSON.parse(readFileSync(RCFG, 'utf8')).work_branch || null; } catch { /* ignore */ }
}

// ── git availability ───────────────────────────────────────────────────────────────────────────────────
const git = (args, opts = {}) => execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
try { git('rev-parse --git-dir'); } catch { err('not a git repository — cannot diff for weakening. (this gate requires git)'); die(2); }

const revOk = (ref) => { try { git(`rev-parse --verify --quiet ${ref}^{commit}`); return true; } catch { return false; } };

// Resolve the BASE ref to compare against. A DEGRADED base (HEAD~1/HEAD, i.e. only the last commit / working
// tree) is a WARN, not silent: in the autonomous loop verify-task runs AFTER the per-task commit, so a base
// of HEAD~1 only sees the last commit and misses weakening banked in earlier commits — pin base_ref (or
// reconcile.config.json work_branch) to the integration branch so the whole task range is in view.
function resolveBase() {
  if (cfg.base_ref) {
    if (revOk(cfg.base_ref)) return { base: cfg.base_ref, how: `config base_ref ${cfg.base_ref}`, degraded: false };
    warn(`configured base_ref "${cfg.base_ref}" not found — falling through to auto-detect`);
  }
  if (cfg.work_branch && revOk(cfg.work_branch)) {
    try {
      const mb = git(`merge-base HEAD ${cfg.work_branch}`).trim();
      if (mb) return { base: mb, how: `merge-base(HEAD, ${cfg.work_branch})=${mb.slice(0, 8)}`, degraded: false };
    } catch { /* fall through */ }
  }
  if (revOk('HEAD~1')) return { base: 'HEAD~1', how: 'HEAD~1 (no base_ref/work_branch — sees only the last commit)', degraded: true };
  return { base: 'HEAD', how: 'HEAD (root commit — comparing working tree vs HEAD only)', degraded: true };
}
const { base, how, degraded } = resolveBase();
(degraded ? warn : ok)(`base ref: ${how}${degraded ? ' — pin base_ref to the integration branch to see the full task range.' : ''}`);

// Compare TARGET (working tree by default; use HEAD via --head) against base.
const useHead = process.argv.includes('--head');
const target = useHead ? 'HEAD' : null;   // null = working tree
ok(`target: ${useHead ? 'HEAD (committed)' : 'working tree'}`);

// ── comment/string-aware line splitting ──────────────────────────────────────────────────────────────────
// Returns { code, comment } for one line. String literals ('/"/`) have their CONTENTS blanked in `code` (the
// delimiters stay) so tokens inside strings are not counted as code. The first line-comment lead-in (outside
// a string) starts the comment; `#` counts as a comment only at a token boundary (after start/space) so JS
// private fields like `this.#x` are not treated as comments. `/* ... */` on one line goes to `comment`.
function splitCodeComment(line) {
  let code = '', comment = '';
  let str = null, i = 0, prev = '';
  while (i < line.length) {
    const ch = line[i];
    if (str) {                                   // inside a string: drop contents
      if (ch === '\\') { i += 2; continue; }
      if (ch === str) { str = null; code += ch; }
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; code += ch; prev = ch; i++; continue; }
    const two = line.slice(i, i + 2);
    if (two === '/*') { const e = line.indexOf('*/', i + 2); comment += e === -1 ? line.slice(i) : line.slice(i, e + 2); i = e === -1 ? line.length : e + 2; continue; }
    let isComment = false;
    for (const lc of cfg.lineComments) {
      if (line.startsWith(lc, i)) {
        if (lc === '#' && !(prev === '' || prev === ' ' || prev === '\t')) continue; // token-boundary only
        isComment = true; break;
      }
    }
    if (isComment) { comment += line.slice(i); break; }
    code += ch; prev = ch; i++;
  }
  return { code, comment };
}

// Count literal-substring occurrences of any pattern across a body of text (sum of per-line hits),
// drawing each line from either its CODE portion (scope='code') or COMMENT portion (scope='comment').
function countHits(content, patterns, scope) {
  if (!content) return 0;
  let n = 0;
  for (const raw of content.split('\n')) {
    const { code, comment } = splitCodeComment(raw);
    const hay = scope === 'comment' ? comment : code;
    if (!hay) continue;
    const hits = [];
    for (const pat of patterns) {
      let from = 0, idx;
      while ((idx = hay.indexOf(pat, from)) !== -1) {
        hits.push({ start: idx, end: idx + pat.length, length: pat.length });
        from = idx + Math.max(1, pat.length);
      }
    }
    // Configs often contain a specific token and its prefix (for example
    // `eslint-disable-next-line` + `eslint-disable`, or `test.skip` + `.skip`).
    // One directive is one criterion change, not two. Prefer the longest match at the same/overlapping
    // range, then count only non-overlapping occurrences.
    hits.sort((a, b) => a.start - b.start || b.length - a.length);
    let acceptedEnd = -1;
    for (const hit of hits) {
      if (hit.start < acceptedEnd) continue;
      n++;
      acceptedEnd = hit.end;
    }
  }
  return n;
}

// ── enumerate changed files ────────────────────────────────────────────────────────────────────────────
// name-status against base; A/M/D/R. For R (rename) git prints "R100\told\tnew".
// CRITICAL: `git diff` does NOT list UNTRACKED files. The harness runs this gate BEFORE the per-task commit,
// so a brand-new file (a fresh test, or a fresh module full of @ts-ignore) is still untracked at gate time.
// We therefore fold `git ls-files --others --exclude-standard` into the change set as synthetic 'A' rows
// (only meaningful when target is the working tree).
function changedFiles() {
  const range = target ? `${base} ${target}` : base;   // `git diff <base>` diffs base..worktree
  const rows = [];
  const seen = new Set();
  let out = '';
  try { out = git(`diff --name-status -M ${range}`); } catch (e) { warn(`git diff failed (${e.message}) — tracked files not compared`); }
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'R' || code === 'C') rows.push({ code, old: parts[1], path: parts[2] });
    else rows.push({ code, old: parts[1], path: parts[1] });
    seen.add(parts[parts.length - 1]);
  }
  if (!target) {   // working-tree target → include untracked files as additions ('git diff' omits them)
    let unt = '';
    try { unt = git('ls-files --others --exclude-standard'); } catch { /* ignore */ }
    for (const p of unt.split('\n')) {
      const path = p.trim();
      if (path && !seen.has(path)) { rows.push({ code: 'A', old: path, path }); seen.add(path); }
    }
  }
  return rows;
}

const matches = (p, globs) => !!p && globs.some(g => p.toLowerCase().includes(g.toLowerCase()));
const isExcluded = (c) => matches(c.path, cfg.excludeGlobs) || matches(c.old, cfg.excludeGlobs);
const isTestFile = (p) => matches(p, cfg.testGlobs);

// Read a blob at a ref, or the working-tree file when ref is null. Missing → null.
function readAt(ref, path) {
  if (!path) return null;
  if (ref === null) { const fp = resolve(REPO, path); return existsSync(fp) ? readFileSync(fp, 'utf8') : null; }
  try { return git(`show ${ref}:${path}`); } catch { return null; }
}

// ── (1)+(2) per changed test file: assertions/test-cases must not drop; skip must not rise ────────────────
const changed = changedFiles().filter(c => !isExcluded(c));
const testChanges = changed.filter(c => isTestFile(c.path) || isTestFile(c.old));
if (!testChanges.length) ok('no changed test files in range — assertion/skip checks have nothing to inspect.');

// Exact migration declarations let an architectural move retire obsolete test paths without pretending
// the criteria vanished. They are deliberately stricter than an exclusion/baseline: exact paths only,
// a written reason, existing replacement tests, and aggregate case/assertion counts that do not fall.
const migratedDeletedTests = new Set();
const deletedTestPaths = new Set(
  testChanges
    .filter(c => c.code === 'D' || (readAt(target, c.path) === null && readAt(base, c.old) !== null))
    .map(c => c.old),
);
for (const [index, migration] of (cfg.testMigrations ?? []).entries()) {
  const label = `testMigrations[${index}]`;
  const from = Array.isArray(migration?.from) ? migration.from : [];
  const to = Array.isArray(migration?.to) ? migration.to : [];
  const reason = typeof migration?.reason === 'string' ? migration.reason.trim() : '';
  if (!from.some(path => deletedTestPaths.has(path))) continue; // declaration is dormant for this diff
  if (!from.length || !to.length || !reason) {
    err(`${label}: active migration requires non-empty exact "from", "to", and "reason" fields.`);
    from.forEach(path => migratedDeletedTests.add(path));
    continue;
  }
  const broad = [...from, ...to].some(path => typeof path !== 'string' || /[*?[\]{}]/.test(path));
  if (broad) {
    err(`${label}: glob-like paths are forbidden; migration allowances must name exact files.`);
    from.forEach(path => migratedDeletedTests.add(path));
    continue;
  }
  const missingSources = from.filter(path => readAt(base, path) === null);
  const liveSources = from.filter(path => !deletedTestPaths.has(path));
  const missingTargets = to.filter(path => readAt(target, path) === null || !isTestFile(path));
  if (missingSources.length || liveSources.length || missingTargets.length) {
    err(`${label}: migration proof incomplete (missing-at-base: ${missingSources.join(', ') || 'none'}; not-deleted: ${liveSources.join(', ') || 'none'}; missing/non-test targets: ${missingTargets.join(', ') || 'none'}).`);
    from.forEach(path => migratedDeletedTests.add(path));
    continue;
  }
  const before = from.map(path => readAt(base, path)).join('\n');
  const after = to.map(path => readAt(target, path)).join('\n');
  const beforeCases = countHits(before, cfg.testCaseKeywords, 'code');
  const afterCases = countHits(after, cfg.testCaseKeywords, 'code');
  const beforeAssertions = countHits(before, cfg.assertionKeywords, 'code');
  const afterAssertions = countHits(after, cfg.assertionKeywords, 'code');
  if (afterCases < beforeCases || afterAssertions < beforeAssertions) {
    err(`${label}: replacement criteria too small (cases ${beforeCases}→${afterCases}, assertions ${beforeAssertions}→${afterAssertions}); ${reason}`);
  } else {
    ok(`${label}: audited migration retained aggregate criteria (cases ${beforeCases}→${afterCases}, assertions ${beforeAssertions}→${afterAssertions}); ${reason}`);
  }
  from.forEach(path => migratedDeletedTests.add(path));
}

for (const c of testChanges) {
  const beforeContent = readAt(base, c.old);
  const afterContent  = c.code === 'D' ? null : readAt(target, c.path);

  // Pure deletion of a whole test file = removing criteria. Always weakening.
  if (c.code === 'D' || (afterContent === null && beforeContent !== null)) {
    if (migratedDeletedTests.has(c.old)) continue;
    err(`test file DELETED: ${c.old} — removes judging criteria (use accepted-risk + a DEC entry if intentional).`);
    continue;
  }
  if (beforeContent === null) {   // brand-new test file (A) — net-new criteria, always allowed.
    const a = countHits(afterContent, cfg.assertionKeywords, 'code'), t = countHits(afterContent, cfg.testCaseKeywords, 'code');
    ok(`new test file ${c.path}: +${t} case(s), +${a} assertion(s) (net-new — allowed).`);
    continue;
  }

  const aBefore = countHits(beforeContent, cfg.assertionKeywords, 'code');
  const aAfter  = countHits(afterContent,  cfg.assertionKeywords, 'code');
  const tBefore = countHits(beforeContent, cfg.testCaseKeywords, 'code');
  const tAfter  = countHits(afterContent,  cfg.testCaseKeywords, 'code');
  const sBefore = countHits(beforeContent, cfg.skipPatterns, 'code');
  const sAfter  = countHits(afterContent,  cfg.skipPatterns, 'code');
  const iBefore = countHits(beforeContent, cfg.ignorePatterns, 'comment');
  const iAfter  = countHits(afterContent,  cfg.ignorePatterns, 'comment');

  if (aAfter < aBefore)
    err(`${c.path}: assertions DROPPED ${aBefore}→${aAfter} (−${aBefore - aAfter}) — weakening. Add tests; never delete assertions to go green.`);
  if (tAfter < tBefore)
    err(`${c.path}: test cases DROPPED ${tBefore}→${tAfter} (−${tBefore - tAfter}) — weakening (criteria removed).`);
  if (sAfter > sBefore)
    err(`${c.path}: skip/only markers INCREASED ${sBefore}→${sAfter} (+${sAfter - sBefore}) — disabling judgment is weakening.`);
  if (iAfter > iBefore)
    err(`${c.path}: type/lint suppressions INCREASED ${iBefore}→${iAfter} (+${iAfter - iBefore}) — hiding failures is weakening.`);

  if (aAfter >= aBefore && tAfter >= tBefore && sAfter <= sBefore && iAfter <= iBefore)
    ok(`${c.path}: intact (cases ${tBefore}→${tAfter}, assertions ${aBefore}→${aAfter}, skips ${sBefore}→${sAfter}, suppress ${iBefore}→${iAfter}).`);
}

// ── ignore-marker increase in NON-test files too (suppressing failures anywhere counts) ──────────────────
for (const c of changed) {
  if (isTestFile(c.path) || isTestFile(c.old)) continue;   // already covered above
  if (c.code === 'D') continue;
  const before = readAt(base, c.old) ?? '';
  const after  = readAt(target, c.path);
  if (after === null) continue;
  const iB = countHits(before, cfg.ignorePatterns, 'comment'), iA = countHits(after, cfg.ignorePatterns, 'comment');
  if (iA > iB) {
    const allowances = (cfg.suppressionAllowances ?? []).filter(a => a?.path === c.path);
    let allowedIncrease = 0;
    const reasons = [];
    let invalid = false;
    for (const [index, allowance] of allowances.entries()) {
      const pattern = typeof allowance?.pattern === 'string' ? allowance.pattern : '';
      const maxIncrease = allowance?.maxIncrease;
      const reason = typeof allowance?.reason === 'string' ? allowance.reason.trim() : '';
      if (!pattern || !cfg.ignorePatterns.includes(pattern) || !Number.isInteger(maxIncrease) || maxIncrease < 1 || !reason) {
        err(`suppressionAllowances[${index}] for ${c.path}: requires an exact configured pattern, positive integer maxIncrease, and non-empty reason.`);
        invalid = true;
        continue;
      }
      const patternBefore = countHits(before, [pattern], 'comment');
      const patternAfter = countHits(after, [pattern], 'comment');
      const increase = Math.max(0, patternAfter - patternBefore);
      if (increase > maxIncrease) {
        err(`${c.path}: audited "${pattern}" allowance exceeded ${increase}>${maxIncrease}; ${reason}`);
        invalid = true;
        continue;
      }
      allowedIncrease += increase;
      if (increase) reasons.push(`${pattern} +${increase}: ${reason}`);
    }
    if (!invalid && allowedIncrease === iA - iB) {
      ok(`${c.path}: suppression increase ${iB}→${iA} is exactly audited (${reasons.join(' | ')}).`);
    } else if (!invalid) {
      err(`${c.path}: type/lint suppressions INCREASED ${iB}→${iA} (+${iA - iB}); only +${allowedIncrease} is covered by exact audited allowances.`);
    }
  }
}

// ── (3) coverage threshold must not be LOWERED ───────────────────────────────────────────────────────────
// Mechanical: find every `<key> <:|=> <number>` occurrence (key optionally quoted), where <key> is one of the
// configured threshold keys. Keys are SPECIFIC (statements/branches/functions/lines/fail_under) — not generic
// words like "min"/"global" — so prose such as "# minimum node version 20" is not mistaken for a threshold.
// Matches inline (`{ lines: 90, branches: 85 }`) and multi-line forms, and quoted JSON keys (`"lines": 90`).
function coverageThresholds(content) {
  const map = {};
  if (!content) return map;
  const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = cfg.coverageThresholdKeys.map(k => k.toLowerCase());
  const re = new RegExp(`["']?\\b(${keys.map(esc).join('|')})\\b["']?\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, 'gi');
  for (const raw of content.split('\n')) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(raw)) !== null) {
      const name = m[1].toLowerCase();
      const val = parseFloat(m[2]);
      map[name] = map[name] === undefined ? val : Math.min(map[name], val); // most conservative if repeated
    }
  }
  return map;
}

if (cfg.coverageConfigPath) {
  const before = readAt(base, cfg.coverageConfigPath);
  const after  = readAt(target, cfg.coverageConfigPath);
  if (before === null && after === null) {
    warn(`coverageConfigPath "${cfg.coverageConfigPath}" not found at base or target — coverage check skipped.`);
  } else if (after === null) {
    err(`coverage config "${cfg.coverageConfigPath}" was DELETED — removes a judging threshold (weakening).`);
  } else if (before === null) {
    ok(`coverage config "${cfg.coverageConfigPath}" is new — thresholds established (allowed).`);
  } else {
    const tb = coverageThresholds(before), ta = coverageThresholds(after);
    let any = false;
    for (const k of Object.keys(tb)) {
      if (ta[k] === undefined) { warn(`coverage key "${k}" present at base (${tb[k]}) but not parseable at target — review manually.`); continue; }
      any = true;
      if (ta[k] < tb[k]) err(`coverage threshold "${k}" LOWERED ${tb[k]}→${ta[k]} in ${cfg.coverageConfigPath} — weakening the bar.`);
      else ok(`coverage "${k}": ${tb[k]}→${ta[k]} (not lowered).`);
    }
    if (!any && !Object.keys(tb).length) warn(`no numeric thresholds parsed from ${cfg.coverageConfigPath} (keys: ${cfg.coverageThresholdKeys.join(',')}) — coverage check inert.`);
  }
} else {
  warn('no coverageConfigPath configured — coverage-threshold check skipped (set it in test-integrity.config.json).');
}

die();
