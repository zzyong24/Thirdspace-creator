import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "delivery-phase.mjs");

function fixture({ phase, steps = ["implementation", "acceptance"], review = "—" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-phase-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  const config = { receipt_policy: "required" };
  if (phase) config.delivery_phase = phase;
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "modules.config.json"),
    `${JSON.stringify({ modules: { feature: { task_id: "T-001", tasks: steps } } }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 |",
      "|---|---|---|---|---|---|",
      `| T-001 | 铺开基本功能 | 📋 | — | ${review} | — |`,
      "",
    ].join("\n"),
  );
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [CLI, ...args, "--root", root], {
    cwd: root,
    encoding: "utf8",
  });
}

test("fresh buildout 只允许 implementation/acceptance，不生产 formal-review 队列", () => {
  const clean = fixture({ phase: "buildout" });
  let result = run(clean, "audit", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).phase, "buildout");

  const formal = fixture({
    phase: "buildout",
    steps: ["formal-review", "implementation", "acceptance"],
    review: "待审",
  });
  result = run(formal, "audit", "--json");
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /formal-review|buildout|正式审核/i);
});

test("旧项目缺 delivery_phase 时保持 maintenance 兼容，不静默降级", () => {
  const root = fixture();
  const result = run(root, "status", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = JSON.parse(result.stdout);
  assert.equal(state.phase, "maintenance");
  assert.equal(state.source, "legacy-compat");
});

test("buildout 提升 maintenance 必须绑定用户决策与干净基线，且不能自动降回", () => {
  const root = fixture({ phase: "buildout" });
  fs.writeFileSync(
    path.join(root, "orchestrator", "DECISION_LOG.md"),
    [
      "ID: DEC-001",
      "Decision: 进入稳定维护期",
      "Owner: user",
      "Status: active",
      "Delivery-Phase: maintenance",
      "",
    ].join("\n"),
  );
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["config", "user.email", "delivery@example.test"], { cwd: root });
  spawnSync("git", ["config", "user.name", "Delivery Test"], { cwd: root });
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "--no-verify", "-qm", "buildout baseline"], { cwd: root });

  let result = run(root, "promote", "--decision", "DEC-001", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), "utf8"),
  );
  assert.equal(config.delivery_phase, "maintenance");
  assert.equal(config.maintenance_decision, "DEC-001");
  assert.match(config.maintenance_baseline_sha, /^[a-f0-9]{40}$/);

  result = run(root, "promote", "--decision", "DEC-001", "--json");
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /already|已经.*maintenance|单向/i);
});
