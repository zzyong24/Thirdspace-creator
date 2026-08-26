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
  fs.copyFileSync(path.join(HERE, "state-lock.mjs"), path.join(proc, "state-lock.mjs"));
  fs.copyFileSync(path.join(HERE, "parallel-isolation.mjs"), path.join(proc, "parallel-isolation.mjs"));
  fs.copyFileSync(path.join(HERE, "delivery-phase.mjs"), path.join(proc, "delivery-phase.mjs"));
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

test("formal-review 引用既有 attestation 合同时可完成中间 step，且不越界修改 complexity ledger", () => {
  const rel = "docs/features/profile/PROFILE_SPEC.md";
  const f = initAutonomousFixture("progress-reused-attestation-", {
    delivery: {
      task_id: "TASK-REVIEW",
      tasks: ["formal-review", "implementation", "acceptance"],
      step_depends_on: { "formal-review": [], "implementation": [], "acceptance": [] },
      write_set: [rel],
    },
  }, ["| TASK-REVIEW | 🔨 |"]);
  fs.mkdirSync(path.dirname(path.join(f.root, rel)), { recursive: true });
  fs.writeFileSync(path.join(f.root, rel), [
    "# Compatibility-only review",
    "The facade reuses stable API-004 and delegates attestation verification to the existing owner.",
    "It creates no evidence protocol, approval system, store, scheduler, runtime state, or operation.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(f.root, "orchestrator", "SCOPE_AUTHORIZATIONS.json"), JSON.stringify({ schema: "scope-authorizations/v1", authorizations: [] }));
  fs.writeFileSync(path.join(f.root, "orchestrator", "COMPLEXITY_LEDGER.json"), JSON.stringify({ schema: "complexity-ledger/v1", entries: [] }));
  fs.writeFileSync(path.join(f.root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({ schema: "threat-model/v1", threats: [] }));
  spawnSync("git", ["add", "."], { cwd: f.root });
  spawnSync("git", ["commit", "-m", "review compatibility spec"], { cwd: f.root });
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.root, encoding: "utf8" }).stdout.trim();
  const ledgerBefore = fs.readFileSync(path.join(f.root, "orchestrator", "COMPLEXITY_LEDGER.json"), "utf8");

  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = f.run("done", "delivery:formal-review", "--commit", commit);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const progress = JSON.parse(fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"));
  assert.equal(progress.verticals[0].tasks[0].status, "done");
  assert.equal(progress.verticals[0].tasks[1].status, "pending");
  assert.match(fs.readFileSync(path.join(f.root, "BACKLOG.md"), "utf8"), /TASK-REVIEW \| 🔨/);
  assert.equal(fs.readFileSync(path.join(f.root, "orchestrator", "COMPLEXITY_LEDGER.json"), "utf8"), ledgerBefore);
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

test("batch --json 只返回 write/read/resource 互不冲突的可并行集", () => {
  const f = initAutonomousFixture("progress-batch-conflicts-", {
    "write-root": {
      task_id: "TASK-WRITE-ROOT",
      tasks: ["work"],
      write_set: ["src/accounts/**"],
      read_set: [],
      exclusive_resources: [],
    },
    "write-exact": {
      task_id: "TASK-WRITE-EXACT",
      tasks: ["work"],
      write_set: ["src/accounts/**"],
      read_set: [],
      exclusive_resources: [],
    },
    "write-child": {
      task_id: "TASK-WRITE-CHILD",
      tasks: ["work"],
      write_set: ["src/accounts/profile.ts"],
      read_set: [],
      exclusive_resources: [],
    },
    "contract-reader": {
      task_id: "TASK-CONTRACT-READER",
      tasks: ["work"],
      write_set: [],
      read_set: ["src/contracts/**"],
      exclusive_resources: [],
    },
    "contract-writer": {
      task_id: "TASK-CONTRACT-WRITER",
      tasks: ["work"],
      write_set: ["src/contracts/api.ts"],
      read_set: [],
      exclusive_resources: [],
    },
    "database-a": {
      task_id: "TASK-DATABASE-A",
      tasks: ["work"],
      write_set: ["src/jobs/a.ts"],
      read_set: [],
      exclusive_resources: ["integration-database"],
    },
    "database-b": {
      task_id: "TASK-DATABASE-B",
      tasks: ["work"],
      write_set: ["src/jobs/b.ts"],
      read_set: [],
      exclusive_resources: ["integration-database"],
    },
    independent: {
      task_id: "TASK-INDEPENDENT",
      tasks: ["work"],
      write_set: ["src/reports/**"],
      read_set: ["src/public/**"],
      exclusive_resources: ["report-fixture"],
    },
  }, [
    "| TASK-WRITE-ROOT | 📋 |",
    "| TASK-WRITE-EXACT | 📋 |",
    "| TASK-WRITE-CHILD | 📋 |",
    "| TASK-CONTRACT-READER | 📋 |",
    "| TASK-CONTRACT-WRITER | 📋 |",
    "| TASK-DATABASE-A | 📋 |",
    "| TASK-DATABASE-B | 📋 |",
    "| TASK-INDEPENDENT | 📋 |",
  ]);

  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = f.run("batch", "--json", "10");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const batch = JSON.parse(result.stdout);
  assert.equal(batch.status, "ready");
  assert.deepEqual(batch.tasks.map((item) => item.task), [
    "write-root:work",
    "contract-reader:work",
    "database-a:work",
    "independent:work",
  ]);
  for (const item of batch.tasks) {
    assert.match(item.task_id, /^TASK-/);
    assert.ok(Array.isArray(item.write_set), `${item.task} must report write_set`);
    assert.ok(Array.isArray(item.read_set), `${item.task} must report read_set`);
    assert.ok(Array.isArray(item.exclusive_resources), `${item.task} must report exclusive_resources`);
  }
});

test("batch reads current modules config instead of stale generated boundaries", () => {
  const f = initAutonomousFixture("progress-batch-current-config-", {
    alpha: {
      task_id: "TASK-ALPHA",
      tasks: ["work"],
      write_set: ["src/alpha/**"],
    },
    beta: {
      task_id: "TASK-BETA",
      tasks: ["work"],
      write_set: ["src/beta/**"],
    },
  }, ["| TASK-ALPHA | 📋 |", "| TASK-BETA | 📋 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  fs.writeFileSync(path.join(f.proc, "modules.config.json"), JSON.stringify({ modules: {
    alpha: { task_id: "TASK-ALPHA", tasks: ["work"], write_set: ["src/alpha/**"] },
    beta: { task_id: "TASK-BETA", tasks: ["work"], write_set: ["src/alpha/overlap.ts"] },
  } }));
  result = f.run("batch", "--json", "2");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).tasks.map((item) => item.task_id), ["TASK-ALPHA"]);
});

