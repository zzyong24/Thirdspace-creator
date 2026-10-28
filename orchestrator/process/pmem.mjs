#!/usr/bin/env node
// pmem.mjs — 项目活记忆(Project Memory)心跳。
//
// 解决"文档腐烂 + 新会话不懂项目 + 不知道欠哪些任务"。两类数据:
//   • DERIVED(生成,禁手改):模块地图 / 边界状态 / BACKLOG 开放任务 / SHA —— 跑 sync 重生成,不会腐。
//   • CURATED(人写):定位 / 为什么 —— 见 orchestrator/SYSTEM_ARCHITECTURE.md 与本脚本顶部常量。
//
// 用法:
//   node pmem.mjs tasks  # 从 BACKLOG.md 看可执行任务
//   node pmem.mjs sync   # 心跳:codegraph sync + 门卫 + 重生成 PROJECT.md + 盖 SHA
//
// `orchestrator/TASK_LEDGER.jsonl` 是 2026-06-29 早期遗留台账，只保留考古。任务新增和状态
// 转换只能走 BACKLOG.md + taskctl.mjs，pmem 不再提供第二套 add/set 写入口。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { readBacklogTaskMetadata } from "./backlog-task-metadata.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BACKLOG = path.join(REPO, "BACKLOG.md");
const PROJECT = path.join(REPO, "PROJECT.md");
const BASELINE = path.join(HERE, "boundary-baseline.json");

// 定位单一真值 = docs/产品定位.md(宪法)。本常量是它的精炼副本,演进时两处对齐(见 T-145/D38)。
const POSITIONING =
  "CreatorOS —— 一个编导式的自媒体内容生产系统(非项目管理工具),核心是「越用越准的编导智能体」:出选题、起草文案与结构、管素材,发布后采集真实表现回流校准。项目主干两阶段:脚本(选题/脚本/素材/发布动作一体)→ 复盘(数据对照/经验沉淀);研究/策划/制作不再是独立阶段。护城河=飞轮复利(盲预测→发布→采集→对照偏差→沉淀经验→回流)。pnpm monorepo(frontend Next.js / backend 库 / contract zod / worker)。";

const BACKLOG_STATUS = {
  "🔨": "wip",
  "📋": "open",
  "⛔": "blocked",
};

function readBacklogTasks() {
  if (!fs.existsSync(BACKLOG)) return [];
  return readBacklogTaskMetadata({root:REPO,backlogFile:BACKLOG}).tasks.flatMap(task => {
    const marker=Object.keys(BACKLOG_STATUS).find(emoji=>task.status.includes(emoji));
    return marker ? [{id:task.id,title:task.title,status:BACKLOG_STATUS[marker]}] : [];
  });
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
  const rows = readBacklogTasks();
  console.log(`\n可执行任务 ${rows.length} 条（BACKLOG.md 单一真相）:\n`);
  for (const s of STATUS_ORDER) {
    if (s === "done") continue;
    const g = rows.filter((r) => r.status === s);
    if (!g.length) continue;
    console.log(`[${STATUS_LABEL[s]}]`);
    for (const r of g) console.log(`  ${r.id}  ${r.title}`);
    console.log("");
  }
}

function rejectLegacyMutation() {
  console.error(
    "✗ BACKLOG.md 是唯一任务真相；请登记 BACKLOG 行，并用 taskctl.mjs start/complete/block 转换状态。",
  );
  process.exit(1);
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
  const open = readBacklogTasks();

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
    lines.push(`- [${r.status}] ${r.id} ${r.title}`);
  lines.push("");
  lines.push(
    "任务真相：`BACKLOG.md`；查看可执行任务：`node orchestrator/process/pmem.mjs tasks`。",
  );
  lines.push("");
  lines.push(`## 模块地图(生成自 ${dir})`);
  lines.push("");
  lines.push(mods.length ? mods.map((m) => `\`${m}\``).join(" · ") : "(空)");
  fs.writeFileSync(PROJECT, `${lines.join("\n").trimEnd()}\n`);
  console.log(`✓ pmem sync 完成 → PROJECT.md (${branch} @ ${sha}) · 边界剩余 ${b.total} · 开放任务 ${open.length} · codegraph ${cg ? "已刷新" : "跳过"}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "tasks") cmdTasks();
else if (cmd === "add" || cmd === "set") rejectLegacyMutation(rest);
else if (cmd === "sync") cmdSync();
else {
  console.log("用法: pmem.mjs <tasks|sync>");
  process.exit(1);
}
