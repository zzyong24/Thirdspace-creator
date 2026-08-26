import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "parallel-isolation.mjs");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Parallel Isolation Test",
  GIT_AUTHOR_EMAIL: "parallel-isolation@example.test",
  GIT_COMMITTER_NAME: "Parallel Isolation Test",
  GIT_COMMITTER_EMAIL: "parallel-isolation@example.test",
};

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function write(root, relative, body) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "parallel-isolation-"));
  const root = path.join(parent, "integration");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  git(root, ["init"]);
  write(root, "frontend/app.js", "export const app = 'base';\n");
  write(root, "backend/server.js", "export const server = 'base';\n");
  write(root, "contracts/api.json", "{\"version\":1}\n");
  write(root, "migrations/001_base.sql", "create table base(id integer);\n");
  write(root, "orchestrator/process/modules.config.json", `${JSON.stringify({
    modules: {
      "read-a": {
        task_id: "T-READ-A",
        tasks: ["audit"],
        write_set: [],
      },
      "read-b": {
        task_id: "T-READ-B",
        tasks: ["audit"],
        write_set: [],
      },
      frontend: {
        task_id: "T-FRONTEND",
        tasks: ["implementation"],
        write_set: ["frontend/**"],
        read_set: ["contracts/api.json"],
      },
      backend: {
        task_id: "T-BACKEND",
        tasks: ["implementation"],
        write_set: ["backend/**"],
        read_set: ["contracts/api.json"],
      },
      schema: {
        task_id: "T-SCHEMA",
        tasks: ["implementation"],
        write_set: ["contracts/api.json"],
      },
      "migration-a": {
        task_id: "T-MIGRATION-A",
        tasks: ["implementation"],
        write_set: ["migrations/010_add_customer.sql"],
        exclusive_resources: ["database-schema:primary"],
      },
      "migration-b": {
        task_id: "T-MIGRATION-B",
        tasks: ["implementation"],
        write_set: ["migrations/011_add_invoice.sql"],
        exclusive_resources: ["database-schema:primary"],
      },
      "control-writer": {
        task_id: "T-CONTROL",
        tasks: ["implementation"],
        write_set: ["frontend/**", "orchestrator/**"],
      },
    },
  }, null, 2)}\n`);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return { parent, root, base: git(root, ["rev-parse", "HEAD"]) };
}

function run(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: "utf8",
    env: GIT_ENV,
  });
}

