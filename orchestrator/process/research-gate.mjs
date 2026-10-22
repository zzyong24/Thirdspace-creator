#!/usr/bin/env node
// research-gate.mjs — implementation-time technical blocker circuit breaker.
// State remains in the canonical BACKLOG plus append-only orchestrator/events.ndjson.
// Research cards are evidence, not a second task/decision authority.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..", "..");
const TRIGGER_KINDS = new Set([
  "repeated-failure-family",
  "violated-invariant",
  "high-cost-feedback-loop",
  "unsuccessful-intervention-churn",
  "external-capability-unknown",
  "non-deterministic-behavior",
  "high-impact-uncertainty",
]);
const IMMEDIATE_TRIGGERS = new Set([
  "repeated-failure-family",
  "high-cost-feedback-loop",
  "unsuccessful-intervention-churn",
  "external-capability-unknown",
  "high-impact-uncertainty",
]);
const REQUIRED_PAUSES = [
  "further-production-changes",
  "broadened-workaround",
  "repeated-full-system-runs",
  "irreversible-operations",
];
const HIGH_IMPACTS = new Set([
  "product-direction",
  "ia",
  "data-ownership",
  "security",
  "data-contract",
  "contract",
  "release-criteria",
  "irreversible-operation",
  "material-cost",
]);

