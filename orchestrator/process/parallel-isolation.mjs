#!/usr/bin/env node

// Deterministic isolation selection and candidate validation for parallel tasks.
// This controller deliberately proves workspace and diff boundaries; an agent's
// claim that it used a branch/worktree is never treated as evidence by itself.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCHEMA = "product-to-code-orchestrator/parallel-isolation@1";
const MODES = new Set(["auto", "shared", "branch", "worktree", "serial"]);
const RESERVED_EXACT = new Set([
  "AGENTS.md",
  "BACKLOG.md",
  "ARTIFACT_MANIFEST.yaml",
  "DECISION_LOG.md",
]);

class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new CliError(code, message, details);
}

function parseArgs(argv) {
  if (argv.length === 0) fail("COMMAND_REQUIRED", "需要 select 或 validate-candidate");
  const command = argv[0];
  if (!new Set(["select", "validate-candidate"]).has(command)) {
    fail("UNKNOWN_COMMAND", `未知命令: ${command}`);
  }
  const values = {};
  const workspaces = [];
  const allowed = command === "select"
    ? new Set(["root", "tasks", "requested", "workspace"])
    : new Set(["root", "task", "workspace", "isolation", "base", "head", "branch"]);
  let json = false;
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("--")) fail("UNKNOWN_ARGUMENT", `未知参数: ${arg}`);
    const key = arg.slice(2);
    if (!allowed.has(key)) fail("UNKNOWN_ARGUMENT", `未知参数: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("ARGUMENT_VALUE_REQUIRED", `${arg} 缺少参数`);
    index++;
    if (key === "workspace" && command === "select") {
      const separator = value.indexOf("=");
      if (separator <= 0 || separator === value.length - 1) {
        fail("INVALID_WORKSPACE_BINDING", "--workspace 必须是 TASK_ID=/absolute/path");
      }
      workspaces.push([value.slice(0, separator), value.slice(separator + 1)]);
      continue;
    }
    if (Object.hasOwn(values, key)) fail("DUPLICATE_ARGUMENT", `${arg} 不得重复`);
    values[key] = value;
  }
  return { command, values, workspaces, json };
}

function requireValue(values, key) {
  const value = values[key];
  if (typeof value !== "string" || value.length === 0) {
    fail("ARGUMENT_REQUIRED", `缺少 --${key}`);
  }
  return value;
}

function canonicalDirectory(value, label) {
  const resolved = path.resolve(value);
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    fail("DIRECTORY_NOT_FOUND", `${label} 不存在: ${resolved}`, { path: resolved });
  }
  if (!fs.statSync(real).isDirectory()) fail("NOT_A_DIRECTORY", `${label} 不是目录: ${real}`);
  return real;
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitValue(cwd, args, code, message) {
  const result = git(cwd, args);
  if (!result.ok) fail(code, message, { git_error: (result.stderr || result.stdout).trim() });
  return result.stdout.trim();
}

function repositoryRoot(root) {
  const top = gitValue(root, ["rev-parse", "--show-toplevel"], "ROOT_NOT_GIT", `不是 Git 仓库: ${root}`);
  const canonicalTop = canonicalDirectory(top, "Git 根目录");
  if (canonicalTop !== root) {
    fail("ROOT_NOT_REPOSITORY_TOP", `--root 必须指向 Git 根目录: ${canonicalTop}`);
  }
  return canonicalTop;
}

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    fail("MODULE_CONFIG_MISSING", `找不到模块配置: ${file}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail("MODULE_CONFIG_INVALID", `模块配置不是合法 JSON: ${error.message}`);
  }
}

function moduleConfigFile(root) {
  const vendored = path.join(root, controlRoot(root), "process", "modules.config.json");
  if (fs.existsSync(vendored)) return vendored;
  const source = path.join(root, "process", "modules.config.json");
  if (fs.existsSync(source)) return source;
  fail("MODULE_CONFIG_MISSING", `找不到模块配置: ${vendored}`);
}

function reconcileConfigFile(root) {
  for (const file of [
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    path.join(root, "process", "reconcile.config.json"),
  ]) if (fs.existsSync(file)) return file;
  return null;
}

