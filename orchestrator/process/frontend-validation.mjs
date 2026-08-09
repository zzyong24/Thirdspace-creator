#!/usr/bin/env node
// Deterministic verifier for UI journey evidence.
//
// A unit/component pass proves local logic or rendering. This verifier requires
// a PAGE_SPEC contract plus one compact report from a real browser/desktop run,
// and checks post-action state coherence, adverse conditions, real-data
// witnesses, and the project-declared normal/minimum viewports.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const REAL_SURFACES = new Set([
  "browser",
  "desktop-web",
  "desktop-app",
  "mobile-browser",
  "tablet-browser",
]);
const MASTER_DETAIL_KEYS = [
  "collection_matches_control",
  "selection_valid_or_empty",
  "detail_matches_selection_or_empty",
  "next_action_when_empty",
];
const JOURNEY_SCHEMAS = new Set([
  "frontend-journey-contract/v1",
  "frontend-journey-contract/v2",
]);
const INTERNAL_ID_PATTERN =
  /(?:^|[^A-Za-z0-9])((?:T\d{2,}|T-(?:\d{2,}|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)|(?:ASM|DEC|FR|NFR|FLOW|ENT|IA|PAGE|COMP|MOCK|API|TEST|TC|INT|BR|PG|HARD|PKG|RISK|REV|FEAT|DFLOW|AC)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*))(?=$|[^A-Za-z0-9])/g;
const INTERNAL_JARGON_PATTERNS = [
  /\btrace\s*id\b/gi,
  /\bcorrelation[_ -]?id\b/gi,
  /\bidempotency(?:[_ -]?key|[_ -]?required)?\b/gi,
  /\b(?:provider|schema|enum|webhook|traceparent|tracestate)\b/gi,
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function gitPathspec(relativePath) {
  return `:(literal)${relativePath}`;
}

function runGit(root, args, label) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: git 无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = clean(result.stderr) || clean(result.stdout) || `exit ${result.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return clean(result.stdout);
}

function resolveGitCommit(root, revision, label) {
  return runGit(root, ["rev-parse", "--verify", `${revision}^{commit}`], label);
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function resolveInside(root, target, label) {
  const unresolved = path.resolve(root, target);
  const absolute = existsSync(unresolved)
    ? realpathSync(unresolved)
    : path.join(realpathSync(path.dirname(unresolved)), path.basename(unresolved));
  if (!inside(root, absolute)) throw new Error(`${label} 必须位于项目根目录内: ${target}`);
  return absolute;
}

function normalizeWatchedPaths(root, value, { required }) {
  const errors = [];
  const watchedPaths = [];
  if (value == null) {
    if (required) errors.push("strict contract.watched_paths 必须是非空数组");
    return { errors, watchedPaths };
  }
  if (!Array.isArray(value) || !value.length) {
    errors.push("contract.watched_paths 必须是非空数组");
    return { errors, watchedPaths };
  }
  const normalizedRoot = realpathSync(root);
  const seen = new Set();
  for (const raw of value) {
    if (!clean(raw)) {
      errors.push("contract.watched_paths 每项必须是非空项目相对路径");
      continue;
    }
    if (path.isAbsolute(raw) || raw.includes("\0")) {
      errors.push(`contract.watched_paths 必须使用安全的项目相对路径: ${raw}`);
      continue;
    }
    const absolute = path.resolve(normalizedRoot, raw);
    const relative = path.relative(normalizedRoot, absolute);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      errors.push(`contract.watched_paths 不得指向项目根或项目外: ${raw}`);
      continue;
    }
    if (!existsSync(absolute)) {
      errors.push(`contract.watched_paths 指向不存在的实现路径: ${raw}`);
      continue;
    }
    if (!inside(normalizedRoot, realpathSync(absolute))) {
      errors.push(`contract.watched_paths 不得通过 symlink 指向项目外: ${raw}`);
      continue;
    }
    const normalized = relative.split(path.sep).join("/");
    if (seen.has(normalized)) {
      errors.push(`contract.watched_paths 重复: ${normalized}`);
      continue;
    }
    seen.add(normalized);
    watchedPaths.push(normalized);
  }
  return { errors, watchedPaths };
}

function assertGitWorktree(root) {
  const answer = runGit(root, ["rev-parse", "--is-inside-work-tree"], "strict UI 验收要求 Git worktree");
  if (answer !== "true") throw new Error("strict UI 验收要求项目位于 Git worktree");
}

function watchedPathStatus(root, watchedPaths) {
  return runGit(
    root,
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ...watchedPaths.map(gitPathspec),
    ],
    "无法检查 watched_paths 工作区状态",
  );
}

function assertWatchedPathsClean(root, watchedPaths) {
  const status = watchedPathStatus(root, watchedPaths);
  if (status) {
    throw new Error(
      `watched_paths 存在 staged/unstaged/untracked 代码漂移，receipt 不能绑定:\n${status}`,
    );
  }
}

function changedWatchedPaths(root, fromCommit, toCommit, watchedPaths) {
  return runGit(
    root,
    [
      "diff",
      "--name-only",
      fromCommit,
      toCommit,
      "--",
      ...watchedPaths.map(gitPathspec),
    ],
    "无法比较 receipt 与当前 HEAD 的 watched_paths",
  );
}

function extractJsonBlock(file, tag) {
  if (!existsSync(file)) throw new Error(`${path.basename(file)} 不存在`);
  const source = readFileSync(file, "utf8");
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...source.matchAll(new RegExp(`\\\`\\\`\\\`${escaped}\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, "g")),
  ];
  if (!matches.length) throw new Error(`${path.basename(file)} 缺 \`\`\`${tag} JSON block`);
  if (matches.length !== 1) throw new Error(`${path.basename(file)} 必须且只能有一个 \`\`\`${tag} block`);
  try {
    return { value: JSON.parse(matches[0][1]), source };
  } catch (error) {
    throw new Error(`${tag} JSON 无法解析: ${error.message}`);
  }
}