function arg(name, argv = process.argv.slice(2)) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}
function safePath(root, relative, label) {
  if (!relative) fail(`${label} 不能为空`);
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${path.sep}`)) fail(`${label} 必须位于项目内: ${relative}`);
  return absolute;
}
function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { fail(`orchestrator/events.ndjson 第 ${index + 1} 行不是合法 JSON`); }
  });
}
function activeOpenEvent(events, taskId) {
  let open = null;
  for (const event of events) {
    if (event.task !== taskId) continue;
    if (event.action === "research_open") open = event;
    if (event.action === "research_resume") open = null;
  }
  return open;
}
function appendEvent(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), actor: "research-gate", ...event })}\n`);
}
function parseBacklog(src) {
  const lines = src.split("\n");
  let columns = null;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const next = lines[i + 1] ?? "";
    if (next.trimStart().startsWith("|") && /^[|\s:\-]+$/.test(next.trim())) {
      columns = {
        id: cells.findIndex((cell) => cell.toUpperCase() === "ID"),
        status: cells.findIndex((cell) => cell.includes("状态")),
      };
      continue;
    }
    if (columns?.id >= 0 && columns?.status >= 0) rows.push({ lineNo: i, cells, columns });
  }
  return { lines, rows };
}
function taskRow(backlogFile, taskId) {
  if (!fs.existsSync(backlogFile)) fail(`找不到 BACKLOG.md`);
  const src = fs.readFileSync(backlogFile, "utf8");
  const parsed = parseBacklog(src);
  const matches = parsed.rows.filter((row) => row.cells[row.columns.id] === taskId);
  if (matches.length !== 1) fail(`BACKLOG.md 中任务 ${taskId} 必须且只能出现一次`);
  return { src, ...parsed, row: matches[0] };
}
function taskStatus(backlogFile, taskId) {
  const { row } = taskRow(backlogFile, taskId);
  return row.cells[row.columns.status];
}
function setTaskStatus(backlogFile, taskId, fromAllowed, to) {
  const state = taskRow(backlogFile, taskId);
  const { row } = state;
  const current = row.cells[row.columns.status];
  if (!fromAllowed.some((item) => current.includes(item))) {
    fail(`任务 ${taskId} 当前状态「${current}」不能转为 ${to}`);
  }
  const segments = state.lines[row.lineNo].split("|");
  const segmentIndex = row.columns.status + 1;
  segments[segmentIndex] = segments[segmentIndex].replace(/📋|🔨|✅|⏸️?|⛔/, to);
  state.lines[row.lineNo] = segments.join("|");
  const tmp = `${backlogFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, state.lines.join("\n"));
  fs.renameSync(tmp, backlogFile);
}
function parseCard(cardFile) {
  if (!fs.existsSync(cardFile)) fail(`研究卡不存在: ${cardFile}`);
  const text = fs.readFileSync(cardFile, "utf8");
  if (/```research-first-gate\/v1\b/.test(text)) {
    fail(`研究卡仍是 research-first-gate/v1；旧版把具体技术案例写进了框架，必须迁移为 v2 后才能审计或恢复`);
  }
  const match = text.match(/```research-first-gate\/v2\s*\n([\s\S]*?)\n```/);
  if (!match) fail(`研究卡缺少 research-first-gate/v2 结构化区块`);
  let card;
  try { card = JSON.parse(match[1]); }
  catch (error) { fail(`研究卡结构化区块不是合法 JSON: ${error.message}`); }
  if (card.schema !== "research-first-gate/v2") fail(`研究卡 schema 必须为 research-first-gate/v2`);
  return { card, text, hash: sha256(text) };
}
function nonEmptyArray(value) { return Array.isArray(value) && value.length > 0; }
function researchVerifyCommands(root) {
  const file = path.join(root, "orchestrator", "process", "reconcile.config.json");
  if (!fs.existsSync(file)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value.research_verify_commands && typeof value.research_verify_commands === "object" && !Array.isArray(value.research_verify_commands)
      ? value.research_verify_commands : {};
  } catch (error) { fail(`reconcile.config.json 无法读取 research_verify_commands: ${error.message}`); }
}
function validateCompleteCard(root, card) {
  const errors = [];
  const verifyCommands = researchVerifyCommands(root);
  const verificationKeys = new Set();
  if (card.status !== "validated") errors.push("status 必须为 validated；researching/candidate 不能恢复实现");
  if (!card.problem_statement?.trim()) errors.push("problem_statement 不能为空");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.failure_family ?? "")) errors.push("failure_family 必须是项目自定义的稳定 kebab-case 问题族");
  if (!card.observed_invariant?.trim()) errors.push("observed_invariant/被违反的不变量不能为空");
  if (!nonEmptyArray(card.trigger_kinds)) errors.push("trigger_kinds 不能为空");
  for (const trigger of card.trigger_kinds ?? []) if (!TRIGGER_KINDS.has(trigger)) errors.push(`未知 trigger_kind: ${trigger}`);
  for (const pause of REQUIRED_PAUSES) if (!card.paused_actions?.includes(pause)) errors.push(`paused_actions 缺 ${pause}`);
  if (!nonEmptyArray(card.evidence?.authoritative)) errors.push("authoritative/权威依据不能为空");
  if (!nonEmptyArray(card.evidence?.local)) errors.push("local/当前系统证据不能为空");
  if (!nonEmptyArray(card.evidence?.experiments)) errors.push("experiments/最小区分性实验不能为空");
  if (!Array.isArray(card.options) || card.options.length < 2) errors.push("options/候选方案至少两个并写取舍");
  for (const source of card.evidence?.authoritative ?? []) {
    const allowedKind = ["official-doc", "standard", "source-code", "approved-spec"].includes(source.kind);
    const isUrl = /^https?:\/\//.test(source.ref ?? "");
    let validLocal = false;
    if (!isUrl && source.ref) {
      try { validLocal = fs.existsSync(safePath(root, source.ref, "authoritative.ref")); }
      catch (error) { errors.push(error.message); }
    }
    if (!allowedKind || (!isUrl && !validLocal) || !source.claim?.trim()) errors.push("每条权威依据必须含 kind、可验证 URL/项目路径与具体 claim");
  }
  for (const local of card.evidence?.local ?? []) {
    let file = null;
    try { file = safePath(root, local.path, "local.path"); }
    catch (error) { errors.push(error.message); }
    if (!file || !fs.existsSync(file) || !local.kind?.trim() || !local.locator?.trim() || !local.observation?.trim()) errors.push("每条当前系统证据必须绑定 kind、存在的项目路径、locator 与 observation");
  }
  for (const option of card.options ?? []) {
    if (!option.id?.trim() || !option.outcome?.trim() || !option.tradeoffs?.trim() || !option.scope?.trim() || !option.falsified_by?.trim()) errors.push("每个候选 option 必须含 id/outcome/tradeoffs/scope/falsified_by");
  }
  if (!card.recommendation || !card.options?.some((option) => option.id === card.recommendation)) errors.push("recommendation 必须引用一个候选方案 ID");
  const validation = card.validation ?? {};
  if (!(Number.isInteger(validation.timebox_minutes) && validation.timebox_minutes >= 1 && validation.timebox_minutes <= 240)) errors.push("validation.timebox_minutes 必须为 1..240");
  if (!(Number.isInteger(validation.max_experiments) && validation.max_experiments >= 1 && validation.max_experiments <= 2)) errors.push("validation.max_experiments 必须为 1..2");
  if ((card.evidence?.experiments?.length ?? 0) > (validation.max_experiments ?? 0)) errors.push("实际 experiments 数量不得超过 validation.max_experiments");
  if (!Array.isArray(validation.acceptance_criteria) || validation.acceptance_criteria.length < 2) errors.push("acceptance_criteria 至少两个，并由项目定义实际指标");
  for (const criterion of validation.acceptance_criteria ?? []) {
    let evidence = null;
    try { evidence = safePath(root, criterion.evidence_path, "acceptance_criteria.evidence_path"); }
    catch (error) { errors.push(error.message); }
    const expectedHash = criterion.evidence_sha256 ?? "";
    if (!criterion.name?.trim() || !criterion.target?.trim() || !criterion.measurement?.trim() || !criterion.observed?.trim() || !criterion.verify_key?.trim() || !evidence || !fs.existsSync(evidence) || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
      errors.push("每个 acceptance criterion 必须含 name/target/measurement/observed/verify_key，并绑定 evidence_path + evidence_sha256");
    } else if (sha256(fs.readFileSync(evidence)) !== expectedHash.toLowerCase()) {
      errors.push(`acceptance evidence hash 不匹配: ${criterion.evidence_path}`);
    }
    if (criterion.verify_key?.trim()) {
      verificationKeys.add(criterion.verify_key);
      if (!String(verifyCommands[criterion.verify_key] ?? "").trim()) errors.push(`research_verify_commands 缺 ${criterion.verify_key}`);
    }
  }
  if (!validation.resume_criteria?.trim()) errors.push("validation.resume_criteria 不能为空");
  for (const experiment of card.evidence?.experiments ?? []) {
    let artifact = null;
    try { artifact = safePath(root, experiment.artifact_path, "experiment.artifact_path"); }
    catch (error) { errors.push(error.message); }
    const expected = experiment.artifact_sha256 ?? "";
    if (!experiment.question?.trim() || !experiment.command?.trim() || !experiment.environment?.trim() || !experiment.result?.trim() || !artifact || !fs.existsSync(artifact) || !/^[a-f0-9]{64}$/i.test(expected)) {
      errors.push("每个 experiment 必须含 question/command/environment/result，并绑定存在的 artifact_path + artifact_sha256");
    } else if (sha256(fs.readFileSync(artifact)) !== expected) {
      errors.push(`experiment artifact hash 不匹配: ${experiment.artifact_path}`);
    }
  }
  if (!nonEmptyArray(card.decision_impacts)) errors.push("decision_impacts 不能为空；无高影响变化时显式写 none");
  if (card.decision_impacts?.includes("none") && card.decision_impacts.length !== 1) errors.push("decision_impacts 的 none 不能与其他影响并列");
  for (const impact of card.decision_impacts ?? []) if (impact !== "none" && !HIGH_IMPACTS.has(impact)) errors.push(`未知 decision impact: ${impact}`);
  if (errors.length) fail(`研究卡尚不能恢复实现:\n- ${errors.join("\n- ")}`);
  for (const key of verificationKeys) {
    const command = String(verifyCommands[key]);
    const result = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", timeout: 240_000, maxBuffer: 1024 * 1024 });
    if (result.status !== 0) {
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-1200);
      fail(`研究验收命令 ${key} 现场验证失败 (exit ${result.status ?? "signal"})${output ? `:\n${output}` : ""}`);
    }
  }
}
function decisionEntry(log, id) {
  const starts = [...log.matchAll(/^ID:\s*(DEC-[A-Za-z0-9._-]+)\s*$/gm)];
  const hit = starts.find((match) => match[1] === id);
  if (!hit) return null;
  const next = starts.find((match) => match.index > hit.index);
  return log.slice(hit.index, next?.index ?? log.length);
}
function validateDecision(root, card, suppliedDecision) {
  const high = (card.decision_impacts ?? []).filter((impact) => HIGH_IMPACTS.has(impact));
  if (!high.length) return [];
  const ids = card.decision_ids ?? [];
  if (!ids.length || !suppliedDecision || !ids.includes(suppliedDecision)) {
    fail(`研究建议影响 ${high.join(", ")}，必须引用卡内 Decision Record 并等待用户确认`);
  }
  const logFile = path.join(root, "orchestrator", "DECISION_LOG.md");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  const entry = decisionEntry(log, suppliedDecision);
  if (!entry || !/^Owner:\s*user\s*$/m.test(entry) || !/^Status:\s*active\s*$/m.test(entry) || !/^Source:\s*.*user/im.test(entry)) {
    fail(`${suppliedDecision} 尚未形成可恢复实现的用户确认:需要 Owner: user、Status: active 与明确 user confirmation Source；needs-user-confirmation/agent 候选不算批准`);
  }
  return [suppliedDecision];
}