function controlRoot(root) {
  const file = reconcileConfigFile(root);
  let value = "orchestrator";
  if (file) {
    const config = readJson(file);
    if (config.control_root != null) value = config.control_root;
  }
  const pattern = safePattern(value, "reconcile.config control_root");
  if (pattern.recursive) fail("CONTROL_ROOT_INVALID", "control_root 必须是目录，不能是 /** pattern");
  return pattern.body;
}

function currentSteps(root) {
  const file = path.join(root, controlRoot(root), "progress.json");
  if (!fs.existsSync(file)) return new Map();
  const progress = readJson(file);
  if (!Array.isArray(progress.verticals)) fail("PROGRESS_INVALID", "progress.json verticals 必须是数组");
  const steps = new Map();
  for (const vertical of progress.verticals) {
    if (!vertical || typeof vertical !== "object" || !Array.isArray(vertical.tasks)) continue;
    const pending = vertical.tasks.find((task) => task?.status !== "done");
    if (pending && typeof pending.step === "string" && pending.step.trim()) {
      steps.set(vertical.id, pending.step.trim());
    }
  }
  return steps;
}

function repositoryIgnoresCase(root) {
  const result = git(root, ["config", "--bool", "core.ignorecase"]);
  return result.ok && result.stdout.trim() === "true";
}

function safePattern(value, label, ignoreCase = false) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    fail("PATH_PATTERN_INVALID", `${label} 必须是非空、无首尾空白的 string`);
  }
  if (
    value.includes("\\")
    || value.includes("\0")
    || path.posix.isAbsolute(value)
    || value.startsWith("./")
    || value.endsWith("/")
    || value.includes("//")
  ) {
    fail("PATH_PATTERN_INVALID", `${label} 必须是规范的仓库相对 POSIX 路径: ${value}`);
  }
  const recursive = value.endsWith("/**");
  const body = recursive ? value.slice(0, -3) : value;
  if (!body || body === "." || body.split("/").some((part) => part === "." || part === "..")) {
    fail("PATH_PATTERN_INVALID", `${label} 包含不安全路径段: ${value}`);
  }
  if (/[*?\[\]{}]/.test(body) || (!recursive && value.includes("*"))) {
    fail("PATH_PATTERN_INVALID", `${label} 只允许精确路径或末尾 /**: ${value}`);
  }
  return { raw: value, body: ignoreCase ? body.toLowerCase() : body, recursive };
}

function stringArray(value, label, { paths = false, resources = false, ignoreCase = false } = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("MODULE_CONFIG_INVALID", `${label} 必须是数组`);
  const seen = new Set();
  return value.map((item, index) => {
    if (paths) {
      const pattern = safePattern(item, `${label}[${index}]`, ignoreCase);
      if (seen.has(pattern.raw)) fail("MODULE_CONFIG_INVALID", `${label} 不得重复: ${pattern.raw}`);
      seen.add(pattern.raw);
      return pattern;
    }
    if (typeof item !== "string" || !item || item !== item.trim()) {
      fail("MODULE_CONFIG_INVALID", `${label}[${index}] 必须是非空、无首尾空白的 string`);
    }
    if (resources && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(item)) {
      fail("MODULE_CONFIG_INVALID", `${label}[${index}] 不是安全的资源标识: ${item}`);
    }
    if (seen.has(item)) fail("MODULE_CONFIG_INVALID", `${label} 不得重复: ${item}`);
    seen.add(item);
    return item;
  });
}

