import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const INIT = path.join(SKILL, "tools", "init-project.sh");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Init Project Test",
  GIT_AUTHOR_EMAIL: "init-project@example.test",
  GIT_COMMITTER_NAME: "Init Project Test",
  GIT_COMMITTER_EMAIL: "init-project@example.test",
};

function run(args) {
  return spawnSync("bash", [INIT, ...args], {
    cwd: SKILL,
    encoding: "utf8",
    env: GIT_ENV,
  });
}

function assertParallelBoundaryTemplate(projectRoot, scale) {
  const file = path.join(
    projectRoot,
    "orchestrator",
    "process",
    "modules.config.example.json",
  );
  const template = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.match(template._meta?.parallel_sets ?? "", /write_set\/read_set.*exclusive_resources/i);
  assert.match(template._meta?.parallel_sets ?? "", /runtime.*branch.*worktree/i);

  const modules = Object.entries(template.modules ?? {});
  assert.ok(modules.length > 0, `${scale} fresh template must include an example module`);
  for (const [moduleId, module] of modules) {
    assert.ok(Object.hasOwn(module, "read_set"), `${scale} ${moduleId} missing read_set`);
    assert.ok(
      Object.hasOwn(module, "exclusive_resources"),
      `${scale} ${moduleId} missing exclusive_resources`,
    );
    assert.ok(Object.hasOwn(module, "step_depends_on"), `${scale} ${moduleId} missing step_depends_on`);
    assert.ok(Array.isArray(module.read_set), `${scale} ${moduleId}.read_set must be an array`);
    assert.ok(
      Array.isArray(module.exclusive_resources),
      `${scale} ${moduleId}.exclusive_resources must be an array`,
    );
    assert.equal(
      typeof module.step_depends_on,
      "object",
      `${scale} ${moduleId}.step_depends_on must be an object`,
    );

    for (const field of ["step_write_set", "step_read_set", "step_exclusive_resources"]) {
      assert.ok(Object.hasOwn(module, field), `${scale} ${moduleId} missing ${field}`);
      assert.equal(
        typeof module[field],
        "object",
        `${scale} ${moduleId}.${field} must remain an object when present`,
      );
    }
  }
}

test("新项目未明确 single 或 multi 拓扑时拒绝生成默认可跳门配置", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "init-project-topology-"));
  const target = path.join(parent, "product");
  const result = run([target, "--triage", "M", "--name", "Product"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /topology|single|multi|拓扑/i);
  assert.equal(
    fs.existsSync(path.join(target, "orchestrator", "process", "reconcile.config.json")),
    false,
  );
});

