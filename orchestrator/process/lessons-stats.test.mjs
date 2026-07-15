import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyLessonStats } from './lessons-stats.mjs';

test('首次 fire:fireCount=1,firstRedAt 与 lastFiredAt 都置为 now', () => {
  const out = tallyLessonStats({}, [{ led: 'LED-001', outcome: 'fire' }], '2026-06-26T00:00:00Z');
  assert.equal(out['LED-001'].fireCount, 1);
  assert.equal(out['LED-001'].firstRedAt, '2026-06-26T00:00:00Z');
  assert.equal(out['LED-001'].lastFiredAt, '2026-06-26T00:00:00Z');
});

test('再次 fire:fireCount 累加,firstRedAt 不变,lastFiredAt 刷新', () => {
  const prev = { 'LED-001': { fireCount: 1, firstRedAt: '2026-06-01T00:00:00Z', lastFiredAt: '2026-06-01T00:00:00Z', registeredAt: '2026-05-01T00:00:00Z', deterrence: false } };
  const out = tallyLessonStats(prev, [{ led: 'LED-001', outcome: 'fire' }], '2026-06-26T00:00:00Z');
  assert.equal(out['LED-001'].fireCount, 2);
  assert.equal(out['LED-001'].firstRedAt, '2026-06-01T00:00:00Z');
  assert.equal(out['LED-001'].lastFiredAt, '2026-06-26T00:00:00Z');
});

test('hold(guard 成立)不动 fireCount,但补齐 registeredAt + deterrence', () => {
  const out = tallyLessonStats({}, [{ led: 'LED-002', outcome: 'hold', deterrence: true }], '2026-06-26T00:00:00Z');
  assert.equal(out['LED-002'].fireCount, 0);
  assert.equal(out['LED-002'].deterrence, true);
  assert.equal(out['LED-002'].registeredAt, '2026-06-26T00:00:00Z');
});

test('manual lesson 也登记(fireCount=0),不丢', () => {
  const out = tallyLessonStats({}, [{ led: 'LED-003', outcome: 'manual' }], '2026-06-26T00:00:00Z');
  assert.equal(out['LED-003'].fireCount, 0);
});