function sameViewport(a, b) {
  return Number(a?.width) === Number(b?.width) && Number(a?.height) === Number(b?.height);
}

function findInternalIds(text) {
  return [...String(text).matchAll(INTERNAL_ID_PATTERN)].map((match) => match[1]);
}

function findInternalJargon(text) {
  const matches = new Set();
  for (const pattern of INTERNAL_JARGON_PATTERNS) {
    for (const match of String(text).matchAll(pattern)) matches.add(match[0]);
  }
  return [...matches];
}

function validateVisibleCopyEvidence(root, report, contract, taskId) {
  const errors = [];
  const required =
    contract?.schema === "frontend-journey-contract/v2" ||
    contract?.copy_guard?.forbid_internal_ids === true;
  const evidence = report?.visible_copy;
  if (!required && evidence == null) return { errors, artifactSha: null, captureCount: 0 };
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("visible_copy 必须提供真实 browser/desktop 可见文案 artifact");
    return { errors, artifactSha: null, captureCount: 0 };
  }
  if (!clean(evidence.artifact_path)) {
    errors.push("visible_copy.artifact_path 不能为空");
    return { errors, artifactSha: null, captureCount: 0 };
  }
  if (!/^[a-f0-9]{64}$/i.test(clean(evidence.artifact_sha256))) {
    errors.push("visible_copy.artifact_sha256 必须是完整 64 位 SHA-256");
  }

  let artifactFile;
  let source;
  let artifact;
  try {
    artifactFile = resolveInside(root, evidence.artifact_path, "visible copy artifact");
    if (!existsSync(artifactFile)) throw new Error(`${evidence.artifact_path} 不存在`);
    source = readFileSync(artifactFile, "utf8");
    artifact = JSON.parse(source);
  } catch (error) {
    errors.push(`visible_copy artifact 无法读取: ${error.message}`);
    return { errors, artifactSha: null, captureCount: 0 };
  }

  const artifactSha = sha(source);
  if (
    /^[a-f0-9]{64}$/i.test(clean(evidence.artifact_sha256)) &&
    clean(evidence.artifact_sha256).toLowerCase() !== artifactSha
  ) {
    errors.push("visible_copy artifact_sha256 与当前 artifact 不一致");
  }
  if (artifact?.schema !== "frontend-visible-copy/v1") {
    errors.push("visible_copy artifact schema 必须为 frontend-visible-copy/v1");
  }
  if (artifact?.task_id !== taskId) {
    errors.push(`visible_copy task_id=${artifact?.task_id}，期望 ${taskId}`);
  }
  if (clean(artifact?.commit_sha) !== clean(report?.commit_sha)) {
    errors.push("visible_copy commit_sha 必须与 report.commit_sha 一致");
  }
  if (!Array.isArray(artifact?.captures) || !artifact.captures.length) {
    errors.push("visible_copy captures 必须是非空数组");
    return { errors, artifactSha, captureCount: 0 };
  }

  const coveredChecks = new Set();
  const coveredViewports = [];
  const leaked = new Set();
  const leakedJargon = new Set();
  for (const [index, capture] of artifact.captures.entries()) {
    const label = clean(capture?.checkpoint) || `capture[${index}]`;
    if (!clean(capture?.checkpoint)) errors.push(`visible_copy ${label} 缺 checkpoint`);
    if (!Array.isArray(capture?.check_ids) || !capture.check_ids.length) {
      errors.push(`visible_copy ${label} 缺 check_ids`);
    } else {
      for (const id of capture.check_ids) coveredChecks.add(id);
    }
    if (!(Number(capture?.viewport?.width) > 0 && Number(capture?.viewport?.height) > 0)) {
      errors.push(`visible_copy ${label} 缺有效 viewport`);
    } else {
      coveredViewports.push(capture.viewport);
    }
    if (!clean(capture?.text)) {
      errors.push(`visible_copy ${label} 的 text 为空，不能证明扫描了页面可见文案`);
    } else {
      for (const id of findInternalIds(capture.text)) leaked.add(id);
      for (const term of findInternalJargon(capture.text)) leakedJargon.add(term);
    }
  }

  for (const requiredCheck of contract.required_checks ?? []) {
    if (!coveredChecks.has(requiredCheck.id)) {
      errors.push(`visible_copy 未覆盖 required_check ${requiredCheck.id}`);
    }
  }
  for (const viewport of contract.viewports ?? []) {
    if (!coveredViewports.some((observed) => sameViewport(observed, viewport))) {
      errors.push(`visible_copy 未覆盖 viewport ${viewport.width}x${viewport.height}`);
    }
  }
  if (leaked.size) {
    errors.push(
      `用户可见文案泄漏内部追踪 ID: ${[...leaked].join(", ")}；内部编号只能留在代码、测试或诊断元数据`,
    );
  }
  if (leakedJargon.size) {
    errors.push(
      `用户可见文案泄漏实现术语或机器错误暗号: ${[...leakedJargon].join(", ")}；请改写为发生了什么、是否受影响、下一步怎么做，诊断值只以“参考编号”作为次要信息`,
    );
  }
  return { errors, artifactSha, captureCount: artifact.captures.length };
}

