import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "backlog-compact.mjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backlog-compact-"));
  const backlog = path.join(root, "BACKLOG.md");
  fs.writeFileSync(
    backlog,
    [
      "# BACKLOG",
      "",
      "## 执行队列",
      "",
      "| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |",
      "|---|---|---|---|---|---|---|",
      "| T-003 | 当前任务 | 🔨 待办 | — | — | [SPEC](SPEC.md) | " + "长范围。".repeat(90) + " |",
      "| T-002 | 已完成任务 | ✅ 完成 | PASS[REV:abcdef123456] | PASS:abcdef123456 | [SPEC](DONE.md) | 已交付真实能力。 |",
      "",
      "## ⏸️ 暂停池",
      "",
      "| ID | 任务 | 搁置 | 文档 | 恢复条件 |",
      "|---|---|---|---|---|",
      "| T-001 | 很久以后才恢复的任务 | ⏸️ | [SPEC](PAUSED.md) | 等用户明确恢复并补齐前置条件。 |",
      "",
      "## ✅ 已完成",
      "",
    ].join("\n"),
  );
  return { root, backlog };
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, path.join(root, "BACKLOG.md"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("--all 归档活动表完成行时保留七列 receipt，不再塞进五列表头", () => {
  const { root } = fixture();
  const result = run(root, "--all");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  const archive = fs.readFileSync(path.join(root, "BACKLOG-archive.md"), "utf8");
  assert.doesNotMatch(backlog, /T-002/);
  assert.match(archive, /\| ID \| 任务 \| 状态 \| 审核 \| 验收 \| 文档 \| 一句话 \|/);
  assert.match(archive, /PASS\[REV:abcdef123456\].*PASS:abcdef123456/);
});

test("--squeeze 把长详情和暂停恢复条件外置，主看板仍保留任务状态且重复运行幂等", () => {
  const { root } = fixture();
  let result = run(root, "--all", "--squeeze");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const once = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  const detailsOnce = fs.readFileSync(path.join(root, "BACKLOG-details.md"), "utf8");
  assert.match(once, /T-003.*🔨/);
  assert.match(once, /T-001.*⏸️/);
  assert.match(once, /\|ID\|状态\|审核\|验收\|文档\|/);
  assert.match(once, /T-001\|⏸️\|—\|—\|\[详情\]/);
  assert.doesNotMatch(once, /PAUSED\.md/);
  assert.doesNotMatch(once, /长范围。{2,}/);
  assert.match(detailsOnce, /<a id="t-003"><\/a>/);
  assert.match(detailsOnce, /<a id="t-001"><\/a>/);
  assert.match(detailsOnce, /等用户明确恢复并补齐前置条件/);

  result = run(root, "--all", "--squeeze");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), once);
  assert.equal(fs.readFileSync(path.join(root, "BACKLOG-details.md"), "utf8"), detailsOnce);
});

test('已存在锚点的新版长叙事必须追加保全而非静默丢弃', () => {
  const {root,backlog} = fixture();
  let result=run(root,'--all','--squeeze');
  assert.equal(result.status,0,result.stderr);
  const previous=fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8');
  let src=fs.readFileSync(backlog,'utf8');
  src=src.replace('见详情。','第二次新增要求。'.repeat(60));
  fs.writeFileSync(backlog,src);
  result=run(root,'--squeeze');
  assert.equal(result.status,0,result.stderr);
  const next=fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8');
  assert.ok(next.startsWith(previous.trimEnd()));
  assert.match(next,/第二次新增要求/);
  const stable=fs.readFileSync(backlog,'utf8');
  result=run(root,'--squeeze');
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(backlog,'utf8'),stable);
  assert.equal(fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8'),next);
});

test('暂停区七列表按表头保留审核与验收，不按旧五列错位', () => {
  const {root,backlog}=fixture();
  fs.writeFileSync(backlog,'## ⏸️ 暂停池\n| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |\n|---|---|---|---|---|---|---|\n| T-901 | 暂停任务 | ⏸️ | PASS[REV:abcdef123456] | 待验 | [SPEC](PAUSED.md) | 等真实材料 |\n');
  const result=run(root,'--squeeze');
  assert.equal(result.status,0,result.stderr);
  const next=fs.readFileSync(backlog,'utf8');
  assert.match(next,/T-901\|⏸️\|PASS\[REV:abcdef123456\]\|待验\|/);
  assert.match(fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8'),/PAUSED.md/);
});

test('--index显式保留行维持完整七列叙事，不再被squeeze缩写', () => {
  const {root,backlog}=fixture();
  const original=fs.readFileSync(backlog,'utf8').split('\n').find(line=>line.startsWith('| T-003 |'));
  const result=run(root,'--all','--index','--retain','T-003');
  assert.equal(result.status,0,result.stderr);
  assert.ok(fs.readFileSync(backlog,'utf8').split('\n').includes(original));
});

test('--index在暂停区保留完整行时保持列一致，已索引保留请求不得写坏', () => {
  for(const legacy of [true,false]){
    const {root,backlog}=fixture();
    fs.writeFileSync(backlog,legacy?'## ⏸️ 暂停\n|ID|任务|搁置|文档|恢复条件|\n|---|---|---|---|---|\n|T-901|暂停任务|⏸️|—|等资料|\n':'## ⏸️ 暂停\n|ID|任务|状态|审核|验收|文档|一句话|\n|---|---|---|---|---|---|---|\n|T-901|暂停任务|⏸️|—|待验|—|等资料|\n');
    const result=run(root,'--index','--retain','T-901');assert.equal(result.status,0,result.stderr);
    const lines=fs.readFileSync(backlog,'utf8').split('\n'),index=lines.findIndex(l=>l.includes('|T-901|')||l.includes('| T-901 |'));
    const head=lines.slice(0,index).findLast(l=>/^\|\s*ID\s*\|/.test(l));
    assert.equal(lines[index].split('|').length,head.split('|').length);
    assert.match(head,/任务/);assert.match(lines[index],/等资料/);
  }
  const {root,backlog}=fixture();
  assert.equal(run(root,'--all','--index').status,0);
  const original=fs.readFileSync(backlog,'utf8'),details=fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8');
  const result=run(root,'--index','--retain','T-001');assert.equal(result.status,1);
  assert.equal(fs.readFileSync(backlog,'utf8'),original);assert.equal(fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8'),details);
});

test('新索引再次使用既有--squeeze入口保持幂等和五列表头', () => {
  const {root,backlog}=fixture();
  assert.equal(run(root,'--all','--index').status,0);
  const once=fs.readFileSync(backlog,'utf8'),details=fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8');
  const result=run(root,'--squeeze');assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(backlog,'utf8'),once);
  assert.equal(fs.readFileSync(path.join(root,'BACKLOG-details.md'),'utf8'),details);
});
