import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const INIT_PROJECT = path.join(SKILL, "tools", "init-project.sh");
const INIT_MODULE = path.join(SKILL, "tools", "init-module.sh");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };

test("模块初始化落在 docs/features 并登记导航与配置", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-module-"));
  let result = spawnSync("bash", [INIT_PROJECT, root, "--triage", "M", "--topology", "single", "--name", "Product"], { encoding: "utf8", env: ENV });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = spawnSync("bash", [INIT_MODULE, root, "--id", "FEAT-001", "--slug", "crm", "--name", "客户跟进"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of ["README.md", "BUSINESS.md", "DATA.md", "UI.md"]) {
    assert.equal(fs.existsSync(path.join(root, "docs", "features", "crm", file)), true, file);
  }
  assert.match(fs.readFileSync(path.join(root, "docs", "features", "crm", "README.md"), "utf8"), /FEAT-001/);
  assert.match(fs.readFileSync(path.join(root, "docs", "INDEX.md"), "utf8"), /features\/crm\/README\.md/);
  const config = JSON.parse(fs.readFileSync(path.join(root, "orchestrator", "process", "knowledge.config.json"), "utf8"));
  assert.equal(config.feature_map["FEAT-001"].dir, "crm");
  result = spawnSync("bash", [INIT_MODULE, root, "--id", "FEAT-001", "--slug", "crm", "--name", "客户跟进"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((fs.readFileSync(path.join(root, "docs", "INDEX.md"), "utf8").match(/features\/crm\/README\.md/g) ?? []).length, 1);
  result = spawnSync(process.execPath, [path.join(root, "orchestrator", "process", "docs-health.mjs"), "--strict"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = spawnSync("bash", [INIT_MODULE, root, "--id", "FEAT-002", "--slug", "crm", "--name", "另一模块"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout + result.stderr, /crm.*FEAT-001|FEAT-001.*crm/);
});