function loadModules(root) {
  const doc = readJson(moduleConfigFile(root));
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !doc.modules || typeof doc.modules !== "object" || Array.isArray(doc.modules)) {
    fail("MODULE_CONFIG_INVALID", "modules.config.json 缺少 modules object");
  }
  const steps = currentSteps(root);
  const ignoreCase = repositoryIgnoresCase(root);
  const byTask = new Map();
  for (const [moduleId, config] of Object.entries(doc.modules)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      fail("MODULE_CONFIG_INVALID", `modules.${moduleId} 必须是 object`);
    }
    const taskId = config.task_id ?? moduleId;
    if (typeof taskId !== "string" || !taskId || taskId !== taskId.trim()) {
      fail("MODULE_CONFIG_INVALID", `modules.${moduleId}.task_id 必须是非空 string`);
    }
    if (byTask.has(taskId)) fail("DUPLICATE_TASK_ID", `task_id 重复: ${taskId}`);
    const declaredSteps = stringArray(config.tasks, `modules.${moduleId}.tasks`);
    const step = steps.get(moduleId) ?? null;
    if (step && !declaredSteps.includes(step)) fail("PROGRESS_CONFIG_DRIFT", `${moduleId}:${step} 不在当前 modules.config tasks 中`);
    const stepValue = (field, stepField) => (
      step
      && config[stepField]
      && typeof config[stepField] === "object"
      && !Array.isArray(config[stepField])
      && Object.hasOwn(config[stepField], step)
        ? config[stepField][step]
        : config[field]
    );
    byTask.set(taskId, {
      module_id: moduleId,
      task_id: taskId,
      step,
      write_patterns: stringArray(stepValue("write_set", "step_write_set"), `modules.${moduleId}.${step ? `step_write_set.${step}` : "write_set"}`, { paths: true, ignoreCase }),
      read_patterns: stringArray(stepValue("read_set", "step_read_set"), `modules.${moduleId}.${step ? `step_read_set.${step}` : "read_set"}`, { paths: true, ignoreCase }),
      exclusive_resources: stringArray(
        stepValue("exclusive_resources", "step_exclusive_resources"),
        `modules.${moduleId}.${step ? `step_exclusive_resources.${step}` : "exclusive_resources"}`,
        { resources: true },
      ),
    });
  }
  return byTask;
}

function requestedTasks(raw, modules) {
  const ids = raw.split(",");
  if (ids.length === 0 || ids.some((id) => !id || id !== id.trim())) {
    fail("TASKS_INVALID", "--tasks 必须是逗号分隔的非空 task_id");
  }
  if (new Set(ids).size !== ids.length) fail("TASKS_INVALID", "--tasks 不得包含重复 task_id");
  return ids.map((id) => {
    const task = modules.get(id);
    if (!task) fail("TASK_NOT_FOUND", `模块配置中不存在 task_id: ${id}`);
    return task;
  });
}

function patternsOverlap(left, right) {
  if (!left.recursive && !right.recursive) return left.body === right.body;
  if (left.recursive && right.recursive) {
    return left.body === right.body
      || left.body.startsWith(`${right.body}/`)
      || right.body.startsWith(`${left.body}/`);
  }
  const tree = left.recursive ? left : right;
  const exact = left.recursive ? right : left;
  return exact.body === tree.body || exact.body.startsWith(`${tree.body}/`);
}

function setsOverlap(left, right) {
  return left.some((a) => right.some((b) => patternsOverlap(a, b)));
}

function conflictCodes(tasks) {
  const codes = new Set();
  for (let left = 0; left < tasks.length; left++) {
    for (let right = left + 1; right < tasks.length; right++) {
      const a = tasks[left];
      const b = tasks[right];
      if (setsOverlap(a.write_patterns, b.write_patterns)) codes.add("WRITE_WRITE_CONFLICT");
      if (
        setsOverlap(a.write_patterns, b.read_patterns)
        || setsOverlap(b.write_patterns, a.read_patterns)
      ) codes.add("READ_WRITE_CONFLICT");
      if (a.exclusive_resources.some((resource) => b.exclusive_resources.includes(resource))) {
        codes.add("EXCLUSIVE_RESOURCE_CONFLICT");
      }
    }
  }
  return [...codes];
}

function workspaceBindings(entries, tasks) {
  const allowed = new Set(tasks.map((task) => task.task_id));
  const map = new Map();
  for (const [taskId, workspace] of entries) {
    if (!allowed.has(taskId)) fail("WORKSPACE_TASK_UNKNOWN", `workspace 绑定了未选任务: ${taskId}`);
    if (map.has(taskId)) fail("DUPLICATE_WORKSPACE", `workspace 重复绑定: ${taskId}`);
    map.set(taskId, workspace);
  }
  return map;
}

