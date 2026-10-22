#!/usr/bin/env node
// backlog-health.mjs — BACKLOG 台账健康门卫。
//
// task-ledger-rules 早已声明"detail 一行、文件超 ~15KB 就压缩",但没人执行——实测有项目
// BACKLOG 膨胀到 200KB+、单行 5900+ 字(任务行写成诊断叙事),SessionStart 注入直接爆上下文。
// 本门卫把该规则变成可执行检查:
//   • 文件体积:>15KB WARN,>30KB ERROR,>60KB(2× 硬限)= 失控线 RUNAWAY → exit 2
//     (reconcile 对 exit 1 记 WARN——卫生债不 block;对 exit 2 记 ERROR——债务失控伤害所有会话,必须先瘦身。
//      机械部分一条命令:node orchestrator/process/backlog-compact.mjs)
//   • 单行长度:>300 字 WARN,>600 字 ERROR(带行号 + 预览,直接指到要压缩的行)
//   • 已完成区(首个 `## ✅` 之后):行应为"一句话 + commit/证据链接",>200 字 WARN 该压缩
//   • 状态列一致性(铁律 2/4 可执行化):任务行的状态 cell(以 📋/🔨/✅/⏸️/⛔ 开头的 cell)超 60 字
//     = 把过程叙事塞进了状态列 → WARN(过程进 commit message,状态列只放状态)
//
// 用法(vendored 到 <project>/orchestrator/process/ 后):
//   node orchestrator/process/backlog-health.mjs           # 默认读 <项目根>/BACKLOG.md
//   node orchestrator/process/backlog-health.mjs <path>    # 显式指定文件(测试/其他布局)
//   node orchestrator/process/backlog-health.mjs --quiet   # 干净时完全静默(reconcile 用)
//   node orchestrator/process/backlog-health.mjs --json    # 只读结构化结果；状态数不是实际并发数
//
// exit 0 = 干净或仅 WARN;exit 1 = 有 ERROR;exit 2 = 体积失控(RUNAWAY)。找不到 BACKLOG.md → 友好提示 exit 0(不阻塞)。
// 零依赖(纯 node:fs)。压缩规范见 rules/task-ledger-rules.md(长过程迁 docs/tasks/T-xxx.md 或 commit message)。

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根

const argv = process.argv.slice(2);
const QUIET = argv.includes("--quiet");
const JSON_OUTPUT = argv.includes("--json");
const explicit = argv.find((a) => !a.startsWith("-"));
const BACKLOG = explicit ? path.resolve(process.cwd(), explicit) : path.resolve(REPO, "BACKLOG.md");

// 阈值(task-ledger-rules 的可执行化)
const SIZE_WARN = 15 * 1024;
const SIZE_FAIL = 30 * 1024;
const SIZE_RUNAWAY = 60 * 1024; // 失控线(2× 硬限):reconcile 升 ERROR,不再当卫生债
const LINE_WARN = 300;
const LINE_FAIL = 600;
const DONE_WARN = 200;
const STATUS_CELL_MAX = 60; // 状态 cell 超此长度 = 塞了过程叙事

const findings = [];
const summary = { bytes: 0, task_states: { todo: 0, in_progress: 0, done: 0, paused: 0, blocked: 0 }, inconsistent_status_rows: 0 };
let runaway = false;
const err = (m) => findings.push({ level: "ERROR", m });
const warn = (m) => findings.push({ level: "WARN", m });
const ok = (m) => findings.push({ level: "OK", m });

function die() {
  const errs = findings.filter((f) => f.level === "ERROR").length;
  const warns = findings.filter((f) => f.level === "WARN").length;
  const exitCode = runaway ? 2 : errs ? 1 : 0;
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      schema: "backlog-health/v1", file: BACKLOG, summary,
      thresholds_bytes: { warning: SIZE_WARN, error: SIZE_FAIL, runaway: SIZE_RUNAWAY },
      errors: errs, warnings: warns, findings, exit_code: exitCode,
    }, null, 2));
    process.exit(exitCode);
  }
  if (!QUIET || errs || warns) {
    const icon = { ERROR: "✗", WARN: "!", OK: "✓" };
    console.log("\n── backlog-health ─────────────────────────────────────");
    for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
    console.log("───────────────────────────────────────────────────────");
    console.log(`${errs} error(s), ${warns} warning(s).`);
    console.log(errs ? "✗ BACKLOG 台账超限——按 rules/task-ledger-rules.md 压缩(✅ 归档一条命令:backlog-compact.mjs;长过程迁 docs/tasks/ 或 commit message)。" : "✓ BACKLOG 台账在限内。");
  }
  process.exit(exitCode);
}

if (!existsSync(BACKLOG)) {
  if (JSON_OUTPUT) console.log(JSON.stringify({ schema: "backlog-health/v1", file: BACKLOG, skipped: "missing-backlog", exit_code: 0 }));
  else if (!QUIET) console.log(`· backlog-health:未找到 ${path.relative(process.cwd(), BACKLOG)} — 跳过(项目尚无任务看板)。`);
  process.exit(0);
}

const src = readFileSync(BACKLOG, "utf8");
const ARCHIVE = path.join(path.dirname(BACKLOG), "BACKLOG-archive.md");

