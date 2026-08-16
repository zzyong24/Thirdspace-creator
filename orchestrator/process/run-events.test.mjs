import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRunEvent, readNewEvents, archiveConsumed } from './run-events.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'runev-')); });

test('append 写一行 JSONL,kind/runId 保真', () => {
  appendRunEvent(dir, { kind: 'halt', runId: 'wf_1', stage: '16', detail: 'repair budget spent' });
  const line = readFileSync(join(dir, 'RUN_EVENTS.jsonl'), 'utf8').trim();
  const ev = JSON.parse(line);
  assert.equal(ev.kind, 'halt');
  assert.equal(ev.runId, 'wf_1');
  assert.equal(ev.schema, 'run-event/v1');
  assert.ok(ev.ts, 'ts 自动补');
});

test('append 拒绝缺少 kind 或 runId 的事件', () => {
  assert.throws(() => appendRunEvent(dir, { runId: 'a' }), /kind/);
  assert.throws(() => appendRunEvent(dir, { kind: 'halt' }), /runId/);
});

test('readNewEvents 只返回游标之后的,游标推进', () => {
  appendRunEvent(dir, { kind: 'halt', runId: 'a' });
  appendRunEvent(dir, { kind: 'eval_red', runId: 'b' });
  const first = readNewEvents(dir);
  assert.equal(first.length, 2);
  archiveConsumed(dir, first.length);
  appendRunEvent(dir, { kind: 'halt', runId: 'c' });
  const second = readNewEvents(dir);
  assert.equal(second.length, 1);
  assert.equal(second[0].runId, 'c');
});

test('归档把已消费行移进 RUN_EVENTS.archived.jsonl(不丢历史)', () => {
  appendRunEvent(dir, { kind: 'halt', runId: 'a' });
  archiveConsumed(dir, 1);
  assert.ok(existsSync(join(dir, 'RUN_EVENTS.archived.jsonl')));
  assert.match(readFileSync(join(dir, 'RUN_EVENTS.archived.jsonl'), 'utf8'), /"runId":"a"/);
});

test('损坏 JSONL fail-closed，并给出行号', () => {
  appendFileSync(join(dir, 'RUN_EVENTS.jsonl'), '{"kind":"halt","runId":"a"}\nnot-json\n');
  assert.throws(() => readNewEvents(dir), /第 2 行.*有效 JSON/);
});

test('事件不是 object 或缺少身份字段时 fail-closed', () => {
  appendFileSync(join(dir, 'RUN_EVENTS.jsonl'), '[1,2]\n');
  assert.throws(() => readNewEvents(dir), /must be a JSON object/);
});

test('归档游标不接受越界值', () => {
  appendRunEvent(dir, { kind: 'halt', runId: 'a' });
  assert.throws(() => archiveConsumed(dir, 2), /exceeds/);
});
