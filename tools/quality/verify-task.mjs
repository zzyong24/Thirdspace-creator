#!/usr/bin/env node
// verify:task —— 每个任务必跑的快速门：boundary + 受影响包 typecheck + 受影响包单测（按 known-failures 判新失败）。
// 用法：pnpm verify:task --task T-1234 [--base <git-ref>] [--packages backend,frontend] [--out <file>]
//   --base：与哪个提交比较改动（含工作区与未跟踪文件），默认 HEAD（只看未提交改动）；任务已提交时传任务开始前的提交。
//   受影响包按路径推断；contract 改动会带上全部下游包。没有任何包受影响时只跑 boundary。
// 输出：JSON 证据（默认 .quality/<task>/verify-task-<commit12>.json），退出码 0=pass 1=fail 2=用法错误。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PACKAGES, ROOT, git, gitIdentity, runPackageTests, runStep } from "./lib.mjs";
import { summarize, writeEvidence } from "./evidence.mjs";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const task = opt("--task");
if (!task || !/^T-\d+[A-Za-z0-9-]*$/.test(task)) { console.error("用法: pnpm verify:task --task T-1234 [--base ref] [--packages a,b] [--out file]"); process.exit(2); }
const base = opt("--base") ?? "HEAD";
if (!(await git(["rev-parse", "--verify", `${base}^{commit}`]))) { console.error(`--base ${base} 不是有效提交`); process.exit(2); }

const changed = [...new Set([
  ...((await git(["diff", "--name-only", base])) ?? "").split("\n"),
  ...((await git(["ls-files", "--others", "--exclude-standard"])) ?? "").split("\n"),
].filter(Boolean))];
let packages = opt("--packages")?.split(",").filter(Boolean);
if (packages) {
  const bad = packages.filter((p) => !PACKAGES[p]);
  if (bad.length) { console.error(`未知包: ${bad.join(",")}`); process.exit(2); }
} else {
  const hit = new Set(Object.entries(PACKAGES).filter(([, p]) => changed.some((f) => f.startsWith(`${p.dir}/`))).map(([k]) => k));
  if (hit.has("contract")) Object.keys(PACKAGES).forEach((k) => hit.add(k));
  packages = Object.keys(PACKAGES).filter((k) => hit.has(k));
}

const id = await gitIdentity();
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), `creatoros-verify-task-${task}-`));
const heap = { NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=6144" };
console.log(`verify:task ${task}：base=${base}，改动文件 ${changed.length} 个，受影响包：${packages.join("、") || "（无）"}`);
const started = new Date().toISOString();
const steps = [await runStep({ name: "boundary", cmd: "pnpm", args: ["-s", "boundary"], logDir })];
for (const p of packages) {
  steps.push(await runStep({ name: `typecheck-${p}`, cmd: "pnpm", args: ["-s", "run", "typecheck"], cwd: path.join(ROOT, PACKAGES[p].dir), env: heap, logDir }));
  console.log(`  ${steps.at(-1).exit_code === 0 ? "✓" : "✗"} typecheck ${p}`);
}
const tests = [];
for (const p of packages) {
  tests.push(await runPackageTests(p, { logDir }));
  const t = tests.at(-1);
  console.log(`  ${t.ok ? "✓" : "✗"} 单测 ${p}：新失败 ${t.new_failures.length}，已知失败 ${t.known_failures.length}`);
}
const notRun = [{ name: "e2e", reason: "verify:task 不含页面旅程；UI 任务按 reconcile.config.json frontend_verify_commands 由 taskctl 执行" }];
const evidence = summarize("verify-task", {
  task, base, base_commit: await git(["rev-parse", base]), ...id, node: process.version,
  started_at: started, finished_at: new Date().toISOString(), changed_files: changed, packages, log_dir: logDir,
}, steps, tests, notRun);
const out = path.resolve(opt("--out") ?? path.join(ROOT, ".quality", task, `verify-task-${(id.commit ?? "nocommit").slice(0, 12)}.json`));
writeEvidence(evidence, out);
process.exit(evidence.verdict === "pass" ? 0 : 1);
