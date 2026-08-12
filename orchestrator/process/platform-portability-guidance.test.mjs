import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const processDir = path.dirname(fileURLToPath(import.meta.url));
const colocatedRoot = path.resolve(processDir, "..");
const stampPath = path.join(processDir, ".skill-version");
const installedSkillDir = existsSync(stampPath)
  ? readFileSync(stampPath, "utf8").match(/^skill_dir=(.+)$/m)?.[1]?.trim()
  : undefined;
const root = existsSync(path.join(colocatedRoot, "SKILL.md"))
  ? colocatedRoot
  : installedSkillDir && existsSync(path.join(installedSkillDir, "SKILL.md"))
    ? installedSkillDir
    : colocatedRoot;
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

test("skill entry treats OS integration as a contract, not an inline command", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /OS integration is a four-axis contract/);
  assert.match(skill, /command\/API.*argv.*completion.*user copy/s);
});

test("contract and test templates require a supported-platform execution matrix", () => {
  const contract = read("templates/SERVICE_CONTRACT_TEMPLATE.md");
  const testPlan = read("templates/TEST_PLAN_TEMPLATE.md");
  for (const source of [contract, testPlan]) {
    assert.match(source, /platform_execution_matrix/);
    assert.match(source, /command\/API/);
    assert.match(source, /completion semantics/);
    assert.match(source, /user copy/);
  }
});

test("BUILD and SHIP gates require platform tests plus target-host evidence", () => {
  const tdd = read("gates/13-tdd-gate.md");
  const integration = read("gates/14-integration-gate.md");
  const prelaunch = read("prompts/prelaunch-engineering-audit.md");
  assert.match(tdd, /platform_execution_matrix/);
  assert.match(tdd, /supported OS/);
  assert.match(integration, /target OS host/);
  assert.match(integration, /installed artifact/);
  assert.match(prelaunch, /OS command and native API matrix/);
  assert.match(prelaunch, /shell-free argv/);
});

test("field lessons retain reusable CreatorOS evidence without project-only branding", () => {
  const lessons = read("rules/field-lessons.md");
  assert.match(lessons, /Cross-platform desktop and release closure/);
  assert.match(lessons, /immutable build manifest/);
  assert.match(lessons, /physical effect on the target filesystem or host/);
  assert.match(lessons, /immutable input version.*attempt identity/s);
  assert.doesNotMatch(lessons, /智溯AI/);
});
