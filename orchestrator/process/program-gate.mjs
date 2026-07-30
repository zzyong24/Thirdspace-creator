#!/usr/bin/env node
// program-gate.mjs — 跨项目用户旅程的唯一完成门。
//
// 单仓测试通过只能证明局部实现可用；本门要求当前 program.config、
// release-set、旅程 receipt、证据文件、参与仓库 commit 与本轮真实执行
// 同时一致。任何一项漂移都会 fail-closed，默认审计输出 NO-GO。
//
// 用法：
//   node orchestrator/process/program-gate.mjs
//   node orchestrator/process/program-gate.mjs --audit [journey-id]
//   node orchestrator/process/program-gate.mjs --execute [journey-id]
//
// 控制文件固定放在当前程序根目录的 orchestrator/program/：
//   program.config.json
//   release-set.json
//   receipts/<journey-id>.json（或 journey.receipt 指定的安全相对路径）
//   executions/<journey-id>.json（本工具原子写入）
//
// 零第三方依赖；工具本身不请求网络，声明的真实旅程命令可访问部署 URL。

import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const PROGRAM_SCHEMA = "product-program/v1";
const RELEASE_SCHEMA = "program-release-set/v1";
const RECEIPT_SCHEMA = "program-journey-receipt/v1";
const EXECUTION_SCHEMA = "program-journey-execution/v1";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_OUTPUT = 4 * 1024 * 1024;

class GateError extends Error {
  constructor(messages) {
    const values = (Array.isArray(messages) ? messages : [messages])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    super(values.join("\n"));
    this.name = "GateError";
    this.messages = values.length ? values : ["未知校验错误"];
  }
}

const clean = (value) => (typeof value === "string" ? value.trim() : "");
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validTimestamp(value) {
  return clean(value) !== "" && Number.isFinite(Date.parse(value));
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function safeId(value, label, errors) {
  const result = clean(value);
  push(errors, ID_PATTERN.test(result), `${label} 必须是安全且非空的 ID`);
  return result;
}

function readJson(file, label) {
  if (!existsSync(file)) throw new GateError(`${label} 不存在: ${file}`);
  let raw;
  try {
    raw = readFileSync(file);
  } catch (error) {
    throw new GateError(`${label} 无法读取: ${error.message}`);
  }
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new GateError(`${label} JSON 无法解析: ${error.message}`);
  }
  if (!isRecord(value)) throw new GateError(`${label} 顶层必须是 JSON object`);
  return { file, raw, value, hash: sha256(raw) };
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, file);
  } catch (error) {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // 原始异常更有诊断价值；临时文件不参与审计。
    }
    throw new GateError(`无法原子写入执行回执 ${file}: ${error.message}`);
  }
}

function resolveProgramFile(programRoot, candidate, label) {
  const raw = clean(candidate);
  if (!raw) throw new GateError(`${label} 不能为空`);
  if (raw.includes("\0") || path.isAbsolute(raw)) {
    throw new GateError(`${label} 必须是 program 根目录内的安全相对路径: ${raw}`);
  }
  const target = path.resolve(programRoot, raw);
  if (!inside(programRoot, target) || target === programRoot) {
    throw new GateError(`${label} 不得越出 program 根目录: ${raw}`);
  }
  if (!existsSync(target)) throw new GateError(`${label} 不存在: ${raw}`);
  let real;
  try {
    real = realpathSync(target);
  } catch (error) {
    throw new GateError(`${label} 无法解析: ${error.message}`);
  }
  if (!inside(programRoot, real)) {
    throw new GateError(`${label} 不得通过 symlink 指向 program 根目录外: ${raw}`);
  }
  return real;
}

function resolveProgramControl(programRoot) {
  const control = path.join(programRoot, "orchestrator", "program");
  if (!existsSync(control)) throw new GateError(`program 控制目录不存在: ${control}`);
  const controlInfo = lstatSync(control);
  if (controlInfo.isSymbolicLink() || !controlInfo.isDirectory()) {
    throw new GateError("orchestrator/program 必须是项目内真实目录，不接受 symlink");
  }
  const controlRoot = realpathSync(control);
  if (!inside(programRoot, controlRoot)) {
    throw new GateError("orchestrator/program 不得越出 program 根目录");
  }

  const executions = path.join(controlRoot, "executions");
  if (!existsSync(executions)) {
    throw new GateError(`execution 目录不存在: ${executions}；请先运行 init-program.sh`);
  }
  const executionInfo = lstatSync(executions);
  if (executionInfo.isSymbolicLink() || !executionInfo.isDirectory()) {
    throw new GateError("orchestrator/program/executions 必须是真实目录，不接受 symlink");
  }
  const executionDir = realpathSync(executions);
  if (!inside(programRoot, executionDir)) {
    throw new GateError("orchestrator/program/executions 不得越出 program 根目录");
  }
  return { controlRoot, executionDir };
}

function resolveRepo(programRoot, candidate, label) {
  const raw = clean(candidate);
  if (!raw || raw.includes("\0")) throw new GateError(`${label} 不能为空`);
  const unresolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(programRoot, raw);
  if (!existsSync(unresolved)) throw new GateError(`${label} 不存在: ${raw}`);
  let real;
  try {
    real = realpathSync(unresolved);
  } catch (error) {
    throw new GateError(`${label} 无法解析: ${error.message}`);
  }
  if (!statSync(real).isDirectory()) throw new GateError(`${label} 必须是目录: ${raw}`);
  return real;
}

function resolveCommandCwd(candidate, participantRepos, label) {
  const raw = clean(candidate);
  if (!raw || raw.includes("\0")) throw new GateError(`${label}.cwd 不能为空`);
  const unresolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(process.cwd(), raw);
  if (!existsSync(unresolved)) throw new GateError(`${label}.cwd 不存在: ${raw}`);
  const real = realpathSync(unresolved);
  if (!statSync(real).isDirectory()) throw new GateError(`${label}.cwd 必须是目录: ${raw}`);
  const owners = [...participantRepos.entries()].filter(([, repo]) => inside(repo, real));
  if (owners.length === 0) {
    throw new GateError(`${label}.cwd 必须位于该旅程参与项目内: ${raw}`);
  }
  if (owners.length > 1) {
    throw new GateError(
      `${label}.cwd 同时落入多个嵌套组件仓库，无法绑定唯一 deployed commit: ${raw}`,
    );
  }
  const [componentId, repoRoot] = owners[0];
  return {
    real,
    componentId,
    repoRoot,
    relativeCwd: path.relative(repoRoot, real),
  };
}

