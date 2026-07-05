#!/usr/bin/env node
// pmem.mjs — 项目活记忆(Project Memory)心跳。
//
// 解决"文档腐烂 + 新会话不懂项目 + 不知道欠哪些任务"。两类数据:
//   • DERIVED(生成,禁手改):模块地图 / 边界状态 / 开放任务 / SHA —— 跑 sync 重生成,不会腐。
//   • CURATED(人写):定位 / 为什么 —— 见 orchestrator/SYSTEM_ARCHITECTURE.md 与本脚本顶部常量。
//
// 用法:
//   node pmem.mjs tasks                       # 看开放任务(新会话先跑这个)
//   node pmem.mjs add "<标题>" [--phase P2] [--status open|wip|blocked]
//   node pmem.mjs set <id> <open|wip|blocked|done>
//   node pmem.mjs sync                         # 心跳:codegraph sync + 门卫 + 重生成 PROJECT.md + 盖 SHA

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const LEDGER = path.join(REPO, "orchestrator", "TASK_LEDGER.jsonl");
const PROJECT = path.join(REPO, "PROJECT.md");
const BASELINE = path.join(HERE, "boundary-baseline.json");

// 定位单一真值 = docs/产品定位.md(宪法)。本常量是它的精炼副本,演进时两处对齐(见 T-145/D38)。
const POSITIONING =
  "CreatorOS —— 一个编导式的自媒体内容生产系统(非项目管理工具),核心是「越用越准的编导智能体」:出选题、起草文案与结构、管素材,发布后采集真实表现回流校准。项目主干两阶段:脚本(选题/脚本/素材/发布动作一体)→ 复盘(数据对照/经验沉淀);研究/策划/制作不再是独立阶段。护城河=飞轮复利(盲预测→发布→采集→对照偏差→沉淀经验→回流)。pnpm monorepo(frontend Next.js / backend 库 / contract zod / worker)。";

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs
    .readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
