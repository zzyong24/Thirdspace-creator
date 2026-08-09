import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  neverFiredFindings,
  selfRefFindings,
  quarantineFindings,
  parseLedgerRules,
  computeMetrics,
  buildReuseCandidate,
  emitDeadLetterWarn,
  partitionEvolutionEvents,
  buildLessonObservation,
  lessonLifecycleFindings,
  selectInjectableLessons,
} from './evolution-guards.mjs';
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

test('consolidate 对全部事件一次分流，eval_red 不再被丢弃或错位归档', () => {
  const events = [
    { kind: 'eval_red', runId: 'wf_1', stage: '4-build', detail: '真机启动白屏' },
    { kind: 'reuse_candidate', runId: 'wf_1', stage: '4-build', description: '可复用启动探针', evidence: { command: 'pnpm test' } },
    { kind: 'unknown', runId: 'wf_1', stage: '4-build' },
  ];
  const result = partitionEvolutionEvents(events);
  assert.deepEqual(result.lessonEvents, [events[0]]);
  assert.deepEqual(result.reuseEvents, [events[1]]);
  assert.deepEqual(result.ignoredEvents, [events[2]]);
  assert.equal(result.consumedCount, 3);
});

test('eval_red 生成稳定的 observation 收件箱记录，不直接晋升 rule', () => {
  const item = buildLessonObservation(
    { kind: 'eval_red', runId: 'wf_1', stage: '4-build', detail: '真实应用启动后白屏', evidence: { command: 'pnpm test', commit: 'abc' } },
    { project: 'creatoros' },
  );
  assert.equal(item.schema, 'lesson-observation/v1');
  assert.equal(item.id, 'wf_1:4-build');
  assert.equal(item.lifecycle, 'observation');
  assert.equal(item.project, 'creatoros');
  assert.equal(item.detail, '真实应用启动后白屏');
  assert.equal(item.evidence.command, 'pnpm test');
});

test('旧 active 生命周期会被明确报告，不再被自检假绿掩盖', () => {
  const ledger = [{ id: 'LED-006', status: 'active', check: 'pnpm test', stage: 'BUILD', severity: 'high' }];
  const config = [{ led: 'LED-006', check: 'pnpm test' }];
  const findings = lessonLifecycleFindings(ledger, config);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'legacy_lifecycle');
  assert.match(findings[0].m, /active/);
});

test('旧 active 仅在已有同 ID 可执行守卫时作为 legacy rule 注入', () => {
  const ledger = parseLedgerRules.fromString(`
## LED-006 — 桌面包必须真启动
- **Date**: 2026-07-27 · **Stage**: BUILD→SHIP · **Severity**: high · **Status**: active
- **WhatFailed**: 安装文件存在但 GUI 白屏。
- **GuardRule**: 必须真启动 GUI 与 WebView。
- **GuardCheck**: \`pnpm test startup\`
`);
  const injected = selectInjectableLessons({
    ledger,
    lessonsCfg: [{ led: 'LED-006', check: 'pnpm test startup' }],
    stage: 'BUILD',
    limit: 7,
  });
  assert.equal(injected.length, 1);
  assert.equal(injected[0].id, 'LED-006');
  assert.equal(injected[0].effectiveLifecycle, 'legacy-rule');

  const withoutGuard = selectInjectableLessons({ ledger, lessonsCfg: [], stage: 'BUILD', limit: 7 });
  assert.equal(withoutGuard.length, 0);
});
