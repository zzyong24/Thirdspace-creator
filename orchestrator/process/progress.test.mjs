import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const copyScheduler = (proc) => {
  fs.copyFileSync(path.join(HERE, "progress.mjs"), path.join(proc, "progress.mjs"));
  fs.copyFileSync(path.join(HERE, "autonomy-guard.mjs"), path.join(proc, "autonomy-guard.mjs"));
  fs.copyFileSync(path.join(HERE, "governance-guard.mjs"), path.join(proc, "governance-guard.mjs"));
};

function initAutonomousFixture(prefix, modules, backlogRows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const proc = path.join(root, "orchestrator", "process");
  fs.mkdirSync(proc, { recursive: true });
  copyScheduler(proc);
  fs.writeFileSync(path.join(proc, "reconcile.config.json"), JSON.stringify({ execution_mode: "autonomous", autonomy_level: "L2" }));
  fs.writeFileSync(path.join(proc, "modules.config.json"), JSON.stringify({ modules }));
  fs.writeFileSync(path.join(root, "BACKLOG.md"), `| ID | 状态 |\n|---|---|\n${backlogRows.join("\n")}\n`);
  spawnSync("git", ["init"], { cwd: root });
  spawnSync("git", ["config", "user.email", "t@example.test"], { cwd: root });
  spawnSync("git", ["config", "user.name", "T"], { cwd: root });
  fs.writeFileSync(path.join(root, "seed.txt"), "seed\n");
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-m", "base"], { cwd: root });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const run = (...args) => spawnSync(process.execPath, [path.join(proc, "progress.mjs"), ...args], { cwd: root, encoding: "utf8" });
  return { root, proc, head, run };
}

