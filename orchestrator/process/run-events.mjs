// process/run-events.mjs — RUN_EVENTS.jsonl 读写 + 游标归档(防 O(n²) 全量重读)。
// capture 侧(run.sh HALT / evaluator)append;消化侧(reconcile --consolidate)readNewEvents
// 后 archiveConsumed(把已消费行移进 .archived.jsonl,活动文件只留未消费 → 长度恒为增量)。
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const RUN_EVENT_SCHEMA = 'run-event/v1';
const f = (dir) => resolve(dir, 'RUN_EVENTS.jsonl');
const arc = (dir) => resolve(dir, 'RUN_EVENTS.archived.jsonl');

function assertRunEvent(ev, label = 'run event') {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  if (typeof ev.kind !== 'string' || !ev.kind.trim()) {
    throw new TypeError(`${label}.kind must be a non-empty string`);
  }
  if (typeof ev.runId !== 'string' || !ev.runId.trim()) {
    throw new TypeError(`${label}.runId must be a non-empty string`);
  }
  return ev;
}

export function appendRunEvent(dir, ev) {
  assertRunEvent(ev);
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ ...ev, schema: RUN_EVENT_SCHEMA, ts: ev.ts ?? new Date().toISOString() }) + '\n';
  appendFileSync(f(dir), line);
}
export function readNewEvents(dir) {
  if (!existsSync(f(dir))) return [];
  const lines = readFileSync(f(dir), 'utf8').split('\n');
  const events = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch (error) {
      throw new Error(`RUN_EVENTS.jsonl 第 ${index + 1} 行不是有效 JSON: ${error.message}`);
    }
    try {
      assertRunEvent(ev, `RUN_EVENTS.jsonl 第 ${index + 1} 行`);
    } catch (error) {
      throw new Error(error.message);
    }
    events.push(ev);
  });
  return events;
}
export function archiveConsumed(dir, n) {
  if (!existsSync(f(dir))) return;
  if (!Number.isInteger(n) || n < 0) throw new RangeError('archiveConsumed n must be a non-negative integer');
  const lines = readFileSync(f(dir), 'utf8').split('\n').filter(Boolean);
  if (n > lines.length) throw new RangeError(`archiveConsumed n=${n} exceeds ${lines.length} pending events`);
  const consumed = lines.slice(0, n), keep = lines.slice(n);
  if (consumed.length) appendFileSync(arc(dir), consumed.map((l) => l + '\n').join(''));
  writeFileSync(f(dir), keep.map((l) => l + '\n').join(''));
}