function taskIds(text) {
  const ids = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const id = line.split("|").slice(1, -1).map((cell) => cell.trim()).find((cell) => /^T-[A-Za-z0-9 -]+$/.test(cell));
    if (id && id !== "T-") ids.push(id);
  }
  return ids;
}

const activeIds = taskIds(src);
const archivedIds = existsSync(ARCHIVE) ? taskIds(readFileSync(ARCHIVE, "utf8")) : [];
const activeCounts = new Map();
for (const id of activeIds) activeCounts.set(id, (activeCounts.get(id) ?? 0) + 1);
const archiveCounts = new Map();
for (const id of archivedIds) archiveCounts.set(id, (archiveCounts.get(id) ?? 0) + 1);
const activeDuplicates = [...activeCounts].filter(([, count]) => count > 1).map(([id]) => id);
const reusedArchived = [...activeCounts.keys()].filter((id) => archiveCounts.has(id));
const archiveDuplicates = [...archiveCounts].filter(([, count]) => count > 1).map(([id]) => id);
if (activeDuplicates.length) err(`执行看板存在重复 ID:${activeDuplicates.join(",")}`);
if (reusedArchived.length) err(`执行看板复用了归档 ID:${reusedArchived.join(",")}`);
if (archiveDuplicates.length) warn(`归档内部保留 ${archiveDuplicates.length} 个历史撞号:${archiveDuplicates.join(",")}`);
if (!activeDuplicates.length && !reusedArchived.length) ok("执行任务 ID 唯一且未复用归档 ID。");

// ① 文件体积
const bytes = Buffer.byteLength(src, "utf8");
summary.bytes = bytes;
const kb = (bytes / 1024).toFixed(1);
if (bytes > SIZE_RUNAWAY) {
  runaway = true;
  err(`BACKLOG.md ${kb}KB 超失控线 ${(SIZE_RUNAWAY / 1024).toFixed(0)}KB(2× 硬限)— RUNAWAY:每个会话都在被它拖累,先瘦身再开工。机械归档:node orchestrator/process/backlog-compact.mjs(✅ 行迁 BACKLOG-archive.md)。`);
} else if (bytes > SIZE_FAIL) err(`BACKLOG.md ${kb}KB 超硬上限 ${(SIZE_FAIL / 1024).toFixed(1)}KB — 必须压缩/归档(backlog-compact.mjs 可机械迁走 ✅ 行)。`);
else if (bytes > SIZE_WARN) warn(`BACKLOG.md ${kb}KB 超软上限 ${(SIZE_WARN / 1024).toFixed(1)}KB — 该压缩了。`);
else ok(`体积 ${kb}KB 在限内(软限 ${(SIZE_WARN / 1024).toFixed(0)}KB / 硬限 ${(SIZE_FAIL / 1024).toFixed(0)}KB / 失控线 ${(SIZE_RUNAWAY / 1024).toFixed(0)}KB)。`);

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

// ④ 状态列一致性(铁律 2/4):状态 cell 只放状态 emoji(+日期),塞过程叙事 = WARN
const STATUS_RE = /^(📋|🔨|✅|⏸️|⛔)/;
const stateNames = { "📋": "todo", "🔨": "in_progress", "✅": "done", "⏸️": "paused", "⛔": "blocked" };
let statusWarns = 0;
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!L.startsWith("|")) continue;
  const cells = L.split("|").map((c) => c.trim());
  const sc = cells.find((c) => STATUS_RE.test(c));
  const task = cells.find((c) => /^T-[A-Za-z0-9._-]+$/.test(c));
  if (task && sc) {
    const symbol = sc.match(STATUS_RE)[1];
    summary.task_states[stateNames[symbol]]++;
    if (/^🔨\s*待办|^📋\s*进行中|^✅\s*(?:待办|进行中)/.test(sc)) {
      summary.inconsistent_status_rows++;
      if (summary.inconsistent_status_rows <= 10) warn(`L${i + 1} ${task} 状态符号与文字冲突:「${sc.slice(0, 50)}」。按真实进度校正；不能将该行计作已确认的在制任务。`);
    }
  }
  if (sc && sc.length > STATUS_CELL_MAX) {
    statusWarns++;
    if (statusWarns <= 10) warn(`L${i + 1} 状态 cell 长 ${sc.length} 字(>${STATUS_CELL_MAX})— 状态列塞了过程叙事:「${sc.slice(0, 30)}…」。过程进 commit message,状态列只放 emoji+日期+一句话。`);
  }
}
if (statusWarns > 10) warn(`…还有 ${statusWarns - 10} 条状态列超长行(共 ${statusWarns})。`);
if (summary.inconsistent_status_rows > 10) warn(`…还有 ${summary.inconsistent_status_rows - 10} 条状态符号与文字冲突(共 ${summary.inconsistent_status_rows})。`);
if (!statusWarns && !summary.inconsistent_status_rows) ok(`状态列干净(无塞叙事,上限 ${STATUS_CELL_MAX} 字)。`);
ok(`看板状态计数:${JSON.stringify(summary.task_states)}；仅按行内符号统计，不代表实际并发或当前领取数。`);

die();
