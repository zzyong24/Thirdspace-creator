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
//   node orchestrator/process/taskctl.mjs complete <task-id> --evidence "<普通证据或 UI report path>"
//   node orchestrator/process/taskctl.mjs block    <task-id> --reason "<原因>"
//
// 转换规则(fail-closed,拒绝即 exit 1):
//   start    📋→🔨   审核值走 allowlist；strict 项目还校验 PASS review receipt + SPEC hash。
//   complete 🔨→✅   拒绝:--evidence 缺失；「验收=待验」还必须通过 UI journey report 校验。
//   block    任意→⏸️  拒绝:--reason 缺失或空。
//   --expect-sha:执行前算 BACKLOG.md 内容 sha256,前缀不匹配 → 拒绝(并发守卫)。
//
// 行定位:在 BACKLOG.md 的 Markdown 表格里找 ID 列 == task-id 的行(靠表头「ID」列定位;
// 无表头时退化为「某 cell 精确等于 task-id」)。找不到或多行匹配 → 拒绝。
// 只替换该行状态 cell；UI complete 同时把同一行「验收」改为 PASS:<report hash>。
//
// 事件行(NDJSON,无关字段省略):
//   {"ts":"<ISO>","actor":"taskctl","action":"start|complete|block","task":"<id>",
//    "evidence":"...","reason":"...","sha_before":"<12位>","sha_after":"<12位>"}
//
// --backlog 指定显式路径时(测试/其他布局),以该文件所在目录为项目根写 events.ndjson。
// 零依赖(纯 node:fs / node:crypto)。

import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, renameSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readReviewConfig, verifyReviewReceipt } from "./reviewctl.mjs";
import { acquireStateLock } from "./state-lock.mjs";
import {
  executeFrontendVerification,
  validateFrontendReport,
} from "./frontend-validation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根

// 状态 emoji 集合:📋 待办 🔨 进行中 ✅ 完成 ⏸️ 搁置 ⛔ 审核FAIL
// ⏸️ 带 VS16(U+FE0F),但手编辑可能落下裸 ⏸ —— 检测时两个都认,长的排前面保证先匹配。
const STATUS_EMOJIS = ["📋", "🔨", "✅", "⏸️", "⏸", "⛔"];
const canon = (e) => (e === "⏸" ? "⏸️" : e); // 归一化到带 VS16 的写法做比较/输出

function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

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
const unresolvedBacklog = explicitBacklog
  ? path.resolve(process.cwd(), explicitBacklog)
  : path.resolve(REPO, "BACKLOG.md");
if (!existsSync(unresolvedBacklog)) die(`找不到 ${unresolvedBacklog} —— 没有看板就没有状态可转。`);
const BACKLOG = realpathSync(unresolvedBacklog);
const PROJ_ROOT = realpathSync(explicitBacklog ? path.dirname(BACKLOG) : REPO);
const EVENTS = path.join(PROJ_ROOT, "orchestrator", "events.ndjson");

const src = readFileSync(BACKLOG, "utf8");
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const shaBefore = sha256(src);

function hasJourneyContract(documentCell) {
  const targets = [...(documentCell ?? "").matchAll(/\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0])
    .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
  for (const target of targets) {
    const file = path.resolve(PROJ_ROOT, target);
    const relative = path.relative(PROJ_ROOT, file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || !existsSync(file)) continue;
    if (readFileSync(file, "utf8").includes("```frontend-journey-contract")) return true;
  }
  return false;
}

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
let columns = null;
const matches = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!isRow(L) || isSep(L)) continue;
  const row = parseRow(L);
  if (isRow(lines[i + 1] ?? "") && isSep(lines[i + 1])) {
    // 表头行(下一行是分隔线)——刷新列位
    columns = {
      id: row.cells.findIndex((c) => c.toUpperCase() === "ID"),
      status: row.cells.findIndex((c) => c.includes("状态")),
      review: row.cells.findIndex((c) => c.includes("审核")),
      acceptance: row.cells.findIndex((c) => c.includes("验收")),
      document: row.cells.findIndex((c) => c.includes("文档")),
    };
    continue;
  }
  const hit = columns?.id >= 0 ? row.cells[columns.id] === taskId : row.cells.includes(taskId);
  if (hit) matches.push({ lineNo: i, row, columns: columns ? { ...columns } : null });
}