function validateContract(contract, taskId, watchedPathErrors = []) {
  const errors = [...watchedPathErrors];
  if (!JOURNEY_SCHEMAS.has(contract?.schema)) {
    errors.push("contract schema 必须为 frontend-journey-contract/v1 或 v2");
    return errors;
  }
  if (
    contract.schema === "frontend-journey-contract/v2" &&
    contract.copy_guard?.forbid_internal_ids !== true
  ) {
    errors.push("v2 contract.copy_guard.forbid_internal_ids 必须为 true");
  }
  if (contract.task_id !== taskId) errors.push(`contract task_id=${contract.task_id}，期望 ${taskId}`);
  if (!Array.isArray(contract.required_checks) || !contract.required_checks.length) {
    errors.push("contract.required_checks 至少一项");
  } else {
    const ids = new Set();
    for (const check of contract.required_checks) {
      if (!clean(check?.id) || !clean(check?.test_id)) {
        errors.push("每个 required_check 必须有 id + test_id");
      }
      if (ids.has(check?.id)) errors.push(`contract required_check 重复: ${check.id}`);
      ids.add(check?.id);
    }
  }
  if (!Array.isArray(contract.required_conditions)) {
    errors.push("contract.required_conditions 必须是数组");
  }
  if (!Array.isArray(contract.viewports) || contract.viewports.length < 2) {
    errors.push("contract.viewports 至少声明常规尺寸与最小支持尺寸两档");
  } else {
    for (const viewport of contract.viewports) {
      if (!(Number(viewport?.width) > 0 && Number(viewport?.height) > 0)) {
        errors.push("contract viewport 的 width/height 必须为正数");
      }
    }
    const viewportKeys = contract.viewports.map((viewport) => `${viewport.width}x${viewport.height}`);
    if (new Set(viewportKeys).size !== viewportKeys.length) {
      errors.push("contract.viewports 尺寸必须唯一，不能用同一运行冒充常规与最小窗口");
    }
  }
  if (!Array.isArray(contract.coherence_groups)) {
    errors.push("contract.coherence_groups 必须是数组");
  } else {
    const requiredIds = new Set((contract.required_checks ?? []).map((check) => check.id));
    for (const group of contract.coherence_groups) {
      if (group?.pattern !== "master-detail") continue;
      for (const key of MASTER_DETAIL_KEYS) {
        const id = group.check_ids?.[key];
        if (!clean(id)) errors.push(`${group.id || "master-detail"}: check_ids.${key} 缺失`);
        else if (!requiredIds.has(id)) {
          errors.push(`${group.id || "master-detail"}: ${key} 引用未声明的 required_check ${id}`);
        }
      }
      if (!["clear", "auto-select", "clear-or-reselect"].includes(group.policy)) {
        errors.push(
          `${group.id || "master-detail"}: policy 必须明确为 clear / auto-select / clear-or-reselect`,
        );
      }
    }
  }
  return errors;
}