function runGit(cwd, args, label) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
  });
  if (result.error) throw new GateError(`${label}: git 无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    const detail =
      clean(result.stderr) || clean(result.stdout) || `exit ${String(result.status)}`;
    throw new GateError(`${label}: ${detail}`);
  }
  return clean(result.stdout);
}

function validateProgram(programRoot, document) {
  const config = document.value;
  const errors = [];
  push(errors, config.schema === PROGRAM_SCHEMA, `program.config.schema 必须是 ${PROGRAM_SCHEMA}`);
  const programId = safeId(config.program_id, "program.config.program_id", errors);
  push(
    errors,
    config.completion_authority === "program-gate",
    `program.config.completion_authority 必须是 program-gate`,
  );

  const componentList = Array.isArray(config.components) ? config.components : [];
  push(errors, componentList.length > 0, "program.config.components 必须是非空数组");
  const components = new Map();
  const repoPaths = new Map();
  componentList.forEach((component, index) => {
    const label = `program.config.components[${index}]`;
    if (!isRecord(component)) {
      errors.push(`${label} 必须是 object`);
      return;
    }
    const id = safeId(component.id, `${label}.id`, errors);
    if (id && components.has(id)) {
      errors.push(`program.config.components 存在重复 ID: ${id}`);
      return;
    }
    let repoPath = null;
    try {
      repoPath = resolveRepo(programRoot, component.repo_path, `${label}.repo_path`);
    } catch (error) {
      errors.push(...error.messages);
    }
    if (repoPath) {
      for (const [existingPath, existingId] of repoPaths) {
        if (inside(existingPath, repoPath) || inside(repoPath, existingPath)) {
          errors.push(
            `${label}.repo_path 与组件 ${existingId} 重复或嵌套，无法唯一绑定 deployed commit: ${repoPath}`,
          );
        }
      }
    }
    if (id) {
      components.set(id, { id, repoPath });
      if (repoPath) repoPaths.set(repoPath, id);
    }
  });

  const journeyList = Array.isArray(config.journeys) ? config.journeys : [];
  push(errors, journeyList.length > 0, "program.config.journeys 必须是非空数组");
  const journeys = new Map();
  const receiptPaths = new Map();

  journeyList.forEach((journey, index) => {
    const label = `program.config.journeys[${index}]`;
    if (!isRecord(journey)) {
      errors.push(`${label} 必须是 object`);
      return;
    }
    const id = safeId(journey.id, `${label}.id`, errors);
    if (id && journeys.has(id)) {
      errors.push(`program.config.journeys 存在重复 ID: ${id}`);
      return;
    }
    push(errors, clean(journey.title) !== "", `${label}.title 不能为空`);
    push(errors, typeof journey.critical === "boolean", `${label}.critical 必须是 boolean`);
    let canonicalFlow = null;
    if (journey.canonical_flow != null) {
      if (!isRecord(journey.canonical_flow)) {
        errors.push(`${label}.canonical_flow 必须是 {path, sha256}`);
      } else {
        for (const key of Object.keys(journey.canonical_flow)) {
          if (!["path", "sha256"].includes(key)) {
            errors.push(`${label}.canonical_flow 含未允许字段: ${key}`);
          }
        }
        const flowPath = clean(journey.canonical_flow.path);
        const expectedFlowSha = clean(journey.canonical_flow.sha256).toLowerCase();
        push(
          errors,
          SHA256_PATTERN.test(expectedFlowSha),
          `${label}.canonical_flow.sha256 必须是完整 64 位 SHA-256`,
        );
        try {
          const flowFile = resolveProgramFile(
            programRoot,
            flowPath,
            `${label}.canonical_flow.path`,
          );
          const info = lstatSync(flowFile);
          if (!info.isFile()) {
            errors.push(`${label}.canonical_flow.path 必须指向普通文件`);
          } else {
            const bytes = readFileSync(flowFile);
            if (bytes.length === 0) {
              errors.push(`${label}.canonical_flow.path 不得是空文件`);
            }
            const actualFlowSha = sha256(bytes);
            if (
              SHA256_PATTERN.test(expectedFlowSha) &&
              actualFlowSha !== expectedFlowSha
            ) {
              errors.push(
                `${label}.canonical_flow.sha256 与当前文件不一致: ${actualFlowSha}`,
              );
            }
            canonicalFlow = {
              path: flowPath,
              file: flowFile,
              sha256: actualFlowSha,
            };
          }
        } catch (error) {
          errors.push(...error.messages);
        }
      }
    }
    const rawJourneyDependencies =
      journey.depends_on == null
        ? []
        : Array.isArray(journey.depends_on)
          ? journey.depends_on
          : [];
    if (journey.depends_on != null && !Array.isArray(journey.depends_on)) {
      errors.push(`${label}.depends_on 必须是数组`);
    }
    const journeyDependencies = rawJourneyDependencies.map(
      (dependency, dependencyIndex) =>
        safeId(dependency, `${label}.depends_on[${dependencyIndex}]`, errors),
    );
    if (new Set(journeyDependencies).size !== journeyDependencies.length) {
      errors.push(`${label}.depends_on 不得重复`);
    }

    const rawComponentIds = Array.isArray(journey.component_ids)
      ? journey.component_ids
      : [];
    push(
      errors,
      rawComponentIds.length >= 2,
      `${label}.component_ids 必须至少包含两个独立项目，program 旅程不能退化为单仓自证`,
    );
    const componentIds = [];
    const seenComponentIds = new Set();
    rawComponentIds.forEach((rawId, componentIndex) => {
      const componentId = safeId(
        rawId,
        `${label}.component_ids[${componentIndex}]`,
        errors,
      );
      if (!componentId) return;
      if (seenComponentIds.has(componentId)) {
        errors.push(`${label}.component_ids 重复: ${componentId}`);
        return;
      }
      seenComponentIds.add(componentId);
      componentIds.push(componentId);
      if (!components.has(componentId)) {
        errors.push(`${label}.component_ids 引用了未注册组件: ${componentId}`);
      }
    });

    const rawSteps = Array.isArray(journey.steps) ? journey.steps : [];
    push(errors, rawSteps.length > 0, `${label}.steps 必须是非空数组`);
    const steps = [];
    const stepIds = new Set();
    rawSteps.forEach((step, stepIndex) => {
      const stepLabel = `${label}.steps[${stepIndex}]`;
      if (!isRecord(step)) {
        errors.push(`${stepLabel} 必须是 object`);
        return;
      }
      const stepId = safeId(step.id, `${stepLabel}.id`, errors);
      if (stepId && stepIds.has(stepId)) {
        errors.push(`${label}.steps 存在重复 ID: ${stepId}`);
      }
      if (stepId) stepIds.add(stepId);
      const owner = safeId(step.owner_component, `${stepLabel}.owner_component`, errors);
      if (owner && !componentIds.includes(owner)) {
        errors.push(`${stepLabel}.owner_component 不属于旅程参与组件: ${owner}`);
      }
      if (journey.canonical_flow == null) {
        push(errors, clean(step.actor) !== "", `${stepLabel}.actor 不能为空`);
        push(errors, clean(step.action) !== "", `${stepLabel}.action 不能为空`);
        push(errors, clean(step.postcondition) !== "", `${stepLabel}.postcondition 不能为空`);
      } else {
        const structuralKeys = new Set(["id", "owner_component", "depends_on"]);
        for (const key of Object.keys(step)) {
          if (!structuralKeys.has(key)) {
            errors.push(
              `${stepLabel}.${key} 不得与 canonical_flow 重复；step 只保留 id/owner_component/depends_on`,
            );
          }
        }
        if (!Array.isArray(step.depends_on)) {
          errors.push(`${stepLabel}.depends_on 在 canonical_flow 模式下必须显式提供数组`);
        }
      }
      // v1 早期项目没有 depends_on；保持兼容时按数组顺序隐式串联。
      // 一旦显式提供，则严格校验依赖图，避免“文件不冲突”被误当成“业务无先后”。
      const rawDependsOn =
        step.depends_on == null
          ? stepIndex > 0
            ? [clean(rawSteps[stepIndex - 1]?.id)]
            : []
          : Array.isArray(step.depends_on)
            ? step.depends_on
            : [];
      if (step.depends_on != null && !Array.isArray(step.depends_on)) {
        errors.push(`${stepLabel}.depends_on 必须是数组`);
      }
      const dependsOn = rawDependsOn.map((dependency, dependencyIndex) =>
        safeId(dependency, `${stepLabel}.depends_on[${dependencyIndex}]`, errors),
      );
      if (new Set(dependsOn).size !== dependsOn.length) {
        errors.push(`${stepLabel}.depends_on 不得重复`);
      }
      steps.push({
        id: stepId,
        ownerComponent: owner,
        actor: clean(step.actor),
        action: clean(step.action),
        postcondition: clean(step.postcondition),
        dependsOn,
        sourceIndex: stepIndex,
      });
    });
    for (const componentId of componentIds) {
      if (!steps.some((step) => step.ownerComponent === componentId)) {
        errors.push(`${label}.component_ids 中的 ${componentId} 没有任何归属步骤`);
      }
    }

    const byStepId = new Map(steps.map((step) => [step.id, step]));
    for (const step of steps) {
      for (const dependency of step.dependsOn) {
        if (!byStepId.has(dependency)) {
          errors.push(`${label}.steps.${step.id}.depends_on 引用了未知步骤: ${dependency}`);
        } else if (dependency === step.id) {
          errors.push(`${label}.steps.${step.id}.depends_on 不得依赖自身`);
        }
      }
    }
    const indegree = new Map(steps.map((step) => [step.id, 0]));
    const outgoing = new Map(steps.map((step) => [step.id, []]));
    for (const step of steps) {
      for (const dependency of step.dependsOn) {
        if (!byStepId.has(dependency) || dependency === step.id) continue;
        indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
        outgoing.get(dependency)?.push(step.id);
      }
    }
    const ready = steps
      .filter((step) => (indegree.get(step.id) ?? 0) === 0)
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    const topologicalSteps = [];
    while (ready.length) {
      const step = ready.shift();
      topologicalSteps.push(step);
      for (const dependentId of outgoing.get(step.id) ?? []) {
        indegree.set(dependentId, (indegree.get(dependentId) ?? 0) - 1);
        if (indegree.get(dependentId) === 0) {
          ready.push(byStepId.get(dependentId));
          ready.sort((a, b) => a.sourceIndex - b.sourceIndex);
        }
      }
    }
    if (topologicalSteps.length !== steps.length) {
      errors.push(`${label}.steps.depends_on 存在依赖环，无法形成业务执行顺序`);
    }

    const rawCommands = Array.isArray(journey.verify_commands)
      ? journey.verify_commands
      : [];
    push(
      errors,
      rawCommands.length > 0,
      `${label}.verify_commands 必须是非空数组，不能以各仓绿色冒充跨项目执行`,
    );
    const commands = [];
    const commandIds = new Set();
    const participantRepos = new Map(
      componentIds
        .filter((componentId) => components.get(componentId)?.repoPath)
        .map((componentId) => [componentId, components.get(componentId).repoPath]),
    );
    rawCommands.forEach((command, commandIndex) => {
      const commandLabel = `${label}.verify_commands[${commandIndex}]`;
      if (!isRecord(command)) {
        errors.push(`${commandLabel} 必须是 object`);
        return;
      }
      const commandId = safeId(command.id, `${commandLabel}.id`, errors);
      if (commandId && commandIds.has(commandId)) {
        errors.push(`${label}.verify_commands 存在重复 ID: ${commandId}`);
      }
      if (commandId) commandIds.add(commandId);
      const commandText = clean(command.command);
      push(errors, commandText !== "", `${commandLabel}.command 不能为空`);
      let cwd = null;
      let commandComponentId = null;
      let relativeCwd = null;
      try {
        const resolved = resolveCommandCwd(command.cwd, participantRepos, commandLabel);
        cwd = resolved.real;
        commandComponentId = resolved.componentId;
        relativeCwd = resolved.relativeCwd;
      } catch (error) {
        errors.push(...error.messages);
      }
      commands.push({
        id: commandId,
        cwd,
        componentId: commandComponentId,
        relativeCwd,
        command: commandText,
      });
    });

    let receiptFile = null;
    try {
      receiptFile = resolveProgramFile(
        programRoot,
        journey.receipt,
        `${label}.receipt`,
      );
    } catch (error) {
      errors.push(...error.messages);
    }
    if (receiptFile && receiptPaths.has(receiptFile)) {
      errors.push(
        `${label}.receipt 与旅程 ${receiptPaths.get(receiptFile)} 共用同一回执，拒绝`,
      );
    }
    if (id && receiptFile) receiptPaths.set(receiptFile, id);

    if (id) {
      journeys.set(id, {
        id,
        title: clean(journey.title),
        critical: journey.critical,
        dependsOn: journeyDependencies,
        canonicalFlow,
        sourceIndex: index,
        componentIds,
        steps:
          topologicalSteps.length === steps.length
            ? topologicalSteps.map(({ sourceIndex: _sourceIndex, ...step }) => step)
            : steps.map(({ sourceIndex: _sourceIndex, ...step }) => step),
        commands,
        receiptFile,
      });
    }
  });

  for (const journey of journeys.values()) {
    for (const dependency of journey.dependsOn) {
      if (!journeys.has(dependency)) {
        errors.push(`program.config.journeys.${journey.id}.depends_on 引用了未知旅程: ${dependency}`);
      } else if (dependency === journey.id) {
        errors.push(`program.config.journeys.${journey.id}.depends_on 不得依赖自身`);
      }
    }
  }
  const journeyIndegree = new Map(
    [...journeys.values()].map((journey) => [journey.id, 0]),
  );
  const journeyOutgoing = new Map(
    [...journeys.values()].map((journey) => [journey.id, []]),
  );
  for (const journey of journeys.values()) {
    for (const dependency of journey.dependsOn) {
      if (!journeys.has(dependency) || dependency === journey.id) continue;
      journeyIndegree.set(journey.id, (journeyIndegree.get(journey.id) ?? 0) + 1);
      journeyOutgoing.get(dependency)?.push(journey.id);
    }
  }
  const journeyReady = [...journeys.values()]
    .filter((journey) => (journeyIndegree.get(journey.id) ?? 0) === 0)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
  const journeyOrder = [];
  while (journeyReady.length) {
    const journey = journeyReady.shift();
    journeyOrder.push(journey.id);
    for (const dependentId of journeyOutgoing.get(journey.id) ?? []) {
      journeyIndegree.set(
        dependentId,
        (journeyIndegree.get(dependentId) ?? 0) - 1,
      );
      if (journeyIndegree.get(dependentId) === 0) {
        journeyReady.push(journeys.get(dependentId));
        journeyReady.sort((a, b) => a.sourceIndex - b.sourceIndex);
      }
    }
  }
  if (journeyOrder.length !== journeys.size) {
    errors.push("program.config.journeys.depends_on 存在依赖环，无法形成执行顺序");
  }

  if (errors.length) throw new GateError(errors);
  for (const journey of journeys.values()) delete journey.sourceIndex;
  return {
    programRoot,
    programId,
    config: document,
    components,
    journeys,
    journeyOrder,
  };
}

function validateRelease(context, document) {
  const release = document.value;
  const errors = [];
  push(errors, release.schema === RELEASE_SCHEMA, `release-set.schema 必须是 ${RELEASE_SCHEMA}`);
  const environment = clean(release.environment);
  push(errors, environment !== "", "release-set.environment 不能为空");
  push(errors, validTimestamp(release.generated_at), "release-set.generated_at 必须是有效时间");
  const releaseComponents = isRecord(release.components) ? release.components : {};
  push(errors, isRecord(release.components), "release-set.components 必须是 object");

  for (const componentId of Object.keys(releaseComponents)) {
    if (!context.components.has(componentId)) {
      errors.push(`release-set.components 含未注册组件: ${componentId}`);
    }
  }

  const normalized = new Map();
  for (const [componentId, component] of context.components) {
    const value = releaseComponents[componentId];
    const label = `release-set.components.${componentId}`;
    if (!isRecord(value)) {
      errors.push(`${label} 缺失；不能用其他仓库绿色冒充 ${componentId} 已发布`);
      continue;
    }
    const commitSha = clean(value.commit_sha).toLowerCase();
    push(errors, SHA_PATTERN.test(commitSha), `${label}.commit_sha 必须是完整 Git commit SHA`);
    const deployUrl = clean(value.deploy_url);
    try {
      const url = new URL(deployUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push(`${label}.deploy_url 只接受 http/https URL`);
      }
      if (environment === "production" && url.protocol !== "https:") {
        errors.push(`${label}.deploy_url 在 production 必须使用 https`);
      }
    } catch {
      errors.push(`${label}.deploy_url 必须是有效 URL`);
    }
    push(errors, validTimestamp(value.deployed_at), `${label}.deployed_at 必须是有效时间`);

    if (component.repoPath && SHA_PATTERN.test(commitSha)) {
      try {
        const inWorktree = runGit(
          component.repoPath,
          ["rev-parse", "--is-inside-work-tree"],
          `${componentId} 仓库校验失败`,
        );
        if (inWorktree !== "true") {
          errors.push(`${componentId} repo_path 不是 Git worktree`);
        } else {
          const resolved = runGit(
            component.repoPath,
            ["rev-parse", "--verify", `${commitSha}^{commit}`],
            `${componentId} release commit 不存在`,
          ).toLowerCase();
          if (resolved !== commitSha) {
            errors.push(
              `${label}.commit_sha 必须是完整 commit，当前 ${commitSha} 解析为 ${resolved}`,
            );
          }
        }
      } catch (error) {
        errors.push(...error.messages);
      }
    }
    normalized.set(componentId, {
      commitSha,
      deployUrl,
      deployedAt: clean(value.deployed_at),
    });
  }

  if (errors.length) throw new GateError(errors);
  return {
    ...context,
    release: document,
    environment,
    releaseGeneratedAt: clean(release.generated_at),
    releaseComponents: normalized,
  };
}

function evidenceBundle(entries) {
  const canonical = [...entries]
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .map((entry) => `${entry.ref}\0${entry.sha256}`)
    .join("\n");
  return sha256(canonical);
}

function validateReceipt(context, journey) {
  if (!journey.receiptFile) {
    throw new GateError(`旅程 ${journey.id} 没有可读取的 receipt`);
  }
  const document = readJson(journey.receiptFile, `旅程 ${journey.id} receipt`);
  const receipt = document.value;
  const errors = [];
  push(errors, receipt.schema === RECEIPT_SCHEMA, `${journey.id} receipt.schema 必须是 ${RECEIPT_SCHEMA}`);
  push(errors, receipt.journey_id === journey.id, `${journey.id} receipt.journey_id 不匹配`);
  push(
    errors,
    receipt.environment === context.environment,
    `${journey.id} receipt.environment 必须与 release-set.environment 一致`,
  );
  push(
    errors,
    SHA256_PATTERN.test(clean(receipt.release_set_sha256)) &&
      clean(receipt.release_set_sha256).toLowerCase() === context.release.hash,
    `${journey.id} receipt.release_set_sha256 未绑定当前 release-set`,
  );
  push(errors, validTimestamp(receipt.observed_at), `${journey.id} receipt.observed_at 必须是有效时间`);
  push(errors, receipt.non_fixture === true, `${journey.id} receipt.non_fixture 必须严格为 true`);

  const entityRefs = Array.isArray(receipt.test_entity_refs)
    ? receipt.test_entity_refs.map(clean)
    : [];
  push(
    errors,
    entityRefs.length > 0 && entityRefs.every(Boolean),
    `${journey.id} receipt.test_entity_refs 必须提供至少一个非 fixture 真实实体引用`,
  );
  if (new Set(entityRefs).size !== entityRefs.length) {
    errors.push(`${journey.id} receipt.test_entity_refs 不得重复`);
  }

  const receiptSteps = Array.isArray(receipt.steps) ? receipt.steps : [];
  push(errors, Array.isArray(receipt.steps), `${journey.id} receipt.steps 必须是数组`);
  if (receiptSteps.length !== journey.steps.length) {
    errors.push(
      `${journey.id} receipt.steps 数量 ${receiptSteps.length} 与配置 ${journey.steps.length} 不一致`,
    );
  }

  const configuredIds = journey.steps.map((step) => step.id);
  const receivedIds = receiptSteps.map((step) => clean(step?.id));
  for (const stepId of configuredIds) {
    if (!receivedIds.includes(stepId)) {
      errors.push(`${journey.id} receipt 缺少步骤 ${stepId}`);
    }
  }
  for (const stepId of receivedIds) {
    if (stepId && !configuredIds.includes(stepId)) {
      errors.push(`${journey.id} receipt 含未配置步骤 ${stepId}`);
    }
  }
  if (new Set(receivedIds).size !== receivedIds.length) {
    errors.push(`${journey.id} receipt.steps 存在重复 ID`);
  }
  configuredIds.forEach((stepId, index) => {
    if (receivedIds[index] && receivedIds[index] !== stepId) {
      errors.push(
        `${journey.id} receipt.steps 顺序漂移: 第 ${index + 1} 步应为 ${stepId}，实际为 ${receivedIds[index]}`,
      );
    }
  });

  const evidenceEntries = [];
  const observedRefs = new Set();
  receiptSteps.forEach((step, index) => {
    const label = `${journey.id} receipt.steps[${index}]`;
    if (!isRecord(step)) {
      errors.push(`${label} 必须是 object`);
      return;
    }
    push(errors, step.status === "pass", `${label}(${clean(step.id) || "无 ID"}).status 必须是 pass`);
    const observedRef = clean(step.observed_ref);
    push(errors, observedRef !== "", `${label}.observed_ref 不能为空`);
    if (observedRef && observedRefs.has(observedRef)) {
      errors.push(`${label}.observed_ref 重复: ${observedRef}`);
    }
    if (observedRef) observedRefs.add(observedRef);

    const refs = Array.isArray(step.evidence_refs)
      ? step.evidence_refs.map(clean)
      : [];
    push(
      errors,
      refs.length > 0 && refs.every(Boolean),
      `${label}.evidence_refs 必须是非空数组`,
    );
    if (new Set(refs).size !== refs.length) {
      errors.push(`${label}.evidence_refs 不得重复`);
    }
    for (const evidenceRef of refs) {
      let file;
      try {
        file = resolveProgramFile(
          context.programRoot,
          evidenceRef,
          `${label}.evidence_refs`,
        );
        const info = lstatSync(file);
        if (!info.isFile()) {
          errors.push(`${label} evidence 必须是普通文件: ${evidenceRef}`);
          continue;
        }
        const bytes = readFileSync(file);
        if (bytes.length === 0) {
          errors.push(`${label} evidence 不能为空文件: ${evidenceRef}`);
          continue;
        }
        evidenceEntries.push({
          ref: evidenceRef.split(path.sep).join("/"),
          sha256: sha256(bytes),
        });
      } catch (error) {
        errors.push(...error.messages);
      }
    }
  });

  const postconditions = isRecord(receipt.postconditions)
    ? receipt.postconditions
    : {};
  push(errors, isRecord(receipt.postconditions), `${journey.id} receipt.postconditions 必须是 object`);
  for (const key of ["read_after_write", "settled", "refresh", "repeat_safe"]) {
    push(
      errors,
      postconditions[key] === true,
      `${journey.id} receipt.postconditions.${key} 必须严格为 true`,
    );
  }
  push(errors, Array.isArray(receipt.open_defects), `${journey.id} receipt.open_defects 必须是数组`);
  if (Array.isArray(receipt.open_defects) && receipt.open_defects.length > 0) {
    errors.push(`${journey.id} receipt.open_defects 非空，旅程不能 GO`);
  }

  if (validTimestamp(receipt.observed_at)) {
    const releaseTimes = journey.componentIds
      .map((componentId) => context.releaseComponents.get(componentId)?.deployedAt)
      .filter(validTimestamp)
      .map((value) => Date.parse(value));
    if (validTimestamp(context.releaseGeneratedAt)) {
      releaseTimes.push(Date.parse(context.releaseGeneratedAt));
    }
    const latestRelease = releaseTimes.length ? Math.max(...releaseTimes) : null;
    if (latestRelease !== null && Date.parse(receipt.observed_at) < latestRelease) {
      errors.push(`${journey.id} receipt.observed_at 早于当前 release-set 的部署时间`);
    }
  }

  if (errors.length) throw new GateError(errors);
  return {
    document,
    evidenceEntries,
    evidenceBundleSha256: evidenceBundle(evidenceEntries),
    observedAt: clean(receipt.observed_at),
  };
}

function loadBase(programRoot) {
  const { controlRoot, executionDir } = resolveProgramControl(programRoot);
  const configDocument = readJson(
    path.join(controlRoot, "program.config.json"),
    "program.config",
  );
  const programContext = validateProgram(programRoot, configDocument);
  const releaseDocument = readJson(path.join(controlRoot, "release-set.json"), "release-set");
  return {
    ...validateRelease(programContext, releaseDocument),
    controlRoot,
    executionDir,
  };
}

function executionFile(context, journeyId) {
  return path.join(context.executionDir, `${journeyId}.json`);
}

function commandSnapshot(command, overrides = {}) {
  return {
    id: command.id,
    component_id: command.componentId,
    cwd_relative: command.relativeCwd.split(path.sep).join("/"),
    cwd_sha256: sha256(command.cwd),
    command_sha256: sha256(command.command),
    started_at: null,
    finished_at: null,
    status: "pending",
    exit_code: null,
    signal: null,
    stdout_sha256: sha256(""),
    stdout_bytes: 0,
    stderr_sha256: sha256(""),
    stderr_bytes: 0,
    ...overrides,
  };
}

function executionBase(
  context,
  journey,
  receipt,
  status,
  startedAt,
  dependencies = [],
) {
  return {
    schema: EXECUTION_SCHEMA,
    program_id: context.programId,
    journey_id: journey.id,
    environment: context.environment,
    status,
    program_config_sha256: context.config.hash,
    config_sha256: context.config.hash,
    release_set_sha256: context.release.hash,
    receipt_sha256: receipt?.document.hash ?? null,
    evidence_bundle_sha256: receipt?.evidenceBundleSha256 ?? null,
    started_at: startedAt,
    finished_at: null,
    dependencies,
    commands: journey.commands.map((command) => commandSnapshot(command)),
    errors: [],
  };
}

function openReleaseCheckouts(context, journey) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "program-gate-release-"));
  const checkouts = new Map();
  const created = [];
  const cleanup = () => {
    for (const item of [...created].reverse()) {
      spawnSync("git", ["worktree", "remove", "--force", item.checkout], {
        cwd: item.repo,
        encoding: "utf8",
        maxBuffer: MAX_OUTPUT,
      });
    }
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } catch {
      // 临时目录清理失败不改变本轮业务验证结论；git 后续 prune 可回收元数据。
    }
  };

  try {
    for (const componentId of new Set(journey.commands.map((command) => command.componentId))) {
      const component = context.components.get(componentId);
      const release = context.releaseComponents.get(componentId);
      if (!component?.repoPath || !release?.commitSha) {
        throw new GateError(`命令组件 ${componentId} 缺仓库或 deployed commit`);
      }
      const checkout = path.join(temporaryRoot, componentId);
      runGit(
        component.repoPath,
        ["worktree", "add", "--detach", checkout, release.commitSha],
        `${componentId} deployed commit 临时检出失败`,
      );
      created.push({ repo: component.repoPath, checkout });
      checkouts.set(componentId, realpathSync(checkout));
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    cwdFor(command) {
      const checkout = checkouts.get(command.componentId);
      if (!checkout) throw new GateError(`命令 ${command.id} 没有 deployed commit 检出`);
      const candidate = path.resolve(checkout, command.relativeCwd);
      if (!inside(checkout, candidate) || !existsSync(candidate)) {
        throw new GateError(
          `命令 ${command.id} 的 cwd 在 deployed commit 中不存在或越界: ${command.relativeCwd}`,
        );
      }
      const real = realpathSync(candidate);
      if (!inside(checkout, real) || !statSync(real).isDirectory()) {
        throw new GateError(`命令 ${command.id} 的 deployed cwd 不安全`);
      }
      return real;
    },
    cleanup,
  };
}

function runCommand(command, runtimeCwd) {
  const startedAt = now();
  const result = spawnSync(command.command, {
    cwd: runtimeCwd,
    shell: true,
    maxBuffer: MAX_OUTPUT,
    windowsHide: true,
  });
  const finishedAt = now();
  const exitCode = Number.isInteger(result.status) ? result.status : null;
  const signal = result.signal == null ? null : String(result.signal);
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
  const status = !result.error && exitCode === 0 ? "pass" : "fail";
  const error = result.error
    ? `命令 ${command.id} 无法完成（${clean(result.error.code) || "spawn error"}）`
    : status === "fail"
      ? `命令 ${command.id} 失败: exit ${exitCode ?? "null"}${signal ? `, signal ${signal}` : ""}`
      : null;
  return {
    snapshot: commandSnapshot(command, {
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      exit_code: exitCode,
      signal,
      stdout_sha256: sha256(stdout),
      stdout_bytes: stdout.byteLength,
      stderr_sha256: sha256(stderr),
      stderr_bytes: stderr.byteLength,
    }),
    error,
  };
}

function runJourneyCommands(context, journey) {
  let checkouts;
  try {
    checkouts = openReleaseCheckouts(context, journey);
  } catch (error) {
    return {
      commands: journey.commands.map((command) => commandSnapshot(command)),
      errors: error.messages ?? [error.message],
    };
  }
  const commandResults = [];
  const errors = [];
  try {
    for (const command of journey.commands) {
      let runtimeCwd;
      try {
        runtimeCwd = checkouts.cwdFor(command);
      } catch (error) {
        errors.push(...(error.messages ?? [error.message]));
        break;
      }
      const result = runCommand(command, runtimeCwd);
      commandResults.push(result.snapshot);
      if (result.error) {
        errors.push(result.error);
        break;
      }
    }
  } finally {
    checkouts.cleanup();
  }
  const executedIds = new Set(commandResults.map((item) => item.id));
  for (const command of journey.commands) {
    if (!executedIds.has(command.id)) commandResults.push(commandSnapshot(command));
  }
  return { commands: commandResults, errors };
}

function executeJourney(context, journey) {
  const startedAt = now();
  let receipt = null;
  let dependencyResults = [];
  try {
    receipt = validateReceipt(context, journey);
    dependencyResults = journey.dependsOn.map((dependencyId) =>
      auditJourney(context, context.journeys.get(dependencyId)),
    );
  } catch (error) {
    const failure = executionBase(context, journey, receipt, "fail", startedAt);
    failure.finished_at = now();
    failure.errors = error.messages ?? [error.message];
    atomicWriteJson(executionFile(context, journey.id), failure);
    throw error;
  }

  const dependencySnapshots = dependencyResults.map((result) => ({
    journey_id: result.journey.id,
    execution_sha256: result.execution.document.hash,
  }));
  const execution = executionBase(
    context,
    journey,
    receipt,
    "running",
    startedAt,
    dependencySnapshots,
  );
  // 先用 running 原子覆盖旧 PASS。即使进程随后中断，默认审计也只能得到 NO-GO。
  atomicWriteJson(executionFile(context, journey.id), execution);

  const fresh = runJourneyCommands(context, journey);
  execution.commands = fresh.commands;
  execution.status = fresh.errors.length ? "fail" : "pass";
  execution.finished_at = now();
  execution.errors = fresh.errors;
  atomicWriteJson(executionFile(context, journey.id), execution);
  if (fresh.errors.length) throw new GateError(fresh.errors);
  return execution;
}

function validateExecution(context, journey, receipt, dependencyResults = []) {
  const file = executionFile(context, journey.id);
  if (!existsSync(file)) {
    throw new GateError(`${journey.id} execution 不存在: ${file}`);
  }
  const executionInfo = lstatSync(file);
  if (executionInfo.isSymbolicLink() || !executionInfo.isFile()) {
    throw new GateError(`${journey.id} execution 必须是真实普通文件，不接受 symlink`);
  }
  const executionReal = realpathSync(file);
  if (!inside(context.executionDir, executionReal)) {
    throw new GateError(`${journey.id} execution 不得越出 executions 目录`);
  }
  const document = readJson(file, `旅程 ${journey.id} execution`);
  const execution = document.value;
  const errors = [];
  push(errors, execution.schema === EXECUTION_SCHEMA, `${journey.id} execution.schema 必须是 ${EXECUTION_SCHEMA}`);
  push(errors, execution.program_id === context.programId, `${journey.id} execution.program_id 不匹配`);
  push(errors, execution.journey_id === journey.id, `${journey.id} execution.journey_id 不匹配`);
  push(errors, execution.environment === context.environment, `${journey.id} execution.environment 不匹配`);
  push(
    errors,
    execution.status === "pass",
    `${journey.id} execution 当前为 ${clean(execution.status) || "缺失"}，必须重新执行；NO-GO`,
  );
  push(
    errors,
    clean(execution.program_config_sha256).toLowerCase() === context.config.hash,
    `${journey.id} execution.program_config_sha256 未绑定当前 program.config`,
  );
  push(
    errors,
    clean(execution.config_sha256).toLowerCase() === context.config.hash,
    `${journey.id} execution.config_sha256 未绑定当前 program.config`,
  );
  push(
    errors,
    clean(execution.release_set_sha256).toLowerCase() === context.release.hash,
    `${journey.id} execution.release_set_sha256 未绑定当前 release-set`,
  );
  push(
    errors,
    clean(execution.receipt_sha256).toLowerCase() === receipt.document.hash,
    `${journey.id} execution.receipt_sha256 未绑定当前 receipt`,
  );
  push(
    errors,
    clean(execution.evidence_bundle_sha256).toLowerCase() ===
      receipt.evidenceBundleSha256,
    `${journey.id} execution.evidence_bundle_sha256 未绑定当前 evidence`,
  );
  push(errors, validTimestamp(execution.started_at), `${journey.id} execution.started_at 必须是有效时间`);
  push(errors, validTimestamp(execution.finished_at), `${journey.id} execution.finished_at 必须是有效时间`);
  if (
    validTimestamp(execution.started_at) &&
    validTimestamp(execution.finished_at) &&
    Date.parse(execution.finished_at) < Date.parse(execution.started_at)
  ) {
    errors.push(`${journey.id} execution.finished_at 早于 started_at`);
  }

  const dependencies = Array.isArray(execution.dependencies)
    ? execution.dependencies
    : [];
  push(
    errors,
    Array.isArray(execution.dependencies),
    `${journey.id} execution.dependencies 必须是数组`,
  );
  if (dependencies.length !== dependencyResults.length) {
    errors.push(
      `${journey.id} execution.dependencies 数量 ${dependencies.length} 与当前旅程依赖 ${dependencyResults.length} 不一致`,
    );
  }
  dependencyResults.forEach((expected, index) => {
    const actual = dependencies[index];
    const label = `${journey.id} execution.dependencies[${index}]`;
    if (!isRecord(actual)) {
      errors.push(`${label} 缺失`);
      return;
    }
    push(
      errors,
      actual.journey_id === expected.journey.id,
      `${label}.journey_id 应为 ${expected.journey.id}`,
    );
    push(
      errors,
      clean(actual.execution_sha256).toLowerCase() ===
        expected.execution.document.hash,
      `${label}.execution_sha256 未绑定依赖旅程 ${expected.journey.id} 的当前 execution`,
    );
  });

  const commands = Array.isArray(execution.commands) ? execution.commands : [];
  push(errors, Array.isArray(execution.commands), `${journey.id} execution.commands 必须是数组`);
  if (commands.length !== journey.commands.length) {
    errors.push(
      `${journey.id} execution.commands 数量 ${commands.length} 与当前配置 ${journey.commands.length} 不一致`,
    );
  }
  journey.commands.forEach((expected, index) => {
    const actual = commands[index];
    const label = `${journey.id} execution.commands[${index}]`;
    if (!isRecord(actual)) {
      errors.push(`${label} 缺失`);
      return;
    }
    push(errors, actual.id === expected.id, `${label}.id 应为 ${expected.id}`);
    push(
      errors,
      actual.component_id === expected.componentId,
      `${label}.component_id 应为 ${expected.componentId}`,
    );
    push(
      errors,
      actual.cwd_relative === expected.relativeCwd.split(path.sep).join("/"),
      `${label}.cwd_relative 与当前 program.config 不一致`,
    );
    push(
      errors,
      clean(actual.cwd_sha256).toLowerCase() === sha256(expected.cwd),
      `${label}.cwd_sha256 与当前 program.config 不一致`,
    );
    push(
      errors,
      clean(actual.command_sha256).toLowerCase() === sha256(expected.command),
      `${label}.command_sha256 与当前 program.config 不一致`,
    );
    push(errors, actual.status === "pass", `${label}.status 必须是 pass`);
    push(errors, actual.exit_code === 0, `${label}.exit_code 必须是 0`);
    push(errors, validTimestamp(actual.started_at), `${label}.started_at 必须是有效时间`);
    push(errors, validTimestamp(actual.finished_at), `${label}.finished_at 必须是有效时间`);
    push(
      errors,
      SHA256_PATTERN.test(clean(actual.stdout_sha256)),
      `${label}.stdout_sha256 必须是完整 SHA-256`,
    );
    push(
      errors,
      Number.isSafeInteger(actual.stdout_bytes) && actual.stdout_bytes >= 0,
      `${label}.stdout_bytes 必须是非负安全整数`,
    );
    push(
      errors,
      SHA256_PATTERN.test(clean(actual.stderr_sha256)),
      `${label}.stderr_sha256 必须是完整 SHA-256`,
    );
    push(
      errors,
      Number.isSafeInteger(actual.stderr_bytes) && actual.stderr_bytes >= 0,
      `${label}.stderr_bytes 必须是非负安全整数`,
    );
    push(
      errors,
      !Object.hasOwn(actual, "command") &&
        !Object.hasOwn(actual, "stdout") &&
        !Object.hasOwn(actual, "stderr"),
      `${label} 不得持久化 command/stdout/stderr 原文`,
    );
  });
  push(
    errors,
    Array.isArray(execution.errors) && execution.errors.length === 0,
    `${journey.id} execution.errors 必须为空`,
  );
  if (errors.length) throw new GateError(errors);
  return { document, value: execution };
}

function auditJourney(context, journey, memo = new Map(), active = new Set()) {
  if (!journey) throw new GateError("依赖旅程未在 program.config 中注册");
  if (memo.has(journey.id)) return memo.get(journey.id);
  if (active.has(journey.id)) {
    throw new GateError(`旅程依赖形成环: ${[...active, journey.id].join(" -> ")}`);
  }
  active.add(journey.id);
  const dependencyResults = journey.dependsOn.map((dependencyId) =>
    auditJourney(context, context.journeys.get(dependencyId), memo, active),
  );
  const receipt = validateReceipt(context, journey);
  const execution = validateExecution(
    context,
    journey,
    receipt,
    dependencyResults,
  );
  const freshStartedAt = now();
  const fresh = runJourneyCommands(context, journey);
  if (fresh.errors.length) {
    const failure = executionBase(
      context,
      journey,
      receipt,
      "fail",
      freshStartedAt,
      dependencyResults.map((result) => ({
        journey_id: result.journey.id,
        execution_sha256: result.execution.document.hash,
      })),
    );
    failure.finished_at = now();
    failure.commands = fresh.commands;
    failure.errors = fresh.errors;
    atomicWriteJson(executionFile(context, journey.id), failure);
    throw new GateError(
      fresh.errors.map((error) => `${journey.id} 本轮 fresh 验证失败: ${error}`),
    );
  }
  const result = { journey, receipt, execution };
  memo.set(journey.id, result);
  active.delete(journey.id);
  return result;
}

function selectJourneys(context, requestedId) {
  if (!requestedId) {
    return context.journeyOrder.map((journeyId) => context.journeys.get(journeyId));
  }
  const journey = context.journeys.get(requestedId);
  if (!journey) throw new GateError(`program.config 中找不到旅程 ${requestedId}`);
  return [journey];
}

function fallbackFailure(programRoot, journeyId, error, hashes = {}) {
  if (!journeyId || !ID_PATTERN.test(journeyId)) return;
  let file;
  try {
    file = path.join(resolveProgramControl(programRoot).executionDir, `${journeyId}.json`);
  } catch {
    // 安全目录本身损坏时保持 NO-GO，但绝不为写失败回执而跟随 symlink 越界。
    return;
  }
  const failure = {
    schema: EXECUTION_SCHEMA,
    program_id: null,
    journey_id: journeyId,
    environment: null,
    status: "fail",
    program_config_sha256: hashes.config ?? null,
    config_sha256: hashes.config ?? null,
    release_set_sha256: hashes.release ?? null,
    receipt_sha256: null,
    evidence_bundle_sha256: null,
    started_at: now(),
    finished_at: now(),
    commands: [],
    errors: error.messages ?? [error.message],
  };
  try {
    atomicWriteJson(file, failure);
  } catch {
    // 主错误仍然保证当前命令 NO-GO；默认审计也会重新校验所有源文件。
  }
}

function invalidateFallbackExecutions(programRoot, requestedId, error) {
  let controlRoot;
  let executionDir;
  try {
    ({ controlRoot, executionDir } = resolveProgramControl(programRoot));
  } catch {
    return;
  }
  const ids = new Set();
  if (requestedId && ID_PATTERN.test(requestedId)) ids.add(requestedId);
  if (!requestedId) {
    const configFile = path.join(controlRoot, "program.config.json");
    try {
      const config = JSON.parse(readFileSync(configFile, "utf8"));
      for (const journey of Array.isArray(config?.journeys) ? config.journeys : []) {
        const id = clean(journey?.id);
        if (ID_PATTERN.test(id)) ids.add(id);
      }
    } catch {
      // 配置无法解析时仍继续扫描已有 execution，不能让旧绿幸存。
    }
    try {
      for (const entry of readdirSync(executionDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const id = entry.name.slice(0, -5);
        if (ID_PATTERN.test(id)) ids.add(id);
      }
    } catch {
      // 目录尚不存在时无旧 execution 需要失效。
    }
  }
  const hashes = {};
  for (const [key, filename] of [
    ["config", "program.config.json"],
    ["release", "release-set.json"],
  ]) {
    try {
      hashes[key] = sha256(readFileSync(path.join(controlRoot, filename)));
    } catch {
      hashes[key] = null;
    }
  }
  for (const id of ids) fallbackFailure(programRoot, id, error, hashes);
}

function printErrors(prefix, errors) {
  console.error(`${prefix}`);
  for (const error of errors) console.error(`  - ${error}`);
}

function parseArgs(args) {
  if (args.length === 0) return { action: "audit", journeyId: null };
  if (args[0] === "--help" && args.length === 1) return { action: "help", journeyId: null };
  if (!["--audit", "--execute"].includes(args[0])) {
    throw new GateError(`不认识参数 ${args[0]}；用法: program-gate.mjs [--audit|--execute] [journey-id]`);
  }
  if (args.length > 2) throw new GateError("参数过多；每次最多指定一个 journey-id");
  const journeyId = args[1] == null ? null : clean(args[1]);
  if (journeyId !== null && !ID_PATTERN.test(journeyId)) {
    throw new GateError(`journey-id 不安全或为空: ${args[1]}`);
  }
  return {
    action: args[0] === "--execute" ? "execute" : "audit",
    journeyId,
  };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    printErrors("NO-GO：参数错误", error.messages ?? [error.message]);
    return 1;
  }
  if (parsed.action === "help") {
    console.log(
      "用法: node orchestrator/process/program-gate.mjs [--audit|--execute] [journey-id]",
    );
    return 0;
  }

  let programRoot;
  try {
    programRoot = realpathSync(process.cwd());
  } catch (error) {
    printErrors("NO-GO：当前 program 根目录无法解析", [error.message]);
    return 1;
  }

  let context;
  try {
    context = loadBase(programRoot);
  } catch (error) {
    if (parsed.action === "execute") {
      invalidateFallbackExecutions(programRoot, parsed.journeyId, error);
    }
    printErrors("NO-GO：跨项目控制面校验失败", error.messages ?? [error.message]);
    return 1;
  }

  let journeys;
  try {
    journeys = selectJourneys(context, parsed.journeyId);
  } catch (error) {
    if (parsed.action === "execute") {
      fallbackFailure(programRoot, parsed.journeyId, error, {
        config: context.config.hash,
        release: context.release.hash,
      });
    }
    printErrors("NO-GO：旅程选择失败", error.messages ?? [error.message]);
    return 1;
  }

  const failures = [];
  if (parsed.action === "execute") {
    for (const journey of journeys) {
      try {
        executeJourney(context, journey);
        console.log(`PASS：${journey.id} 跨项目命令执行成功，execution 已原子写入`);
      } catch (error) {
        failures.push(...(error.messages ?? [error.message]).map((item) => `${journey.id}: ${item}`));
      }
    }
  } else {
    const memo = new Map();
    for (const journey of journeys) {
      try {
        auditJourney(context, journey, memo);
        console.log(
          `PASS：${journey.id} execution 绑定一致，且 deployed commit fresh verification 通过`,
        );
      } catch (error) {
        failures.push(...(error.messages ?? [error.message]).map((item) => `${journey.id}: ${item}`));
      }
    }
  }

  if (failures.length) {
    printErrors("NO-GO：跨项目旅程未通过", failures);
    return 1;
  }
  console.log(
    `GO：program ${context.programId} 的 ${journeys.length} 条跨项目旅程已通过${parsed.action === "execute" ? "执行" : "审计"}`,
  );
  return 0;
}

process.exitCode = main();