function writeLedger(rows) {
  fs.writeFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: REPO, encoding: "utf8", ...opts });
}
function shQuiet(cmd) {
  try {
    return sh(cmd, { stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const STATUS_ORDER = ["wip", "blocked", "open", "done"];
const STATUS_LABEL = { wip: "进行中", blocked: "卡住", open: "待办", done: "完成" };

function cmdTasks() {
  const rows = readLedger();
  const open = rows.filter((r) => r.status !== "done");
  console.log(`\n开放任务 ${open.length} 条(共 ${rows.length}):\n`);
  for (const s of STATUS_ORDER) {
    if (s === "done") continue;
    const g = rows.filter((r) => r.status === s);
    if (!g.length) continue;
    console.log(`[${STATUS_LABEL[s]}]`);
    for (const r of g)
      console.log(`  ${r.id}  (${r.phase ?? "-"})  ${r.title}`);
    console.log("");
  }
  const done = rows.filter((r) => r.status === "done").length;
  console.log(`已完成:${done}/${rows.length}`);
}

function nextId(rows) {
  const n =
    rows.reduce((mx, r) => {
      const m = /^T-(\d+)$/.exec(r.id);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, 0) + 1;
  return `T-${String(n).padStart(3, "0")}`;
}

function cmdAdd(argv) {
  const title = argv[0];
  if (!title) {
    console.error("用法: pmem add \"<标题>\" [--phase P2] [--status open]");
    process.exit(1);
  }
  const phase = flag(argv, "--phase") ?? "-";
  const status = flag(argv, "--status") ?? "open";
  const rows = readLedger();
  const id = nextId(rows);
  rows.push({ id, phase, title, status, created: today(), ref: "" });
  writeLedger(rows);
  console.log(`+ ${id}  (${phase})  ${title}  [${status}]`);
}

function cmdSet(argv) {
  const [id, status] = argv;
  if (!id || !status) {
    console.error("用法: pmem set <id> <open|wip|blocked|done>");
    process.exit(1);
  }
  const rows = readLedger();
  const r = rows.find((x) => x.id === id);
  if (!r) {
    console.error(`找不到任务 ${id}`);
    process.exit(1);
  }
  r.status = status;
  if (status === "done") r.closed = today();
  writeLedger(rows);
  console.log(`✓ ${id} → ${status}`);
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function moduleList() {
  for (const d of ["backend/src/modules", "frontend/src/server/modules"]) {
    const abs = path.join(REPO, d);
    if (fs.existsSync(abs)) {
      const mods = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      return { dir: d, mods };
    }
  }
  return { dir: "(未找到 modules 目录)", mods: [] };
}

function boundarySummary() {
  try {
    const b = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    const byRule = {};
    for (const v of b.violations ?? []) {
      const id = v.split("::")[0];
      byRule[id] = (byRule[id] ?? 0) + 1;
    }
    return { total: b.count ?? (b.violations ?? []).length, byRule };
  } catch {
    return { total: 0, byRule: {} };
  }
}

function cmdSync() {
  // 1) codegraph 增量(best-effort,无则跳过)
  const cg = shQuiet("codegraph sync 2>/dev/null || codegraph index 2>/dev/null && echo ok");
  // 2) 门卫(只读,不阻断 sync;阻断交给 reconcile/CI)
  shQuiet("node orchestrator/process/boundary-scan.mjs --quiet");
  // 3) 取真值
  const sha = shQuiet("git rev-parse --short HEAD") || "?";
  const branch = shQuiet("git rev-parse --abbrev-ref HEAD") || "?";
  const { dir, mods } = moduleList();
  const b = boundarySummary();
  const rows = readLedger();
  const open = rows.filter((r) => r.status !== "done");

  const lines = [];
  lines.push("# PROJECT.md — 项目活记忆(新会话先读这一个文件)");
  lines.push("");
  lines.push("> 本文件由 `node orchestrator/process/pmem.mjs sync` 生成,**勿手改生成段**。");
  lines.push("> 人写的「定位/为什么」改 pmem.mjs 顶部常量与 SYSTEM_ARCHITECTURE.md。");
  lines.push("");
  lines.push(`LAST_SYNCED: ${branch} @ ${sha}`);
  lines.push("");
  lines.push("## 这是什么(定位)");
  lines.push("");
  lines.push(POSITIONING);
  lines.push("");
  lines.push("物理架构与依赖规则见 [orchestrator/SYSTEM_ARCHITECTURE.md](orchestrator/SYSTEM_ARCHITECTURE.md)。");
  lines.push("正在进行:彻底重构,见 [docs/superpowers/specs/2026-06-29-creatoros-refactor-design.md](docs/superpowers/specs/2026-06-29-creatoros-refactor-design.md)。");
  lines.push("");
  lines.push("## 重构进度:物理架构边界(门卫)");
  lines.push("");
  lines.push(`剩余违规 **${b.total}** 条(目标 0,随 Phase 2 消减):`);
  lines.push("");
  for (const [id, n] of Object.entries(b.byRule)) lines.push(`- ${n} × \`${id}\``);
  lines.push("");
  lines.push(`查实时:\`node orchestrator/process/boundary-scan.mjs\``);
  lines.push("");
  lines.push("## 开放任务(欠债)");
  lines.push("");
  if (!open.length) lines.push("- (无)");
  for (const r of open)
    lines.push(`- [${r.status}] ${r.id} (${r.phase ?? "-"}) ${r.title}`);
  lines.push("");
  lines.push(`全部任务:\`node orchestrator/process/pmem.mjs tasks\``);
  lines.push("");
  lines.push(`## 模块地图(生成自 ${dir})`);
  lines.push("");
  lines.push(mods.length ? mods.map((m) => `\`${m}\``).join(" · ") : "(空)");
  lines.push("");
  fs.writeFileSync(PROJECT, lines.join("\n") + "\n");
  console.log(`✓ pmem sync 完成 → PROJECT.md (${branch} @ ${sha}) · 边界剩余 ${b.total} · 开放任务 ${open.length} · codegraph ${cg ? "已刷新" : "跳过"}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "tasks") cmdTasks();
else if (cmd === "add") cmdAdd(rest);
else if (cmd === "set") cmdSet(rest);
else if (cmd === "sync") cmdSync();
else {
  console.log("用法: pmem.mjs <tasks|add|set|sync>");
  process.exit(1);
}