function inspectWorkspace(rawPath) {
  const workspace = canonicalDirectory(rawPath, "workspace");
  const top = git(workspace, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { ok: false, reason: "WORKSPACE_NOT_GIT", workspace };
  let repository;
  try {
    repository = fs.realpathSync(top.stdout.trim());
  } catch {
    return { ok: false, reason: "WORKSPACE_NOT_GIT", workspace };
  }
  if (repository !== workspace) return { ok: false, reason: "WORKSPACE_NOT_REPOSITORY_TOP", workspace };
  const head = git(workspace, ["rev-parse", "HEAD"]);
  const branch = git(workspace, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const dirty = git(workspace, ["status", "--porcelain", "--untracked-files=all"]);
  if (!head.ok) return { ok: false, reason: "WORKSPACE_HEAD_INVALID", workspace };
  if (!branch.ok || !branch.stdout.trim()) return { ok: false, reason: "WORKSPACE_BRANCH_REQUIRED", workspace };
  if (!dirty.ok) return { ok: false, reason: "WORKSPACE_STATUS_INVALID", workspace };
  return {
    ok: true,
    workspace,
    head: head.stdout.trim(),
    branch: branch.stdout.trim(),
    dirty: dirty.stdout.trim(),
  };
}

function registeredWorktrees(root) {
  const result = git(root, ["worktree", "list", "--porcelain"]);
  if (!result.ok) return new Set();
  const worktrees = new Set();
  for (const line of result.stdout.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    try {
      worktrees.add(fs.realpathSync(line.slice("worktree ".length)));
    } catch {
      // A stale worktree record is not evidence of an active workspace.
    }
  }
  return worktrees;
}

function proveParallelWorkspaces(root, tasks, bindings, requested) {
  const reasons = new Set();
  const inspected = [];
  for (const task of tasks) {
    const raw = bindings.get(task.task_id);
    if (!raw) {
      reasons.add("WORKSPACE_MISSING");
      continue;
    }
    let info;
    try {
      info = inspectWorkspace(raw);
    } catch (error) {
      if (error instanceof CliError) {
        reasons.add("WORKSPACE_MISSING");
        continue;
      }
      throw error;
    }
    if (!info.ok) {
      reasons.add(info.reason);
      continue;
    }
    if (info.dirty) reasons.add("WORKSPACE_DIRTY");
    inspected.push({ task_id: task.task_id, ...info });
  }
  const paths = inspected.map((item) => item.workspace);
  if (paths.some((workspace) => workspace === root) || new Set(paths).size !== paths.length) {
    reasons.add("WORKSPACE_NOT_INDEPENDENT");
  }
  const branches = inspected.map((item) => item.branch);
  if (new Set(branches).size !== branches.length) reasons.add("BRANCH_NOT_DISTINCT");

  const base = gitValue(root, ["rev-parse", "HEAD"], "ROOT_HEAD_INVALID", "无法读取项目 HEAD");
  if (inspected.some((item) => item.head !== base)) reasons.add("WORKSPACE_BASE_MISMATCH");
  const registered = registeredWorktrees(root);
  if (requested === "worktree") {
    if (inspected.some((item) => !registered.has(item.workspace))) reasons.add("WORKTREE_NOT_REGISTERED");
  }
  return {
    reasons: [...reasons],
    inspected: inspected.map((item) => ({
      ...item,
      isolation: requested === "auto"
        ? (registered.has(item.workspace) ? "worktree" : "branch")
        : requested,
    })),
  };
}

function publicTask(task) {
  return {
    task_id: task.task_id,
    module_id: task.module_id,
    step: task.step,
    write_set: task.write_patterns.map((item) => item.raw),
    read_set: task.read_patterns.map((item) => item.raw),
    exclusive_resources: task.exclusive_resources,
  };
}

function isReserved(root, relative) {
  const prefix = controlRoot(root);
  return RESERVED_EXACT.has(relative)
    || relative === "orchestrator"
    || relative.startsWith("orchestrator/")
    || relative === prefix
    || relative.startsWith(`${prefix}/`);
}

function integrationBusinessDirty(root) {
  const paths = new Set();
  for (const args of [
    ["diff", "--name-only", "--no-renames"],
    ["diff", "--cached", "--name-only", "--no-renames"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const result = git(root, args);
    if (!result.ok) fail("ROOT_STATUS_INVALID", "无法检查 integration workspace 状态");
    for (const relative of result.stdout.split(/\r?\n/).filter(Boolean)) paths.add(relative);
  }
  const nestedWorktrees = [...registeredWorktrees(root)]
    .filter(workspace => workspace.startsWith(`${root}${path.sep}`))
    .map(workspace => `${path.relative(root, workspace).split(path.sep).join("/")}/`);
  return [...paths].filter(relative => (
    !isReserved(root, relative)
    && !nestedWorktrees.some(prefix => relative === prefix.slice(0, -1) || relative.startsWith(prefix))
  )).sort();
}

function select(root, values, workspaceEntries) {
  const modules = loadModules(root);
  const tasks = requestedTasks(requireValue(values, "tasks"), modules);
  const requested = requireValue(values, "requested");
  if (!MODES.has(requested)) fail("ISOLATION_MODE_INVALID", `不支持隔离方式: ${requested}`);
  const bindings = workspaceBindings(workspaceEntries, tasks);
  const payloadBase = {
    schema: SCHEMA,
    requested_mode: requested,
    tasks: tasks.map(publicTask),
  };
  if (requested === "serial") {
    return { ...payloadBase, selected_mode: "serial", reason_codes: ["EXPLICIT_SERIAL"] };
  }
  const conflicts = conflictCodes(tasks);
  if (conflicts.length > 0) {
    return { ...payloadBase, selected_mode: "serial", reason_codes: conflicts };
  }
  const writers = tasks.filter((task) => task.write_patterns.length > 0);
  if (writers.length === 0) {
    return {
      ...payloadBase,
      tasks: tasks.map((task) => ({ ...publicTask(task), isolation: "shared" })),
      selected_mode: "shared",
      reason_codes: ["READ_ONLY_SHARED"],
    };
  }
  if (requested === "shared") {
    return { ...payloadBase, selected_mode: "serial", reason_codes: ["SHARED_WRITER_UNSAFE"] };
  }
  const dirtyRoot = integrationBusinessDirty(root);
  if (dirtyRoot.length) {
    return { ...payloadBase, selected_mode: "serial", reason_codes: ["INTEGRATION_DIRTY"], dirty_paths: dirtyRoot };
  }
  const proof = proveParallelWorkspaces(root, writers, bindings, requested);
  if (proof.reasons.length > 0) {
    return { ...payloadBase, selected_mode: "serial", reason_codes: proof.reasons };
  }
  const provenByTask = new Map(proof.inspected.map((item) => [item.task_id, item]));
  const publicTasks = tasks.map((task) => ({
    ...publicTask(task),
    isolation: task.write_patterns.length === 0
      ? "shared"
      : provenByTask.get(task.task_id).isolation,
  }));
  const modes = new Set(publicTasks.map((task) => task.isolation));
  return {
    ...payloadBase,
    tasks: publicTasks,
    selected_mode: modes.size === 1 ? [...modes][0] : "mixed",
    reason_codes: [],
    workspaces: proof.inspected.map(({ task_id, workspace, branch, head, isolation }) => ({
      task_id,
      workspace,
      branch,
      head,
      isolation,
    })),
  };
}

function fullCommit(workspace, raw, label) {
  if (!/^[0-9a-fA-F]{7,64}$/.test(raw)) fail("COMMIT_INVALID", `${label} 不是 commit hash`);
  return gitValue(
    workspace,
    ["rev-parse", "--verify", `${raw}^{commit}`],
    "COMMIT_INVALID",
    `${label} 在 workspace 中不存在`,
  );
}

function coordinatorLease(root, task) {
  const file = path.join(root, controlRoot(root), "progress.json");
  const progress = readJson(file);
  if (!Array.isArray(progress.verticals) || !progress.leases || typeof progress.leases !== "object" || Array.isArray(progress.leases)) {
    fail("LEASE_REQUIRED", "progress.json 缺少可验证 verticals/leases");
  }
  const vertical = progress.verticals.find((item) => (
    item
    && typeof item === "object"
    && item.id === task.module_id
    && (item.task_id ?? task.task_id) === task.task_id
  ));
  const pending = vertical?.tasks?.find((item) => item?.status !== "done");
  if (!pending || typeof pending.step !== "string" || !pending.step.trim()) {
    fail("LEASE_REQUIRED", `${task.task_id} 没有 current pending step`);
  }
  const key = `${task.module_id}:${pending.step}`;
  if (task.step && task.step !== pending.step) {
    fail("PROGRESS_CONFIG_DRIFT", `${key} 与 modules.config current-step boundary 不一致`);
  }
  const lease = progress.leases[key];
  if (!lease || typeof lease !== "object" || Array.isArray(lease)) {
    fail("LEASE_REQUIRED", `${key} 缺主会话执行 lease`);
  }
  for (const field of [
    "isolation_kind",
    "workspace_root",
    "branch",
    "base_sha",
    "wave_id",
    "merge_index",
  ]) {
    if (!Object.hasOwn(lease, field)) fail("LEASE_REQUIRED", `${key} lease 缺 ${field}`);
  }
  if (!Number.isInteger(lease.merge_index) || lease.merge_index < 0) {
    fail("LEASE_REQUIRED", `${key} lease merge_index 无效`);
  }
  return { key, lease, step: pending.step };
}

function moduleConfigMatchesBase(root, base) {
  const file = moduleConfigFile(root);
  const relative = path.relative(root, file).split(path.sep).join("/");
  const exists = git(root, ["cat-file", "-e", `${base}:${relative}`]);
  const diff = git(root, ["diff", "--quiet", base, "--", relative]);
  return exists.ok && diff.ok;
}

function validateCandidate(root, values) {
  const dirtyRoot = integrationBusinessDirty(root);
  if (dirtyRoot.length) fail("INTEGRATION_DIRTY", "integration workspace 含未提交业务改动", { dirty_paths: dirtyRoot });
  const modules = loadModules(root);
  const taskId = requireValue(values, "task");
  const task = modules.get(taskId);
  if (!task) fail("TASK_NOT_FOUND", `模块配置中不存在 task_id: ${taskId}`);
  const { lease } = coordinatorLease(root, task);
  const isolation = requireValue(values, "isolation");
  if (!new Set(["branch", "worktree"]).has(isolation)) {
    fail("CANDIDATE_ISOLATION_INVALID", "候选提交只接受 branch 或 worktree 隔离");
  }
  const workspace = canonicalDirectory(requireValue(values, "workspace"), "workspace");
  let leasedWorkspace;
  try {
    leasedWorkspace = fs.realpathSync(lease.workspace_root);
  } catch {
    fail("LEASE_MISMATCH", `lease workspace 不存在: ${lease.workspace_root}`);
  }
  if (
    isolation !== lease.isolation_kind
    || workspace !== leasedWorkspace
    || requireValue(values, "branch") !== lease.branch
    || requireValue(values, "base") !== lease.base_sha
  ) {
    fail("LEASE_MISMATCH", "candidate 参数与主会话 lease 的 isolation/workspace/branch/base 不一致");
  }
  const info = inspectWorkspace(workspace);
  if (!info.ok) fail(info.reason, `workspace 无法通过 Git 校验: ${workspace}`);
  if (workspace === root) fail("WORKSPACE_NOT_INDEPENDENT", "候选提交不得来自主工作区");
  const expectedBranch = lease.branch;
  if (info.branch !== expectedBranch) {
    fail("BRANCH_MISMATCH", `候选分支不匹配: expected=${expectedBranch}, actual=${info.branch}`);
  }
  if (isolation === "worktree" && !registeredWorktrees(root).has(workspace)) {
    fail("WORKTREE_NOT_REGISTERED", `workspace 不是该项目注册的 worktree: ${workspace}`);
  }

  const rawBase = requireValue(values, "base");
  const rawHead = requireValue(values, "head");
  const baseInRoot = fullCommit(root, rawBase, "base");
  if (!moduleConfigMatchesBase(root, baseInRoot)) {
    fail("BOUNDARY_CONFIG_DRIFT", "modules.config 已偏离 lease base；必须释放 lease 并重新规划");
  }
  const integrationHead = gitValue(
    root,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    "ROOT_HEAD_INVALID",
    "无法读取当前 integration HEAD",
  );
  if (baseInRoot !== integrationHead) {
    fail("STALE_BASE", `候选 base ${baseInRoot} 已不是当前 integration HEAD ${integrationHead}`);
  }
  const base = fullCommit(workspace, rawBase, "base");
  if (base !== baseInRoot) fail("BASE_REPOSITORY_MISMATCH", "base 在项目与 workspace 中解析结果不同");
  const head = fullCommit(workspace, rawHead, "head");
  if (head !== info.head) fail("HEAD_NOT_CHECKED_OUT", "--head 必须等于 workspace 当前 HEAD");
  if (base === head) fail("EMPTY_CANDIDATE", "候选提交必须位于 base 之后");
  const ancestry = git(workspace, ["merge-base", "--is-ancestor", base, head]);
  if (!ancestry.ok) fail("BASE_NOT_ANCESTOR", "候选提交不在指定 base 的单一后继谱系上");
  const merges = gitValue(
    workspace,
    ["rev-list", "--merges", `${base}..${head}`],
    "CANDIDATE_LINEAGE_INVALID",
    "无法检查候选提交谱系",
  );
  if (merges) fail("MERGE_COMMIT_FORBIDDEN", "候选谱系包含 merge commit，必须先交由主会话整合");
  const commitCount = Number.parseInt(gitValue(
    workspace,
    ["rev-list", "--count", `${base}..${head}`],
    "CANDIDATE_LINEAGE_INVALID",
    "无法计算候选提交数",
  ), 10);
  if (commitCount !== 1) {
    fail("CANDIDATE_COMMIT_COUNT", `每个并行任务必须交付一个候选提交，当前为 ${commitCount}`);
  }
  const dirty = gitValue(
    workspace,
    ["status", "--porcelain", "--untracked-files=all"],
    "WORKSPACE_STATUS_INVALID",
    "无法检查 workspace 状态",
  );
  if (dirty) fail("WORKSPACE_DIRTY", "workspace 仍有未提交改动");

  const changedRaw = gitValue(
    workspace,
    ["diff", "--name-only", "--no-renames", "-z", `${base}..${head}`, "--"],
    "CANDIDATE_DIFF_INVALID",
    "无法读取候选差异",
  );
  const changed = changedRaw.split("\0").filter(Boolean).sort();
  if (changed.length === 0) fail("EMPTY_CANDIDATE", "候选提交没有文件变化");
  const violations = [];
  for (const relative of changed) {
    let exact;
    try {
      exact = safePattern(relative, "changed path", repositoryIgnoresCase(root));
    } catch {
      violations.push({ code: "UNSAFE_CHANGED_PATH", path: relative });
      continue;
    }
    if (isReserved(root, relative)) violations.push({ code: "RESERVED_CONTROL_PATH", path: relative });
    if (!task.write_patterns.some((pattern) => patternsOverlap(pattern, exact))) {
      violations.push({ code: "OUTSIDE_WRITE_SET", path: relative });
    }
  }
  return {
    schema: SCHEMA,
    valid: violations.length === 0,
    task_id: taskId,
    isolation,
    workspace,
    branch: info.branch,
    base_sha: base,
    head_sha: head,
    changed_paths: changed,
    violations,
  };
}

function emit(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  if (Object.hasOwn(payload, "selected_mode")) {
    console.log(`${payload.selected_mode}: ${payload.reason_codes.join(", ") || "verified"}`);
  } else {
    console.log(payload.valid ? "candidate valid" : "candidate rejected");
  }
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
  const root = repositoryRoot(canonicalDirectory(requireValue(parsed.values, "root"), "root"));
  const payload = parsed.command === "select"
    ? select(root, parsed.values, parsed.workspaces)
    : validateCandidate(root, parsed.values);
  emit(payload, parsed.json);
  if (payload.valid === false) process.exitCode = 2;
} catch (error) {
  const cli = error instanceof CliError
    ? error
    : new CliError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
  const payload = {
    schema: SCHEMA,
    valid: false,
    error: { code: cli.code, message: cli.message, ...cli.details },
  };
  const wantsJson = parsed?.json ?? process.argv.includes("--json");
  if (wantsJson) process.stdout.write(`${JSON.stringify(payload)}\n`);
  else console.error(`${cli.code}: ${cli.message}`);
  process.exitCode = 2;
}