export function auditResearchGates(root) {
  const eventsFile = path.join(root, "orchestrator", "events.ndjson");
  const backlogFile = path.join(root, "BACKLOG.md");
  const events = readEvents(eventsFile);
  const openByTask = new Map();
  for (const event of events) {
    if (event.action === "research_open") openByTask.set(event.task, event);
    if (event.action === "research_resume") openByTask.delete(event.task);
  }
  const errors = [];
  for (const [taskId, event] of openByTask) {
    try {
      const status = taskStatus(backlogFile, taskId);
      if (!status.includes("⏸")) errors.push(`${taskId} 有 OPEN 研究门但状态不是 ⏸️`);
      taskRow(backlogFile, event.research_task);
      parseCard(safePath(root, event.card, "card"));
    } catch (error) { errors.push(error.message); }
  }
  return { ok: errors.length === 0, errors, open: [...openByTask.keys()] };
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const taskId = argv[1];
  const root = path.resolve(arg("--root", argv) ?? DEFAULT_ROOT);
  const backlogFile = path.join(root, "BACKLOG.md");
  const eventsFile = path.join(root, "orchestrator", "events.ndjson");
  if (command === "audit") {
    const result = auditResearchGates(root);
    if (!result.ok) fail(`Research-First Gate 审计失败:\n- ${result.errors.join("\n- ")}`);
    console.log(result.open.length ? `✓ 研究门有效暂停: ${result.open.join(", ")}` : "✓ 无未关闭 Research-First Gate");
    return;
  }
  if (!taskId || taskId.startsWith("--")) fail(`用法: research-gate.mjs <observe|resume|audit> <T-ID> ...`);
  if (command === "observe") {
    if (arg("--class", argv)) fail(`--class 属于 research-first-gate/v1，已移除；请用项目自定义 --family 与通用 --trigger`);
    const failureFamily = arg("--family", argv);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(failureFamily ?? "")) fail(`--family 必须是项目自定义的稳定 kebab-case 问题族`);
    const triggerKind = arg("--trigger", argv);
    if (!TRIGGER_KINDS.has(triggerKind)) fail(`--trigger 必须为 ${[...TRIGGER_KINDS].join(" | ")}`);
    const evidenceRel = arg("--evidence", argv);
    const evidenceFile = safePath(root, evidenceRel, "evidence");
    if (!fs.existsSync(evidenceFile)) fail(`失败证据不存在: ${evidenceRel}`);
    const researchTask = arg("--research-task", argv);
    taskRow(backlogFile, researchTask);
    const cardRel = arg("--card", argv);
    const { card } = parseCard(safePath(root, cardRel, "card"));
    if (card.task_id !== taskId || card.research_task_id !== researchTask) fail(`研究卡 task_id/research_task_id 与命令不一致`);
    if (card.failure_family !== failureFamily) fail(`研究卡 failure_family 必须与 --family 一致`);
    if (!card.trigger_kinds?.includes(triggerKind)) fail(`研究卡 trigger_kinds 必须包含本次 --trigger`);
    const events = readEvents(eventsFile);
    const lastResume = events.findLastIndex((event) => event.action === "research_resume" && event.task === taskId);
    const activeEvents = events.slice(lastResume + 1);
    const prior = activeEvents.filter((event) => event.action === "research_observation" && event.task === taskId && event.failure_family === failureFamily).length;
    const priorTechnical = activeEvents.filter((event) => event.action === "research_observation" && event.task === taskId).length;
    appendEvent(eventsFile, {
      action: "research_observation",
      task: taskId,
      failure_family: failureFamily,
      trigger_kind: triggerKind,
      evidence: evidenceRel,
      evidence_sha256: sha256(fs.readFileSync(evidenceFile)),
      cost: arg("--cost", argv) ?? "normal",
    });
    const shouldOpen = priorTechnical + 1 >= 2 || IMMEDIATE_TRIGGERS.has(triggerKind);
    if (!shouldOpen) {
      console.log(`✓ 已记录 ${taskId} 的第 ${prior + 1} 次 ${failureFamily}/${triggerKind}；再次技术干预仍无进展将触发研究门`);
      return;
    }
    if (!activeOpenEvent(events, taskId)) {
      setTaskStatus(backlogFile, taskId, ["📋", "🔨"], "⏸️");
      appendEvent(eventsFile, { action: "research_open", task: taskId, research_task: researchTask, card: cardRel, failure_family: failureFamily, trigger_kind: triggerKind });
    }
    console.error(`RESEARCH_REQUIRED: ${taskId} 已进入研究门；暂停继续改生产实现、扩大 workaround、重复全量运行与不可逆操作。`);
    process.exitCode = 2;
    return;
  }
  if (command === "resume") {
    const cardRel = arg("--card", argv);
    const parsed = parseCard(safePath(root, cardRel, "card"));
    if (parsed.card.task_id !== taskId) fail(`研究卡 task_id 与 ${taskId} 不一致`);
    const open = activeOpenEvent(readEvents(eventsFile), taskId);
    if (!open) fail(`${taskId} 没有可恢复的 research_open 事件`);
    if (open.card !== cardRel || open.research_task !== parsed.card.research_task_id) {
      fail(`resume 必须绑定最近 research_open 的同一张卡与 research task；当前 open=${open.card}/${open.research_task}`);
    }
    if (open.failure_family && open.failure_family !== parsed.card.failure_family) fail(`研究卡 failure_family 与 research_open lineage 不一致`);
    if (open.trigger_kind && !parsed.card.trigger_kinds?.includes(open.trigger_kind)) fail(`研究卡 trigger_kinds 未保留 research_open 的触发形状`);
    validateCompleteCard(root, parsed.card);
    const decisions = validateDecision(root, parsed.card, arg("--decision", argv));
    setTaskStatus(backlogFile, taskId, ["⏸"], "📋");
    appendEvent(eventsFile, { action: "research_resume", task: taskId, card: cardRel, card_sha256: parsed.hash, decisions });
    console.log(`✓ ${taskId} 的有界研究与必要用户决策已闭合，回到 📋；需重新按看板和审核门开工。`);
    return;
  }
  fail(`未知命令 ${command ?? ""}；使用 observe | resume | audit`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); }
  catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(error.exitCode ?? 1);
  }
}
