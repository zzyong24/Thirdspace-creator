import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "autonomy-guard.mjs");
const run = (root, args = ["audit", "--root", root]) => spawnSync(process.execPath, [GUARD, ...args], { cwd: root, encoding: "utf8" });
const canonicalEventHash = (events) => createHash("sha256")
  .update(events.map((event) => JSON.stringify(event)).join("\n") + "\n")
  .digest("hex");

test("manifest/DEC 宣称 L2 但缺 progress/modules/verify 时 fail-closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-preflight-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml"), "notes: L2 autonomous\n");
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), "Decision: L2 gated autonomy，继续推进\n");
  fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), JSON.stringify({ autonomy_level: "L2" }));
  const r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /progress\.json/);
  assert.match(r.stdout + r.stderr, /modules\.config\.json|verify/i);
});

test("10 个 review cycle 且无 board/progress transition 触发 watchdog HALT", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-watchdog-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  fs.writeFileSync(path.join(root, "orchestrator", "review-events.ndjson"), Array.from({ length: 10 }, (_, i) => JSON.stringify({ task_id: "T-029", cycle: i + 1, round: 1, event_hash: `h${i}` })).join("\n") + "\n");
  fs.writeFileSync(path.join(root, "orchestrator", "AUTONOMY_EVENTS.ndjson"), [1, 2].map(i => JSON.stringify({ task_id: "T-029", before_head: "abc", after_head: "abc", before_progress: "p", after_progress: "p", before_board: "b", after_board: "b", iteration: i })).join("\n") + "\n");
  fs.writeFileSync(path.join(root, "orchestrator", "DELIVERY_GUARD.json"), JSON.stringify({ schema: "delivery-guard/v1", max_review_cycles_per_task: 2, max_stalled_iterations: 2 }));
  const r = run(root, ["watchdog", "--root", root]);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /T-029.*10|10.*T-029/);
  assert.match(r.stdout + r.stderr, /HALT|REPLAN|transition/i);
});

test("completed task 的 legacy review cycles 不全局阻断独立 ready task", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-completed-history-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  fs.writeFileSync(path.join(root, "BACKLOG.md"), [
    "| ID | 状态 |",
    "|---|---|",
    "| T-029 | ✅ |",
    "| T-024 | 📋 |",
    "",
  ].join("\n"));
  const legacy = Array.from({ length: 10 }, (_, index) => ({
    task_id: "T-029", round: 1, review_kind: "initial", event_hash: `legacy-${index}`,
  }));
  fs.writeFileSync(path.join(root, "orchestrator", "review-events.ndjson"), `${legacy.map(JSON.stringify).join("\n")}\n`);
  fs.writeFileSync(path.join(root, "orchestrator", "DELIVERY_GUARD.json"), JSON.stringify({
    schema: "delivery-guard/v1", max_review_cycles_per_task: 2, max_review_events_per_task: 6,
  }));

  const result = run(root, ["watchdog", "--root", root]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("baseline-marker 只读生成 task-scoped canonical prefix marker", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-baseline-marker-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  const taskEvents = [
    { task_id: "T-029", review_kind: "initial", event_hash: "a" },
    { task_id: "T-029", review_kind: "recheck", event_hash: "b" },
  ];
  const unrelated = { task_id: "T-024", review_kind: "initial", event_hash: "c" };
  fs.writeFileSync(path.join(root, "orchestrator", "review-events.ndjson"), `${[taskEvents[0], unrelated, taskEvents[1]].map(JSON.stringify).join("\n")}\n`);

  const result = run(root, ["baseline-marker", "--root", root, "--task", "T-029", "--reason", "legacy incident quarantine"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const marker = JSON.parse(result.stdout);
  assert.deepEqual(marker, {
    status: "quarantined",
    review_event_count: 2,
    review_events_sha256: canonicalEventHash(taskEvents),
    reason: "legacy incident quarantine",
  });
});

test("task-scoped marker 只隔离绑定 hash 的历史前缀；同 task 新增变化仍红", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-task-baseline-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  fs.writeFileSync(path.join(root, "BACKLOG.md"), "| ID | 状态 |\n|---|---|\n| T-029 | 📋 |\n");
  const historical = Array.from({ length: 4 }, (_, index) => ({
    task_id: "T-029", cycle: index + 1, round: 1, review_kind: "initial", event_hash: `old-${index}`,
  }));
  const reviewFile = path.join(root, "orchestrator", "review-events.ndjson");
  fs.writeFileSync(reviewFile, `${historical.map(JSON.stringify).join("\n")}\n`);
  const guardFile = path.join(root, "orchestrator", "DELIVERY_GUARD.json");
  const guard = {
    schema: "delivery-guard/v1",
    max_review_cycles_per_task: 2,
    max_review_events_per_task: 6,
    review_cycle_baselines: {
      "T-029": {
        status: "isolated",
        review_event_count: historical.length,
        review_events_sha256: canonicalEventHash(historical),
        reason: "legacy lineage retained read-only",
      },
    },
  };
  fs.writeFileSync(guardFile, JSON.stringify(guard));
  fs.appendFileSync(reviewFile, `${JSON.stringify({ task_id: "T-024", cycle: 1, round: 1, review_kind: "initial", event_hash: "other-task" })}\n`);

  let result = run(root, ["task-preflight", "--root", root, "--task", "T-029"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  guard.review_cycle_baselines["T-029"].status = "quarantined";
  fs.writeFileSync(guardFile, JSON.stringify(guard));
  result = run(root, ["task-preflight", "--root", root, "--task", "T-029"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /historical|quarantined|authorization/i);
  guard.review_cycle_baselines["T-029"].status = "isolated";
  fs.writeFileSync(guardFile, JSON.stringify(guard));

  const added = { task_id: "T-029", cycle: 5, round: 1, review_kind: "initial", event_hash: "new-1" };
  fs.appendFileSync(reviewFile, `${JSON.stringify(added)}\n`);
  result = run(root, ["task-preflight", "--root", root, "--task", "T-029"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /T-029.*baseline|baseline.*T-029|新增|new/i);

  const tampered = historical.map((event, index) => index === 0 ? { ...event, event_hash: "tampered" } : event);
  fs.writeFileSync(reviewFile, `${tampered.map(JSON.stringify).join("\n")}\n`);
  result = run(root, ["task-preflight", "--root", root, "--task", "T-029"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /hash|tamper|篡改|baseline/i);
});
