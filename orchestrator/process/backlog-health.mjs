#!/usr/bin/env node
// backlog-health.mjs — BACKLOG 台账健康门卫。
//
// task-ledger-rules 早已声明"detail 一行、文件超 ~15KB 就压缩",但没人执行——实测有项目
// BACKLOG 膨胀到 200KB+、单行 5900+ 字(任务行写成诊断叙事),SessionStart 注入直接爆上下文。
// 本门卫把该规则变成可执行检查:
//   • 文件体积:>15KB WARN,>30KB ERROR
//   • 单行长度:>300 字 WARN,>600 字 ERROR(带行号 + 预览,直接指到要压缩的行)
//   • 已完成区(首个 `## ✅` 之后):行应为"一句话 + commit/证据链接",>200 字 WARN 该压缩
//
// 用法(vendored 到 <project>/orchestrator/process/ 后):
//   node orchestrator/process/backlog-health.mjs           # 默认读 <项目根>/BACKLOG.md
//   node orchestrator/process/backlog-health.mjs <path>    # 显式指定文件(测试/其他布局)
//   node orchestrator/process/backlog-health.mjs --quiet   # 干净时完全静默(reconcile 用)
//
// exit 0 = 干净或仅 WARN;exit 1 = 有 ERROR。找不到 BACKLOG.md → 友好提示 exit 0(不阻塞)。
// 零依赖(纯 node:fs)。压缩规范见 rules/task-ledger-rules.md(长过程迁 docs/tasks/T-xxx.md 或 commit message)。

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根

const argv = process.argv.slice(2);
const QUIET = argv.includes("--quiet");
const explicit = argv.find((a) => !a.startsWith("-"));
const BACKLOG = explicit ? path.resolve(process.cwd(), explicit) : path.resolve(REPO, "BACKLOG.md");

// 阈值(task-ledger-rules 的可执行化)
const SIZE_WARN = 15 * 1024;
const SIZE_FAIL = 30 * 1024;
const LINE_WARN = 300;
const LINE_FAIL = 600;
const DONE_WARN = 200;

const findings = [];
const err = (m) => findings.push({ level: "ERROR", m });
const warn = (m) => findings.push({ level: "WARN", m });
const ok = (m) => findings.push({ level: "OK", m });

function die() {
  const errs = findings.filter((f) => f.level === "ERROR").length;
  const warns = findings.filter((f) => f.level === "WARN").length;
  if (!QUIET || errs || warns) {
    const icon = { ERROR: "✗", WARN: "!", OK: "✓" };
    console.log("\n── backlog-health ─────────────────────────────────────");
    for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
    console.log("───────────────────────────────────────────────────────");
    console.log(`${errs} error(s), ${warns} warning(s).`);
    console.log(errs ? "✗ BACKLOG 台账超限——按 rules/task-ledger-rules.md 压缩(长过程迁 docs/tasks/ 或 commit message)。" : "✓ BACKLOG 台账在限内。");
  }
  process.exit(errs ? 1 : 0);
}

if (!existsSync(BACKLOG)) {
  if (!QUIET) console.log(`· backlog-health:未找到 ${path.relative(process.cwd(), BACKLOG)} — 跳过(项目尚无任务看板)。`);
  process.exit(0);
}

const src = readFileSync(BACKLOG, "utf8");

// ① 文件体积
const bytes = Buffer.byteLength(src, "utf8");
const kb = (bytes / 1024).toFixed(1);
if (bytes > SIZE_FAIL) err(`BACKLOG.md ${kb}KB 超硬上限 ${(SIZE_FAIL / 1024).toFixed(1)}KB — 必须压缩/归档(如迁 docs/BACKLOG-archive.md)。`);
else if (bytes > SIZE_WARN) warn(`BACKLOG.md ${kb}KB 超软上限 ${(SIZE_WARN / 1024).toFixed(1)}KB — 该压缩了。`);
else ok(`体积 ${kb}KB 在限内(软限 ${(SIZE_WARN / 1024).toFixed(0)}KB / 硬限 ${(SIZE_FAIL / 1024).toFixed(0)}KB)。`);

// ② 单行长度 + ③ 已完成区膨胀
const lines = src.split("\n");
let doneStart = -1; // 首个 `## ✅` 标题行
let lineFails = 0, lineWarns = 0, doneWarns = 0;
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (doneStart < 0 && /^##\s+✅/.test(L)) doneStart = i;
  const len = L.length;
  const preview = L.trim().slice(0, 40);
  if (len > LINE_FAIL) {
    lineFails++;
    if (lineFails <= 15) err(`L${i + 1} 长 ${len} 字(>${LINE_FAIL} 硬限):「${preview}…」— detail 一行放不下就迁 docs/tasks/。`);
  } else if (len > LINE_WARN) {
    lineWarns++;
    if (lineWarns <= 15) warn(`L${i + 1} 长 ${len} 字(>${LINE_WARN} 软限):「${preview}…」`);
  } else if (doneStart >= 0 && i > doneStart && len > DONE_WARN && L.includes("|")) {
    doneWarns++;
    if (doneWarns <= 10) warn(`已完成区 L${i + 1} 长 ${len} 字(>${DONE_WARN})— 完成行只留一句话 + commit/证据链接,该压缩。`);
  }
}
if (lineFails > 15) err(`…还有 ${lineFails - 15} 条超硬限行(共 ${lineFails})。`);
if (lineWarns > 15) warn(`…还有 ${lineWarns - 15} 条超软限行(共 ${lineWarns})。`);
if (doneWarns > 10) warn(`…还有 ${doneWarns - 10} 条已完成区超长行(共 ${doneWarns})。`);
if (!lineFails && !lineWarns) ok(`无超长行(软限 ${LINE_WARN} 字 / 硬限 ${LINE_FAIL} 字)。`);
if (doneStart >= 0 && !doneWarns) ok(`已完成区(L${doneStart + 1} 起):无超长行。`);

die();
