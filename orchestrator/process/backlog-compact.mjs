#!/usr/bin/env node
// backlog-compact.mjs — BACKLOG 机械瘦身。
//
// - ✅ 行归档到 BACKLOG-archive.md，统一保留审核/验收 receipt；
// - --squeeze 把超长执行行与暂停恢复条件无损外置到 BACKLOG-details.md；
// - 主看板继续保留 ID、状态和文档入口，taskctl 仍以 BACKLOG.md 为唯一状态真相；
// - 重复运行幂等，不重复归档、不重复详情锚点。

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ALL = argv.includes("--all");
const SQUEEZE = argv.includes("--squeeze");
const keepIndex = argv.indexOf("--keep");
const KEEP = keepIndex >= 0 ? Math.max(0, Number.parseInt(argv[keepIndex + 1], 10) || 5) : 5;
const explicit = argv.find((value, index) =>
  !value.startsWith("-") && !(keepIndex >= 0 && index === keepIndex + 1),
);
const BACKLOG = explicit ? path.resolve(process.cwd(), explicit) : path.join(REPO, "BACKLOG.md");
const ARCHIVE = path.join(path.dirname(BACKLOG), "BACKLOG-archive.md");
const DETAILS = path.join(path.dirname(BACKLOG), "BACKLOG-details.md");

if (!existsSync(BACKLOG)) {
  console.log(`· backlog-compact:未找到 ${path.relative(process.cwd(), BACKLOG)} — 无事可做。`);
  process.exit(0);
}

const parseRow = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim());
const isSeparator = (line) => /^[|\s:\-]+$/.test(line.trim()) && line.includes("-");
const isTaskId = (value) => /^T-[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/i.test(value ?? "");
const statusMarker = (value) => (value ?? "").match(/📋|🔨|✅|⏸️|⏸|⛔/)?.[0] ?? "";
const portableAnchor = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const compactText = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
};
const firstLinkOrText = (value) => {
  const link = String(value ?? "").match(/\[[^\]]+\]\([^)]+\)/)?.[0];
  return link || compactText(value, 64) || "—";
};

function columnMap(header) {
  return {
    id: header.findIndex((cell) => cell.toUpperCase() === "ID"),
    title: header.findIndex((cell) => cell === "任务"),
    status: header.findIndex((cell) => cell.includes("状态") || cell.includes("搁置")),
    review: header.findIndex((cell) => cell.includes("审核")),
    acceptance: header.findIndex((cell) => cell.includes("验收")),
    document: header.findIndex((cell) => cell.includes("文档")),
    detail: header.findIndex((cell) => cell === "一句话" || cell.includes("恢复条件")),
  };
}

function tableRecords(lines) {
  const records = [];
  let columns = null;
  let header = null;
  let headerIndex = -1;
  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s/.test(line)) section = line;
    if (!line.trimStart().startsWith("|") || isSeparator(line)) continue;
    const cells = parseRow(line);
    if (isSeparator(lines[index + 1] ?? "")) {
      header = cells;
      columns = columnMap(cells);
      headerIndex = index;
      continue;
    }
    if (!columns || columns.id < 0 || !isTaskId(cells[columns.id])) continue;
    records.push({ index, line, cells, columns: { ...columns }, header: [...header], headerIndex, section });
  }
  return records;
}

function archiveIds() {
  if (!existsSync(ARCHIVE)) return new Set();
  return new Set(tableRecords(readFileSync(ARCHIVE, "utf8").split("\n")).map((record) => record.cells[record.columns.id]));
}

function canonicalArchiveRow(record) {
  const cell = (key, fallback = "—") => {
    const index = record.columns[key];
    return index >= 0 && record.cells[index] ? record.cells[index] : fallback;
  };
  return `| ${cell("id")} | ${cell("title")} | ${cell("status")} | ${cell("review")} | ${cell("acceptance")} | ${cell("document")} | ${cell("detail")} |`;
}

function readDetailSections() {
  const sections = new Map();
  if (!existsSync(DETAILS)) return sections;
  const source = readFileSync(DETAILS, "utf8");
  const matches = [...source.matchAll(/^<a id="([^"]+)"><\/a>\n## ([^\n]+)\n([\s\S]*?)(?=^<a id="|\s*$)/gm)];
  for (const match of matches) sections.set(match[1], { title: match[2], body: match[3].trimEnd() });
  return sections;
}

function renderDetails(sections) {
  const blocks = [
    "# BACKLOG 任务详情（机械外置）",
    "",
    "> 由 `backlog-compact.mjs --squeeze` 维护。任务状态仍只认 `BACKLOG.md`；本文件保存外置前原始行，避免会话注入膨胀。",
    "",
  ];
  for (const [anchor, section] of sections) {
    blocks.push(`<a id="${anchor}"></a>`, `## ${section.title}`, section.body, "");
  }
  return `${blocks.join("\n").trimEnd()}\n`;
}

