#!/usr/bin/env node
// context-plan.mjs — 为当前阶段/任务生成确定性的“路径指针”读取计划。
//
// required_reads 是 skill_dir 下按需读取的通用规则路径；required_project_reads
// 是 project root 下当前任务必须读取的权威事实路径。两者都只返回指针，不内联正文。因此
// total_inline_bytes 只计实际嵌入的规则正文（当前为 0）；referenced_bytes
// 则通过 .skill-version 的 skill_dir 计算，只作诊断，不占启动上下文预算。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PACKS = {
  core: {
    refs: [
      "rules/global-rules.md",
      "workflows/_COMMON.md",
      "gates/_GATE_EVIDENCE.md",
    ],
  },
  plan: {
    refs: [
      "workflows/v3-1-plan.md",
      "gates/01-product-gate.md",
      "templates/PRODUCT_SPEC_TEMPLATE.md",
    ],
  },
  contract: {
    refs: [
      "workflows/v3-2-contract.md",
      "gates/03-scope-budget-gate.md",
      "gates/12-service-contract-gate.md",
      "gates/15b-contract-completeness-gate.md",
      "templates/SERVICE_CONTRACT_TEMPLATE.md",
    ],
  },
  design: {
    refs: [
      "workflows/v3-3-design.md",
      "gates/05-ui-gate.md",
      "gates/06-page-spec-gate.md",
      "templates/UI_RULES_TEMPLATE.md",
      "templates/PAGE_SPEC_TEMPLATE.md",
    ],
  },
  build: {
    refs: [
      "workflows/v3-4-build.md",
      "gates/13-tdd-gate.md",
    ],
  },
  ship: {
    refs: [
      "workflows/v3-5-ship.md",
      "gates/14-integration-gate.md",
      "rules/product-integrity-rules.md",
      "rules/observability-rules.md",
      "templates/RELEASE_REVIEW_TEMPLATE.md",
    ],
  },
  architecture: {
    refs: [
      "rules/physical-architecture-rules.md",
      "gates/02-architecture-boundary-gate.md",
      "templates/SYSTEM_ARCHITECTURE_TEMPLATE.md",
    ],
  },
  knowledge: {
    refs: ["rules/knowledge-layer-rules.md"],
  },
  program: {
    refs: ["rules/program-orchestration-rules.md"],
  },
  autonomy: {
    refs: ["rules/orchestrator-state-machine.md"],
  },
  security: {
    refs: ["templates/THREAT_MODEL_TEMPLATE.json"],
  },
  observability: {
    refs: ["rules/observability-rules.md"],
  },
  ui: {
    refs: [
      "rules/product-integrity-rules.md",
      "rules/ui-implementation-rules.md",
      "gates/09-frontend-implementation-gate.md",
      "gates/10-frontend-validation-gate.md",
    ],
  },
  research: {
    refs: [
      "gates/04-research-first-gate.md",
      "templates/TECHNICAL_RESEARCH_CARD_TEMPLATE.md",
    ],
  },
  mock: {
    refs: [
      "rules/mock-data-rules.md",
      "gates/08-mock-data-gate.md",
    ],
  },
  "visual-mock": {
    refs: ["templates/UI_MOCK_PROMPT_TEMPLATE.md"],
  },
  prelaunch: {
    refs: ["prompts/prelaunch-engineering-audit.md"],
  },
  retro: {
    refs: ["prompts/engineering-retro.md"],
  },
  "asset-mining": {
    refs: ["prompts/asset-distill.md"],
  },
};

// 固定顺序保证同一状态产出逐字节稳定，不受触发发现顺序影响。
const PACK_ORDER = [
  "core",
  "plan",
  "contract",
  "design",
  "build",
  "ship",
  "architecture",
  "knowledge",
  "program",
  "autonomy",
  "security",
  "observability",
  "ui",
  "research",
  "mock",
  "visual-mock",
  "prelaunch",
  "retro",
  "asset-mining",
];

