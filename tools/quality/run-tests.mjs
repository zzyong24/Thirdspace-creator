#!/usr/bin/env node
// 单包单测 + known-failures 判定。
// 用法：node tools/quality/run-tests.mjs <package> [--out <evidence.json>] [--log-dir <dir>] [--shard index/count] [--max-workers n] [--strict-resolved]
// 退出码：0 = 无新失败（已知失败如实列出）；1 = 有新失败或测试进程异常；2 = 用法/清单错误。
// --strict-resolved：清单里的 fail 项已通过也算失败（提醒及时删条目；CI 默认只告警）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PACKAGES, gitIdentity, runPackageTests, testExecutionArgs } from "./lib.mjs";

const argv = process.argv.slice(2);
const pkg = argv[0];
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
if (!PACKAGES[pkg]) { console.error(`用法: run-tests.mjs <${Object.keys(PACKAGES).join("|")}> [--out file] [--log-dir dir]`); process.exit(2); }

const logDir = path.resolve(opt("--log-dir") ?? fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-quality-")));
const execution = { shard: opt("--shard"), maxWorkers: opt("--max-workers") };
try {
  for (const name of ["--shard", "--max-workers"]) if (argv.includes(name) && !opt(name)) throw new Error(`${name} 缺少参数`);
  testExecutionArgs(execution);
} catch (error) { console.error(error.message); process.exit(2); }
console.log(`[${pkg}] 开始完整${execution.shard ? `分片 ${execution.shard}` : "套件"}；maxWorkers=${execution.maxWorkers ?? "包配置"}；实时日志 ${process.env.QUALITY_VERBOSE === "1" ? "开启" : "关闭"}`);
const res = await runPackageTests(pkg, { logDir, strictResolved: argv.includes("--strict-resolved"), ...execution });
const evidence = { schema: "creatoros-test-run/v1", ...(await gitIdentity()), node: process.version, at: new Date().toISOString(), ...res };
const out = opt("--out");
if (out) fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
const c = res.counts;
console.log(`[${pkg}] passed ${c.passed ?? 0} / failed ${c.failed ?? 0} / skipped ${(c.skipped ?? 0) + (c.pending ?? 0) + (c.todo ?? 0)}；新失败 ${res.new_failures.length}；已知失败 ${res.known_failures.length}；已修复待删清单 ${res.resolved_known_failures.length}`);
for (const f of res.new_failures) console.log(`  ✗ 新失败 ${f.file} :: ${f.test}`);
for (const f of res.known_failures) console.log(`  · 已知 ${f.known_id} ${f.file} :: ${f.test}`);
for (const id of res.resolved_known_failures) console.log(`  ! ${id} 已通过，请从 tools/quality/known-failures.json 删除`);
if (res.report_error) console.log(`  ✗ ${res.report_error}`);
for (const error of res.runtime_errors) console.log(`  ✗ 运行异常 ${error.kind}: ${error.message ?? error.file ?? "测试被中断或进程超时"}`);
console.log(`  质量门 ${res.ok ? "PASS" : "FAIL"}；进程 exit=${res.step.exit_code} signal=${res.step.signal ?? "无"}${res.step.oom ? " OOM" : ""}`);
console.log(`  日志 ${res.step.log_path}${out ? `；证据 ${out}` : ""}`);
process.exit(res.ok ? 0 : 1);
