#!/usr/bin/env node
// backlog-compact.mjs — BACKLOG 机械瘦身:把 ✅ 完成行归档到 BACKLOG-archive.md。
//
// task-ledger-rules 铁律 3 说「状态变更即压缩」,但压缩从来没人做——因为全靠手工。本工具把
// **不需要语义判断的机械部分**变成一条命令:
//   • 归档对象:`## ✅`(或含「归档」)区段内的表格行 —— 完成区整体安全,默认全迁;
//   • 活动区(待办/进行中表)里状态 cell 为 ✅ 的行**默认不动**(可能是"刚完成待复验",
//     机器不判断),只列出提醒;确认后 `--all` 连它们一起迁;
//   • 主文件保留完成区最近 --keep 条(默认 5,取区段顶部——惯例新完成在上);
//   • 归档文件:与 BACKLOG.md 同目录 `BACKLOG-archive.md`,按日期分节追加,只进不改。
//
// 需要语义判断的部分(超长 📋/🔨 行压成一句话、教训抽取回流 field-lessons)仍是 agent 的活,
// 本工具跑完会把 backlog-health 仍标红的行列出来。
//
// 用法:
//   node orchestrator/process/backlog-compact.mjs               # 归档完成区 ✅ 行(留最近 5)
//   node orchestrator/process/backlog-compact.mjs --keep 10     # 留最近 10 条
//   node orchestrator/process/backlog-compact.mjs --all         # 活动区 ✅ 行也归档
//   node orchestrator/process/backlog-compact.mjs --dry-run     # 只报告,不写文件
//   node orchestrator/process/backlog-compact.mjs <path>        # 显式指定 BACKLOG 文件
//
// 安全:项目是 git 仓,改动可 diff/revert;本工具不删数据,只搬运;幂等(无可归档行时不写文件)。
// 零依赖(纯 node:fs)。日期取 git log 最后提交日,取不到再用系统时钟(尽量确定性)。

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { parseBacklogTaskRows, createTaskMetadata } from "./backlog-task-metadata.mjs";
import { acquireStateLock } from "./state-lock.mjs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ALL = argv.includes("--all");
const INDEX = argv.includes("--index");
const SQUEEZE = argv.includes("--squeeze") || INDEX;
const retainIdx = argv.indexOf("--retain");
const RETAIN = new Set(retainIdx >= 0 ? argv[retainIdx + 1].split(",") : []);
const keepIdx = argv.indexOf("--keep");
const KEEP = keepIdx >= 0 ? Math.max(0, Number.isFinite(Number(argv[keepIdx + 1])) ? Number(argv[keepIdx + 1]) : 5) : 5;
const explicit = argv.find((a, i) => !a.startsWith("-") && (keepIdx < 0 || i !== keepIdx + 1) && (retainIdx < 0 || i !== retainIdx + 1));
const BACKLOG = explicit ? path.resolve(process.cwd(), explicit) : path.resolve(REPO, "BACKLOG.md");
const ARCHIVE = path.join(path.dirname(BACKLOG), "BACKLOG-archive.md");
const DETAILS = path.join(path.dirname(BACKLOG), "BACKLOG-details.md");

if (!existsSync(BACKLOG)) {
  console.log(`· backlog-compact:未找到 ${path.relative(process.cwd(), BACKLOG)} — 无事可做。`);
  process.exit(0);
}

