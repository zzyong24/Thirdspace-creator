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