function validateReportAgainstContract(
  report,
  contract,
  taskId,
  { contractSha, requireCodeBinding },
) {
  const errors = [];
  if (report?.schema !== "frontend-validation/v1") {
    return ["report schema 必须为 frontend-validation/v1"];
  }
  if (report.task_id !== taskId) errors.push(`report task_id=${report.task_id}，期望 ${taskId}`);
  if (!/^[a-f0-9]{7,64}$/i.test(clean(report.commit_sha))) {
    errors.push("commit_sha 必须是 7–64 位十六进制提交标识");
  }
  if (requireCodeBinding || report.contract_sha != null) {
    if (!/^[a-f0-9]{12}$/i.test(clean(report.contract_sha))) {
      errors.push("contract_sha 必须是当前 journey contract 文件的 12 位 SHA-256");
    } else if (report.contract_sha.toLowerCase() !== contractSha) {
      errors.push("contract_sha 与当前 journey contract 文件不一致");
    }
  }
  if (!clean(report.observed_at) || Number.isNaN(Date.parse(report.observed_at))) {
    errors.push("observed_at 必须是可解析时间");
  }

  const run = report.run ?? {};
  if (!clean(run.verify_key)) errors.push("run.verify_key 不能为空");
  if (!clean(run.command)) errors.push("run.command 不能为空");
  if (run.exit_code !== 0) errors.push(`真实运行 exit_code=${run.exit_code}，必须为 0`);
  if (!clean(run.output_ref)) errors.push("run.output_ref 不能为空");

  const environment = report.environment ?? {};
  if (!REAL_SURFACES.has(environment.surface)) {
    errors.push(
      `environment.surface=${JSON.stringify(environment.surface)} 不是受支持的真实 browser/desktop surface`,
    );
  }
  if (!clean(environment.runtime) || /mock|fixture|jsdom/i.test(environment.runtime)) {
    errors.push("environment.runtime 必须标识真实浏览器/桌面运行时，不能是 mock/jsdom");
  }
  if (!Array.isArray(environment.viewports)) {
    errors.push("environment.viewports 必须是数组");
  } else {
    for (const required of contract.viewports ?? []) {
      const observed = environment.viewports.find((viewport) => sameViewport(viewport, required));
      if (!observed) {
        errors.push(`缺 viewport ${required.width}x${required.height} 的真实运行结果`);
      } else if (observed.result !== "pass") {
        errors.push(`viewport ${required.width}x${required.height} 未 PASS`);
      }
    }
  }

  const data = report.data ?? {};
  if (data.mode !== "non-fixture") errors.push("data.mode 必须为 non-fixture（真实/代表性数据）");
  if (!Array.isArray(data.witnesses) || !data.witnesses.length) {
    errors.push("data.witnesses 至少提供一个不含敏感内容的真实数据 witness");
  } else {
    for (const witness of data.witnesses) {
      if (!clean(witness?.id) || !clean(witness?.role)) {
        errors.push("每个 data witness 必须有脱敏 id + role");
      }
    }
    if (
      (contract.coherence_groups ?? []).some((group) => group.pattern === "master-detail") &&
      (new Set(data.witnesses.map((witness) => witness.role)).size < 2 ||
        new Set(data.witnesses.map((witness) => witness.id)).size < 2)
    ) {
      errors.push("master-detail 旅程至少需要两个不同 id、不同角色的 witness，才能证明切换后旧选择不会泄漏");
    }
  }

  for (const level of ["logic", "surface", "journey"]) {
    if (report.levels?.[level]?.status !== "pass") {
      errors.push(`levels.${level}.status 必须独立为 pass`);
    }
    if (!clean(report.levels?.[level]?.evidence_ref)) {
      errors.push(`levels.${level}.evidence_ref 不能为空`);
    }
  }
  const experience = report.levels?.experience;
  if (!["pass", "not-requested"].includes(experience?.status)) {
    errors.push("levels.experience.status 必须为 pass 或 not-requested（不可拿机器结果冒充人类确认）");
  }
  if (!clean(experience?.evidence_ref)) errors.push("levels.experience.evidence_ref 不能为空");

  if (!Array.isArray(report.checks)) {
    errors.push("checks 必须是数组");
  } else {
    const seen = new Set();
    for (const check of report.checks) {
      if (seen.has(check?.id)) errors.push(`report check 重复: ${check.id}`);
      seen.add(check?.id);
    }
    for (const required of contract.required_checks ?? []) {
      const observed = report.checks.find((check) => check.id === required.id);
      if (!observed) {
        errors.push(`${required.id}: 缺少旅程后置条件证据`);
        continue;
      }
      if (observed.test_id !== required.test_id) {
        errors.push(`${required.id}: test_id=${observed.test_id}，期望 ${required.test_id}`);
      }
      if (observed.result !== "pass") errors.push(`${required.id}: result 必须为 pass`);
      if (!clean(observed.evidence_ref)) errors.push(`${required.id}: evidence_ref 不能为空`);
    }
  }

  if (!Array.isArray(report.coverage)) {
    errors.push("coverage 必须是数组");
  } else {
    const conditions = report.coverage.map((item) => item?.condition);
    if (new Set(conditions).size !== conditions.length) {
      errors.push("coverage condition 不得重复");
    }
    for (const condition of contract.required_conditions ?? []) {
      const observed = report.coverage.find((item) => item.condition === condition);
      if (!observed) {
        errors.push(`缺 required condition: ${condition}`);
        continue;
      }
      if (observed.result !== "pass") errors.push(`${condition}: required condition 必须在真实运行中 pass`);
      if (!clean(observed.evidence_ref) && observed.result === "pass") {
        errors.push(`${condition}: pass 时 evidence_ref 不能为空`);
      }
    }
  }

  if (!clean(report.tdd_red_ref)) {
    errors.push("tdd_red_ref 不能为空：必须留下旅程曾经失败、测试能抓住它的证据");
  }
  if (!Array.isArray(report.open_defects)) errors.push("open_defects 必须是数组");
  else if (report.open_defects.length) errors.push("open_defects 非空，页面组不能宣告完成");
  if (report.status !== "pass") errors.push("report.status 必须为 pass；最终状态由验证器重新计算");
  return errors;
}