let today;
try { today = execSync("git log -1 --format=%cs", { cwd: path.dirname(BACKLOG), stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a repo / no commits */ }
if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) today = new Date().toISOString().slice(0, 10);

const src = readFileSync(BACKLOG, "utf8");
const lines = src.split("\n");
const STATUS_RE = /^(📋|🔨|✅|⏸️|⛔)/;
const isTableRow = (L) => L.startsWith("|") && !/^\|\s*-{2,}/.test(L.replace(/\|/g, "| ")) && !/^\|(\s*:?-+:?\s*\|)+\s*$/.test(L);
const statusOf = (L) => {
  const c = L.split("|").map((s) => s.trim()).find((s) => STATUS_RE.test(s));
  return c ? c.match(STATUS_RE)[1] : null;
};

// 定位完成区(首个标题含 ✅ 或「归档」的 ## 区段,到下一个 ## 或文件尾)
let doneStart = -1, doneEnd = lines.length;
for (let i = 0; i < lines.length; i++) {
  if (doneStart < 0 && /^##\s/.test(lines[i]) && (lines[i].includes("✅") || lines[i].includes("归档"))) { doneStart = i; continue; }
  if (doneStart >= 0 && /^##\s/.test(lines[i])) { doneEnd = i; break; }
}

const toArchive = [];   // {idx, line}
const activeDone = [];  // ✅ rows outside the done section (informational unless --all)
let keptInDone = 0;

for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!isTableRow(L)) continue;
  const st = statusOf(L);
  if (st !== "✅") continue;
  const inDone = doneStart >= 0 && i > doneStart && i < doneEnd;
  if (inDone) {
    if (keptInDone < KEEP) { keptInDone++; continue; } // 区段顶部 = 最近,保留
    toArchive.push({ idx: i, line: L });
  } else {
    if (ALL) toArchive.push({ idx: i, line: L });
    else activeDone.push({ idx: i, line: L });
  }
}

console.log("\n── backlog-compact ────────────────────────────────────");
console.log(`台账:${path.relative(process.cwd(), BACKLOG)}(${(Buffer.byteLength(src) / 1024).toFixed(1)}KB)`);
console.log(`完成区:${doneStart >= 0 ? `L${doneStart + 1}` : "未找到 `## ✅`/归档区段"};保留最近 ${KEEP} 条,归档 ${toArchive.length} 条。`);
if (activeDone.length) {
  console.log(`! 活动区还有 ${activeDone.length} 条 ✅ 行(默认不动——可能是"刚完成待复验"):`);
  for (const r of activeDone.slice(0, 8)) console.log(`  L${r.idx + 1}:「${r.line.trim().slice(0, 60)}…」`);
  console.log(`  确认它们真收口了就再跑一次加 --all;或手动把它们移进 \`## ✅\` 区段。`);
}

if (!toArchive.length && !SQUEEZE) {
  console.log("✓ 无可归档行 — 台账已是紧凑态(或先建 `## ✅` 完成区段)。");
  process.exit(0);
}

if (DRY) {
  console.log(`(dry-run)将归档 ${toArchive.length} 行到 ${path.basename(ARCHIVE)},主文件预计减 ${(toArchive.reduce((n, r) => n + Buffer.byteLength(r.line + "\n"), 0) / 1024).toFixed(1)}KB。`);
  process.exit(0);
}

// 先计算所有变更；任何元数据错误发生时仍不写入原文件。
const gone = new Set(toArchive.map((r) => r.idx));
let outLines = lines.filter((_, i) => !gone.has(i));
let squeezed = 0;
const detailsBefore = existsSync(DETAILS) ? readFileSync(DETAILS, "utf8") : "";
let detailText = detailsBefore || "# BACKLOG 任务详情\n";
const detailBlocks = [];
if (SQUEEZE) {
  const { tasks } = parseBacklogTaskRows(outLines.join("\n"));
  const byLine = new Map(tasks.map(t => [t.lineIndex, t]));
  let pausedTable = false;
  let indexedTable = false;
  const output = [];
  const header = "| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |";
  const indexHeader = "|ID|状态|审核|验收|文档|";
  for (let n = 0; n < outLines.length; n++) {
    const line = outLines[n];
    if (/^##\s+/.test(line)) { pausedTable = line.includes("⏸️"); indexedTable = false; }
    const task = byLine.get(n);
    if (!task) {
      if (pausedTable && /^\|\s*ID\s*\|/.test(line)) { output.push(indexHeader); indexedTable = true; }
      else if (pausedTable && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) output.push("|---|---|---|---|---|");
      else { output.push(line); if (/^\|\s*ID\s*\|/.test(line)) indexedTable = !line.includes("任务"); }
      continue;
    }
    const retain = INDEX && RETAIN.has(task.id);
    if (retain && !task.title) throw new Error(`保留 ${task.id} 前需先恢复完整元数据，拒绝写入错列表头`);
    const indexRow = !task.title || (!retain && (pausedTable || INDEX));
    if (indexRow !== indexedTable) {
      output.push("", indexRow ? indexHeader : header, indexRow ? "|---|---|---|---|---|" : "|---|---|---|---|---|---|---|");
      indexedTable = indexRow;
    }
    if (retain) {
      const canonicalHeader = ["ID","任务","状态","审核","验收","文档","一句话"];
      output.push(JSON.stringify(task.header) === JSON.stringify(canonicalHeader) ? line : `| ${[task.id, task.title, task.status, task.review || "—", task.acceptance ?? "—", task.document || "—", task.narrative || "—"].join(" | ")} |`);
      continue;
    }
    if (!task.title) { // 已索引行由读取器/迁移校验；压缩不猜标题或覆盖它。
      output.push(line); continue;
    }
    if (!indexRow && (task.narrative === "见详情。" || (line.length <= 300 && task.narrative.length <= 150))) {
      output.push(line); continue;
    }
    let entry;
    for (const anchorHashLength of [8, 12, 16, 64]) {
      entry = createTaskMetadata(task, { anchorHashLength });
      const combined = detailText + detailBlocks.join("");
      if (!combined.includes(`<a id="${entry.anchor}"></a>`) || combined.includes(entry.block.trim())) break;
      if (anchorHashLength === 64) throw new Error("元数据锚点冲突，拒绝覆盖");
    }
    const combined = detailText + detailBlocks.join("");
    if (!combined.includes(entry.block.trim())) {
      const legacyAnchor = task.id.toLowerCase().replace(/\s+/g, "-");
      if (!combined.includes(`<a id="${legacyAnchor}"></a>`)) detailBlocks.push(`\n<a id="${legacyAnchor}"></a>\n`);
      detailBlocks.push(`\n${entry.block.trim()}\n`);
    }
    const link = INDEX ? entry.link.replace("[详情]", "[D]") : entry.link;
    if (indexRow) output.push(`|${task.id}|${task.status}|${task.review || "—"}|${task.acceptance || "—"}|${link}|`);
    else output.push(`| ${[task.id, task.title, task.status, task.review || "—", task.acceptance || "—", task.document === "—" ? link : `${task.document} ${link}`, "见详情。"].join(" | ")} |`);
    squeezed++;
  }
  outLines = output;
}
const out = outLines.join("\n");
const release = acquireStateLock(path.dirname(BACKLOG), { operation: "backlog-compact" });
try {
  if (readFileSync(BACKLOG, "utf8") !== src || (existsSync(DETAILS) ? readFileSync(DETAILS, "utf8") : "") !== detailsBefore) throw new Error("并发变更，拒绝覆盖看板或详情");
  // 详情和归档先写；即便中断也只有可恢复的副本，主看板不会先丢原行。
  if (detailBlocks.length) writeFileSync(DETAILS, `${detailText.trimEnd()}\n${detailBlocks.join("")}`.trimEnd()+"\n");
  if (toArchive.length) {
    const head = existsSync(ARCHIVE) ? "" : "# BACKLOG 归档(只进不改)\n";
    const originalTasks = parseBacklogTaskRows(src).tasks;
    const archived = toArchive.map(r => {
      const t = originalTasks.find(t => t.lineIndex === r.idx);
      return t ? `| ${t.header.join(" | ")} |\n|${t.header.map(() => "---").join("|")}|\n${r.line}` : r.line;
    });
    appendFileSync(ARCHIVE, `${head}\n## 归档于 ${today}\n\n${archived.join("\n\n")}\n`);
  }
  writeFileSync(BACKLOG, out);
} finally { release(); }
console.log(`✓ 归档 ${toArchive.length} 行，外置 ${squeezed} 行；主文件 ${(Buffer.byteLength(src) / 1024).toFixed(1)}KB → ${(Buffer.byteLength(out) / 1024).toFixed(1)}KB。`);
