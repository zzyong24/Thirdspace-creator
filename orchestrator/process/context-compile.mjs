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
// 产物分 10 节:目标 / 看板行原文 / 引用文档 / 上下文读取计划 / 知识上下文 /
// write_set / 验收判据 / 禁止事项 / 受阻协议 / 版本锚。知识映射可注明跳过；
// task binding、write_set、当前步骤与 verify 缺失时 fail-closed，禁止生成伪完整 Packet。
//
// 零依赖(纯 node:fs / node:crypto / node:child_process)。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", ".."); // orchestrator/process/ → 项目根
const BACKLOG = path.join(REPO, "BACKLOG.md");
const KNOWLEDGE_CFG = path.join(HERE, "knowledge.config.json");
const MODULES_CFG = path.join(HERE, "modules.config.json");
const RECONCILE_CFG = path.join(HERE, "reconcile.config.json");
const PROGRESS = path.join(REPO, "orchestrator", "progress.json");
const CONTEXT_PLAN = path.join(HERE, "context-plan.mjs");

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

// ---------- 第 6/7 节:任务边界 + 当前步骤验收 ----------
// modules.config.json 是 write_set / verify_commands 的权威；progress.json 只决定当前 pending step。
// 旧 interactive 单步骤配置没有 progress 时可由唯一 step 推导，但绝不跨 module 汇总。
function failControls(message) {
  console.error(`✗ Task Packet control contract: ${message}`);
  process.exit(2);
}

function readControlJson(file, label, fallback = null) {
  if (!fs.existsSync(file)) {
    if (fallback !== null) return fallback;
    failControls(`缺少 ${label}`);
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failControls(`${label} 顶层必须是对象`);
    }
    return value;
  } catch (error) {
    failControls(`${label} 不是合法 JSON: ${error.message}`);
  }
}

function stringList(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    failControls(`${label} 缺失或为空`);
  }
  const result = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) failControls(`${label}[${index}] 必须是非空 string`);
    return item.trim();
  });
  return [...new Set(result)];
}

function commandList(value, label) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  const result = values.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) failControls(`${label}[${index}] 必须是非空 string`);
    return item.trim();
  });
  return [...new Set(result)];
}

const PARALLEL_LEASE_FIELDS = [
  "isolation_kind",
  "workspace_root",
  "branch",
  "base_sha",
  "wave_id",
  "merge_index",
];

function hasParallelLeaseMetadata(lease) {
  return lease
    && typeof lease === "object"
    && !Array.isArray(lease)
    && PARALLEL_LEASE_FIELDS.some((field) => Object.hasOwn(lease, field));
}

function validatedParallelLease(lease, key) {
  for (const field of PARALLEL_LEASE_FIELDS) {
    if (!Object.hasOwn(lease, field)) {
      failControls(`并行 lease ${key} 缺失必需字段 ${field}`);
    }
    if (field === "merge_index") {
      if (!Number.isInteger(lease[field]) || lease[field] < 0) {
        failControls(`并行 lease ${key} 的 ${field} 无效；必须是非负整数`);
      }
      continue;
    }
    if (typeof lease[field] !== "string" || !lease[field].trim()) {
      failControls(`并行 lease ${key} 的 ${field} 无效；必须是非空 string`);
    }
  }
  if (!["shared", "branch", "worktree"].includes(lease.isolation_kind)) {
    failControls(`并行 lease ${key} 的 isolation_kind 无效；只允许 shared、branch 或 worktree`);
  }
  return Object.fromEntries(PARALLEL_LEASE_FIELDS.map((field) => [field, lease[field]]));
}

