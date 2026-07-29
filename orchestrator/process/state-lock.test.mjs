import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireStateLock } from "./state-lock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TASKCTL = path.join(HERE, "taskctl.mjs");
const REVIEWCTL = path.join(HERE, "reviewctl.mjs");

test("共享状态锁让并发 taskctl 明确失败，而不是静默覆盖 BACKLOG/event", () => {
  const root = mkdtempSync(path.join(tmpdir(), "orchestrator-state-lock-"));
  try {
    mkdirSync(path.join(root, "orchestrator"), { recursive: true });
    const backlog = path.join(root, "BACKLOG.md");
    const original = [
      "| ID | 状态 | 审核 |",
      "|---|---|---|",
      "| T-LOCK | 📋 | — |",
      "",
    ].join("\n");
    writeFileSync(backlog, original);

    const release = acquireStateLock(root, { operation: "test-holder" });
    const blocked = spawnSync(
      process.execPath,
      [TASKCTL, "block", "T-LOCK", "--reason", "并发测试", "--backlog", backlog],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(blocked.status, 1);
    assert.match(`${blocked.stdout}${blocked.stderr}`, /状态写锁|state lock/i);
    assert.equal(readFileSync(backlog, "utf8"), original);
    release();

    const accepted = spawnSync(
      process.execPath,
      [TASKCTL, "block", "T-LOCK", "--reason", "锁释放后可写", "--backlog", backlog],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(readFileSync(backlog, "utf8"), /⏸️/);
    assert.equal(
      readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8")
        .trim()
        .split("\n").length,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reviewctl 与 taskctl 共用同一把项目写锁", () => {
  const root = mkdtempSync(path.join(tmpdir(), "orchestrator-review-lock-"));
  try {
    mkdirSync(path.join(root, "orchestrator"), { recursive: true });
    const backlog = path.join(root, "BACKLOG.md");
    const review = path.join(root, "SPEC.review.md");
    writeFileSync(
      backlog,
      [
        "| ID | 状态 | 文档 | 审核 | 验收 |",
        "|---|---|---|---|---|",
        "| T-REV | 📋 | [SPEC](SPEC.md) | 待审 | — |",
        "",
      ].join("\n"),
    );
    writeFileSync(path.join(root, "SPEC.md"), "# SPEC\n\nFR-1: 保留数据。\n");
    writeFileSync(path.join(root, "CONSTITUTION.md"), "# Constitution\n\n本地优先。\n");
    writeFileSync(
      path.join(root, "packet.json"),
      `${JSON.stringify({
        schema: "spec-review-round/v2",
        review_kind: "initial",
        summary: "无阻断问题",
        findings: [],
      })}\n`,
    );
    const args = [
      REVIEWCTL,
      "record",
      "T-REV",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      "packet.json",
      "--review",
      "SPEC.review.md",
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-model",
      "--model",
      "fixture-reviewer",
    ];

    const release = acquireStateLock(root, { operation: "test-holder" });
    const blocked = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.match(`${blocked.stdout}${blocked.stderr}`, /状态写锁|state lock/i);
    assert.equal(existsSync(review), false);
    assert.equal(existsSync(path.join(root, "orchestrator", "review-events.ndjson")), false);
    release();

    const accepted = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(existsSync(review), true);
    assert.equal(
      readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8")
        .trim()
        .split("\n").length,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
