#!/usr/bin/env node
// taskctl.mjs — 任务状态转换的**唯一程序化写入口** + append-only 事件日志。
//
// 三个状态源(BACKLOG.md / manifest / progress.json)靠手编辑互相同步,漂移频发。
// 本工具把「状态转换」收口成一个 CLI:BACKLOG.md 保持人类可读 canonical(不变成生成视图),
// 每次成功转换 append 一条事件到 <项目根>/orchestrator/events.ndjson(不存在自动建),
// 手改产生的漂移由 reconcile 检出(另一环节,本工具不管)。
//
// 用法(vendored 到 <project>/orchestrator/process/ 后,../.. = 项目根):
//   node orchestrator/process/taskctl.mjs start    <task-id> [--backlog <path>] [--expect-sha <hex前缀>]
//   node orchestrator/process/taskctl.mjs complete <task-id> --evidence "<commit-id 或证据文本>"
//   node orchestrator/process/taskctl.mjs block    <task-id> --reason "<原因>"
//
// 转换规则(fail-closed,拒绝即 exit 1):
//   start    📋/⏸️→🔨   拒绝:审核列 = 待审 / FAIL / 裸 CONCERNS(未标「已处理」)——与
//                     templates/hooks/backlog-guard.sh 的阻断语义一致(cell 精确等于,CONCERNS 前缀判)。
//   complete 🔨→✅   拒绝:--evidence 缺失或空(无证据不得完成)。
//   block    任意→⏸️  拒绝:--reason 缺失或空。
//   --expect-sha:执行前算 BACKLOG.md 内容 sha256,前缀不匹配 → 拒绝(并发守卫)。
//
// 行定位:在 BACKLOG.md 的 Markdown 表格里找 ID 列 == task-id 的行(靠表头「ID」列定位;
// 无表头时退化为「某 cell 精确等于 task-id」)。找不到或多行匹配 → 拒绝。
// 只替换该行状态 cell 里的状态 emoji(📋 🔨 ✅ ⏸️ ⛔),行内其他内容一个字不动。
//
// 事件行(NDJSON,无关字段省略):
//   {"ts":"<ISO>","actor":"taskctl","action":"start|complete|block","task":"<id>",
//    "evidence":"...","reason":"...","sha_before":"<12位>","sha_after":"<12位>"}
//
// --backlog 指定显式路径时(测试/其他布局),以该文件所在目录为项目根写 events.ndjson。
// 零依赖(纯 node:fs / node:crypto)。

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根

// 状态 emoji 集合:📋 待办 🔨 进行中 ✅ 完成 ⏸️ 搁置 ⛔ 审核FAIL
// ⏸️ 带 VS16(U+FE0F),但手编辑可能落下裸 ⏸ —— 检测时两个都认,长的排前面保证先匹配。
const STATUS_EMOJIS = ["📋", "🔨", "✅", "⏸️", "⏸", "⛔"];
const canon = (e) => (e === "⏸" ? "⏸️" : e); // 归一化到带 VS16 的写法做比较/输出

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// ── 参数解析 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const action = argv[0];
const taskId = argv[1];
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

if (!["start", "complete", "block"].includes(action ?? ""))
  die(`用法:taskctl.mjs <start|complete|block> <task-id> [选项] —— 收到 action「${action ?? ""}」不认识。`);
if (!taskId || taskId.startsWith("--")) die(`缺 <task-id>(第二个位置参数)。`);

const evidence = flag("--evidence");
const reason = flag("--reason");
const expectSha = flag("--expect-sha");

// fail-closed:证据/原因先验,不动文件
if (action === "complete" && (!evidence || !evidence.trim()))
  die(`complete 必须带 --evidence "<commit-id 或证据文本>"(无证据不得完成)。`);
if (action === "block" && (!reason || !reason.trim()))
  die(`block 必须带 --reason "<原因>"。`);

const explicitBacklog = flag("--backlog");
const BACKLOG = explicitBacklog
  ? path.resolve(process.cwd(), explicitBacklog)
  : path.resolve(REPO, "BACKLOG.md");
const PROJ_ROOT = explicitBacklog ? path.dirname(BACKLOG) : REPO;
const EVENTS = path.join(PROJ_ROOT, "orchestrator", "events.ndjson");

if (!existsSync(BACKLOG)) die(`找不到 ${BACKLOG} —— 没有看板就没有状态可转。`);

const src = readFileSync(BACKLOG, "utf8");
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const shaBefore = sha256(src);

// ── 并发守卫:--expect-sha 前缀不匹配即拒绝 ─────────────────────────────────
if (expectSha && !shaBefore.startsWith(expectSha.toLowerCase()))
  die(`并发守卫:BACKLOG.md 当前 sha256=${shaBefore.slice(0, 12)}…,与 --expect-sha ${expectSha} 不匹配 —— 文件已被他人改动,重读后再试。`);