test("multi-step task 的中间 step 绑定 commit 但保持 BACKLOG 进行中；只有最后 step 要求 ✅", () => {
  const f = initAutonomousFixture("progress-multistep-done-", {
    delivery: { task_id: "TASK-101", tasks: ["formal-review", "implementation", "acceptance"], write_set: ["src/**"] },
  }, ["| TASK-101 | 🔨 |"]);
  let r = f.run("generate");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  r = f.run("done", "delivery:formal-review", "--commit", f.head);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let progress = JSON.parse(fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"));
  assert.equal(progress.verticals[0].tasks[0].status, "done");
  assert.equal(progress.verticals[0].commits["formal-review"], f.head);

  for (const state of ["📋", "⏸️", "✅"]) {
    fs.writeFileSync(path.join(f.root, "BACKLOG.md"), `| ID | 状态 |\n|---|---|\n| TASK-101 | ${state} |\n`);
    r = f.run("done", "delivery:implementation", "--commit", f.head);
    assert.equal(r.status, 1, `${state} must fail:\n${r.stdout}${r.stderr}`);
  }
  fs.writeFileSync(path.join(f.root, "BACKLOG.md"), "| ID | 状态 |\n|---|---|\n| TASK-101 | 🔨 |\n");
  r = f.run("done", "delivery:implementation", "--commit", f.head);
  assert.equal(r.status, 0, r.stdout + r.stderr);

  r = f.run("done", "delivery:acceptance", "--commit", f.head);
  assert.equal(r.status, 1, "final step must reject a still-in-progress board row");
  fs.writeFileSync(path.join(f.root, "BACKLOG.md"), "| ID | 状态 |\n|---|---|\n| TASK-101 | ✅ |\n");
  r = f.run("done", "delivery:acceptance", "--commit", f.head);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("step-level dependency 允许 review 先行，并在上游完成前 gate implementation", () => {
  const f = initAutonomousFixture("progress-step-dependency-", {
    foundation: { tasks: ["cutover"], write_set: ["foundation/**"] },
    delivery: {
      tasks: ["formal-review", "implementation", "acceptance"],
      depends_on: ["foundation:cutover"],
      step_depends_on: {
        "formal-review": [],
        "implementation": ["foundation:cutover"],
        "acceptance": ["foundation:cutover"],
      },
      write_set: ["delivery/**"],
    },
  }, ["| foundation | 🔨 |", "| delivery | 🔨 |"]);
  let r = f.run("generate");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("block", "foundation:cutover", "--reason", "upstream decision pending");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  r = f.run("schedule");
  let schedule = JSON.parse(r.stdout);
  assert.equal(schedule.task, "delivery:formal-review");

  const progressFile = path.join(f.root, "orchestrator", "progress.json");
  let progress = JSON.parse(fs.readFileSync(progressFile, "utf8"));
  progress.verticals.find((v) => v.id === "delivery").tasks[0].status = "done";
  fs.writeFileSync(progressFile, JSON.stringify(progress));
  r = f.run("schedule");
  schedule = JSON.parse(r.stdout);
  assert.equal(schedule.status, "hold");
  r = f.run("done", "delivery:implementation", "--commit", f.head);
  assert.equal(r.status, 1, "direct done must not bypass the current step dependency");

  progress = JSON.parse(fs.readFileSync(progressFile, "utf8"));
  const upstream = progress.verticals.find((v) => v.id === "foundation");
  upstream.blocked_reason = null;
  upstream.tasks[0].status = "done";
  fs.writeFileSync(progressFile, JSON.stringify(progress));
  r = f.run("schedule");
  schedule = JSON.parse(r.stdout);
  assert.equal(schedule.task, "delivery:implementation");

  r = f.run("block", "delivery:implementation", "--reason", "decision pending");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("done", "delivery:implementation", "--commit", f.head);
  assert.equal(r.status, 1, "direct done must not bypass a blocked current step");
  r = f.run("unblock", "delivery:implementation");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("claim", "delivery:implementation", "--agent", "agent-a");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("done", "delivery:implementation", "--commit", f.head);
  assert.equal(r.status, 1, "a lease must require its owner identity at done");
  r = f.run("done", "delivery:implementation", "--commit", f.head, "--agent", "agent-b");
  assert.equal(r.status, 1, "another agent must not consume the lease");
  r = f.run("done", "delivery:implementation", "--commit", f.head, "--agent", "agent-a");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("legacy module depends_on 与单 step 最终 ✅ 合同保持不变", () => {
  const f = initAutonomousFixture("progress-legacy-dependency-", {
    upstream: { tasks: ["ship"], write_set: ["upstream/**"] },
    downstream: { tasks: ["ship"], depends_on: ["upstream:ship"], write_set: ["downstream/**"] },
  }, ["| upstream | 🔨 |", "| downstream | ✅ |"]);
  let r = f.run("generate");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let progress = JSON.parse(fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"));
  progress.verticals.find((v) => v.id === "upstream").blocked_reason = "not ready";
  fs.writeFileSync(path.join(f.root, "orchestrator", "progress.json"), JSON.stringify(progress));
  r = f.run("schedule");
  assert.equal(JSON.parse(r.stdout).status, "hold");
  progress = JSON.parse(fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"));
  const upstream = progress.verticals.find((v) => v.id === "upstream");
  upstream.blocked_reason = null;
  upstream.tasks[0].status = "done";
  fs.writeFileSync(path.join(f.root, "orchestrator", "progress.json"), JSON.stringify(progress));
  r = f.run("schedule");
  assert.equal(JSON.parse(r.stdout).task, "downstream:ship");
  r = f.run("done", "downstream:ship", "--commit", f.head);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("autonomous generate 不得用 done_signals 越过 commit、顺序与 BACKLOG 门", () => {
  const f = initAutonomousFixture("progress-done-signals-", {
    delivery: {
      tasks: ["review", "implementation"], depends_on: [], write_set: ["evidence/**"],
      done_signals: { review: ["evidence/review.done"], implementation: ["evidence/implementation.done"] },
    },
  }, ["| delivery | 📋 |"]);
  fs.mkdirSync(path.join(f.root, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "evidence", "review.done"), "present\n");
  fs.writeFileSync(path.join(f.root, "evidence", "implementation.done"), "present\n");
  spawnSync("git", ["add", "evidence"], { cwd: f.root });
  spawnSync("git", ["commit", "-m", "pre-existing evidence"], { cwd: f.root });

  const r = f.run("generate");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const progress = JSON.parse(fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"));
  assert.deepEqual(progress.verticals[0].tasks.map((task) => task.status), ["pending", "pending"]);
  assert.deepEqual(progress.verticals[0].commits, {});
});

test("multi-step refactor 保持 block/unblock 与 lease 的独占和释放语义", () => {
  const f = initAutonomousFixture("progress-multistep-lease-", {
    delivery: { tasks: ["review", "implementation"], depends_on: [], write_set: ["delivery/**"] },
  }, ["| delivery | 🔨 |"]);
  let r = f.run("generate");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("claim", "delivery:review", "--agent", "agent-a");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("claim", "delivery:review", "--agent", "agent-b");
  assert.equal(r.status, 1, "a leased step must not be claimed twice");
  r = f.run("release", "delivery:review");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = f.run("block", "delivery:review", "--reason", "decision pending");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(f.run("schedule").stdout).status, "hold");
  r = f.run("unblock", "delivery:review");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(f.run("schedule").stdout).task, "delivery:review");
});
test("top task blocked 时 schedule 选择另一个依赖满足且 write-set 隔离的 ready task", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "progress-scheduler-"));
  const proc = path.join(root, "orchestrator", "process");
  fs.mkdirSync(proc, { recursive: true });
  copyScheduler(proc);
  fs.writeFileSync(path.join(proc, "modules.config.json"), JSON.stringify({ modules: {
    migration: { tasks: ["cutover"], write_set: ["db/**"] },
    reports: { tasks: ["ui"], depends_on: [], write_set: ["frontend/reports/**"] },
  } }));
  fs.writeFileSync(path.join(root, "orchestrator", "progress.json"), JSON.stringify({ summary: {}, leases: {}, verticals: [
    { id: "migration", blocked_reason: "DEC needed", tasks: [{ step: "cutover", status: "pending" }], commits: {} },
    { id: "reports", blocked_reason: null, tasks: [{ step: "ui", status: "pending" }], commits: {} },
  ] }));
  const r = spawnSync(process.execPath, [path.join(proc, "progress.mjs"), "schedule"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.status, "ready");
  assert.equal(result.task, "reports:ui");
  assert.equal(result.bypassed_blocked.includes("migration:cutover"), true);
});

test("autonomous progress done 拒绝无 commit、假 commit 与未完成 board transition", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "progress-done-"));
  const proc = path.join(root, "orchestrator", "process"); fs.mkdirSync(proc, { recursive: true });
  copyScheduler(proc);
  fs.writeFileSync(path.join(proc, "reconcile.config.json"), JSON.stringify({ execution_mode: "autonomous", autonomy_level: "L2" }));
  fs.writeFileSync(path.join(proc, "modules.config.json"), JSON.stringify({ modules: { "T-001": { tasks: ["work"], write_set: ["x"] } } }));
  fs.writeFileSync(path.join(root, "orchestrator", "progress.json"), JSON.stringify({ summary: {}, leases: {}, verticals: [{ id: "T-001", tasks: [{ step: "work", status: "pending" }], commits: {} }] }));
  fs.writeFileSync(path.join(root, "BACKLOG.md"), "| ID | 状态 |\n|---|---|\n| T-001 | 🔨 |\n");
  spawnSync("git", ["init"], { cwd: root }); spawnSync("git", ["config", "user.email", "t@example.test"], { cwd: root }); spawnSync("git", ["config", "user.name", "T"], { cwd: root });
  fs.writeFileSync(path.join(root, "x"), "x"); spawnSync("git", ["add", "."], { cwd: root }); spawnSync("git", ["commit", "-m", "base"], { cwd: root });
  const call = (args) => spawnSync(process.execPath, [path.join(proc, "progress.mjs"), "done", "T-001:work", ...args], { cwd: root, encoding: "utf8" });
  let r = call([]); assert.equal(r.status, 1); assert.match(r.stderr, /commit/i);
  r = call(["--commit", "deadbeef"]); assert.equal(r.status, 1); assert.match(r.stderr, /commit/i);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  r = call(["--commit", head]); assert.equal(r.status, 1); assert.match(r.stderr, /BACKLOG|board|✅/i);
});

test("T-029 历史 review 污染被 task-scoped quarantine，scheduler 仍领取 T-024", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "progress-governance-quarantine-"));
  const proc = path.join(root, "orchestrator", "process");
  fs.mkdirSync(proc, { recursive: true });
  copyScheduler(proc);
  fs.writeFileSync(path.join(proc, "modules.config.json"), JSON.stringify({ modules: {
    migration: { task_id: "T-029", tasks: ["cutover"], write_set: ["src/migration/**"] },
    reports: { task_id: "T-024", tasks: ["ship"], write_set: ["src/reports/**"] },
  } }));
  fs.writeFileSync(path.join(root, "orchestrator", "progress.json"), JSON.stringify({ summary: {}, leases: {}, verticals: [
    { id: "migration", task_id: "T-029", blocked_reason: null, tasks: [{ step: "cutover", status: "pending" }], write_set: ["src/migration/**"], commits: {} },
    { id: "reports", task_id: "T-024", blocked_reason: null, tasks: [{ step: "ship", status: "pending" }], write_set: ["src/reports/**"], commits: {} },
  ] }));
  fs.writeFileSync(path.join(root, "BACKLOG.md"), "| ID | 状态 |\n|---|---|\n| T-029 | 📋 |\n| T-024 | 📋 |\n");
  const polluted = Array.from({ length: 10 }, (_, index) => JSON.stringify({
    task_id: "T-029", cycle: index + 1, round: 1, review_kind: "initial", event_hash: `h-${index}`,
  })).join("\n");
  fs.writeFileSync(path.join(root, "orchestrator", "review-events.ndjson"), `${polluted}\n`);
  fs.writeFileSync(path.join(root, "orchestrator", "DELIVERY_GUARD.json"), JSON.stringify({
    schema: "delivery-guard/v1", max_review_cycles_per_task: 2, max_review_events_per_task: 6,
  }));

  const result = spawnSync(process.execPath, [path.join(proc, "progress.mjs"), "schedule"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const schedule = JSON.parse(result.stdout);
  assert.equal(schedule.status, "ready");
  assert.equal(schedule.task, "reports:ship");
  assert.deepEqual(schedule.quarantined, ["migration:cutover"]);
  const globalPreflight = spawnSync(process.execPath, [path.join(proc, "autonomy-guard.mjs"), "audit", "--root", root], { cwd: root, encoding: "utf8" });
  assert.equal(globalPreflight.status, 0, globalPreflight.stdout + globalPreflight.stderr);
});

test("T-029 历史 complexity/REV-ADD governance debt 被隔离，scheduler 仍领取 T-024", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "progress-governance-debt-"));
  const proc = path.join(root, "orchestrator", "process");
  fs.mkdirSync(proc, { recursive: true });
  copyScheduler(proc);
  fs.mkdirSync(path.join(root, "docs", "tasks"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "reports"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "tasks", "T-029.md"), "[REV-ADD] AC-901 Swift native app Keychain IPC same-UID malicious process\n");
  fs.writeFileSync(path.join(root, "src", "reports", "index.ts"), "export const reports = true;\n");
  fs.writeFileSync(path.join(root, "orchestrator", "SCOPE_AUTHORIZATIONS.json"), JSON.stringify({ schema: "scope-authorizations/v1", authorizations: [] }));
  fs.writeFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), JSON.stringify({ schema: "complexity-ledger/v1", entries: [], historical_baselines: [] }));
  fs.writeFileSync(path.join(proc, "modules.config.json"), JSON.stringify({ modules: {
    migration: { task_id: "T-029", tasks: ["cutover"], write_set: ["docs/tasks/T-029.md"] },
    reports: { task_id: "T-024", tasks: ["ship"], write_set: ["src/reports/**"] },
  } }));
  fs.writeFileSync(path.join(root, "orchestrator", "progress.json"), JSON.stringify({ summary: {}, leases: {}, verticals: [
    { id: "migration", task_id: "T-029", blocked_reason: null, tasks: [{ step: "cutover", status: "pending" }], write_set: ["docs/tasks/T-029.md"], commits: {} },
    { id: "reports", task_id: "T-024", blocked_reason: null, tasks: [{ step: "ship", status: "pending" }], write_set: ["src/reports/**"], commits: {} },
  ] }));

  const result = spawnSync(process.execPath, [path.join(proc, "progress.mjs"), "schedule"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const schedule = JSON.parse(result.stdout);
  assert.equal(schedule.task, "reports:ship");
  assert.deepEqual(schedule.quarantined_governance, ["migration:cutover"]);
});