function taskControls() {
  const config = readControlJson(MODULES_CFG, "orchestrator/process/modules.config.json");
  const modules = config.modules;
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) {
    failControls("modules.config.json modules 必须是对象");
  }
  const bindings = Object.entries(modules).filter(([moduleId, moduleConfig]) => (
    moduleConfig
    && typeof moduleConfig === "object"
    && !Array.isArray(moduleConfig)
    && (moduleId === taskId || moduleConfig.task_id === taskId)
  ));
  if (bindings.length === 0) {
    failControls(`${taskId} 缺 task binding；module id 必须等于 task ID，或显式声明 task_id`);
  }

  const reconcile = readControlJson(RECONCILE_CFG, "orchestrator/process/reconcile.config.json", {});
  const autonomous = reconcile.execution_mode === "autonomous" || /^L[2-4]$/i.test(reconcile.autonomy_level ?? "");
  let currentStep = null;
  let progressBound = false;
  let parallelLease = null;

  if (fs.existsSync(PROGRESS)) {
    const progress = readControlJson(PROGRESS, "orchestrator/progress.json");
    if (!Array.isArray(progress.verticals)) failControls("progress.json verticals 必须是数组");
    const moduleIds = new Set(bindings.map(([moduleId]) => moduleId));
    const verticals = progress.verticals.filter((vertical) => {
      if (!vertical || typeof vertical !== "object" || Array.isArray(vertical)) return false;
      if (!moduleIds.has(vertical.id)) return false;
      const configuredTaskId = modules[vertical.id]?.task_id ?? vertical.id;
      return (vertical.task_id ?? configuredTaskId) === taskId;
    });
    if (verticals.length === 0) failControls(`${taskId} 在 progress.json 中缺 task binding`);
    const pendingSteps = verticals.map((vertical) => {
      if (!Array.isArray(vertical.tasks)) failControls(`progress vertical ${vertical.id} tasks 必须是数组`);
      const pending = vertical.tasks.find((step) => step?.status !== "done");
      if (!pending || typeof pending.step !== "string" || !pending.step.trim()) {
        failControls(`${taskId} 没有 current pending step`);
      }
      return pending.step.trim();
    });
    const uniqueSteps = [...new Set(pendingSteps)];
    if (uniqueSteps.length !== 1) {
      failControls(`${taskId} 的 task bindings 当前步骤冲突: ${uniqueSteps.join(", ")}`);
    }
    currentStep = uniqueSteps[0];
    const leases = progress.leases == null ? {} : progress.leases;
    if (!leases || typeof leases !== "object" || Array.isArray(leases)) {
      failControls("progress.json leases 必须是对象");
    }
    const currentLeases = verticals.map((vertical) => {
      const key = `${vertical.id}:${currentStep}`;
      return { key, lease: leases[key] };
    });
    const parallelLeases = currentLeases.filter(({ lease }) => hasParallelLeaseMetadata(lease));
    if (parallelLeases.length > 0) {
      if (parallelLeases.length !== currentLeases.length) {
        failControls(`${taskId} 的 current-step bindings 必须全部绑定同一个并行 lease`);
      }
      const validated = parallelLeases.map(({ key, lease }) => validatedParallelLease(lease, key));
      const canonical = JSON.stringify(validated[0]);
      if (validated.some((lease) => JSON.stringify(lease) !== canonical)) {
        failControls(`${taskId} 的 current-step 并行 leases 执行环境冲突`);
      }
      parallelLease = validated[0];
    }
    progressBound = true;
  } else {
    if (autonomous) failControls(`${taskId} 缺 progress.json；autonomous Packet 不得猜 current step`);
    const sequences = bindings.map(([moduleId, moduleConfig]) => {
      if (!Array.isArray(moduleConfig.tasks) || moduleConfig.tasks.length !== 1) {
        failControls(`${moduleId} 无 progress.json 时必须是 single-step interactive task`);
      }
      const [step] = moduleConfig.tasks;
      if (typeof step !== "string" || !step.trim()) failControls(`${moduleId}.tasks[0] 必须是非空 string`);
      return step.trim();
    });
    const uniqueSteps = [...new Set(sequences)];
    if (uniqueSteps.length !== 1) failControls(`${taskId} 的 legacy task bindings 步骤冲突`);
    currentStep = uniqueSteps[0];
  }

  const writes = [];
  const reads = [];
  const resources = [];
  const commands = [];
  for (const [moduleId, moduleConfig] of bindings) {
    if (!Array.isArray(moduleConfig.tasks) || !moduleConfig.tasks.includes(currentStep)) {
      failControls(`${moduleId} 未声明 current step ${currentStep}`);
    }
    const stepValue = (field, stepField) => (
      moduleConfig[stepField]
      && typeof moduleConfig[stepField] === "object"
      && !Array.isArray(moduleConfig[stepField])
      && Object.hasOwn(moduleConfig[stepField], currentStep)
        ? moduleConfig[stepField][currentStep]
        : moduleConfig[field]
    );
    const moduleWrites = stringList(
      stepValue("write_set", "step_write_set") ?? [],
      `modules.${moduleId}.write_set@${currentStep}`,
      { allowEmpty: true },
    );
    const moduleReads = stringList(
      stepValue("read_set", "step_read_set") ?? [],
      `modules.${moduleId}.read_set@${currentStep}`,
      { allowEmpty: true },
    );
    if (moduleWrites.length === 0 && moduleReads.length === 0) {
      failControls(`modules.${moduleId} 必须声明非空 write_set 或 read_set`);
    }
    writes.push(...moduleWrites);
    reads.push(...moduleReads);
    resources.push(...stringList(
      stepValue("exclusive_resources", "step_exclusive_resources") ?? [],
      `modules.${moduleId}.exclusive_resources@${currentStep}`,
      { allowEmpty: true },
    ));

    const modern = moduleConfig.verify_commands?.[currentStep] ?? config.verify_commands?.[currentStep];
    const legacy = moduleConfig.verify ?? config.verify;
    const selected = modern ?? (!progressBound && !autonomous ? legacy : null);
    for (const command of commandList(
      selected,
      modern != null
        ? `verify_commands.${currentStep}`
        : `legacy verify for modules.${moduleId}`,
    )) {
      commands.push({ moduleId, command, legacy: modern == null });
    }
  }

  const uniqueCommands = [];
  const seenCommands = new Set();
  for (const item of commands) {
    if (seenCommands.has(item.command)) continue;
    seenCommands.add(item.command);
    uniqueCommands.push(item);
  }
  if (uniqueCommands.length === 0) {
    failControls(`${taskId} current-step verify 缺失: verify_commands.${currentStep}`);
  }

  return {
    currentStep,
    moduleIds: bindings.map(([moduleId]) => moduleId),
    writeSet: [...new Set(writes)],
    readSet: [...new Set(reads)],
    exclusiveResources: [...new Set(resources)],
    verifyCommands: uniqueCommands,
    parallelLease,
  };
}

