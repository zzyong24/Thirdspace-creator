// process/run-events.mjs — RUN_EVENTS.jsonl 读写 + 游标归档(防 O(n²) 全量重读)。
// capture 侧(run.sh HALT / evaluator)append;消化侧(reconcile --consolidate)readNewEvents
// 后 archiveConsumed(把已消费行移进 .archived.jsonl,活动文件只留未消费 → 长度恒为增量)。
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const f = (dir) => resolve(dir, 'RUN_EVENTS.jsonl');
const arc = (dir) => resolve(dir, 'RUN_EVENTS.archived.jsonl');

export function appendRunEvent(dir, ev) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...ev }) + '\n';
  appendFileSync(f(dir), line);
}
export function readNewEvents(dir) {
  if (!existsSync(f(dir))) return [];
  return readFileSync(f(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export function archiveConsumed(dir, n) {
  if (!existsSync(f(dir))) return;
  const lines = readFileSync(f(dir), 'utf8').split('\n').filter(Boolean);
  const consumed = lines.slice(0, n), keep = lines.slice(n);
  if (consumed.length) appendFileSync(arc(dir), consumed.map((l) => l + '\n').join(''));
  writeFileSync(f(dir), keep.map((l) => l + '\n').join(''));
}
