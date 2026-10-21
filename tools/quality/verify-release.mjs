#!/usr/bin/env node
// verify:release —— 打包前全量门：boundary、lint（只记录）、全 workspace typecheck（串行 6GB 堆）、
// 五包单测（按 known-failures 判新失败）、frontend 生产构建（PGlite 圈在临时目录）。
// 用法：pnpm verify:release [--out <file>] [--skip-build]
// 页面旅程、安装包冒烟不在本脚本内，证据里明确记为 not_run，不能当作已验。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PACKAGES, ROOT, gitIdentity, runPackageTests, runStep } from "./lib.mjs";
import { summarize, writeEvidence } from "./evidence.mjs";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const id = await gitIdentity();
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-verify-release-"));
const heap = { NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=6144" };
const started = new Date().toISOString();
const steps = [];
const step = async (s) => { const r = await runStep({ logDir, ...s }); steps.push(r); console.log(`  ${r.exit_code === 0 ? "✓" : r.allow_failure ? "!" : "✗"} ${r.name}（${Math.round(r.duration_ms / 1000)}s）`); return r; };

console.log(`verify:release @ ${id.commit?.slice(0, 12)}（未提交的跟踪文件改动 ${id.tracked_changes} 个）`);
await step({ name: "boundary", cmd: "pnpm", args: ["-s", "boundary"] });
await step({ name: "lint-frontend", cmd: "pnpm", args: ["--filter", "creatoros-frontend", "lint"], env: heap, allowFailure: true });
await step({ name: "typecheck-all", cmd: "pnpm", args: ["-r", "--workspace-concurrency=1", "typecheck"], env: heap });
const tests = [];
for (const p of Object.keys(PACKAGES)) {
  const t = await runPackageTests(p, { logDir });
  tests.push(t);
  console.log(`  ${t.ok ? "✓" : "✗"} 单测 ${p}：新失败 ${t.new_failures.length}，已知失败 ${t.known_failures.length}`);
}
const notRun = [
  { name: "core-journeys-e2e", reason: "需要真实运行环境，按任务的 frontend_verify_commands 单独执行" },
  { name: "installer-smoke", reason: "需要打包与安装，需用户批准后人工执行" },
];
if (argv.includes("--skip-build")) notRun.push({ name: "frontend-build", reason: "--skip-build" });
else {
  const pglite = fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-build-pglite-"));
  await step({ name: "frontend-build", cmd: "pnpm", args: ["--filter", "creatoros-frontend", "build"], env: { ...heap, PGLITE_DATA_DIR: pglite } });
}
const evidence = summarize("verify-release", { ...id, node: process.version, started_at: started, finished_at: new Date().toISOString(), log_dir: logDir }, steps, tests, notRun);
const out = path.resolve(opt("--out") ?? path.join(ROOT, ".quality", "release", `verify-release-${(id.commit ?? "nocommit").slice(0, 12)}.json`));
writeEvidence(evidence, out);
process.exit(evidence.verdict === "pass" ? 0 : 1);