export function validateFrontendReport({ root, reportPath, taskId }) {
  const config = readFrontendConfig(root);
  const requireCodeBinding = config.receipt_policy === "required";
  const reportFile = resolveInside(root, reportPath, "frontend validation report");
  const { value: report, source } = extractJsonBlock(reportFile, "frontend-validation");
  if (!clean(report.contract_path)) throw new Error("report.contract_path 不能为空");
  const contractFile = resolveInside(root, report.contract_path, "frontend journey contract");
  const { value: contract, source: contractSource } = extractJsonBlock(
    contractFile,
    "frontend-journey-contract",
  );
  const contractSha = sha(contractSource).slice(0, 12);
  const watched = normalizeWatchedPaths(root, contract?.watched_paths, {
    required: requireCodeBinding,
  });
  const contractErrors = validateContract(contract, taskId, watched.errors);
  const reportErrors =
    JOURNEY_SCHEMAS.has(contract?.schema)
      ? validateReportAgainstContract(report, contract, taskId, {
          contractSha,
          requireCodeBinding,
        })
      : [];
  const visibleCopy = JOURNEY_SCHEMAS.has(contract?.schema)
    ? validateVisibleCopyEvidence(root, report, contract, taskId)
    : { errors: [], artifactSha: null, captureCount: 0 };
  const errors = [...contractErrors, ...reportErrors, ...visibleCopy.errors];
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    report,
    contract,
    reportFile,
    contractFile,
    reportSha: sha(source).slice(0, 12),
    contractSha,
    watchedPaths: watched.watchedPaths,
    checkIds: contract.required_checks.map((check) => check.id),
    visibleCopySha: visibleCopy.artifactSha,
    visibleCopyCaptureCount: visibleCopy.captureCount,
  };
}