const STAGE_PACK = new Map([
  ["1-plan", "plan"],
  ["plan", "plan"],
  ["2-contract", "contract"],
  ["contract", "contract"],
  ["3-design", "design"],
  ["design", "design"],
  ["4-build", "build"],
  ["build", "build"],
  ["5-ship", "ship"],
  ["ship", "ship"],
]);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parseArgs(args) {
  const parsed = {
    root: path.resolve(HERE, "..", ".."),
    stage: null,
    task: null,
    step: null,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (["--root", "--stage", "--task", "--step"].includes(arg)) {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) fail(`${arg} 缺少参数`);
      parsed[arg.slice(2)] = value;
      i++;
      continue;
    }
    fail(`未知参数: ${arg}`);
  }
  parsed.root = path.resolve(parsed.root);
  if (parsed.step && !parsed.task) fail("--step 必须与 --task 一起使用");
  return parsed;
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file} 不是合法 JSON: ${error.message}`);
  }
}

function scalarFromManifest(raw, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`^\\s*${escaped}\\s*:\\s*["']?([^"'#\\n]+)`, "m"));
  return match?.[1]?.trim() ?? null;
}

function resolveLayout(root) {
  const vendoredProcess = path.join(root, "orchestrator", "process");
  const sourceProcess = path.join(root, "process");
  const vendored = fs.existsSync(vendoredProcess);
  const processDir = vendored ? vendoredProcess : sourceProcess;
  const vendoredManifest = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const sourceManifest = path.join(root, "ARTIFACT_MANIFEST.yaml");
  return {
    processDir,
    controlDir: vendored ? path.join(root, "orchestrator") : root,
    manifest: fs.existsSync(vendoredManifest) ? vendoredManifest : sourceManifest,
  };
}

