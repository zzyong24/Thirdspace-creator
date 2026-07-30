import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const SYNC = path.join(SKILL, "tools", "sync-to-lab.sh");

function run(env) {
  return spawnSync("bash", [SYNC], {
    cwd: SKILL,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Sync Test",
      GIT_AUTHOR_EMAIL: "sync@example.test",
      GIT_COMMITTER_NAME: "Sync Test",
      GIT_COMMITTER_EMAIL: "sync@example.test",
      ...env,
    },
  });
}

test("sync-to-lab 未显式提供 LAB_DIR 时拒绝猜测本机旧路径", () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "sync-no-default-home-"));
  const result = run({ HOME: fakeHome, LAB_DIR: "" });
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /LAB_DIR.*(?:required|显式|必须)/i);
});

test("sync-to-lab 拒绝覆盖带未提交修改的目标 checkout", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sync-dirty-lab-"));
  const lab = path.join(repo, "product-to-code-orchestrator");
  fs.mkdirSync(lab, { recursive: true });
  fs.writeFileSync(path.join(lab, "SKILL.md"), "committed\n");
  let result = spawnSync("git", ["init", "-q"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const args of [
    ["config", "user.name", "Sync Test"],
    ["config", "user.email", "sync@example.test"],
    ["add", "."],
    ["commit", "-q", "-m", "initial"],
  ]) {
    result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  fs.writeFileSync(path.join(lab, "SKILL.md"), "dirty-user-change\n");

  result = run({ LAB_DIR: lab });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /dirty|未提交|拒绝覆盖/i);
  assert.equal(fs.readFileSync(path.join(lab, "SKILL.md"), "utf8"), "dirty-user-change\n");
});

test("sync-to-lab 在父仓库存在无关 staged 文件时拒绝同步且不得提交", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sync-parent-staged-"));
  const lab = path.join(repo, "product-to-code-orchestrator");
  const unrelated = path.join(repo, "unrelated.txt");
  fs.mkdirSync(lab, { recursive: true });
  fs.writeFileSync(path.join(lab, "SKILL.md"), "committed\n");
  fs.writeFileSync(unrelated, "committed\n");
  let result = spawnSync("git", ["init", "-q"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const args of [
    ["config", "user.name", "Sync Test"],
    ["config", "user.email", "sync@example.test"],
    ["add", "."],
    ["commit", "-q", "-m", "initial"],
  ]) {
    result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const beforeHead = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  fs.writeFileSync(unrelated, "staged-user-change\n");
  result = spawnSync("git", ["add", "unrelated.txt"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  result = run({ LAB_DIR: lab });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /dirty|未提交|暂存|拒绝/i);
  const afterHead = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  assert.equal(afterHead, beforeHead);
  const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  assert.equal(staged, "unrelated.txt");
});
