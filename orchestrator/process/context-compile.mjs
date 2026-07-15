#!/usr/bin/env node
// context-compile.mjs — Task Packet 编译器:给一个 BACKLOG 任务装配「最小充分上下文」。
//
// 为什么:BACKLOG 膨胀后 SessionStart 全量注入会被宿主转存文件(等于没注入);子代理派发
// 靠主 agent 手写简报必漏上下文 → 产出差/死循环。本编译器把「任务级上下文装配」变成确定性
// 脚本:同一仓库状态重跑,产物逐字节相同(禁时间戳),可 diff、可缓存、可被 hook 引用。
//
// 用法(vendored 到 <project>/orchestrator/process/ 后,../.. = 项目根):
//   node orchestrator/process/context-compile.mjs <task-id>              # 产出 orchestrator/context/<task-id>.md
//   node orchestrator/process/context-compile.mjs <task-id> --out <path> # 指定输出路径
//
// 产物分 9 节:目标 / 看板行原文 / 引用文档 / 知识上下文 / write_set / 验收判据 /
// 禁止事项 / 受阻协议 / 版本锚。缺配置的节优雅注明跳过或留占位,不当失败。
//
// 零依赖(纯 node:fs / node:crypto / node:child_process)。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根
const BACKLOG = path.join(REPO, "BACKLOG.md");
const KNOWLEDGE_CFG = path.join(HERE, "knowledge.config.json");
const MODULES_CFG = path.join(HERE, "modules.config.json");

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const taskId = argv.find((a) => !a.startsWith("--"));
let outPath = null;
const outIdx = argv.indexOf("--out");
if (outIdx !== -1) outPath = argv[outIdx + 1] ?? null;

if (!taskId) {
  console.error("用法:node context-compile.mjs <task-id> [--out <path>]");
  process.exit(1);
}

// ---------- 读看板 ----------
if (!fs.existsSync(BACKLOG)) {
  console.error(`✗ 未找到 ${rel(BACKLOG)} —— Task Packet 依赖看板,请先建 BACKLOG.md。`);
  process.exit(1);
}
const backlogRaw = fs.readFileSync(BACKLOG, "utf8");
const lines = backlogRaw.split("\n");

function rel(abs) {
  return path.relative(REPO, abs).split(path.sep).join("/");
}

// Markdown 表格行 → 去掉首尾空 cell 的单元格数组。
function cellsOf(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const parts = t.split("|").map((c) => c.trim());
  // "| a | b |".split("|") → ["","a","b",""],掐头去尾
  if (parts.length && parts[0] === "") parts.shift();
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

// 是否表格分隔行(|---|:--:|...)
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
}

// ---------- 定位任务行(首个 cell 精确等于 task-id,防止误中「一句话」里提到的 ID) ----------
let rowIdx = -1;
let rowCells = null;
for (let i = 0; i < lines.length; i++) {
  const cells = cellsOf(lines[i]);
  if (!cells || isSeparatorRow(cells)) continue;
  if (cells[0] === taskId) {
    rowIdx = i;
    rowCells = cells;
    break;
  }
}
if (rowIdx === -1) {
  console.error(`✗ BACKLOG.md 中找不到 ID 为「${taskId}」的看板行(要求首列精确匹配)。`);
  process.exit(1);
}
const rowLine = lines[rowIdx];

// ---------- 解析列名(向上找最近的表头行,其下一行是分隔行) ----------
function findHeader(fromIdx) {
  for (let i = fromIdx - 1; i >= 0; i--) {
    const cells = cellsOf(lines[i]);
    if (!cells) continue;
    if (isSeparatorRow(cells)) continue;
    const next = cellsOf(lines[i + 1] ?? "");
    if (next && isSeparatorRow(next)) return cells;
  }
  return null;
}
const header = findHeader(rowIdx);

// 按列名取 cell;找不到列名时退回位置约定(ID/任务/状态/文档/一句话)。
function cellByName(names, fallbackIdx) {
  if (header) {
    for (let i = 0; i < header.length; i++) {
      if (names.some((n) => header[i].includes(n))) return rowCells[i] ?? "";
    }
  }
  return rowCells[fallbackIdx] ?? "";
}
const taskName = cellByName(["任务"], 1);
const oneLiner = cellByName(["一句话", "描述", "说明"], rowCells.length - 1);
const docCell = cellByName(["文档", "SPEC", "引用"], 3);

// 任务全文(用于知识上下文命中)
const taskText = rowLine;