if (matches.length === 0) die(`任务 ${taskId} 在 ${path.basename(BACKLOG)} 表格中找不到(ID 列无精确匹配)。`);
if (matches.length > 1)
  die(`任务 ${taskId} 匹配到 ${matches.length} 行(L${matches.map((m) => m.lineNo + 1).join("/L")})—— ID 必须唯一,先修看板。`);

const { lineNo, row, columns: taskColumns } = matches[0];

// ── 定位状态 cell + 当前状态 emoji ──────────────────────────────────────────
const emojiIn = (cell) => STATUS_EMOJIS.find((e) => (cell ?? "").includes(e));
let sCol = -1;
if (taskColumns?.status >= 0 && emojiIn(row.cells[taskColumns.status])) sCol = taskColumns.status;
else {
  const cand = row.cells.map((c, k) => (emojiIn(c) ? k : -1)).filter((k) => k >= 0);
  if (cand.length === 1) sCol = cand[0];
  else if (cand.length === 0) die(`任务 ${taskId} 行内找不到状态 emoji(📋/🔨/✅/⏸️/⛔)—— 不是合法任务行。`);
  else die(`任务 ${taskId} 行内有 ${cand.length} 个含状态 emoji 的 cell 且无「状态」表头可判 —— 歧义,拒绝。`);
}
const fromRaw = emojiIn(row.cells[sCol]);
const from = canon(fromRaw);

// ── 转换规则(fail-closed)────────────────────────────────────────────────────
let config;
if (action === "block") {
  // 风险收缩动作必须在 legacy、缺配置或配置损坏时仍可用；它不能制造“开工/完成”假象。
  config = { receipt_policy: null };
} else {
  try {
    config = readReviewConfig(PROJ_ROOT);
  } catch (error) {
    die(error.message);
  }
}
const strictReceipts = config.receipt_policy === "required";
if (!strictReceipts && action !== "block") {
  die(
    `项目 receipt_policy=${JSON.stringify(config.receipt_policy ?? "(missing)")}，` +
      `legacy/未配置项目禁止 ${action}；请先运行 strict-receipts-migrate.mjs apply 迁移为 required`,
  );
}
if (
  action !== "block" &&
  strictReceipts &&
  (!taskColumns || taskColumns.review < 0 || taskColumns.acceptance < 0)
) {
  die(`strict 项目任务表必须同时含「审核」和「验收」列`);
}

let to;
let frontendEvidence = null;
let frontendExecution = null;
if (action === "start") {
  if (from !== "📋") die(`start 只接受 📋→🔨:任务 ${taskId} 当前状态是 ${from}。`);
  if (taskColumns?.review >= 0) {
    try {
      verifyReviewReceipt({
        root: PROJ_ROOT,
        taskId,
        reviewCell: row.cells[taskColumns.review],
        documentCell: taskColumns.document >= 0 ? row.cells[taskColumns.document] : "",
      });
    } catch (error) {
      die(`任务 ${taskId}: ${error.message}`);
    }
  } else {
    // 旧项目没有独立审核列。保留兼容性，但仍识别 Thirdspace 一类嵌在状态 cell
    // 中的显式 FAIL/待审/未处理 CONCERNS，不能把 legacy 变成绕过入口。
    const legacyText = row.cells.join(" ");
    const blocked =
      /待审|(?:^|\s|·)FAIL(?:\s|·|$)/.test(legacyText) ||
      (/CONCERNS/.test(legacyText) && !/已处理/.test(legacyText));
    if (blocked) die(`任务 ${taskId} 的 legacy 行仍含未放行审核标记，不得开工`);
  }
  to = "🔨";
} else if (action === "complete") {
  if (from !== "🔨") die(`complete 只接受 🔨→✅:任务 ${taskId} 当前状态是 ${from}。`);
  if (taskColumns?.acceptance >= 0) {
    const acceptance = row.cells[taskColumns.acceptance];
    if (acceptance === "待验") {
      try {
        frontendEvidence = validateFrontendReport({
          root: PROJ_ROOT,
          reportPath: evidence,
          taskId,
        });
        frontendExecution = executeFrontendVerification({
          root: PROJ_ROOT,
          verified: frontendEvidence,
        });
      } catch (error) {
        die(`任务 ${taskId} UI 旅程验收失败:\n${error.message}`);
      }
    } else if (
      acceptance === "—" &&
      taskColumns.document >= 0 &&
      hasJourneyContract(row.cells[taskColumns.document])
    ) {
      die(`任务 ${taskId} 链接了 frontend journey contract，验收不得标 —；请改为待验并提交真实报告`);
    } else if (acceptance !== "—") {
      die(`任务 ${taskId} 验收列为「${acceptance}」；complete 只接受 — 或待验`);
    }
  }
  to = "✅";
} else {
  // block:任意 → ⏸️
  if (from === "⏸️") die(`任务 ${taskId} 已是 ⏸️ 搁置,无需重复 block。`);
  to = "⏸️";
}