function skillDirFromVersion(processDir) {
  const versionFile = path.join(processDir, ".skill-version");
  if (!fs.existsSync(versionFile)) {
    // 在 skill 源码目录直接调试时可用；装配到项目后由 .skill-version 锚定版本。
    return path.resolve(HERE, "..");
  }
  const raw = fs.readFileSync(versionFile, "utf8");
  const value = raw.match(/^skill_dir=(.+)$/m)?.[1]?.trim();
  if (!value) fail(`${versionFile} 缺少 skill_dir`);
  return path.resolve(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function packIds(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} 必须是 string 数组`);
  return value.map((id, index) => {
    if (typeof id !== "string" || id.length === 0 || id !== id.trim()) {
      fail(`${label}[${index}] 必须是非空、无首尾空白的 string`);
    }
    return id;
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const UI_SURFACE_TOKENS = new Set([
  "frontend",
  "e2e",
  "browser",
  "ui",
  "web",
  "client",
  "page",
  "pages",
  "screen",
  "screens",
  "view",
  "views",
  "component",
  "components",
  "mobile",
  "ios",
  "android",
]);

const UI_DIRECTORY_TOKENS = new Set([
  "frontend",
  "ui",
  "web",
  "client",
  "page",
  "pages",
  "screen",
  "screens",
  "view",
  "views",
  "component",
  "components",
  "mobile",
  "ios",
  "android",
]);

function nameTokens(value) {
  if (typeof value !== "string") return [];
  const tokens = value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  // Camel-case splitting turns the conventional spelling `iOS` into `i`, `os`.
  if (tokens.some((token, index) => token === "i" && tokens[index + 1] === "os")) {
    tokens.push("ios");
  }
  return tokens;
}

function mentionsUiSurface(value) {
  return nameTokens(value).some((part) => UI_SURFACE_TOKENS.has(part));
}

function isUiWritePath(value) {
  if (typeof value !== "string") return false;
  const segments = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\*+$/.test(segment));

  // Framework-owned view files are UI even when the repository keeps them at src/.
  if (/\.(?:tsx|jsx|vue|svelte)(?:$|[}*,?])/i.test(value)) return true;

  return segments.some((segment, index) => {
    const isFileName = index === segments.length - 1 && segment.includes(".");
    if (isFileName) return false;
    return nameTokens(segment).some((part) => UI_DIRECTORY_TOKENS.has(part));
  });
}

function isCompleteApprovedUserThreat(threat) {
  return (
    isPlainObject(threat)
    && typeof threat.id === "string"
    && threat.id.trim().length > 0
    && threat.status === "approved"
    && threat.owner === "user"
    && typeof threat.actor === "string"
    && threat.actor.trim().length > 0
    && Array.isArray(threat.assets)
    && threat.assets.length > 0
    && Array.isArray(threat.capabilities)
    && threat.capabilities.length > 0
    && Array.isArray(threat.acceptance_ids)
    && threat.acceptance_ids.length > 0
  );
}

function threatAppliesToTask(threat, taskId) {
  if (!isCompleteApprovedUserThreat(threat)) return false;
  const boundTask = typeof threat.task_id === "string" ? threat.task_id.trim() : "";
  // task_id is an optional planner extension, not part of reviewctl's threat contract.
  // A complete approved threat without it is therefore a project-wide safety fact.
  return boundTask.length === 0 || boundTask === taskId;
}

function matchingTaskModules(modulesConfig, taskId) {
  if (!taskId) return [];
  if (!isPlainObject(modulesConfig)) fail("modules.config.json 顶层必须是对象");
  const configuredModules = modulesConfig.modules ?? {};
  if (!isPlainObject(configuredModules)) fail("modules.config.json modules 必须是对象");

  return Object.entries(configuredModules).filter(([moduleId, moduleConfig]) => (
    isPlainObject(moduleConfig)
    && (moduleConfig.task_id === taskId || moduleId === taskId)
  ));
}

function declaredTaskSteps(matches, taskId) {
  const canonicalTasks = [];
  for (const [moduleId, moduleConfig] of matches) {
    if (moduleConfig.tasks !== undefined) {
      if (!Array.isArray(moduleConfig.tasks) || moduleConfig.tasks.some((step) => typeof step !== "string")) {
        fail(`modules.${moduleId}.tasks 必须是 string 数组`);
      }
      if (canonicalTasks.length > 0 && !sameJson(canonicalTasks[0].tasks, moduleConfig.tasks)) {
        fail(`task ${taskId} 的重复 module 绑定存在冲突 tasks: ${canonicalTasks[0].moduleId}, ${moduleId}`);
      }
      canonicalTasks.push({ moduleId, tasks: moduleConfig.tasks });
    }
  }
  return canonicalTasks[0]?.tasks ?? [];
}

function currentProgressStep(progressFile, matches, taskId, declaredSteps) {
  if (!fs.existsSync(progressFile)) return null;
  const progress = readJson(progressFile);
  if (!isPlainObject(progress) || !Array.isArray(progress.verticals)) {
    fail(`${progressFile} 必须包含 verticals 数组`);
  }

  const moduleIds = new Set(matches.map(([moduleId]) => moduleId));
  const verticals = progress.verticals.filter((vertical) => (
    isPlainObject(vertical)
    && (vertical.task_id === taskId || vertical.id === taskId || moduleIds.has(vertical.id))
  ));
  if (verticals.length === 0) return null;

  const candidates = [];
  for (const vertical of verticals) {
    if (!Array.isArray(vertical.tasks)) {
      fail(`progress.json vertical ${vertical.id ?? taskId} 缺少 tasks 数组`);
    }
    const pending = vertical.tasks.find((entry) => isPlainObject(entry) && entry.status !== "done");
    if (!pending) continue;
    if (typeof pending.step !== "string" || !pending.step.trim()) {
      fail(`progress.json vertical ${vertical.id ?? taskId} 的当前 pending step 非法`);
    }

    const prefix = `${vertical.id}:`;
    const claimed = Object.keys(isPlainObject(progress.leases) ? progress.leases : {})
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
    if (claimed.length > 1) {
      fail(`task ${taskId} 在 progress.json 有多个 claimed step: ${claimed.join(", ")}`);
    }
    if (claimed.length === 1 && claimed[0] !== pending.step) {
      fail(`task ${taskId} claimed step ${claimed[0]} 与当前 pending step ${pending.step} 冲突`);
    }
    candidates.push(claimed[0] ?? pending.step);
  }

  const unique = [...new Set(candidates)];
  if (unique.length !== 1) return null;
  if (!declaredSteps.includes(unique[0])) {
    fail(`progress.json 当前 step ${unique[0]} 不在 task ${taskId} 的 modules.config tasks 中`);
  }
  return unique[0];
}

function resolveTaskStep({ matches, taskId, requestedStep, progressFile }) {
  if (!taskId) return null;
  const declaredSteps = declaredTaskSteps(matches, taskId);
  if (matches.length === 0) {
    if (requestedStep) fail(`task ${taskId} 未在 modules.config.json 中声明，无法验证 --step ${requestedStep}`);
    return null;
  }
  if (declaredSteps.length === 0) fail(`task ${taskId} 的 modules.config tasks 为空，无法确定 step`);

  if (requestedStep) {
    if (!declaredSteps.includes(requestedStep)) {
      fail(`--step ${requestedStep} 不在 task ${taskId} 的 modules.config tasks 中`);
    }
    return requestedStep;
  }

  const hasProgress = fs.existsSync(progressFile);
  const progressStep = currentProgressStep(progressFile, matches, taskId, declaredSteps);
  if (progressStep) return progressStep;
  if (hasProgress) {
    fail(`task ${taskId} 无法从 progress.json 唯一确定当前 pending/claimed step`);
  }
  if (declaredSteps.length === 1) return declaredSteps[0];
  fail(`task ${taskId} 有多个 step，无法从 progress.json 唯一确定当前 pending/claimed step；请传 --step`);
}

function taskContext(matches, taskId, currentStep) {
  if (!taskId) return { packs: [], ui: false, matchedModules: [], step: null };
  const canonicalSteps = declaredTaskSteps(matches, taskId);
  const hasExplicitUiStep = canonicalSteps.some(mentionsUiSurface);
  const stepScopedSurface = canonicalSteps.length > 1 && hasExplicitUiStep;
  const stepDefinitions = new Map();
  const packs = [];
  let ui = false;

  for (const [moduleId, moduleConfig] of matches) {

    if (moduleConfig.step_depends_on !== undefined) {
      if (!isPlainObject(moduleConfig.step_depends_on)) {
        fail(`modules.${moduleId}.step_depends_on 必须是对象`);
      }
      for (const [step, definition] of Object.entries(moduleConfig.step_depends_on)) {
        if (stepDefinitions.has(step) && !sameJson(stepDefinitions.get(step).definition, definition)) {
          fail(`task ${taskId} 的重复 module 绑定存在冲突 step ${step}: ${stepDefinitions.get(step).moduleId}, ${moduleId}`);
        }
        stepDefinitions.set(step, { moduleId, definition });
      }
    }

    packs.push(...packIds(moduleConfig.context_packs, `modules.${moduleId}.context_packs`));
    // A multi-step task may contain a future frontend/e2e step. Do not let those
    // future names (or their task-wide write_set) pollute the current repo step.
    const namedSteps = stepScopedSurface ? [currentStep] : [moduleId, currentStep];
    if (namedSteps.some(mentionsUiSurface)) ui = true;
    if (!stepScopedSurface && Array.isArray(moduleConfig.write_set) && moduleConfig.write_set.some(isUiWritePath)) ui = true;
  }

  return {
    packs,
    ui,
    step: currentStep,
    matchedModules: matches.map(([moduleId]) => moduleId),
  };
}

const args = parseArgs(process.argv.slice(2));
const layout = resolveLayout(args.root);
const manifestRaw = fs.existsSync(layout.manifest)
  ? fs.readFileSync(layout.manifest, "utf8")
  : "";
const manifestStage = scalarFromManifest(manifestRaw, "current_stage");
const stage = args.stage ?? manifestStage ?? "1-plan";
const stagePack = STAGE_PACK.get(String(stage).toLowerCase());
if (!stagePack) fail(`未知 stage: ${stage}`);

const reconcile = readJson(path.join(layout.processDir, "reconcile.config.json"));
if (!reconcile || typeof reconcile !== "object" || Array.isArray(reconcile)) {
  fail("reconcile.config.json 顶层必须是对象");
}
const modules = readJson(path.join(layout.processDir, "modules.config.json"));
const reasons = new Map();

const hasContextPolicy = Object.prototype.hasOwnProperty.call(reconcile, "context_policy");
const compatibilityMode = !hasContextPolicy;
const diagnostic = compatibilityMode
  ? "legacy reconcile.config.json 缺少 context_policy，本次显式使用 compat-full；不修改项目配置"
  : null;
let projectPacks = [];
if (hasContextPolicy) {
  const policy = reconcile.context_policy;
  if (!isPlainObject(policy)) {
    fail("context_policy 必须是对象");
  }
  const allowedPolicyKeys = new Set(["mode", "project_packs"]);
  const unknownPolicyKeys = Object.keys(policy).filter((key) => !allowedPolicyKeys.has(key));
  if (unknownPolicyKeys.length > 0) {
    fail(`context_policy 未知字段: ${unknownPolicyKeys.join(", ")}`);
  }
  if (policy.mode !== "adaptive") {
    fail(`未知 context_policy.mode: ${String(policy.mode)}`);
  }
  if (!Object.prototype.hasOwnProperty.call(policy, "project_packs")) {
    fail("context_policy.project_packs 必须是 string 数组");
  }
  projectPacks = packIds(policy.project_packs, "context_policy.project_packs");
}

function activate(id, reason) {
  if (!PACKS[id]) fail(`unknown context pack: ${id}`);
  const current = reasons.get(id) ?? [];
  if (!current.includes(reason)) current.push(reason);
  reasons.set(id, current);
}

activate("core", "每个任务都需要的最小交付内核");
activate(stagePack, `当前阶段为 ${stage}`);
if (compatibilityMode) {
  for (const id of PACK_ORDER) activate(id, diagnostic);
}

const triage = scalarFromManifest(manifestRaw, "scale_class");
if (String(triage).toUpperCase() === "L") {
  activate("architecture", "scale_class=L，需要明确跨模块边界");
}
if (fs.existsSync(path.join(layout.processDir, "boundaries.config.json"))) {
  activate("architecture", "项目存在 boundaries.config.json");
}
if (fs.existsSync(path.join(layout.processDir, "knowledge.config.json"))) {
  activate("knowledge", "项目已启用 knowledge.config.json");
}
if (reconcile.program_completion_required === true) {
  activate("program", "program_completion_required=true");
}
if (
  reconcile.execution_mode === "autonomous"
  || (typeof reconcile.autonomy_level === "string"
    && !["", "interactive", "l0"].includes(reconcile.autonomy_level.toLowerCase()))
) {
  activate("autonomy", `自治配置 ${reconcile.autonomy_level ?? reconcile.execution_mode}`);
}

for (const id of projectPacks) {
  activate(id, "项目 context_policy 显式增加 prose，不关闭任何 executable guard");
}

const taskMatches = matchingTaskModules(modules, args.task);
// Validate duplicate task definitions before resolving the current step.
declaredTaskSteps(taskMatches, args.task);
const currentStep = resolveTaskStep({
  matches: taskMatches,
  taskId: args.task,
  requestedStep: args.step,
  progressFile: path.join(layout.controlDir, "progress.json"),
});
const currentTask = taskContext(taskMatches, args.task, currentStep);
for (const id of currentTask.packs) {
  activate(id, `任务 ${args.task} 的 module 绑定显式增加 prose，不关闭任何 executable guard`);
}
if (currentTask.ui) {
  activate("ui", `任务 ${args.task} 的 step 名或 write_set 指向 frontend/ui/web surface`);
}

if (args.task) {
  const threatFile = path.join(layout.controlDir, "THREAT_MODEL.json");
  if (fs.existsSync(threatFile)) {
    const threatModel = readJson(threatFile);
    if (!isPlainObject(threatModel) || threatModel.schema !== "threat-model/v1" || !Array.isArray(threatModel.threats)) {
      fail(`${threatFile} 必须符合 threat-model/v1 且包含 threats 数组`);
    }
    const approvedThreats = threatModel.threats.filter((threat) => threatAppliesToTask(threat, args.task));
    if (approvedThreats.length > 0) {
      const ids = approvedThreats
        .map((threat) => threat.id)
        .filter((id) => typeof id === "string" && id.length > 0);
      const suffix = ids.length > 0 ? `: ${ids.join(", ")}` : "";
      activate("security", `任务 ${args.task} 适用完整的 user-owned approved threat${suffix}`);
    }
  }
}
if (stagePack === "ship" && reasons.has("security")) {
  activate("prelaunch", "SHIP 的 security 风险激活上线前工程审计");
}

const activePacks = PACK_ORDER
  .filter((id) => reasons.has(id))
  .map((id) => ({
    id,
    reason: reasons.get(id).join("；"),
    refs: [...PACKS[id].refs],
  }));

const requiredReads = [];
const seenRefs = new Set();
for (const pack of activePacks) {
  for (const ref of pack.refs) {
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    requiredReads.push(ref);
  }
}

const requiredProjectReads = [];
const seenProjectRefs = new Set();
function addProjectRead(target) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return;
  const relative = path.relative(args.root, target).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    fail(`project context path 越出 project root: ${target}`);
  }
  if (seenProjectRefs.has(relative)) return;
  seenProjectRefs.add(relative);
  requiredProjectReads.push(relative);
}

if (stagePack === "design" || reasons.has("ui")) {
  for (const relative of ["PRODUCT_VOCABULARY.md", "UI_RULES.md", "PAGE_SPEC.md"]) {
    addProjectRead(path.join(args.root, relative));
  }
}
if (reasons.has("architecture")) {
  addProjectRead(path.join(layout.controlDir, "SYSTEM_ARCHITECTURE.md"));
  addProjectRead(path.join(layout.processDir, "boundaries.config.json"));
}
if (reasons.has("security")) {
  addProjectRead(path.join(layout.controlDir, "THREAT_MODEL.json"));
}

const skillDir = skillDirFromVersion(layout.processDir);
let referencedBytes = 0;
for (const ref of requiredReads) {
  const target = path.join(skillDir, ref);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    fail(`context pack 引用路径不存在: ${ref} (skill_dir=${skillDir})`);
  }
  referencedBytes += fs.statSync(target).size;
}

const result = {
  schema: "product-to-code-orchestrator/context-plan@2",
  stage,
  task_id: args.task,
  step: currentTask.step,
  read_root: skillDir,
  compatibility_mode: compatibilityMode,
  diagnostic,
  packs: activePacks,
  required_reads: requiredReads,
  required_project_reads: requiredProjectReads,
  // required_reads 是路径指针，planner 不嵌入任何规则/模板正文。
  total_inline_bytes: 0,
  // 诊断值：指针对应文件在 skill_dir 中的字节总数，不计入上下文预算。
  referenced_bytes: referencedBytes,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`stage: ${result.stage}`);
  console.log(`task_id: ${result.task_id ?? "(none)"}`);
  console.log(`step: ${result.step ?? "(none)"}`);
  console.log(`read_root: ${result.read_root}`);
  console.log(`compatibility_mode: ${result.compatibility_mode}`);
  if (result.diagnostic) console.log(`diagnostic: ${result.diagnostic}`);
  console.log(`packs: ${result.packs.map((pack) => pack.id).join(", ")}`);
  console.log("required_reads:");
  for (const ref of result.required_reads) console.log(`- ${ref}`);
  console.log("required_project_reads:");
  for (const ref of result.required_project_reads) console.log(`- ${ref}`);
  console.log(`total_inline_bytes: ${result.total_inline_bytes}`);
  console.log(`referenced_bytes: ${result.referenced_bytes}`);
}