test("current step may override module boundaries without changing legacy module defaults", () => {
  const f = initAutonomousFixture("progress-step-boundaries-", {
    delivery: {
      task_id: "TASK-DELIVERY",
      tasks: ["formal-review", "implementation"],
      write_set: ["src/delivery/**"],
      read_set: ["contracts/api.json"],
      step_write_set: {
        "formal-review": [],
        implementation: ["src/delivery/**"],
      },
      step_read_set: {
        "formal-review": ["docs/spec.md"],
        implementation: ["contracts/api.json"],
      },
      step_exclusive_resources: {
        "formal-review": [],
        implementation: ["integration-database"],
      },
    },
  }, ["| TASK-DELIVERY | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = f.run("batch", "--json", "1");
  let [task] = JSON.parse(result.stdout).tasks;
  assert.equal(task.task_id, "TASK-DELIVERY");
  assert.equal(task.step, "formal-review");
  assert.equal(task.isolation, "shared");
  assert.deepEqual(task.write_set, []);
  assert.deepEqual(task.read_set, ["docs/spec.md"]);

  const progressFile = path.join(f.root, "orchestrator", "progress.json");
  const progress = JSON.parse(fs.readFileSync(progressFile, "utf8"));
  progress.verticals[0].tasks[0].status = "done";
  fs.writeFileSync(progressFile, JSON.stringify(progress));
  result = f.run("batch", "--json", "1");
  [task] = JSON.parse(result.stdout).tasks;
  assert.equal(task.step, "implementation");
  assert.equal(task.isolation, "auto");
  assert.deepEqual(task.write_set, ["src/delivery/**"]);
  assert.deepEqual(task.read_set, ["contracts/api.json"]);
  assert.deepEqual(task.exclusive_resources, ["integration-database"]);
});

test("task with neither read_set nor write_set is not silently classified read-only", () => {
  const f = initAutonomousFixture("progress-empty-boundaries-", {
    empty: {
      task_id: "TASK-EMPTY",
      tasks: ["work"],
      write_set: [],
      read_set: [],
    },
  }, ["| TASK-EMPTY | 📋 |"]);
  const result = f.run("generate");
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr + result.stdout, /read_set|write_set|boundary|边界/i);
});

test("batch leaves writer isolation to runtime proof and only marks read-only work shared", () => {
  const f = initAutonomousFixture("progress-batch-isolation-", {
    "branch-writer": {
      task_id: "TASK-BRANCH-WRITER",
      tasks: ["work"],
      write_set: ["src/branch/**"],
      read_set: [],
      exclusive_resources: [],
      isolated_workspace: true,
    },
    "default-writer": {
      task_id: "TASK-DEFAULT-WRITER",
      tasks: ["work"],
      write_set: ["src/default/**"],
      read_set: [],
      exclusive_resources: [],
    },
    "read-only": {
      task_id: "TASK-READ-ONLY",
      tasks: ["inspect"],
      write_set: [],
      read_set: ["docs/reference/**"],
      exclusive_resources: [],
    },
  }, [
    "| TASK-BRANCH-WRITER | 📋 |",
    "| TASK-DEFAULT-WRITER | 📋 |",
    "| TASK-READ-ONLY | 📋 |",
  ]);

  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = f.run("batch", "--json", "3");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const byTask = new Map(JSON.parse(result.stdout).tasks.map((item) => [item.task, item]));
  assert.equal(byTask.get("branch-writer:work")?.isolation, "auto");
  assert.equal(byTask.get("default-writer:work")?.isolation, "auto");
  assert.equal(byTask.get("read-only:inspect")?.isolation, "shared");
});

test("parallel claim records the coordinator-owned execution lease and rejects partial metadata", () => {
  const f = initAutonomousFixture("progress-parallel-claim-", {
    delivery: {
      task_id: "TASK-PARALLEL",
      tasks: ["implementation"],
      write_set: ["src/delivery/**"],
      read_set: ["contracts/api.json"],
      exclusive_resources: [],
    },
  }, ["| TASK-PARALLEL | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-delivery",
    "--isolation", "worktree",
  );
  assert.equal(result.status, 2, result.stdout + result.stderr);

  fs.writeFileSync(path.join(f.root, "integration-advance.txt"), "advance\n");
  spawnSync("git", ["add", "integration-advance.txt"], { cwd: f.root });
  spawnSync("git", ["commit", "-m", "advance integration"], { cwd: f.root });
  const base = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: f.root,
    encoding: "utf8",
  }).stdout.trim();
  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-delivery",
    "--isolation", "worktree",
    "--workspace-root", path.join(f.root, ".worktrees", "wave-a", "delivery"),
    "--branch", "codex/wave-a/delivery",
    "--base-sha", f.head,
    "--wave-id", "wave-a",
    "--merge-index", "0",
  );
  assert.equal(result.status, 2, "parallel claim must reject a stale base_sha");

  const workspaceRoot = path.join(f.root, ".worktrees", "wave-a", "delivery");
  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-delivery",
    "--isolation", "worktree",
    "--workspace-root", workspaceRoot,
    "--branch", "codex/wave-a/delivery",
    "--base-sha", base,
    "--wave-id", "wave-a",
    "--merge-index", "0",
  );
  assert.equal(result.status, 2, "parallel claim must reject a missing/fake workspace");

  fs.mkdirSync(path.dirname(workspaceRoot), { recursive: true });
  const worktree = spawnSync(
    "git",
    ["worktree", "add", "-b", "codex/wave-a/delivery", workspaceRoot, base],
    { cwd: f.root, encoding: "utf8" },
  );
  assert.equal(worktree.status, 0, worktree.stderr || worktree.stdout);

  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-delivery",
    "--isolation", "worktree",
    "--workspace-root", workspaceRoot,
    "--branch", "codex/wave-a/delivery",
    "--base-sha", base,
    "--wave-id", "wave-a",
    "--merge-index", "0",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const progress = JSON.parse(
    fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"),
  );
  assert.deepEqual(progress.leases["delivery:implementation"], {
    agent: "agent-delivery",
    since: progress.leases["delivery:implementation"].since,
    isolation_kind: "worktree",
    workspace_root: fs.realpathSync(workspaceRoot),
    branch: "codex/wave-a/delivery",
    base_sha: base,
    wave_id: "wave-a",
    merge_index: 0,
  });
});