// ── 只改状态 cell 里的 emoji,行内其余一个字不动 ────────────────────────────
const segIdx = row.idx[sCol];
row.segs[segIdx] = row.segs[segIdx].replace(fromRaw, to);
if (frontendEvidence) {
  const acceptanceSegment = row.idx[taskColumns.acceptance];
  const original = row.segs[acceptanceSegment];
  const left = original.match(/^\s*/)?.[0] ?? " ";
  const right = original.match(/\s*$/)?.[0] ?? " ";
  row.segs[acceptanceSegment] = `${left}PASS:${frontendEvidence.reportSha}${right}`;
}
lines[lineNo] = row.segs.join("|");
const out = lines.join("\n");
const shaAfter = sha256(out);

// Validation (including a potentially slow real-browser command) happens
// without monopolizing the project state. The lock is acquired only for the
// commit window, then the source snapshot is compared again under the lock.
let releaseStateLock;
try {
  releaseStateLock = acquireStateLock(PROJ_ROOT, {
    operation: `taskctl:${action}:${taskId}`,
  });
} catch (error) {
  die(error.message);
}
const latestBacklog = readFileSync(BACKLOG, "utf8");
if (latestBacklog !== src) {
  releaseStateLock();
  die("并发守卫:BACKLOG.md 在验证期间已变化；拒绝用旧快照覆盖，请重读后重试");
}

// ── append 事件(无关字段省略;文件/目录不存在自动建)──────────────────────────
const ev = { ts: new Date().toISOString(), actor: "taskctl", action, task: taskId };
if (evidence) ev.evidence = evidence;
if (reason) ev.reason = reason;
if (frontendEvidence) {
  ev.report = path.relative(PROJ_ROOT, frontendEvidence.reportFile).split(path.sep).join("/");
  ev.report_sha = frontendEvidence.reportSha;
  ev.acceptance_checks = frontendEvidence.checkIds;
  if (frontendEvidence.visibleCopySha) {
    ev.visible_copy_sha = frontendEvidence.visibleCopySha;
    ev.visible_copy_captures = frontendEvidence.visibleCopyCaptureCount;
  }
  ev.commit_sha = frontendEvidence.report.commit_sha;
  ev.verification_executed = frontendExecution.executed;
  if (frontendExecution.executed) {
    ev.verification_command_sha = frontendExecution.commandSha;
    ev.verification_output_sha = frontendExecution.outputSha;
    ev.verification_output_bytes = frontendExecution.outputBytes;
  }
}
ev.sha_before = shaBefore.slice(0, 12);
ev.sha_after = shaAfter.slice(0, 12);
mkdirSync(path.dirname(EVENTS), { recursive: true });
let eventsBefore = "";
try {
  eventsBefore = existsSync(EVENTS) ? readFileSync(EVENTS, "utf8") : "";
} catch (error) {
  die(`events.ndjson 无法读取，状态未改变: ${error.message}`);
}
try {
  atomicWrite(BACKLOG, out);
  atomicWrite(EVENTS, `${eventsBefore}${JSON.stringify(ev)}\n`);
} catch (error) {
  try {
    atomicWrite(BACKLOG, src);
  } catch {}
  die(`taskctl transaction 未提交，BACKLOG 已回滚: ${error.message}`);
}
releaseStateLock();

console.log(`✓ ${taskId} ${from}→${to}(event 已记)`);
