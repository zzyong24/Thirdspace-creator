import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('关键链路质量门必须保留安全降级与完整回归规则', () => {
  const agents = read('AGENTS.md');
  const ledger = read('orchestrator/LESSON_LEDGER.md');
  // 已完成任务按官方流程归档，历史验收要求仍需检查，不能要求永远留在活动看板。
  const backlog = [read('BACKLOG.md'), read('BACKLOG-archive.md')].join('\n');

  assert.match(agents, /关键链路禁止质量门反杀可用性/);
  assert.match(agents, /上一版可完成的合法任务[\s\S]*不得[\s\S]*整单失败/);
  assert.match(agents, /必须先确定性降级/);
  assert.match(agents, /旧版成功样例[\s\S]*完整公共调用链回归[\s\S]*全部输入族/);

  assert.match(ledger, /LED-043 — 质量安全门不能把上一版可完成的合法任务变成整单失败/);
  assert.match(ledger, /孤立 helper\/几何单测不能作为发布证据/);

  const repairTask = backlog.split('\n').find((line) => line.startsWith('| T-896 |')) ?? '';
  assert.match(repairTask, /分镜组装→正式安全门→HTML\/渲染输入/);
  assert.match(repairTask, /横图、方图、竖图/);
  assert.match(repairTask, /不能在 HyperFrames 启动前取消整单/);
});
