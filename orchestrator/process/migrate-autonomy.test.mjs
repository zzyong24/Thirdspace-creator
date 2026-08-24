import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, GIT_AUTHOR_NAME: "Migration Test", GIT_AUTHOR_EMAIL: "migration@example.test", GIT_COMMITTER_NAME: "Migration Test", GIT_COMMITTER_EMAIL: "migration@example.test" };
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, env, encoding: "utf8" });

test("显式自治迁移创建可审计队列；不会从 DEC prose 猜任务或授权", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-migrate-"));
  let r = run("bash", [path.join(SKILL, "tools/init-project.sh"), root, "--triage", "S", "--topology", "single", "--name", "fixture"], SKILL);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  run("git", ["add", "."], root); run("git", ["commit", "-m", "baseline"], root);
  fs.rmSync(path.join(root, "orchestrator/process/modules.config.json"), { force: true });
  fs.rmSync(path.join(root, "orchestrator/progress.json"), { force: true });
  const input = path.join(root, "migration-input.json");
  fs.writeFileSync(input, JSON.stringify({
    verify_commands: { work: "test -f PRODUCT_SPEC.md" },
    modules: { "T-001": { tasks: ["work"], depends_on: [], write_set: ["PRODUCT_SPEC.md"], done_signals: {} } },
  }, null, 2));
  r = run("bash", [path.join(SKILL, "tools/migrate-autonomy.sh"), root, "--level", "L2", "--modules", input], SKILL);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "orchestrator/process/reconcile.config.json"), "utf8"));
  assert.equal(cfg.execution_mode, "autonomous"); assert.equal(cfg.autonomy_level, "L2");
  assert.equal(fs.existsSync(path.join(root, "orchestrator/progress.json")), true);
  r = run(process.execPath, [path.join(root, "orchestrator/process/autonomy-guard.mjs"), "audit", "--root", root], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("自治迁移对 step_depends_on 的 step 与依赖引用 fail-closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-step-deps-"));
  let r = run("bash", [path.join(SKILL, "tools/init-project.sh"), root, "--triage", "S", "--topology", "single", "--name", "fixture"], SKILL);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  run("git", ["add", "."], root); run("git", ["commit", "-m", "baseline"], root);
  fs.rmSync(path.join(root, "orchestrator/process/modules.config.json"), { force: true });
  fs.rmSync(path.join(root, "orchestrator/progress.json"), { force: true });
  const input = path.join(root, "migration-input.json");
  const base = {
    verify_commands: { review: "true", implementation: "true", cutover: "true" },
    modules: {
      "T-100": { tasks: ["cutover"], depends_on: [], write_set: ["foundation/**"] },
      "T-200": {
        tasks: ["review", "implementation"], depends_on: ["T-100:cutover"], write_set: ["delivery/**"],
        step_depends_on: { review: [], unknown: ["T-999:missing"] },
      },
    },
  };
  fs.writeFileSync(input, JSON.stringify(base));
  r = run("bash", [path.join(SKILL, "tools/migrate-autonomy.sh"), root, "--level", "L2", "--modules", input], SKILL);
  assert.notEqual(r.status, 0, "unknown step and dependency must not be accepted");
  assert.match(r.stderr + r.stdout, /step_depends_on|unknown|dependency/i);
  assert.equal(fs.existsSync(path.join(root, "orchestrator/process/modules.config.json")), false);

  base.modules["T-200"].step_depends_on = { review: [], implementation: ["T-100:cutover"] };
  fs.writeFileSync(input, JSON.stringify(base));
  r = run("bash", [path.join(SKILL, "tools/migrate-autonomy.sh"), root, "--level", "L2", "--modules", input], SKILL);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
