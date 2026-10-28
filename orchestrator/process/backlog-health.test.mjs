import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./backlog-health.mjs", import.meta.url);
const header = "| ID | 任务 | 状态 |\n|---|---|---|\n";
const row = (id, status = "📋 待办") => `| ${id} | 示例 | ${status} |\n`;

function fixture(active, archived = "") {
  const dir = mkdtempSync(join(tmpdir(), "backlog-health-"));
  const backlog = join(dir, "BACKLOG.md");
  writeFileSync(backlog, header + active);
  writeFileSync(join(dir, "BACKLOG-archive.md"), header + archived);
  return backlog;
}

test("执行任务 ID 唯一且未复用归档 ID时通过", () => {
  const backlog = fixture(row("T-002"), row("T-001", "✅ 完成"));
  const output = execFileSync(process.execPath, [SCRIPT.pathname, backlog], { encoding: "utf8" });
  assert.match(output, /执行任务 ID 唯一/);
});

test("执行看板内部重复 ID时报错", () => {
  const backlog = fixture(row("T-002") + row("T-002"));
  const result = spawnSync(process.execPath, [SCRIPT.pathname, backlog], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /执行看板存在重复 ID:T-002/);
});

test("执行任务复用归档 ID时报错", () => {
  const backlog = fixture(row("T-002"), row("T-002", "✅ 完成"));
  const result = spawnSync(process.execPath, [SCRIPT.pathname, backlog], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /执行看板复用了归档 ID:T-002/);
});

test("归档内部历史撞号只警告,不阻断执行", () => {
  const backlog = fixture(row("T-003"), row("T-001", "✅ 完成") + row("T-001", "✅ 完成"));
  const output = execFileSync(process.execPath, [SCRIPT.pathname, backlog], { encoding: "utf8" });
  assert.match(output, /归档内部保留 1 个历史撞号:T-001/);
});

test('历史来源索引只识别原行哈希，不能豁免新撞号或损坏来源', async () => {
  const fs=await import('node:fs');const path=await import('node:path');const {createHash}=await import('node:crypto');
  const first=row('T-001','✅ 完成').trimEnd(),second=row('T-001','✅ 历史').trimEnd();
  const backlog=fixture(row('T-003'),first+'\n'+second+'\n'),root=path.dirname(backlog);
  const index={schema:'historical-id-provenance/v1',collisions:[{id:'T-001',occurrences:[first,second].map((raw_row,i)=>({source_file:'BACKLOG-archive.md',source_line:i+3,raw_row,row_sha256:createHash('sha256').update(raw_row).digest('hex')}))}]};
  fs.writeFileSync(path.join(root,'provenance.json'),JSON.stringify(index));
  fs.writeFileSync(path.join(root,'BACKLOG-details.md'),'<!-- backlog-archive-provenance: provenance.json -->\n');
  const run=()=>spawnSync(process.execPath,[SCRIPT.pathname,backlog],{encoding:'utf8'});
  let result=run();assert.equal(result.status,0,result.stdout);assert.doesNotMatch(result.stdout,/\[WARN\].*历史撞号/);assert.match(result.stdout,/已核实.*1/);
  fs.appendFileSync(path.join(root,'BACKLOG-archive.md'),row('T-002')+row('T-002'));
  result=run();assert.equal(result.status,0,result.stdout);assert.match(result.stdout,/历史撞号:T-002/);
  index.collisions[0].occurrences[0].row_sha256='0'.repeat(64);fs.writeFileSync(path.join(root,'provenance.json'),JSON.stringify(index));
  result=run();assert.equal(result.status,1);assert.match(result.stdout,/来源索引.*不匹配/);
  fs.appendFileSync(backlog,row('T-003'));result=run();assert.equal(result.status,1);assert.match(result.stdout,/执行看板存在重复 ID:T-003/);
});

test('历史带空格ID及方框待办状态计数不丢项', () => {
  const backlog=fixture(row('T-433 S2','⏸️')+row('T-979','⬜ 待办'));
  const result=spawnSync(process.execPath,[SCRIPT.pathname,backlog,'--json'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.summary.task_states.paused,1);
  assert.equal(data.summary.task_states.todo,1);
});