test("single 明确落 false；multi 同步落 true 并建立 program 控制面", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "init-project-scopes-"));
  const single = path.join(parent, "single");
  let result = run([
    single,
    "--triage",
    "S",
    "--name",
    "Single",
    "--topology",
    "single",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(
    result.stdout,
    /reviewctl: review receipts/i,
    "fresh buildout must not run the formal-review receipt audit",
  );
  assert.match(result.stdout, /buildout: formal review inactive/i);
  let config = JSON.parse(
    fs.readFileSync(
      path.join(single, "orchestrator", "process", "reconcile.config.json"),
      "utf8",
    ),
  );
  assert.equal(config.program_completion_required, false);
  assert.equal(config.delivery_phase, "buildout");
  assert.deepEqual(config.context_policy, { mode: "adaptive", project_packs: [] });
  assert.deepEqual(config.research_verify_commands, {});
  const settings = JSON.parse(fs.readFileSync(path.join(single, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.hooks.PostToolUse[0].matcher, "Edit|Write|MultiEdit");
  assert.equal(settings.hooks.Stop[0].hooks[0].command.includes("stop-reconcile.sh"), true);
  assert.equal(fs.existsSync(path.join(single, ".claude", "hooks", "post-tool-observe.sh")), true);
  const codexHooks = JSON.parse(fs.readFileSync(path.join(single, ".codex", "hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(codexHooks.hooks).sort(), ["PostToolUse", "PreToolUse", "SessionStart", "Stop"]);
  assert.equal(codexHooks.hooks.PostToolUse[0].hooks[0].command.includes("/.codex/hooks/post-tool-observe.sh"), true);
  assert.equal(fs.existsSync(path.join(single, ".codex", "hooks", "stop-reconcile.sh")), true);
  assert.equal(fs.existsSync(path.join(single, "orchestrator", "program")), false);
  assert.equal(
    fs.existsSync(path.join(single, "orchestrator", "process", ".vendor-manifest.json")),
    true,
    "fresh init must record the exact vendored engine baseline",
  );
  assert.equal(fs.existsSync(path.join(single, "orchestrator", "process", "context-plan.mjs")), true);
  assert.equal(fs.existsSync(path.join(single, "orchestrator", "process", "delivery-phase.mjs")), true);
  assert.equal(fs.existsSync(path.join(single, "docs", "research")), true);
  assertParallelBoundaryTemplate(single, "S");
  assert.equal(
    fs.existsSync(
      path.join(single, "orchestrator", "templates", "TECHNICAL_RESEARCH_CARD_TEMPLATE.md"),
    ),
    true,
  );
  const projectModules = `${JSON.stringify({ modules: { local: { tasks: ["implementation", "acceptance"], depends_on: [], step_depends_on: { implementation: [] }, write_set: ["local/**"] } } }, null, 2)}\n`;
  fs.writeFileSync(path.join(single, "orchestrator", "process", "modules.config.json"), projectModules);
  delete config.program_completion_required;
  fs.writeFileSync(
    path.join(single, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  result = spawnSync(
    process.execPath,
    [path.join(single, "orchestrator", "process", "reconcile.mjs")],
    { cwd: single, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /program_completion_required.*(?:single|multi|拓扑|boolean)/i,
  );
  // 模拟 3.13 及更早项目：有 Claude hooks，但尚未生成 Codex registry。
  fs.unlinkSync(path.join(single, ".codex", "hooks.json"));
  fs.unlinkSync(
    path.join(single, "orchestrator", "templates", "TECHNICAL_RESEARCH_CARD_TEMPLATE.md"),
  );
  fs.rmdirSync(path.join(single, "docs", "research"));
  result = run([single, "--update", "--topology", "single"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.readFileSync(path.join(single, "orchestrator", "process", "modules.config.json"), "utf8"),
    projectModules,
    "updater must not overwrite project-owned multi-step queue config",
  );
  config = JSON.parse(
    fs.readFileSync(
      path.join(single, "orchestrator", "process", "reconcile.config.json"),
      "utf8",
    ),
  );
  assert.equal(config.program_completion_required, false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(single, ".claude", "settings.json"), "utf8")).hooks.PostToolUse.length,
    1,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(single, ".codex", "hooks.json"), "utf8")).hooks.Stop.length,
    1,
  );
  assert.equal(fs.existsSync(path.join(single, "docs", "research")), true);
  assert.equal(
    fs.existsSync(
      path.join(single, "orchestrator", "templates", "TECHNICAL_RESEARCH_CARD_TEMPLATE.md"),
    ),
    true,
  );

  // Older project configs must not be silently narrowed during update. The new
  // planner handles a missing policy as explicit compat-full until a reviewed migration.
  delete config.context_policy;
  fs.writeFileSync(
    path.join(single, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  result = run([single, "--update", "--topology", "single"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updatedLegacyConfig = JSON.parse(
    fs.readFileSync(path.join(single, "orchestrator", "process", "reconcile.config.json"), "utf8"),
  );
  assert.equal(Object.hasOwn(updatedLegacyConfig, "context_policy"), false);
  const legacyPlan = spawnSync(
    process.execPath,
    [path.join(single, "orchestrator", "process", "context-plan.mjs"), "--root", single, "--json"],
    { cwd: single, encoding: "utf8" },
  );
  assert.equal(legacyPlan.status, 0, legacyPlan.stderr || legacyPlan.stdout);
  assert.equal(JSON.parse(legacyPlan.stdout).compatibility_mode, true);

  const multi = path.join(parent, "multi");
  result = run([
    multi,
    "--triage",
    "M",
    "--name",
    "Multi",
    "--topology",
    "multi",
    "--program-id",
    "multi-product",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  config = JSON.parse(
    fs.readFileSync(
      path.join(multi, "orchestrator", "process", "reconcile.config.json"),
      "utf8",
    ),
  );
  assert.equal(config.program_completion_required, true);
  assert.equal(
    fs.existsSync(path.join(multi, "orchestrator", "program", "program.config.json")),
    true,
  );
  assertParallelBoundaryTemplate(multi, "M");
  assert.equal(fs.existsSync(path.join(single, "docs", "INDEX.md")), false);
  assert.equal(fs.existsSync(path.join(single, "orchestrator", "process", "knowledge.config.json")), false);
  for (const relative of [
    "docs/INDEX.md",
    "docs/features",
    "docs/journeys",
    "docs/data-flows",
    "docs/platform",
    "docs/evidence",
    "docs/archive",
    "orchestrator/process/knowledge.config.json",
  ]) {
    assert.equal(fs.existsSync(path.join(multi, relative)), true, `missing ${relative}`);
  }
  const knowledge = JSON.parse(
    fs.readFileSync(path.join(multi, "orchestrator", "process", "knowledge.config.json"), "utf8"),
  );
  assert.equal(knowledge.project_root, "../..");
  assert.equal(knowledge.docs_dir, "../../docs");
  assert.deepEqual(knowledge.feature_map, {});
  assert.match(
    fs.readFileSync(path.join(multi, "orchestrator", "ARTIFACT_MANIFEST.yaml"), "utf8"),
    /docs\/INDEX\.md[\s\S]*module-spec-index/,
  );
});

test("legacy engine 先 fail-closed，再用审核 manifest 原子 adopt，后续 update 保留已上游能力", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "init-project-engine-extension-"));
  const target = path.join(parent, "product");
  let result = run([
    target,
    "--triage",
    "S",
    "--name",
    "Engine Extension",
    "--topology",
    "single",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const processDir = path.join(target, "orchestrator", "process");
  const programGate = path.join(processDir, "program-gate.mjs");
  const taskctl = path.join(processDir, "taskctl.mjs");
  const stamp = path.join(processDir, ".skill-version");
  const versionBefore = fs.readFileSync(stamp, "utf8");
  fs.appendFileSync(programGate, "\n// legacy local release identity extension\n");
  fs.appendFileSync(taskctl, "\n// legacy local resume extension\n");
  for (const file of [programGate, taskctl]) {
    const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  }
  const programBefore = fs.readFileSync(programGate, "utf8");
  const taskBefore = fs.readFileSync(taskctl, "utf8");

  // A recorded project with local core edits must fail before any overwrite.
  result = run([target, "--update", "--topology", "single"]);
  assert.notEqual(result.status, 0, "unknown active engine extensions must fail closed");
  assert.match(result.stderr + result.stdout, /engine.*(?:extension|modified|local)|本地.*(?:扩展|修改)|迁移/i);
  assert.match(result.stderr + result.stdout, /program-gate\.mjs/);
  assert.match(result.stderr + result.stdout, /taskctl\.mjs/);
  assert.equal(fs.readFileSync(programGate, "utf8"), programBefore, "program gate extension must remain active");
  assert.equal(fs.readFileSync(taskctl, "utf8"), taskBefore, "task resume extension must remain active");
  assert.equal(fs.readFileSync(stamp, "utf8"), versionBefore, "failed update must not stamp the new version");
  assert.equal(
    fs.readdirSync(processDir).some((name) => name.includes("pre-update")),
    false,
    "fail-closed means no active overwrite plus backup side effect",
  );

  // Legacy projects have no trustworthy vendor baseline either. Deleting the
  // baseline cannot turn the same active extensions into an update bypass.
  fs.unlinkSync(path.join(processDir, ".vendor-manifest.json"));
  result = run([target, "--update", "--topology", "single"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /legacy engine.*vendor baseline|无法区分.*本地扩展/i);
  assert.equal(fs.readFileSync(programGate, "utf8"), programBefore);
  assert.equal(fs.readFileSync(taskctl, "utf8"), taskBefore);
  assert.equal(fs.readFileSync(stamp, "utf8"), versionBefore);

  const candidatesRoot = path.join(target, "orchestrator", ".engine-update-candidates");
  assert.equal(fs.existsSync(candidatesRoot), true, "migration must provide a separate incoming engine candidate");
  const candidates = fs.readdirSync(candidatesRoot);
  assert.equal(candidates.length, 1);
  assert.equal(
    fs.existsSync(path.join(candidatesRoot, candidates[0], "process", "program-gate.mjs")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(candidatesRoot, candidates[0], "process", "taskctl.mjs")),
    true,
  );

  const candidateRoot = path.join(candidatesRoot, candidates[0]);
  const migrationFile = path.join(candidateRoot, "migration-manifest.json");
  const migration = JSON.parse(fs.readFileSync(migrationFile, "utf8"));
  assert.equal(migration.reviewed, false);
  assert.match(migration.candidate_tree_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(migration.required_literals["program-gate.mjs"], [
    "release_identity",
    "--no-replace-objects",
    "PROGRAM_GATE_RELEASE_ROOT",
  ]);
  migration.reviewed = true;
  migration.reviewed_by = "init-project regression reviewer";
  fs.writeFileSync(migrationFile, `${JSON.stringify(migration, null, 2)}\n`);

  result = run([
    target,
    "--update",
    "--topology",
    "single",
    "--adopt-engine",
    migrationFile,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const adoptedProgram = fs.readFileSync(programGate, "utf8");
  const adoptedTask = fs.readFileSync(taskctl, "utf8");
  for (const literal of ["release_identity", "--no-replace-objects", "PROGRAM_GATE_RELEASE_ROOT"]) {
    assert.match(adoptedProgram, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const literal of ["resume", "invalidated_acceptance", "auditResearchGates"]) {
    assert.match(adoptedTask, new RegExp(literal));
  }
  const snapshots = path.join(target, "orchestrator", ".engine-snapshots");
  const snapshot = fs.readdirSync(snapshots)[0];
  assert.equal(
    fs.readFileSync(path.join(snapshots, snapshot, "process", "program-gate.mjs"), "utf8"),
    programBefore,
    "whole active engine snapshot must retain the legacy extension",
  );
  assert.equal(
    fs.readFileSync(path.join(snapshots, snapshot, "process", "taskctl.mjs"), "utf8"),
    taskBefore,
  );
  assert.equal(fs.existsSync(path.join(processDir, ".vendor-manifest.json")), true);

  result = run([target, "--update", "--topology", "single"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(programGate, "utf8"), /release_identity/);
  assert.match(fs.readFileSync(taskctl, "utf8"), /auditResearchGates/);
});