function writeSetSection(controls) {
  return controls.writeSet.length
    ? controls.writeSet.map((item) => `- \`${item}\``).join("\n")
    : "(read-only; no writes allowed)";
}

function readSetSection(controls) {
  return controls.readSet.length
    ? controls.readSet.map((item) => `- \`${item}\``).join("\n")
    : "(未声明额外 task-local read dependency)";
}

function exclusiveResourcesSection(controls) {
  return controls.exclusiveResources.length
    ? controls.exclusiveResources.map((item) => `- \`${item}\``).join("\n")
    : "(无 task-local 独占资源)";
}

function parallelWorkerConstraints(controls) {
  if (!controls.parallelLease) return "指针:项目根 **AGENTS.md**。项目约束以 AGENTS.md 与本 Packet 的结构化边界为准；框架不注入项目专属优先级、模型、阶段或范围政策。";
  return [
    "- 只交付一个 candidate commit（候选提交），禁止 push。",
    "- 禁止修改 BACKLOG、progress、manifest、DEC/review/ledger 等主控制面；只能由主会话串行整合与推进状态。",
    "- 隔离与候选校验遵循 `rules/parallel-collab-rules.md`；越界或基线失效即拒收。",
  ].join("\n");
}

function verifySection(controls) {
  return controls.verifyCommands
    .map(({ moduleId, command, legacy }) => `- [${legacy ? "legacy " : ""}模块 ${moduleId} · ${controls.currentStep}] \`${command}\``)
    .join("\n");
}

function executionEnvironmentSection(controls) {
  if (!controls.parallelLease) {
    return "未绑定并行执行环境；沿用 legacy 单会话/共享控制面语义。";
  }
  return PARALLEL_LEASE_FIELDS
    .map((field) => `- ${field}: \`${controls.parallelLease[field]}\``)
    .join("\n");
}

