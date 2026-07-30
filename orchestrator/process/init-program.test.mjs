import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const INIT = path.join(SKILL, "tools", "init-program.sh");

function run(args, cwd = SKILL) {
  return spawnSync("bash", [INIT, ...args], { cwd, encoding: "utf8" });
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-program-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.copyFileSync(
    path.join(HERE, "program-gate.mjs"),
    path.join(root, "orchestrator", "process", "program-gate.mjs"),
  );
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    `${JSON.stringify({
      receipt_policy: "required",
      probes: [{ stage: "1-plan", path: "PRODUCT_SPEC.md" }],
      project_owned: { keep: true },
    }, null, 2)}\n`,
  );
  return root;
}

test("init-program 创建单一跨项目控制面但不伪造完成证据", () => {
  const root = setup();
  const result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const control = path.join(root, "orchestrator", "program");
  const config = JSON.parse(fs.readFileSync(path.join(control, "program.config.json"), "utf8"));
  const release = JSON.parse(fs.readFileSync(path.join(control, "release-set.json"), "utf8"));
  const reconcile = JSON.parse(
    fs.readFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), "utf8"),
  );
  assert.equal(config.program_id, "thirdspace");
  assert.equal(config.name, "Thirdspace");
  assert.equal(config.completion_authority, "program-gate");
  assert.equal(reconcile.program_completion_required, true);
  assert.equal(reconcile.receipt_policy, "required");
  assert.deepEqual(reconcile.probes, [{ stage: "1-plan", path: "PRODUCT_SPEC.md" }]);
  assert.deepEqual(reconcile.project_owned, { keep: true });
  assert.equal(release.schema, "program-release-set/v1");
  assert.equal(fs.existsSync(path.join(control, "receipts", ".gitkeep")), true);
  assert.equal(fs.existsSync(path.join(control, "executions", ".gitkeep")), true);
  assert.equal(fs.existsSync(path.join(control, "evidence", ".gitkeep")), true);
  assert.equal(fs.existsSync(path.join(control, "executions", "J-001.json")), false);
  assert.match(result.stdout, /NO-GO|配置|下一步/);
});

test("init-program 幂等且绝不覆盖项目已经填写的 program config", () => {
  const root = setup();
  let result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const configFile = path.join(root, "orchestrator", "program", "program.config.json");
  const original = JSON.parse(fs.readFileSync(configFile, "utf8"));
  original.name = "用户已经修改";
  fs.writeFileSync(configFile, `${JSON.stringify(original, null, 2)}\n`);
  const reconcileFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const reconcileAfterFirstRun = fs.readFileSync(reconcileFile, "utf8");

  result = run([root, "--id", "changed", "--name", "Changed"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert.equal(after.program_id, "thirdspace");
  assert.equal(after.name, "用户已经修改");
  assert.equal(fs.readFileSync(reconcileFile, "utf8"), reconcileAfterFirstRun);
  assert.match(result.stdout, /SKIP|保留/);
});

test("reconcile config 不可解析时 fail-closed 且不覆盖任何项目内容", () => {
  const root = setup();
  const reconcileFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const invalid = '{ "receipt_policy": "required", "project_owned": ';
  fs.writeFileSync(reconcileFile, invalid);

  const result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /reconcile\.config\.json|JSON|解析/);
  assert.equal(fs.readFileSync(reconcileFile, "utf8"), invalid);
  assert.equal(fs.existsSync(path.join(root, "orchestrator", "program")), false);
});

test("未先更新 vendored engine 时拒绝创建只有文档没有门禁的假控制面", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-program-no-engine-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  const result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /program-gate|--update/);
  assert.equal(fs.existsSync(path.join(root, "orchestrator", "program")), false);
});

test("init-program 拒绝沿 program symlink 把控制面写出项目", () => {
  const root = setup();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "init-program-outside-"));
  fs.symlinkSync(outside, path.join(root, "orchestrator", "program"), "dir");
  const reconcileFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const before = fs.readFileSync(reconcileFile, "utf8");

  const result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /program.*symlink|symlink.*program|真实目录/i);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.readFileSync(reconcileFile, "utf8"), before);
});

test("init-program 拒绝沿 .gitkeep symlink 创建项目外文件", () => {
  const root = setup();
  let result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "init-program-outside-"));
  const outsideTarget = path.join(outside, "escaped");
  const gitkeep = path.join(root, "orchestrator", "program", "executions", ".gitkeep");
  fs.unlinkSync(gitkeep);
  fs.symlinkSync(outsideTarget, gitkeep, "file");

  result = run([root, "--id", "thirdspace", "--name", "Thirdspace"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /\.gitkeep.*symlink|symlink.*\.gitkeep/i);
  assert.equal(fs.existsSync(outsideTarget), false);
});
