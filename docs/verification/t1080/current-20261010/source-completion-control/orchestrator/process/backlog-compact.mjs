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
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ALL = argv.includes("--all");
const SQUEEZE = argv.includes("--squeeze");
const keepIdx = argv.indexOf("--keep");
const KEEP = keepIdx >= 0 ? Math.max(0, parseInt(argv[keepIdx + 1], 10) || 5) : 5;
const explicit = argv.find((a, i) => !a.startsWith("-") && (keepIdx < 0 || i !== keepIdx + 1));
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

// 写归档(只进不改,按日期分节;新文件补头)
if (toArchive.length) {
  let head = "";
  if (!existsSync(ARCHIVE)) {
    head = `# BACKLOG 归档(只进不改)\n\n> 由 \`backlog-compact.mjs\` 从 BACKLOG.md 迁入的 ✅ 完成行。考古用;不进 SessionStart 注入。\n`;
  }
  const block = `${head}\n## 归档于 ${today}\n\n| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |\n|---|---|---|---|---|---|---|\n${toArchive.map((r) => r.line).join("\n")}\n`;
  appendFileSync(ARCHIVE, block);
}

// 重写主文件(删除已归档行)
const gone = new Set(toArchive.map((r) => r.idx));
let outLines = lines.filter((_, i) => !gone.has(i));
let squeezed = 0;
let detailText = existsSync(DETAILS) ? readFileSync(DETAILS, "utf8") : "# BACKLOG 任务详情\n";
const detailBlocks = [];

if (SQUEEZE) {
  let pausedTable = false;
  outLines = outLines.map((line) => {
    if (/^##\s+/.test(line)) pausedTable = line.includes("⏸️");
    if (pausedTable && /^\|\s*ID\s*\|/.test(line)) return "|ID|状态|审核|验收|文档|";
    if (pausedTable && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) return "|---|---|---|---|---|";
    if (!/^\|\s*T-/.test(line)) return line;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const id = cells[0];
    const anchor = id.toLowerCase().replace(/\s+/g, "-");
    const detailLink = `[详情](BACKLOG-details.md#${anchor})`;

    if (pausedTable) {
      if (cells.length === 5 && cells.at(-1)?.includes(`BACKLOG-details.md#${anchor}`)) return line;
      const [task = "", status = "⏸️", document = "—", recovery = "—"] = cells.slice(1);
      if (!detailText.includes(`<a id="${anchor}"></a>`)) {
        detailBlocks.push(`\n<a id="${anchor}"></a>\n### ${id} · ${task}\n\n- 原文档：${document}\n- 暂停原因/恢复条件：${recovery}\n`);
      }
      squeezed++;
      return `|${id}|${status.startsWith("⏸️") ? "⏸️" : status}|—|—|${detailLink}|`;
    }

    if (cells.length !== 7 || (line.length <= 300 && (cells[6] ?? "").length <= 150)) return line;
    if (!detailText.includes(`<a id="${anchor}"></a>`)) {
      detailBlocks.push(`\n<a id="${anchor}"></a>\n### ${id} · ${cells[1]}\n\n- 原文档：${cells[5]}\n- 任务详情：${cells[6]}\n`);
    }
    cells[5] = cells[5] === "—" ? detailLink : `${cells[5]} ${detailLink}`;
    cells[6] = "见详情。";
    squeezed++;
    return `| ${cells.join(" | ")} |`;
  });
}

const out = outLines.join("\n");
writeFileSync(BACKLOG, out);
if (detailBlocks.length) {
  detailText = `${detailText.trimEnd()}\n${detailBlocks.join("")}\n`;
  writeFileSync(DETAILS, detailText);
}

const newKB = (Buffer.byteLength(out) / 1024).toFixed(1);
if (toArchive.length) console.log(`✓ 归档 ${toArchive.length} 行 → ${path.relative(process.cwd(), ARCHIVE)}`);
if (SQUEEZE) console.log(`✓ 外置 ${squeezed} 条长详情/暂停恢复条件 → ${path.relative(process.cwd(), DETAILS)}`);
console.log(`✓ 主文件 ${(Buffer.byteLength(src) / 1024).toFixed(1)}KB → ${newKB}KB。git diff 复核后连同归档文件一起提交。`);
console.log(`  剩余超长 📋/🔨 行属语义压缩(agent 的活):node orchestrator/process/backlog-health.mjs 查看清单。`);
