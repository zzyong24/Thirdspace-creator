import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAntiCheck } from './anti-check.mjs';

test('守卫真有效:复现态下 check 非零 → PASS(WARN 0)', () => {
  const r = runAntiCheck({
    led: 'LED-T',
    check: 'test ! -f __ac_probe',         // 文件存在则 exit≠0
    antiCheck: { setup: 'touch __ac_probe', teardown: 'rm -f __ac_probe' },
  }, '/tmp');
  assert.equal(r.status, 'pass');
});

test('稻草人假绿:复现态下 check 仍 exit 0 → WARN(假绿)', () => {
  const r = runAntiCheck({
    led: 'LED-F',
    check: 'true',                          // 永远 exit 0 —— 假绿
    antiCheck: { setup: ':', teardown: ':' },
  }, '/tmp');
  assert.equal(r.status, 'false-green');
  assert.equal(r.finding.level, 'WARN');
});

test('无 antiCheck 字段 → skip(不算假绿,只标未覆盖)', () => {
  const r = runAntiCheck({ led: 'LED-N', check: 'true' }, '/tmp');
  assert.equal(r.status, 'uncovered');
});
