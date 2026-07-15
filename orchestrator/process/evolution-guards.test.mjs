import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neverFiredFindings, selfRefFindings, quarantineFindings, parseLedgerRules, computeMetrics, buildReuseCandidate, emitDeadLetterWarn } from './evolution-guards.mjs';
const schema = JSON.parse(readFileSync(new URL('./reuse-candidate.schema.json', import.meta.url)));
function validate(obj, s) {
  for (const k of s.required) if (!(k in obj)) return `missing ${k}`;
  if (obj.schema !== s.properties.schema.const) return 'schema const mismatch';
  if (!s.properties.kind.enum.includes(obj.kind)) return 'bad kind';
  if (!s.properties.suggested_scope.enum.includes(obj.suggested_scope)) return 'bad scope';
  for (const k of s.properties.evidence.required) if (!(k in obj.evidence)) return `evidence.${k}`;
  for (const k of s.properties.provenance.required) if (!(k in obj.provenance)) return `provenance.${k}`;
  return null;
}

const now = new Date('2026-06-26T00:00:00Z');
const old = '2026-01-01T00:00:00Z'; // > 90 天前
const young = '2026-06-20T00:00:00Z';

test('never-fired:active rule + age>N + fireCount=0 + 非 deterrence → 1 条 WARN', () => {
  const lessons = [{ led: 'LED-X', status: 'rule', check: 'test -f x' }];
  const stats = { 'LED-X': { fireCount: 0, registeredAt: old, deterrence: false } };
  const f = neverFiredFindings(lessons, stats, now, 90);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'WARN');
});

test('never-fired:deterrence=true 守卫豁免(LED-001 类),不 WARN', () => {
  const lessons = [{ led: 'LED-001', status: 'rule', deterrence: true }];
  const stats = { 'LED-001': { fireCount: 0, registeredAt: old, deterrence: true } };
  assert.equal(neverFiredFindings(lessons, stats, now, 90).length, 0);
});

test('never-fired:age<N(年轻)不 WARN', () => {
  const lessons = [{ led: 'LED-Y', status: 'rule' }];
  const stats = { 'LED-Y': { fireCount: 0, registeredAt: young, deterrence: false } };
  assert.equal(neverFiredFindings(lessons, stats, now, 90).length, 0);
});

test('自指一致性:ledger 有 Status=rule 非 manual,但 lessons[] 无对应 → WARN', () => {
  const ledgerRules = [{ id: 'LED-Z', status: 'rule', check: 'test -f z' }];
  const lessonsCfg = [];
  const f = selfRefFindings(ledgerRules, lessonsCfg);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'WARN');
  assert.match(f[0].m, /漂移/);
});

test('自指一致性:已接线则不 WARN', () => {
  const ledgerRules = [{ id: 'LED-Z', status: 'rule', check: 'test -f z' }];
  const lessonsCfg = [{ led: 'LED-Z', check: 'test -f z' }];
  assert.equal(selfRefFindings(ledgerRules, lessonsCfg).length, 0);
});

test('quarantine:误报超阈值 + calibration OFF → WARN 提议降级', () => {
  const f = quarantineFindings([{ led: 'LED-Q', falsePositives: 5 }], 3, false);
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'WARN');
});

test('quarantine:calibration ON → 只 print would,不产 finding', () => {
  assert.equal(quarantineFindings([{ led: 'LED-Q', falsePositives: 5 }], 3, true).length, 0);
});

test('parseLedgerRules 抽出 LED 的 status + check', () => {
  const md = `## LED-001 — x\n- **Status**: rule\n- **GuardCheck**: \`test -f .env.local\`\n`;
  const r = parseLedgerRules.fromString(md);
  assert.equal(r[0].id, 'LED-001');
  assert.equal(r[0].status, 'rule');
  assert.match(r[0].check, /env.local/);
});

test('computeMetrics:repeat-failure-rate + guard-hit-rate 有真分母', () => {
  const m = computeMetrics({ stats: { 'LED-A': { fireCount: 2 }, 'LED-B': { fireCount: 0 } }, activeRules: ['LED-A', 'LED-B'], thisRunFired: ['LED-A'], totalRuns: 10 });
  assert.equal(m.repeatFailureRate, '1/10');
  assert.equal(m.guardHitRate, '1/2');
});

test('computeMetrics:无分母标 calibrating,不出 0/N/A', () => {
  const m = computeMetrics({ stats: {}, activeRules: [], thisRunFired: [], totalRuns: 0 });
  assert.equal(m.repeatFailureRate, 'calibrating 0/0');
  assert.equal(m.guardHitRate, 'calibrating 0/0');
});

test('calibration 缺省 ON:undefined → true(reconcile 用 cfg.calibration_mode !== false)', () => {
  const calibrationOn = (cfg) => cfg.calibration_mode !== false;
  assert.equal(calibrationOn({}), true);
  assert.equal(calibrationOn({ calibration_mode: true }), true);
  assert.equal(calibrationOn({ calibration_mode: false }), false);
});

test('buildReuseCandidate 产出严格合 reuse-candidate/v1', () => {
  const ev = { kind: 'reuse_candidate', runId: 'wf_9', stage: '16', description: 's3 上传可复用', evidence: { command: 'pnpm test', test: 't.test.ts', commit: 'abc' } };
  const c = buildReuseCandidate(ev, { project: 'creatoros', seq: 1 });
  assert.equal(validate(c, schema), null);
  assert.equal(c.schema, 'reuse-candidate/v1');
  assert.equal(c.id, 'wf_9-1');
  assert.equal(c.kind, 'asset');
});

test('lesson kind:scope=gen 的 LED 晋升 → kind:lesson', () => {
  const ev = { kind: 'lesson_promoted', runId: 'wf_9', stage: 'gen', description: 'x', led: 'LED-5', evidence: { command: 'node reconcile.mjs' } };
  const c = buildReuseCandidate(ev, { project: 'creatoros', seq: 2 });
  assert.equal(c.kind, 'lesson');
  assert.equal(validate(c, schema), null);
});

test('断链可观测:OUTBOX 只增 N 轮无消费回执 → WARN', () => {
  const f = emitDeadLetterWarn({ outboxLines: 12, consumedMarker: 0, rounds: 5 });
  assert.equal(f.level, 'WARN');
  assert.match(f.m, /接缝可能断/);
});