// ── Markdown 表格解析 ───────────────────────────────────────────────────────
const lines = src.split("\n");
const isRow = (l) => l.trimStart().startsWith("|");
const isSep = (l) => {
  const t = l.trim();
  return isRow(l) && t.includes("-") && /^[|\s:\-]+$/.test(t);
};
// 拆行成 segs(按 | 切,保留原始空白以便原样回写)+ 参与语义的 cell 下标
function parseRow(line) {
  const segs = line.split("|");
  let start = 0,
    end = segs.length;
  if (segs.length && segs[0].trim() === "") start = 1; // 行首 | 之前的空段
  if (end > start && segs[end - 1].trim() === "") end -= 1; // 行尾 | 之后的空段
  const idx = [];
  for (let i = start; i < end; i++) idx.push(i);
  return { segs, idx, cells: idx.map((i) => segs[i].trim()) };
}

// 扫全文:记住最近表头的 ID / 状态 / 审核 列位,收集 ID 匹配行
let idCol = -1,
  statusCol = -1,
  reviewCol = -1;
const matches = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!isRow(L) || isSep(L)) continue;
  const row = parseRow(L);
  if (isRow(lines[i + 1] ?? "") && isSep(lines[i + 1])) {
    // 表头行(下一行是分隔线)——刷新列位
    idCol = row.cells.findIndex((c) => c.toUpperCase() === "ID");
    statusCol = row.cells.findIndex((c) => c.includes("状态"));
    reviewCol = row.cells.findIndex((c) => c.includes("审核"));
    continue;
  }
  const hit = idCol >= 0 ? row.cells[idCol] === taskId : row.cells.includes(taskId);
  if (hit) matches.push({ lineNo: i, row });
}

if (matches.length === 0) die(`任务 ${taskId} 在 ${path.basename(BACKLOG)} 表格中找不到(ID 列无精确匹配)。`);
if (matches.length > 1)
  die(`任务 ${taskId} 匹配到 ${matches.length} 行(L${matches.map((m) => m.lineNo + 1).join("/L")})—— ID 必须唯一,先修看板。`);

const { lineNo, row } = matches[0];

// ── 定位状态 cell + 当前状态 emoji ──────────────────────────────────────────
const emojiIn = (cell) => STATUS_EMOJIS.find((e) => (cell ?? "").includes(e));
let sCol = -1;
if (statusCol >= 0 && emojiIn(row.cells[statusCol])) sCol = statusCol;
else {
  const cand = row.cells.map((c, k) => (emojiIn(c) ? k : -1)).filter((k) => k >= 0);
  if (cand.length === 1) sCol = cand[0];
  else if (cand.length === 0) die(`任务 ${taskId} 行内找不到状态 emoji(📋/🔨/✅/⏸️/⛔)—— 不是合法任务行。`);
  else die(`任务 ${taskId} 行内有 ${cand.length} 个含状态 emoji 的 cell 且无「状态」表头可判 —— 歧义,拒绝。`);
}
const fromRaw = emojiIn(row.cells[sCol]);
const from = canon(fromRaw);

// ── 转换规则(fail-closed)────────────────────────────────────────────────────
// 审核阻断判定 —— 与 templates/hooks/backlog-guard.sh 完全对齐:
// cell 精确等于 待审/FAIL,或以 CONCERNS 开头且未含「已处理」。
const blockedCell = (c) => c === "待审" || c === "FAIL" || (c.startsWith("CONCERNS") && !c.includes("已处理"));

let to;
if (action === "start") {
  if (from !== "📋" && from !== "⏸️")
    die(`start 只接受 📋/⏸️→🔨:任务 ${taskId} 当前状态是 ${from}。`);
  const reviewCells = reviewCol >= 0 ? [row.cells[reviewCol]] : row.cells; // 无审核表头时退化为全行判(guard 同款)
  const bad = reviewCells.find(blockedCell);
  if (bad !== undefined)
    die(`任务 ${taskId} 审核列为「${bad}」—— 待审 / FAIL / 未处理的 CONCERNS 不得开工(先过 spec-review,改成 PASS 或 CONCERNS(已处理))。`);
  to = "🔨";
} else if (action === "complete") {
  if (from !== "🔨") die(`complete 只接受 🔨→✅:任务 ${taskId} 当前状态是 ${from}。`);
  to = "✅";
} else {
  // block:任意 → ⏸️
  if (from === "⏸️") die(`任务 ${taskId} 已是 ⏸️ 搁置,无需重复 block。`);
  to = "⏸️";
}

// ── 只改状态 cell 里的 emoji,行内其余一个字不动 ────────────────────────────
const segIdx = row.idx[sCol];
row.segs[segIdx] = row.segs[segIdx].replace(fromRaw, to);
lines[lineNo] = row.segs.join("|");
const out = lines.join("\n");
writeFileSync(BACKLOG, out);
const shaAfter = sha256(out);

// ── append 事件(无关字段省略;文件/目录不存在自动建)──────────────────────────
const ev = { ts: new Date().toISOString(), actor: "taskctl", action, task: taskId };
if (evidence) ev.evidence = evidence;
if (reason) ev.reason = reason;
ev.sha_before = shaBefore.slice(0, 12);
ev.sha_after = shaAfter.slice(0, 12);
mkdirSync(path.dirname(EVENTS), { recursive: true });
appendFileSync(EVENTS, JSON.stringify(ev) + "\n");

console.log(`✓ ${taskId} ${from}→${to}(event 已记)`);