// ---------- 上下文读取计划 ----------
// 调用同目录的确定性 planner，Packet 只记路径指针，不展开规则正文。
function contextReadPlan(currentStep) {
  if (!fs.existsSync(CONTEXT_PLAN)) {
    console.error(`✗ 未找到 ${rel(CONTEXT_PLAN)}，无法生成上下文读取计划。`);
    process.exit(2);
  }
  const run = spawnSync(
    process.execPath,
    [CONTEXT_PLAN, "--root", REPO, "--task", taskId, "--step", currentStep, "--json"],
    { cwd: REPO, encoding: "utf8" },
  );
  if (run.status !== 0) {
    const detail = (run.stderr || run.stdout || "context-plan 执行失败").trim();
    console.error(`✗ 无法生成上下文读取计划:\n${detail}`);
    process.exit(run.status === 2 ? 2 : 1);
  }
  try {
    const parsed = JSON.parse(run.stdout);
    if (
      parsed.schema !== "product-to-code-orchestrator/context-plan@2"
      || !Array.isArray(parsed.required_reads)
      || !Array.isArray(parsed.required_project_reads)
      || typeof parsed.read_root !== "string"
      || !parsed.read_root
      || parsed.step !== currentStep
    ) {
      throw new Error("wrong schema, missing reads/read_root, or mismatched step");
    }
    return {
      reads: parsed.required_reads,
      projectReads: parsed.required_project_reads,
      readRoot: parsed.read_root,
      compatibilityMode: parsed.compatibility_mode === true,
      diagnostic: typeof parsed.diagnostic === "string" ? parsed.diagnostic : null,
    };
  } catch {
    console.error("✗ context-plan 未返回合法 JSON。");
    process.exit(2);
  }
}

// ---------- 第 10 节:版本锚 ----------
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
const controls = taskControls();
const contextPlan = contextReadPlan(controls.currentStep);
const contextReads = contextPlan.reads;
const projectContextReads = contextPlan.projectReads;

// ---------- 组装 Packet(确定性:同仓库状态重跑逐字节相同,禁时间戳) ----------
const packet = `# Task Packet · ${taskId}

> 由 \`orchestrator/process/context-compile.mjs\` 确定性生成 —— 同一仓库状态重跑逐字节相同。
> read_set、write_set 与验收命令只来自本任务绑定；不得手工扩成其他任务的范围。

## 1. 目标

- **任务**:${taskName || "(看板行未解析出任务名)"}
- **一句话**:${oneLiner || "(看板行未解析出一句话)"}
- **当前步骤**:${controls.currentStep}
- **任务绑定**:${controls.moduleIds.join(", ")}

### 执行环境（主控制面 lease）

${executionEnvironmentSection(controls)}

## 2. 看板行原文

\`\`\`
${rowLine.trim()}
\`\`\`

## 3. 引用文档

${docPaths.length ? docPaths.map((p) => `- \`${p}\``).join("\n") : "「文档」列未解析出存在于仓库的路径 —— 主 agent 派发前确认是否真无 SPEC。"}

(只给路径不展开内容 —— 子代理按需自己读,别整篇灌进简报。)

## 4. 上下文读取计划

读取根：\`${contextPlan.readRoot}\`
读取模式：${contextPlan.compatibilityMode ? `compat-full — ${contextPlan.diagnostic ?? "legacy policy"}` : "adaptive"}

${contextReads.length ? contextReads.map((p) => `- \`${p}\``).join("\n") : "(无额外读取路径)"}

项目权威（项目根相对路径）：

${projectContextReads.length ? projectContextReads.map((p) => `- \`${p}\``).join("\n") : "(当前步骤没有额外项目权威文件)"}

## 5. 知识上下文

${knowledgeSection()}

## 6. 任务边界

read_set（并行依赖）：

${readSetSection(controls)}

exclusive_resources（必须串行的逻辑资源）：

${exclusiveResourcesSection(controls)}

write_set（允许修改）：

${writeSetSection(controls)}

说明:write_set = 本任务允许触碰的文件/目录清单。**并行任务的 write_set 必须不相交**；write_set 相交或存在语义冲突时必须串行。worktree 只隔离工作空间，不能把冲突任务变安全(协议见 rules/parallel-collab-rules.md)。子代理越出 write_set 的改动视为违规,主 agent 合并时拒收。

## 7. 验收判据

${verifySection(controls)}

## 8. 禁止事项

${parallelWorkerConstraints(controls)}

## 9. 受阻协议

同一障碍失败 2 次 = 停止并报告(带已试过什么、卡在哪、需要什么);被 hook / permission 拒 = 政策禁止,**禁止换措辞重试**。子代理不能提问 —— 受阻即返回,不许在原地打转。

## 10. 版本锚

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