function parseTableRow(line) {
  const segments = line.split("|");
  let start = segments[0]?.trim() === "" ? 1 : 0;
  let end = segments.at(-1)?.trim() === "" ? segments.length - 1 : segments.length;
  const indexes = [];
  for (let index = start; index < end; index += 1) indexes.push(index);
  return { cells: indexes.map((index) => segments[index].trim()) };
}

function readAcceptanceRows(backlogFile) {
  const lines = readFileSync(backlogFile, "utf8").split("\n");
  const rows = [];
  let columns = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trimStart().startsWith("|")) continue;
    if (/^[|\s:\-]+$/.test(line.trim()) && line.includes("-")) continue;
    const next = lines[index + 1]?.trim() ?? "";
    const row = parseTableRow(line);
    if (/^[|\s:\-]+$/.test(next) && next.includes("-")) {
      columns = {
        id: row.cells.findIndex((cell) => cell.toUpperCase() === "ID"),
        status: row.cells.findIndex((cell) => cell.includes("状态")),
        acceptance: row.cells.findIndex((cell) => cell.includes("验收")),
        document: row.cells.findIndex((cell) => cell.includes("文档")),
      };
      continue;
    }
    // 只审计真正含「状态」列的执行任务表。暂停池/历史索引使用「搁置」等旧表头，
    // 它们不是可完成任务，不能因后来新增的验收列被 retroactive strict 校验。
    if (!columns || columns.id < 0 || columns.status < 0 || !row.cells[columns.id]) continue;
    rows.push({
      id: row.cells[columns.id],
      status: row.cells[columns.status] ?? "",
      acceptance: columns.acceptance >= 0 ? row.cells[columns.acceptance] ?? "" : null,
      document: columns.document >= 0 ? row.cells[columns.document] ?? "" : "",
      hasAcceptanceColumn: columns.acceptance >= 0,
    });
  }
  return rows;
}

function documentHasJourneyContract(root, documentCell) {
  const targets = [...clean(documentCell).matchAll(/\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0])
    .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
  for (const target of targets) {
    try {
      const file = resolveInside(root, target, "task document");
      if (existsSync(file) && readFileSync(file, "utf8").includes("```frontend-journey-contract")) {
        return true;
      }
    } catch {
      // Broken/out-of-root links are handled by their own document checks; they are not evidence of a UI contract.
    }
  }
  return false;
}

function readFrontendConfig(root) {
  const file = path.join(root, "orchestrator", "process", "reconcile.config.json");
  if (!existsSync(file)) return { receipt_policy: "legacy", frontend_verify_commands: {} };
  let config;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`reconcile.config.json 无法安全读取: ${error.message}`);
  }
  const policy = config.receipt_policy ?? "legacy";
  if (!["legacy", "required"].includes(policy)) {
    throw new Error(`reconcile.config.json receipt_policy=${JSON.stringify(policy)} 不合法`);
  }
  if (
    config.frontend_verify_commands != null &&
    (typeof config.frontend_verify_commands !== "object" ||
      Array.isArray(config.frontend_verify_commands))
  ) {
    throw new Error("reconcile.config.json frontend_verify_commands 必须是 object");
  }
  return {
    ...config,
    receipt_policy: policy,
    frontend_verify_commands: config.frontend_verify_commands ?? {},
  };
}