test("progress mutations respect the project state lock", () => {
  const f = initAutonomousFixture("progress-state-lock-", {
    delivery: {
      task_id: "TASK-LOCKED",
      tasks: ["implementation"],
      write_set: ["src/delivery/**"],
    },
  }, ["| TASK-LOCKED | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const lockDir = path.join(f.root, "orchestrator", ".state-write.lock");
  fs.mkdirSync(lockDir);
  fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify({
    schema: "orchestrator-state-lock/v1",
    token: "held-by-test",
    pid: process.pid,
    operation: "test-held-lock",
    started_at: "2026-08-24T00:00:00.000Z",
  })}\n`);

  result = f.run("claim", "delivery:implementation", "--agent", "agent-delivery");
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  const progress = JSON.parse(
    fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"),
  );
  assert.equal(progress.leases["delivery:implementation"], undefined);
});

test("parallel done rejects the wave base when no candidate was integrated", () => {
  const f = initAutonomousFixture("progress-parallel-done-", {
    delivery: {
      task_id: "TASK-PARALLEL-DONE",
      tasks: ["implementation", "acceptance"],
      write_set: ["src/delivery/**"],
      read_set: ["contracts/api.json"],
      exclusive_resources: [],
    },
  }, ["| TASK-PARALLEL-DONE | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const workspace = path.join(f.root, ".worktrees", "wave-done", "delivery");
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  const added = spawnSync(
    "git",
    ["worktree", "add", "-b", "codex/wave-done/delivery", workspace, f.head],
    { cwd: f.root, encoding: "utf8" },
  );
  assert.equal(added.status, 0, added.stderr || added.stdout);
  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-delivery",
    "--isolation", "worktree",
    "--workspace-root", workspace,
    "--branch", "codex/wave-done/delivery",
    "--base-sha", f.head,
    "--wave-id", "wave-done",
    "--merge-index", "0",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = f.run(
    "done", "delivery:implementation", "--commit", f.head, "--agent", "agent-delivery",
  );
  assert.equal(result.status, 1, "parallel done must reject base_sha without an integrated candidate");
  const progress = JSON.parse(
    fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"),
  );
  assert.equal(progress.verticals[0].tasks[0].status, "pending");
  assert.ok(progress.leases["delivery:implementation"]);

  fs.mkdirSync(path.join(workspace, "src", "delivery"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "delivery", "feature.js"), "export const feature = true;\n");
  spawnSync("git", ["add", "src/delivery/feature.js"], { cwd: workspace });
  const committed = spawnSync("git", ["commit", "-m", "deliver scoped candidate"], {
    cwd: workspace,
    encoding: "utf8",
  });
  assert.equal(committed.status, 0, committed.stderr || committed.stdout);
  const candidate = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).stdout.trim();
  const landed = spawnSync("git", ["cherry-pick", candidate], { cwd: f.root, encoding: "utf8" });
  assert.equal(landed.status, 0, landed.stderr || landed.stdout);
  const integrated = spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.root, encoding: "utf8" }).stdout.trim();
  result = f.run(
    "done", "delivery:implementation", "--commit", integrated, "--agent", "agent-delivery",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const completed = JSON.parse(
    fs.readFileSync(path.join(f.root, "orchestrator", "progress.json"), "utf8"),
  );
  assert.equal(completed.verticals[0].tasks[0].status, "done");
  assert.equal(completed.verticals[0].commits.implementation, integrated);
  assert.equal(completed.leases["delivery:implementation"], undefined);
});

test("parallel wave claims require one base and a unique merge index", () => {
  const f = initAutonomousFixture("progress-parallel-wave-", {
    alpha: { task_id: "TASK-WAVE-A", tasks: ["implementation"], write_set: ["src/a/**"] },
    beta: { task_id: "TASK-WAVE-B", tasks: ["implementation"], write_set: ["src/b/**"] },
  }, ["| TASK-WAVE-A | 🔨 |", "| TASK-WAVE-B | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const alpha = path.join(f.root, ".worktrees", "wave-order", "alpha");
  const beta = path.join(f.root, ".worktrees", "wave-order", "beta");
  fs.mkdirSync(path.dirname(alpha), { recursive: true });
  for (const [target, branch] of [[alpha, "codex/wave-order/alpha"], [beta, "codex/wave-order/beta"]]) {
    const added = spawnSync("git", ["worktree", "add", "-b", branch, target, f.head], {
      cwd: f.root,
      encoding: "utf8",
    });
    assert.equal(added.status, 0, added.stderr || added.stdout);
  }

  result = f.run(
    "claim", "alpha:implementation", "--agent", "agent-a",
    "--isolation", "worktree", "--workspace-root", alpha,
    "--branch", "codex/wave-order/alpha", "--base-sha", f.head,
    "--wave-id", "wave-order", "--merge-index", "0",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = f.run(
    "claim", "beta:implementation", "--agent", "agent-b",
    "--isolation", "worktree", "--workspace-root", beta,
    "--branch", "codex/wave-order/beta", "--base-sha", f.head,
    "--wave-id", "wave-order", "--merge-index", "0",
  );
  assert.equal(result.status, 2, "a wave must reject duplicate merge_index values");
  assert.match(result.stderr + result.stdout, /merge.index|wave|duplicate|合并顺序/i);
});

test("scheduler fails closed when progress topology no longer matches modules config", () => {
  const f = initAutonomousFixture("progress-topology-drift-", {
    alpha: { task_id: "TASK-ALPHA", tasks: ["work"], write_set: ["src/a/**"] },
    beta: { task_id: "TASK-BETA", tasks: ["work"], write_set: ["src/b/**"] },
  }, ["| TASK-ALPHA | 🔨 |", "| TASK-BETA | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  fs.writeFileSync(path.join(f.proc, "modules.config.json"), JSON.stringify({ modules: {
    alpha: { task_id: "TASK-ALPHA", tasks: ["review"], write_set: ["docs/a.md"] },
  } }));

  result = f.run("batch", "--json", "2");
  assert.equal(result.status, 2, "stale progress topology must not schedule obsolete work");
  assert.match(result.stderr + result.stdout, /generate|topology|modules\.config|drift|队列.*漂移/i);
});

test("batch conflict detection follows core.ignorecase", () => {
  const f = initAutonomousFixture("progress-ignorecase-", {
    alpha: { task_id: "TASK-CASE-A", tasks: ["work"], write_set: ["src/Feature.ts"] },
    beta: { task_id: "TASK-CASE-B", tasks: ["work"], write_set: ["src/feature.ts"] },
  }, ["| TASK-CASE-A | 🔨 |", "| TASK-CASE-B | 🔨 |"]);
  spawnSync("git", ["config", "core.ignorecase", "true"], { cwd: f.root });
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = f.run("batch", "--json", "2");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).tasks.length, 1);
});

test("parallel claim binds permissions to the committed modules config", () => {
  const f = initAutonomousFixture("progress-config-base-", {
    delivery: { task_id: "TASK-CONFIG-BASE", tasks: ["implementation"], write_set: ["src/safe/**"] },
  }, ["| TASK-CONFIG-BASE | 🔨 |"]);
  let result = f.run("generate");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const workspace = path.join(f.root, ".worktrees", "config-base", "delivery");
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  const added = spawnSync("git", ["worktree", "add", "-b", "codex/config-base", workspace, f.head], {
    cwd: f.root,
    encoding: "utf8",
  });
  assert.equal(added.status, 0, added.stderr || added.stdout);
  fs.writeFileSync(path.join(f.proc, "modules.config.json"), JSON.stringify({ modules: {
    delivery: { task_id: "TASK-CONFIG-BASE", tasks: ["implementation"], write_set: ["src/**"] },
  } }));
  result = f.run(
    "claim", "delivery:implementation", "--agent", "agent-config",
    "--isolation", "worktree", "--workspace-root", workspace,
    "--branch", "codex/config-base", "--base-sha", f.head,
    "--wave-id", "wave-config", "--merge-index", "0",
  );
  assert.equal(result.status, 2, "an uncommitted boundary expansion must not enlarge a lease");
  assert.match(result.stderr + result.stdout, /modules\.config|base.sha|commit|replan/i);
});
