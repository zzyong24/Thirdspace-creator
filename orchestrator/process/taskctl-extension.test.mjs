import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TASKCTL = path.join(HERE, "taskctl.mjs");

function rootWith(status, acceptance, review = "PASS[REV:abc123]") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskctl-extension-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 |",
      "|---|---|---|---|---|---|",
      `| T-101 | 通用任务 | ${status} | — | ${review} | ${acceptance} |`,
      "",
    ].join("\n"),
  );
  return root;
}

test("buildout 开工不要求 review sidecar，但拒绝把待审 formal review 带回快速铺开期", () => {
  const fast = rootWith("📋", "—", "—");
  fs.writeFileSync(
    path.join(fast, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify({ receipt_policy: "required", delivery_phase: "buildout", research_verify_commands: {} })}\n`,
  );
  let result = run(fast, "start", "T-101");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(fast, "BACKLOG.md"), "utf8"), /🔨/);
  assert.equal(fs.existsSync(path.join(fast, "orchestrator", "review-events.ndjson")), false);

  const ceremonial = rootWith("📋", "—", "待审");
  fs.writeFileSync(
    path.join(ceremonial, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify({ receipt_policy: "required", delivery_phase: "buildout", research_verify_commands: {} })}\n`,
  );
  result = run(ceremonial, "start", "T-101");
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /buildout|快速铺开|正式审核/i);
  assert.match(fs.readFileSync(path.join(ceremonial, "BACKLOG.md"), "utf8"), /📋/);
});

function run(root, ...args) {
  return spawnSync(process.execPath, [TASKCTL, ...args, "--backlog", path.join(root, "BACKLOG.md")], {
    cwd: root,
    encoding: "utf8",
  });
}

test("block 会使已有 acceptance PASS 失效并留下结构化事件", () => {
  const root = rootWith("🔨", "PASS:abcdef123456");
  const result = run(root, "block", "T-101", "--reason", "上游输入失效");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /⏸️.*待验/);
  const event = JSON.parse(fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8"));
  assert.equal(event.invalidated_acceptance, "PASS:abcdef123456");
});

test("resume 不能绕过仍开放的 Research-First Gate", () => {
  const root = rootWith("⏸️", "待验");
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify({ receipt_policy: "required", research_verify_commands: {} })}\n`,
  );
  fs.writeFileSync(
    path.join(root, "orchestrator", "events.ndjson"),
    `${JSON.stringify({ ts: new Date().toISOString(), actor: "research-gate", action: "research_open", task: "T-101", research_task: "T-102", card: "docs/research/T-102.md" })}\n`,
  );
  const result = run(root, "resume", "T-101", "--reason", "自称已恢复");
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /Research-First Gate|未关闭/i);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /⏸️/);
});

test('start同步清理旧状态词，不误删后续限制说明', () => {
  const root = rootWith('📋 待办（等待实机）', '—', '—');
  fs.writeFileSync(path.join(root, 'orchestrator/process/reconcile.config.json'), JSON.stringify({receipt_policy:'required',delivery_phase:'buildout',research_verify_commands:{}}));
  const result = run(root, 'start', 'T-101');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(root, 'BACKLOG.md'),'utf8'), /🔨（等待实机）/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'BACKLOG.md'),'utf8'), /🔨\s*待办/);
});

test('normalize-labels保留状态和票据，记录原文，幂等且守并发', () => {
  const root = rootWith('⏸️ 进行中 · 缺材料', 'PASS:abcdef123456');
  let result = run(root, 'normalize-labels', 'T-101', '--expect-sha', '000000');
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(root,'orchestrator/events.ndjson')),false);
  result = run(root, 'normalize-labels', 'T-101');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const once = fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8');
  assert.match(once,/⏸️ · 缺材料.*PASS:abcdef123456/);
  const events = fs.readFileSync(path.join(root,'orchestrator/events.ndjson'),'utf8');
  const event = JSON.parse(events);
  assert.equal(event.status_before, '⏸️ 进行中 · 缺材料');
  assert.equal(event.status_after, '⏸️ · 缺材料');
  result = run(root, 'normalize-labels', 'T-101');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8'), once);
  assert.equal(fs.readFileSync(path.join(root,'orchestrator/events.ndjson'),'utf8'),events);
});

test('索引任务complete只扫描本任务真实文档，不能漏旅程或混入他项合同', async () => {
  const {parseBacklogTaskRows,createTaskMetadata}=await import('./backlog-task-metadata.mjs');
  for(const journey of [true,false]) for(const document of ['[SPEC](own.md) [D](BACKLOG-details.md#unrelated)', 'own.md']) {
    const root=rootWith('🔨','—','—');
    fs.writeFileSync(path.join(root,'orchestrator/process/reconcile.config.json'),JSON.stringify({receipt_policy:'required',delivery_phase:'buildout'}));
    const original=fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8').replace('| — | — | — |','| '+document+' | — | — |');
    fs.writeFileSync(path.join(root,'own.md'),journey?'```frontend-journey-contract\n{}\n```\n':'# 普通后端任务\n');
    const task=parseBacklogTaskRows(original).tasks[0],entry=createTaskMetadata(task);
    fs.writeFileSync(path.join(root,'BACKLOG-details.md'),entry.block+'\n<a id="unrelated"></a>\n```frontend-journey-contract\n{}\n```\n');
    fs.writeFileSync(path.join(root,'BACKLOG.md'),'|ID|状态|审核|验收|文档|\n|---|---|---|---|---|\n|T-101|🔨|—|—|'+entry.link+'|\n');
    const result=run(root,'complete','T-101','--evidence','真实后端测试通过');
    assert.equal(result.status,journey?1:0,result.stderr||result.stdout);
    if(journey)assert.match(result.stderr,/frontend journey contract/);
  }
});