export function executeFrontendVerification({ root, verified }) {
  const config = readFrontendConfig(root);
  if (config.receipt_policy !== "required") {
    return { executed: false, reason: "legacy receipt policy" };
  }
  const key = verified.report.run.verify_key;
  const configured = config.frontend_verify_commands[key];
  if (!clean(configured)) {
    throw new Error(
      `strict 项目缺 frontend_verify_commands[${JSON.stringify(key)}]；不能执行未经 allowlist 的旅程命令`,
    );
  }
  if (configured.trim() !== verified.report.run.command.trim()) {
    throw new Error(`report.run.command 与 frontend_verify_commands[${JSON.stringify(key)}] 不一致`);
  }
  assertGitWorktree(root);
  const head = resolveGitCommit(root, "HEAD", "无法解析当前 HEAD");
  const reportCommit = resolveGitCommit(
    root,
    verified.report.commit_sha,
    `report.commit_sha ${verified.report.commit_sha} 不是当前仓库可解析的 commit`,
  );
  if (reportCommit !== head) {
    throw new Error(
      `strict completion 要求 report.commit_sha 精确等于当前 HEAD；report=${reportCommit}，HEAD=${head}`,
    );
  }
  assertWatchedPathsClean(root, verified.watchedPaths);
  const result = spawnSync("/bin/bash", ["-lc", configured], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) throw new Error(`旅程命令无法启动: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`旅程命令实际退出 ${result.status}:\n${output.slice(-2000)}`);
  }
  const visibleCopy = validateVisibleCopyEvidence(
    root,
    verified.report,
    verified.contract,
    verified.report.task_id,
  );
  if (visibleCopy.errors.length) {
    throw new Error(`旅程命令后的可见文案证据失效:\n${visibleCopy.errors.join("\n")}`);
  }
  const headAfter = resolveGitCommit(root, "HEAD", "旅程命令后无法解析当前 HEAD");
  if (headAfter !== head) {
    throw new Error(`旅程命令执行期间 HEAD 发生变化: ${head} → ${headAfter}`);
  }
  assertWatchedPathsClean(root, verified.watchedPaths);
  return {
    executed: true,
    verifyKey: key,
    commitSha: head,
    contractSha: verified.contractSha,
    watchedPaths: verified.watchedPaths,
    watchedPathsSha: sha(JSON.stringify(verified.watchedPaths)).slice(0, 12),
    commandSha: sha(configured).slice(0, 12),
    outputSha: sha(output).slice(0, 12),
    outputBytes: Buffer.byteLength(output, "utf8"),
  };
}

function readCompletionEvents(root) {
  const file = path.join(root, "orchestrator", "events.ndjson");
  if (!existsSync(file)) return [];
  const events = [];
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`events.ndjson 第 ${index + 1} 行损坏: ${error.message}`);
    }
  }
  return events;
}

export function auditFrontendReceipts({ root, backlogFile }) {
  const errors = [];
  let policy = "legacy";
  let config = { receipt_policy: "legacy", frontend_verify_commands: {} };
  try {
    config = readFrontendConfig(root);
    policy = config.receipt_policy;
  } catch (error) {
    errors.push(error.message);
  }
  let events = [];
  try {
    events = readCompletionEvents(root);
  } catch (error) {
    errors.push(error.message);
  }
  for (const row of readAcceptanceRows(backlogFile)) {
    if (!row.hasAcceptanceColumn) {
      if (policy === "required") errors.push(`${row.id}: strict 项目 BACKLOG 缺少「验收」列`);
      continue;
    }
    const value = clean(row.acceptance);
    if (value === "—") {
      if (documentHasJourneyContract(root, row.document)) {
        errors.push(`${row.id}: linked frontend journey contract 不能以 验收=— 绕过`);
      }
      continue;
    }
    if (value === "待验") {
      if (row.status.includes("✅")) errors.push(`${row.id}: 已完成但验收仍为待验`);
      continue;
    }
    const match = value.match(/^PASS:([a-f0-9]{12})$/);
    if (!match) {
      errors.push(`${row.id}: 验收列值「${value || "(空)"}」不合法`);
      continue;
    }
    const event = [...events]
      .reverse()
      .find((item) => item.task === row.id && item.action === "complete" && item.report_sha);
    if (!event) {
      errors.push(`${row.id}: PASS 验收缺 taskctl completion event`);
      continue;
    }
    if (event.report_sha !== match[1]) {
      errors.push(`${row.id}: BACKLOG 验收 receipt 与 completion event 不一致`);
      continue;
    }
    if (policy === "required" && event.verification_executed !== true) {
      errors.push(`${row.id}: strict UI receipt 没有 taskctl 实际执行旅程命令的记录`);
      continue;
    }
    try {
      const verified = validateFrontendReport({
        root,
        reportPath: event.report,
        taskId: row.id,
      });
      if (verified.reportSha !== match[1]) errors.push(`${row.id}: 验收报告内容 hash 已变化`);
      if (policy === "required") {
        const configured = config.frontend_verify_commands[verified.report.run.verify_key];
        if (!clean(configured) || configured.trim() !== verified.report.run.command.trim()) {
          errors.push(`${row.id}: 当前 frontend verify allowlist 与报告命令不一致`);
        } else if (event.verification_command_sha !== sha(configured).slice(0, 12)) {
          errors.push(`${row.id}: completion event 的命令 hash 与当前 allowlist 不一致`);
        }
        if (!/^[a-f0-9]{12}$/.test(event.verification_output_sha ?? "")) {
          errors.push(`${row.id}: completion event 缺实际命令输出 hash`);
        }
        if (!/^[a-f0-9]{7,64}$/i.test(clean(event.commit_sha))) {
          errors.push(`${row.id}: completion event 缺 report commit 绑定`);
        } else {
          assertGitWorktree(root);
          const reportCommit = resolveGitCommit(
            root,
            verified.report.commit_sha,
            `${row.id}: report.commit_sha 无法解析`,
          );
          const eventCommit = resolveGitCommit(
            root,
            event.commit_sha,
            `${row.id}: completion event commit 无法解析`,
          );
          if (eventCommit !== reportCommit) {
            errors.push(`${row.id}: completion event commit 与 report.commit_sha 不一致`);
          }
          assertWatchedPathsClean(root, verified.watchedPaths);
          const head = resolveGitCommit(root, "HEAD", `${row.id}: 当前 HEAD 无法解析`);
          const changed = changedWatchedPaths(
            root,
            reportCommit,
            head,
            verified.watchedPaths,
          );
          if (changed) {
            errors.push(
              `${row.id}: receipt commit 之后 watched_paths 代码已变化，receipt 失效:\n${changed}`,
            );
          }
        }
      }
    } catch (error) {
      errors.push(`${row.id}: ${error.message}`);
    }
  }
  return errors;
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function main() {
  try {
    const argv = process.argv.slice(2);
    const command = argv[0];
    if (command === "validate") {
      const reportPath = flag(argv, "--report");
      const taskId = flag(argv, "--task");
      if (!reportPath || !taskId) {
        throw new Error("用法: frontend-validation.mjs validate --report <file> --task <task-id>");
      }
      const root = process.cwd();
      const result = validateFrontendReport({ root, reportPath, taskId });
      const execution = argv.includes("--execute")
        ? executeFrontendVerification({ root, verified: result })
        : { executed: false };
      console.log(
        `✓ frontend journey evidence PASS (${taskId}, ${result.reportSha}, ${result.checkIds.length} postconditions${execution.executed ? ", command executed" : ""})`,
      );
    } else if (command === "audit") {
      const backlogFile = path.resolve(process.cwd(), flag(argv, "--backlog") ?? "BACKLOG.md");
      if (!existsSync(backlogFile)) throw new Error(`BACKLOG 不存在: ${backlogFile}`);
      const errors = auditFrontendReceipts({ root: path.dirname(backlogFile), backlogFile });
      if (errors.length) throw new Error(errors.join("\n"));
      if (!argv.includes("--quiet")) console.log("✓ frontend validation receipts PASS");
    } else {
      throw new Error("用法: frontend-validation.mjs <validate|audit> ...");
    }
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) main();
