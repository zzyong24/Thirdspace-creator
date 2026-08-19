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
  let config = JSON.parse(
    fs.readFileSync(
      path.join(single, "orchestrator", "process", "reconcile.config.json"),
      "utf8",
    ),
  );
  assert.equal(config.program_completion_required, false);
  const settings = JSON.parse(fs.readFileSync(path.join(single, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.hooks.PostToolUse[0].matcher, "Edit|Write|MultiEdit");
  assert.equal(settings.hooks.Stop[0].hooks[0].command.includes("stop-reconcile.sh"), true);
  assert.equal(fs.existsSync(path.join(single, ".claude", "hooks", "post-tool-observe.sh")), true);
  const codexHooks = JSON.parse(fs.readFileSync(path.join(single, ".codex", "hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(codexHooks.hooks).sort(), ["PostToolUse", "PreToolUse", "SessionStart", "Stop"]);
  assert.equal(codexHooks.hooks.PostToolUse[0].hooks[0].command.includes("/.codex/hooks/post-tool-observe.sh"), true);
  assert.equal(fs.existsSync(path.join(single, ".codex", "hooks", "stop-reconcile.sh")), true);
  assert.equal(fs.existsSync(path.join(single, "orchestrator", "program")), false);
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
  result = run([single, "--update", "--topology", "single"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
});
