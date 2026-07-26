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
