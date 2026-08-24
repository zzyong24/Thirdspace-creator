import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TASKCTL = path.join(HERE, "taskctl.mjs");

function rootWith(status, acceptance) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskctl-extension-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 |",
      "|---|---|---|---|---|---|",
      `| T-101 | 通用任务 | ${status} | — | PASS[REV:abc123] | ${acceptance} |`,
      "",
    ].join("\n"),
  );
  return root;
}

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