// ---------- 第 3 节:引用文档(行内「文档」列里存在于仓库的路径) ----------
// 抽两类:markdown 链接 [x](path) 与裸路径 token(含 / 且以常见文档后缀结尾)。
function extractDocPaths(cell) {
  const found = [];
  const seen = new Set();
  const push = (p) => {
    const clean = p.split("#")[0].trim(); // 去锚点再验存在性
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    found.push(clean);
  };
  let m;
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  while ((m = linkRe.exec(cell))) push(m[1]);
  const bareRe = /(?:^|[\s`(,;、:])([\w./-]+\/[\w./-]+\.(?:md|txt|json|yaml|yml))/g;
  while ((m = bareRe.exec(cell))) push(m[1]);
  return found;
}
const docPaths = extractDocPaths(docCell).filter((p) =>
  fs.existsSync(path.join(REPO, p)),
);

// ---------- 第 4 节:知识上下文(knowledge.config.json 的 feature_map 命中) ----------
// config 形状约定:{ "feature_map": [ { "id": "...", "title": "...", "docs": [路径…] 或 {名:路径} } ] }
// 命中规则:任务行文本包含条目 id,或包含条目 title(不区分大小写)。
function knowledgeSection() {
  if (!fs.existsSync(KNOWLEDGE_CFG)) {
    return "无 orchestrator/process/knowledge.config.json —— 本项目未启用知识上下文映射,跳过此节(不影响开工;需要时按 feature_map 约定补配置)。";
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(KNOWLEDGE_CFG, "utf8"));
  } catch {
    return "knowledge.config.json 存在但不是合法 JSON —— 跳过此节,请修配置。";
  }
  const map = Array.isArray(cfg.feature_map) ? cfg.feature_map : [];
  if (!map.length) return "knowledge.config.json 的 feature_map 为空 —— 跳过此节。";

  const lower = taskText.toLowerCase();
  const hits = map.filter((f) => {
    const id = String(f.id ?? "").trim();
    const title = String(f.title ?? "").trim();
    return (id && taskText.includes(id)) || (title && lower.includes(title.toLowerCase()));
  });
  if (!hits.length) return "feature_map 无条目与本任务命中 —— 跳过此节。";

  const out = [];
  for (const f of hits) {
    out.push(`- **${f.title ?? f.id}**(feature ${f.id ?? "?"}):`);
    const docs = f.docs ?? {};
    const entries = Array.isArray(docs)
      ? docs.map((p) => [null, p])
      : Object.entries(docs);
    if (!entries.length) {
      out.push("  - (该 feature 未配置 docs 路径)");
      continue;
    }
    for (const [name, p] of entries) {
      const exists = fs.existsSync(path.join(REPO, String(p)));
      const label = name ? `${name}: ` : "";
      out.push(`  - ${label}\`${p}\`${exists ? "" : "(路径缺失,勿引用)"}`);
    }
  }
  return out.join("\n");
}

// ---------- 第 6 节:验收判据(modules.config.json 的 verify 命令) ----------
function verifySection() {
  if (!fs.existsSync(MODULES_CFG)) {
    return "占位:**主 agent 必须补可验证命令**(测试/typecheck/真机路径),不接受「看起来对」。(无 modules.config.json,无法自动装配 verify。)";
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(MODULES_CFG, "utf8"));
  } catch {
    return "占位:**主 agent 必须补可验证命令**。(modules.config.json 不是合法 JSON。)";
  }
  const cmds = [];
  const collect = (v, from) => {
    if (!v) return;
    for (const c of Array.isArray(v) ? v : [v]) {
      if (typeof c === "string" && c.trim()) cmds.push({ from, cmd: c.trim() });
    }
  };
  collect(cfg.verify, "全局");
  for (const [name, mod] of Object.entries(cfg.modules ?? {})) {
    if (mod && typeof mod === "object") collect(mod.verify, `模块 ${name}`);
  }
  if (!cmds.length) {
    return "占位:**主 agent 必须补可验证命令**(测试/typecheck/真机路径),不接受「看起来对」。(modules.config.json 存在但未配 verify。)";
  }
  return cmds.map((c) => `- [${c.from}] \`${c.cmd}\``).join("\n");
}

// ---------- 第 9 节:版本锚 ----------
function gitShortHead() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: REPO,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim() || "无";
  } catch {
    return "无";
  }
}
const backlogSha = crypto
  .createHash("sha256")
  .update(backlogRaw)
  .digest("hex")
  .slice(0, 12);

// ---------- 组装 Packet(确定性:同仓库状态重跑逐字节相同,禁时间戳) ----------
const packet = `# Task Packet · ${taskId}

> 由 \`orchestrator/process/context-compile.mjs\` 确定性生成 —— 同一仓库状态重跑逐字节相同。
> 子代理派发前主 agent 须补齐第 5 节 write_set;第 6 节若是占位须补真命令。

## 1. 目标

- **任务**:${taskName || "(看板行未解析出任务名)"}
- **一句话**:${oneLiner || "(看板行未解析出一句话)"}

## 2. 看板行原文

\`\`\`
${rowLine.trim()}
\`\`\`

## 3. 引用文档

${docPaths.length ? docPaths.map((p) => `- \`${p}\``).join("\n") : "「文档」列未解析出存在于仓库的路径 —— 主 agent 派发前确认是否真无 SPEC。"}

(只给路径不展开内容 —— 子代理按需自己读,别整篇灌进简报。)

## 4. 知识上下文

${knowledgeSection()}

## 5. write_set(允许修改)

待主 agent 声明。

说明:write_set = 本任务允许触碰的文件/目录清单。**并行任务的 write_set 必须不相交**;相交 → 串行或真 worktree 隔离(协议见 rules/parallel-collab-rules.md)。子代理越出 write_set 的改动视为违规,主 agent 合并时拒收。

## 6. 验收判据

${verifySection()}

## 7. 禁止事项

指针:项目根 **AGENTS.md**(踩坑与收尾纪律的单一真相,开工前读)。
一行摘要:诚实置 0(没做就说没做,不编进度)/ 禁假按钮(禁 mock 假交互冒充真功能)/ 模型可配(禁写死具体模型)/ 不准 P0/P1 分级、不准多阶段执行(一次从 0 到 1 做完)。

## 8. 受阻协议

同一障碍失败 2 次 = 停止并报告(带已试过什么、卡在哪、需要什么);被 hook / permission 拒 = 政策禁止,**禁止换措辞重试**。子代理不能提问 —— 受阻即返回,不许在原地打转。

## 9. 版本锚

- git HEAD:\`${gitShortHead()}\`
- BACKLOG.md sha256(前 12 位):\`${backlogSha}\`
`;

// ---------- 落盘 ----------
const target = outPath
  ? path.resolve(process.cwd(), outPath)
  : path.join(REPO, "orchestrator", "context", `${taskId}.md`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, packet);
console.log(`✓ Task Packet 已生成 → ${rel(target)}`);