let today = "";
try {
  today = execFileSync("git", ["log", "-1", "--format=%cs"], {
    cwd: path.dirname(BACKLOG),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {}
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) today = new Date().toISOString().slice(0, 10);

const source = readFileSync(BACKLOG, "utf8");
const sourceLines = source.split("\n");
const records = tableRecords(sourceLines);
const doneSectionRecords = records.filter((record) => /✅|归档/.test(record.section) && statusMarker(record.cells[record.columns.status]) === "✅");
const keepDone = new Set(doneSectionRecords.slice(0, KEEP).map((record) => record.index));
const toArchive = records.filter((record) => {
  if (statusMarker(record.cells[record.columns.status]) !== "✅") return false;
  if (ALL) return true;
  return /✅|归档/.test(record.section) && !keepDone.has(record.index);
});
const existingArchiveIds = archiveIds();
const collisions = toArchive.filter((record) => existingArchiveIds.has(record.cells[record.columns.id]));
if (collisions.length) {
  console.error(`✗ 拒绝重复归档 ID:${collisions.map((record) => record.cells[record.columns.id]).join(",")}；先运行 backlog-health 修复单一真相。`);
  process.exit(1);
}

const removed = new Set(toArchive.map((record) => record.index));
const outputLines = sourceLines.filter((_, index) => !removed.has(index));
const details = readDetailSections();
let squeezed = 0;
if (SQUEEZE) {
  const squeezeRecords = tableRecords(outputLines);
  const pausedHeaderIndexes = new Set();
  for (const record of squeezeRecords) {
    const status = statusMarker(record.cells[record.columns.status]);
    const paused = status === "⏸️" || status === "⏸";
    const oversized = record.line.length > 300;
    if (!paused && !oversized) continue;
    const id = record.cells[record.columns.id];
    const anchor = portableAnchor(id);
    if (!details.has(anchor)) {
      details.set(anchor, {
        title: id,
        body: [`原始表头：${record.header.join(" | ")}`, "", record.line].join("\n"),
      });
    }
    let replacement;
    if (paused) {
      // 暂停池只保留恢复索引；原始任务、文档与恢复条件完整保存在详情文件。
      // 保持「搁置」而不是「状态」表头，避免暂停任务被当前执行队列的 strict receipt 审计误收。
      pausedHeaderIndexes.add(record.headerIndex);
      replacement = `| ${id} | ⏸️ | [详情](BACKLOG-details.md#${anchor}) |`;
    } else {
      const cells = [...record.cells];
      if (record.columns.title >= 0) cells[record.columns.title] = compactText(cells[record.columns.title], 96);
      if (record.columns.document >= 0) cells[record.columns.document] = firstLinkOrText(cells[record.columns.document]);
      if (record.columns.detail >= 0) cells[record.columns.detail] = `[详情](BACKLOG-details.md#${anchor})`;
      replacement = `| ${cells.join(" | ")} |`;
    }
    if (replacement !== outputLines[record.index]) {
      outputLines[record.index] = replacement;
      squeezed += 1;
    }
  }
  for (const headerIndex of pausedHeaderIndexes) {
    outputLines[headerIndex] = "| ID | 搁置 | 文档 |";
    outputLines[headerIndex + 1] = "|---|---|---|";
  }
}

const output = outputLines.join("\n");
console.log("\n── backlog-compact ────────────────────────────────────");
console.log(`台账:${path.relative(process.cwd(), BACKLOG)}(${(Buffer.byteLength(source) / 1024).toFixed(1)}KB)`);
console.log(`归档:${toArchive.length} 条；外置详情:${squeezed} 条；保留完成区:${KEEP} 条。`);
if (DRY) {
  console.log(`(dry-run) 主文件预计 ${(Buffer.byteLength(output) / 1024).toFixed(1)}KB，不写文件。`);
  process.exit(0);
}

if (toArchive.length) {
  const head = existsSync(ARCHIVE)
    ? ""
    : "# BACKLOG 归档(只进不改)\n\n> 由 `backlog-compact.mjs` 从 BACKLOG.md 迁入的完成行。考古用，不进 SessionStart 注入。\n";
  const block = `${head}\n## 归档于 ${today}\n\n| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |\n|---|---|---|---|---|---|---|\n${toArchive.map(canonicalArchiveRow).join("\n")}\n`;
  appendFileSync(ARCHIVE, block);
}
if (SQUEEZE && (squeezed || !existsSync(DETAILS))) writeFileSync(DETAILS, renderDetails(details));
if (output !== source) writeFileSync(BACKLOG, output);

console.log(`✓ 主文件 ${(Buffer.byteLength(source) / 1024).toFixed(1)}KB → ${(Buffer.byteLength(output) / 1024).toFixed(1)}KB。`);
console.log("✓ 完整原行保存在 BACKLOG-archive.md / BACKLOG-details.md；状态真相仍在 BACKLOG.md。");