function output(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function rejection(result) {
  assert.equal(result.status, 2, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function select(root, tasks, requested, workspaces = []) {
  const args = [
    "select",
    "--root", root,
    "--tasks", tasks.join(","),
    "--requested", requested,
    ...workspaces.flatMap(([taskId, workspace]) => ["--workspace", `${taskId}=${workspace}`]),
    "--json",
  ];
  return output(run(root, args));
}

function addWorktree(root, target, branch, base) {
  git(root, ["worktree", "add", "-b", branch, target, base]);
  return target;
}

function writeParallelLease(root, taskId, workspace, branch, base, isolation = "worktree") {
  const modules = JSON.parse(
    fs.readFileSync(path.join(root, "orchestrator", "process", "modules.config.json"), "utf8"),
  ).modules;
  const [moduleId, config] = Object.entries(modules).find(
    ([id, value]) => (value.task_id ?? id) === taskId,
  );
  const step = config.tasks[0];
  fs.writeFileSync(path.join(root, "orchestrator", "progress.json"), `${JSON.stringify({
    leases: {
      [`${moduleId}:${step}`]: {
        agent: `agent-${moduleId}`,
        since: "2026-08-24T00:00:00.000Z",
        isolation_kind: isolation,
        workspace_root: fs.realpathSync(workspace),
        branch,
        base_sha: base,
        wave_id: "wave-test",
        merge_index: 0,
      },
    },
    verticals: [{
      id: moduleId,
      task_id: taskId,
      tasks: [{ step, status: "pending" }],
    }],
  }, null, 2)}\n`);
}

test("isolation selector distinguishes shared, real branch workspace, worktree, and serial", (t) => {
  const f = fixture(t);

  const readOnly = select(f.root, ["T-READ-A", "T-READ-B"], "shared");
  assert.equal(readOnly.schema, "product-to-code-orchestrator/parallel-isolation@1");
  assert.equal(readOnly.selected_mode, "shared");

  const sharedWriters = select(f.root, ["T-FRONTEND", "T-BACKEND"], "shared");
  assert.equal(sharedWriters.selected_mode, "serial");
  assert.ok(sharedWriters.reason_codes.includes("SHARED_WRITER_UNSAFE"));

  const fakeBranch = select(f.root, ["T-FRONTEND", "T-BACKEND"], "branch", [
    ["T-FRONTEND", f.root],
    ["T-BACKEND", f.root],
  ]);
  assert.equal(fakeBranch.selected_mode, "serial");
  assert.ok(fakeBranch.reason_codes.includes("WORKSPACE_NOT_INDEPENDENT"));

  const frontendClone = path.join(f.parent, "frontend-clone");
  const backendClone = path.join(f.parent, "backend-clone");
  git(f.parent, ["clone", "--quiet", f.root, frontendClone]);
  git(f.parent, ["clone", "--quiet", f.root, backendClone]);
  git(frontendClone, ["checkout", "-b", "task/frontend"]);
  git(backendClone, ["checkout", "-b", "task/backend"]);
  const realBranches = select(f.root, ["T-FRONTEND", "T-BACKEND"], "branch", [
    ["T-FRONTEND", frontendClone],
    ["T-BACKEND", backendClone],
  ]);
  assert.equal(realBranches.selected_mode, "branch");

  const frontendWorktree = addWorktree(
    f.root,
    path.join(f.parent, "wt-frontend"),
    "task/wt-frontend",
    f.base,
  );
  const backendWorktree = addWorktree(
    f.root,
    path.join(f.parent, "wt-backend"),
    "task/wt-backend",
    f.base,
  );
  const realWorktrees = select(f.root, ["T-FRONTEND", "T-BACKEND"], "worktree", [
    ["T-FRONTEND", frontendWorktree],
    ["T-BACKEND", backendWorktree],
  ]);
  assert.equal(realWorktrees.selected_mode, "worktree");

  const adaptiveMixed = select(
    f.root,
    ["T-READ-A", "T-FRONTEND", "T-BACKEND"],
    "auto",
    [
      ["T-FRONTEND", frontendClone],
      ["T-BACKEND", backendWorktree],
    ],
  );
  assert.equal(adaptiveMixed.selected_mode, "mixed");
  const mixedByTask = new Map(
    adaptiveMixed.tasks.map((task) => [task.task_id, task.isolation]),
  );
  assert.equal(mixedByTask.get("T-READ-A"), "shared");
  assert.equal(mixedByTask.get("T-FRONTEND"), "branch");
  assert.equal(mixedByTask.get("T-BACKEND"), "worktree");

  const semanticConflict = select(
    f.root,
    ["T-MIGRATION-A", "T-MIGRATION-B"],
    "worktree",
    [
      ["T-MIGRATION-A", frontendWorktree],
      ["T-MIGRATION-B", backendWorktree],
    ],
  );
  assert.equal(semanticConflict.selected_mode, "serial");
  assert.ok(semanticConflict.reason_codes.includes("EXCLUSIVE_RESOURCE_CONFLICT"));

  const explicitSerial = select(f.root, ["T-MIGRATION-A", "T-MIGRATION-B"], "serial");
  assert.equal(explicitSerial.selected_mode, "serial");
});

test("worktree never overrides a schema read/write dependency", (t) => {
  const f = fixture(t);
  const schemaWorktree = addWorktree(
    f.root,
    path.join(f.parent, "wt-schema"),
    "task/schema",
    f.base,
  );
  const frontendWorktree = addWorktree(
    f.root,
    path.join(f.parent, "wt-schema-consumer"),
    "task/schema-consumer",
    f.base,
  );
  const result = select(f.root, ["T-SCHEMA", "T-FRONTEND"], "worktree", [
    ["T-SCHEMA", schemaWorktree],
    ["T-FRONTEND", frontendWorktree],
  ]);
  assert.equal(result.selected_mode, "serial");
  assert.ok(result.reason_codes.includes("READ_WRITE_CONFLICT"));
});

test("selector uses the current step boundary instead of a future module write_set", (t) => {
  const f = fixture(t);
  const file = path.join(f.root, "orchestrator", "process", "modules.config.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.modules.frontend.tasks = ["formal-review", "implementation"];
  config.modules.frontend.step_write_set = {
    "formal-review": [],
    implementation: ["frontend/**"],
  };
  config.modules.frontend.step_read_set = {
    "formal-review": ["docs/frontend-spec.md"],
    implementation: ["contracts/api.json"],
  };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(f.root, "orchestrator", "progress.json"), `${JSON.stringify({
    leases: {},
    verticals: [{
      id: "frontend",
      task_id: "T-FRONTEND",
      tasks: [
        { step: "formal-review", status: "pending" },
        { step: "implementation", status: "pending" },
      ],
    }],
  }, null, 2)}\n`);

  const result = select(f.root, ["T-FRONTEND"], "shared");
  assert.equal(result.selected_mode, "shared");
  assert.deepEqual(result.tasks[0].write_set, []);
  assert.deepEqual(result.tasks[0].read_set, ["docs/frontend-spec.md"]);
});

test("selector rejects a dirty worker workspace before dispatch", (t) => {
  const f = fixture(t);
  const workspace = addWorktree(
    f.root,
    path.join(f.parent, "dirty-worker"),
    "task/dirty-worker",
    f.base,
  );
  write(workspace, "frontend/preexisting.js", "export const dirty = true;\n");
  const result = select(f.root, ["T-FRONTEND"], "worktree", [["T-FRONTEND", workspace]]);
  assert.equal(result.selected_mode, "serial");
  assert.ok(result.reason_codes.includes("WORKSPACE_DIRTY"));
});

test("selector rejects a dirty integration business baseline", (t) => {
  const f = fixture(t);
  const workspace = addWorktree(
    f.root,
    path.join(f.parent, "clean-worker-dirty-root"),
    "task/clean-worker-dirty-root",
    f.base,
  );
  write(f.root, "backend/uncommitted.js", "export const local = true;\n");
  const result = select(f.root, ["T-FRONTEND"], "worktree", [["T-FRONTEND", workspace]]);
  assert.equal(result.selected_mode, "serial");
  assert.ok(result.reason_codes.includes("INTEGRATION_DIRTY"));
  assert.deepEqual(result.dirty_paths, ["backend/uncommitted.js"]);
});

test("conflict detection follows a case-insensitive repository", (t) => {
  const f = fixture(t);
  git(f.root, ["config", "core.ignorecase", "true"]);
  const file = path.join(f.root, "orchestrator", "process", "modules.config.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.modules.frontend.write_set = ["src/Feature.ts"];
  config.modules.backend.write_set = ["src/feature.ts"];
  config.modules.frontend.read_set = [];
  config.modules.backend.read_set = [];
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  const frontend = addWorktree(f.root, path.join(f.parent, "case-a"), "task/case-a", f.base);
  const backend = addWorktree(f.root, path.join(f.parent, "case-b"), "task/case-b", f.base);
  const result = select(f.root, ["T-FRONTEND", "T-BACKEND"], "worktree", [
    ["T-FRONTEND", frontend],
    ["T-BACKEND", backend],
  ]);
  assert.equal(result.selected_mode, "serial");
  assert.ok(result.reason_codes.includes("WRITE_WRITE_CONFLICT"));
});

test("candidate validation rejects writes outside write_set and all reserved control paths", async (t) => {
  const f = fixture(t);

  async function candidate(name, taskId, changes, { expectedBranch = `candidate/${name}` } = {}) {
    const workspace = addWorktree(
      f.root,
      path.join(f.parent, `candidate-${name}`),
      `candidate/${name}`,
      f.base,
    );
    for (const [relative, body] of changes) write(workspace, relative, body);
    git(workspace, ["add", "."]);
    git(workspace, ["commit", "-m", name]);
    const head = git(workspace, ["rev-parse", "HEAD"]);
    writeParallelLease(f.root, taskId, workspace, expectedBranch, f.base);
    return run(f.root, [
      "validate-candidate",
      "--root", f.root,
      "--task", taskId,
      "--workspace", workspace,
      "--isolation", "worktree",
      "--base", f.base,
      "--head", head,
      "--branch", expectedBranch,
      "--json",
    ]);
  }

  await t.test("valid task-local diff passes", async () => {
    const result = output(await candidate("valid", "T-FRONTEND", [
      ["frontend/app.js", "export const app = 'valid';\n"],
    ]));
    assert.equal(result.valid, true);
    assert.deepEqual(result.changed_paths, ["frontend/app.js"]);
  });

  await t.test("out-of-write-set diff fails", async () => {
    const result = rejection(await candidate("outside", "T-FRONTEND", [
      ["backend/server.js", "export const server = 'escaped';\n"],
    ]));
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((item) => (
      item.code === "OUTSIDE_WRITE_SET" && item.path === "backend/server.js"
    )));
  });

  await t.test("reserved control path fails even when declared in write_set", async () => {
    const result = rejection(await candidate("reserved", "T-CONTROL", [
      ["orchestrator/progress.json", "{\"tampered\":true}\n"],
    ]));
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((item) => (
      item.code === "RESERVED_CONTROL_PATH" && item.path === "orchestrator/progress.json"
    )));
  });

  await t.test("candidate from a different branch fails", async () => {
    const result = rejection(await candidate("wrong-branch", "T-FRONTEND", [
      ["frontend/app.js", "export const app = 'wrong-branch';\n"],
    ], { expectedBranch: "candidate/expected-branch" }));
    assert.equal(result.error.code, "BRANCH_MISMATCH");
  });

  await t.test("more than one candidate commit fails", async () => {
    const workspace = addWorktree(
      f.root,
      path.join(f.parent, "candidate-multiple"),
      "candidate/multiple",
      f.base,
    );
    write(workspace, "frontend/app.js", "export const app = 'first';\n");
    git(workspace, ["add", "."]);
    git(workspace, ["commit", "-m", "first"]);
    write(workspace, "frontend/app.js", "export const app = 'second';\n");
    git(workspace, ["add", "."]);
    git(workspace, ["commit", "-m", "second"]);
    const head = git(workspace, ["rev-parse", "HEAD"]);
    writeParallelLease(f.root, "T-FRONTEND", workspace, "candidate/multiple", f.base);
    const result = rejection(run(f.root, [
      "validate-candidate",
      "--root", f.root,
      "--task", "T-FRONTEND",
      "--workspace", workspace,
      "--isolation", "worktree",
      "--base", f.base,
      "--head", head,
      "--branch", "candidate/multiple",
      "--json",
    ]));
    assert.equal(result.error.code, "CANDIDATE_COMMIT_COUNT");
  });

  await t.test("candidate becomes stale when integration HEAD advances", async () => {
    const workspace = addWorktree(
      f.root,
      path.join(f.parent, "candidate-stale"),
      "candidate/stale",
      f.base,
    );
    write(workspace, "frontend/app.js", "export const app = 'stale';\n");
    git(workspace, ["add", "."]);
    git(workspace, ["commit", "-m", "stale candidate"]);
    const head = git(workspace, ["rev-parse", "HEAD"]);
    writeParallelLease(f.root, "T-FRONTEND", workspace, "candidate/stale", f.base);

    write(f.root, "integration-advance.txt", "new integration head\n");
    git(f.root, ["add", "integration-advance.txt"]);
    git(f.root, ["commit", "-m", "advance integration"]);
    const result = rejection(run(f.root, [
      "validate-candidate",
      "--root", f.root,
      "--task", "T-FRONTEND",
      "--workspace", workspace,
      "--isolation", "worktree",
      "--base", f.base,
      "--head", head,
      "--branch", "candidate/stale",
      "--json",
    ]));
    assert.equal(result.error.code, "STALE_BASE");
  });

  await t.test("candidate arguments cannot replace the coordinator lease", async () => {
    const assigned = addWorktree(
      f.root,
      path.join(f.parent, "candidate-assigned"),
      "candidate/assigned",
      git(f.root, ["rev-parse", "HEAD"]),
    );
    const currentBase = git(f.root, ["rev-parse", "HEAD"]);
    writeParallelLease(
      f.root,
      "T-FRONTEND",
      assigned,
      "candidate/assigned",
      currentBase,
    );

    const rogue = addWorktree(
      f.root,
      path.join(f.parent, "candidate-rogue"),
      "candidate/rogue",
      currentBase,
    );
    write(rogue, "frontend/app.js", "export const app = 'rogue';\n");
    git(rogue, ["add", "."]);
    git(rogue, ["commit", "-m", "rogue"]);
    const rogueHead = git(rogue, ["rev-parse", "HEAD"]);
    const result = rejection(run(f.root, [
      "validate-candidate",
      "--root", f.root,
      "--task", "T-FRONTEND",
      "--workspace", rogue,
      "--isolation", "worktree",
      "--base", currentBase,
      "--head", rogueHead,
      "--branch", "candidate/rogue",
      "--json",
    ]));
    assert.equal(result.error.code, "LEASE_MISMATCH");
  });
});

test("candidate reserves a project-configured control_root without project-specific names", (t) => {
  const f = fixture(t);
  const customRoot = path.join(f.root, "control-plane");
  fs.mkdirSync(path.join(customRoot, "process"), { recursive: true });
  fs.writeFileSync(path.join(customRoot, "process", "modules.config.json"), `${JSON.stringify({
    modules: {
      control: {
        task_id: "T-CUSTOM-CONTROL",
        tasks: ["implementation"],
        write_set: ["control-plane/**"],
      },
    },
  }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(f.root, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify({ control_root: "control-plane" })}\n`,
  );
  git(f.root, ["add", "orchestrator/process/reconcile.config.json", "control-plane/process/modules.config.json"]);
  git(f.root, ["commit", "-m", "configure generic control root"]);
  const base = git(f.root, ["rev-parse", "HEAD"]);
  const workspace = addWorktree(
    f.root,
    path.join(f.parent, "candidate-custom-control"),
    "candidate/custom-control",
    base,
  );
  write(workspace, "control-plane/worker-owned.json", "{\"tampered\":true}\n");
  git(workspace, ["add", "control-plane/worker-owned.json"]);
  git(workspace, ["commit", "-m", "touch custom control root"]);
  const head = git(workspace, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(customRoot, "progress.json"), `${JSON.stringify({
    leases: {
      "control:implementation": {
        agent: "agent-control",
        since: "2026-08-24T00:00:00.000Z",
        isolation_kind: "worktree",
        workspace_root: fs.realpathSync(workspace),
        branch: "candidate/custom-control",
        base_sha: base,
        wave_id: "wave-control",
        merge_index: 0,
      },
    },
    verticals: [{
      id: "control",
      task_id: "T-CUSTOM-CONTROL",
      tasks: [{ step: "implementation", status: "pending" }],
    }],
  }, null, 2)}\n`);

  const result = rejection(run(f.root, [
    "validate-candidate", "--root", f.root, "--task", "T-CUSTOM-CONTROL",
    "--workspace", workspace, "--isolation", "worktree",
    "--base", base, "--head", head, "--branch", "candidate/custom-control", "--json",
  ]));
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((item) => (
    item.code === "RESERVED_CONTROL_PATH" && item.path === "control-plane/worker-owned.json"
  )));
});
