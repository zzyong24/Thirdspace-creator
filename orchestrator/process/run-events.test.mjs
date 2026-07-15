import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
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
  assert.ok(ev.ts, 'ts 自动补');
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
