#!/usr/bin/env node
// Deterministic SPEC review ledger.
//
// `record` validates one reviewer packet, computes the verdict, replaces the
// human-facing current snapshot, appends the full round to a hash-chained log,
// and writes a receipt into BACKLOG.md.
//
// `audit` is the CI/manual-edit backstop. It verifies receipt/state hashes and
// the append-only event chain. It cannot prevent arbitrary shell writes; it
// makes those writes detectable when reconcile runs.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireStateLock } from "./state-lock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const ENUMS = {
  severity: ["blocker", "major", "minor"],
  category: [
    "correctness",
    "completeness",
    "consistency",
    "security",
    "data-integrity",
    "operability",
    "testability",
    "scope",
  ],
  status: ["open", "resolved"],
  evidence_kind: [
    "spec-contradiction",
    "deterministic-check",
    "runtime-observation",
    "external-fact",
  ],
  risk_class: [
    "confirmed-requirement",
    "security",
    "data-loss",
    "irreversibility",
    "low-risk",
    "preference",
  ],
  disposition: ["mitigate", "accept", "avoid", "escalate", "probe", "future"],
  remedy_type: ["constraint", "clarify", "remove", "probe", "risk-decision", "future"],
  scope_effect: ["none", "narrowing", "expansion"],
  origin: ["baseline", "changed-lines", "new-evidence", "late-critical"],
};

const REQUIRED_TEXT = [
  "id",
  "where",
  "failure_mode",
  "evidence_ref",
  "origin_ref",
  "suggestion",
];

const FINDING_FIELDS = new Set([
  "id",
  "status",
  "severity",
  "category",
  "requirement_anchor",
  "acceptance_anchor",
  "where",
  "failure_mode",
  "evidence_kind",
  "evidence_ref",
  "risk_class",
  "disposition",
  "remedy_type",
  "scope_effect",
  "origin",
  "origin_ref",
  "suggestion",
  "resolution_evidence",
  "parent_id",
  "probe",
]);
const MUTABLE_RECHECK_FIELDS = new Set(["status", "severity", "resolution_evidence"]);
const FROZEN_FIELDS = [...FINDING_FIELDS].filter((field) => !MUTABLE_RECHECK_FIELDS.has(field));
const LINE_REF_PATTERN = /^(SPEC|CONSTITUTION)-LINE:(\d+):([a-f0-9]{16})$/;
const EVIDENCE_REF_PATTERN = /^EVIDENCE-SHA256:([a-f0-9]{64}):(.+)$/;
const LINE_FINGERPRINT_ALGORITHM = "sha256-64/semantic-line/v2";

const severityRank = { minor: 1, major: 2, blocker: 3 };
const receiptPattern = /^(PASS|CONCERNS|FAIL)\[REV:([a-f0-9]{12})\]$/;

function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return sha(stable(value));
}

function logicalLines(text) {
  return text.split(/\r?\n/);
}

function lineFingerprint(line) {
  // Formatting-only edits must not manufacture a legal recheck origin.
  // Markdown indentation is irrelevant to the review claim; collapse it before
  // fingerprinting while retaining punctuation and wording changes.
  const semantic = line.trim().replace(/[ \t]+/g, " ");
  return sha(semantic).slice(0, 16);
}

function lineFingerprints(text) {
  return logicalLines(text).map(lineFingerprint);
}

function changedLineReferences(previousEvent, currentText) {
  if (
    previousEvent.spec_line_fingerprint_algorithm !== LINE_FINGERPRINT_ALGORITHM ||
    !Array.isArray(previousEvent.spec_line_fingerprints)
  ) {
    return null;
  }
  const previous = new Set(previousEvent.spec_line_fingerprints);
  return logicalLines(currentText).flatMap((line, index) => {
    const fingerprint = lineFingerprint(line);
    if (!cleanText(line) || previous.has(fingerprint)) return [];
    return [
      {
        origin_ref: `SPEC-LINE:${index + 1}:${fingerprint}`,
        text: cleanText(line),
      },
    ];
  });
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

function resolveInside(root, value, label) {
  const unresolved = path.resolve(root, value);
  const absolute = existsSync(unresolved)
    ? realpathSync(unresolved)
    : path.join(realpathSync(path.dirname(unresolved)), path.basename(unresolved));
  if (!inside(root, absolute)) throw new Error(`${label} 必须位于项目根目录内: ${value}`);
  return absolute;
}

function relativePortable(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function atomicWrite(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function extractState(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const match = text.match(/```spec-review-state\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`${relativePortable(path.dirname(file), file)} 缺 spec-review-state JSON block`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`review current snapshot JSON 无法解析: ${error.message}`);
  }
}

export function readReviewConfig(root) {
  const file = path.join(root, "orchestrator", "process", "reconcile.config.json");
  if (!existsSync(file)) return { receipt_policy: "legacy" };
  try {
    const value = { receipt_policy: "legacy", ...JSON.parse(readFileSync(file, "utf8")) };
    if (!["legacy", "required"].includes(value.receipt_policy)) {
      throw new Error(`receipt_policy=${JSON.stringify(value.receipt_policy)} 不合法`);
    }
    return value;
  } catch (error) {
    throw new Error(`reconcile.config.json 无法安全读取: ${error.message}`);
  }
}

function parseRow(line) {
  const segments = line.split("|");
  let start = segments[0]?.trim() === "" ? 1 : 0;
  let end = segments.at(-1)?.trim() === "" ? segments.length - 1 : segments.length;
  const indexes = [];
  for (let index = start; index < end; index += 1) indexes.push(index);
  return { segments, indexes, cells: indexes.map((index) => segments[index].trim()) };
}

function isTableRow(line) {
  return line.trimStart().startsWith("|");
}

function isSeparator(line) {
  const value = line.trim();
  return isTableRow(line) && value.includes("-") && /^[|\s:\-]+$/.test(value);
}

export function readBacklog(backlogFile) {
  const lines = readFileSync(backlogFile, "utf8").split("\n");
  const tasks = [];
  let columns = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!isTableRow(lines[lineIndex]) || isSeparator(lines[lineIndex])) continue;
    const row = parseRow(lines[lineIndex]);
    if (isSeparator(lines[lineIndex + 1] ?? "")) {
      columns = {
        id: row.cells.findIndex((cell) => cell.toUpperCase() === "ID"),
        status: row.cells.findIndex((cell) => cell.includes("状态")),
        document: row.cells.findIndex((cell) => cell.includes("文档")),
        review: row.cells.findIndex((cell) => cell.includes("审核")),
        acceptance: row.cells.findIndex((cell) => cell.includes("验收")),
      };
      continue;
    }
    if (!columns || columns.id < 0 || !row.cells[columns.id]) continue;
    tasks.push({
      id: row.cells[columns.id],
      status: columns.status >= 0 ? row.cells[columns.status] : "",
      document: columns.document >= 0 ? row.cells[columns.document] : "",
      review: columns.review >= 0 ? row.cells[columns.review] : "",
      acceptance: columns.acceptance >= 0 ? row.cells[columns.acceptance] : null,
      lineIndex,
      row,
      columns,
    });
  }
  return { lines, tasks };
}

function markdownTargets(cell) {
  return [...cleanText(cell).matchAll(/\]\(([^)]+)\)/g)].map((match) =>
    match[1].trim().replace(/^<|>$/g, ""),
  ).filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#"))
    .map((target) => target.split("#", 1)[0].split("?", 1)[0]);
}

function adjacentReviewPath(specFile) {
  const extension = path.extname(specFile);
  return extension
    ? `${specFile.slice(0, -extension.length)}.review${extension}`
    : `${specFile}.review.md`;
}

function setBacklogReview(backlogFile, taskId, value) {
  const parsed = readBacklog(backlogFile);
  const matches = parsed.tasks.filter((task) => task.id === taskId);
  if (matches.length !== 1) {
    throw new Error(`BACKLOG 中任务 ${taskId} 必须且只能出现一次（实际 ${matches.length} 次）`);
  }
  const task = matches[0];
  if (task.columns.review < 0) throw new Error("BACKLOG 表缺少「审核」列");
  const segmentIndex = task.row.indexes[task.columns.review];
  const original = task.row.segments[segmentIndex];
  const left = original.match(/^\s*/)?.[0] ?? " ";
  const right = original.match(/\s*$/)?.[0] ?? " ";
  task.row.segments[segmentIndex] = `${left}${value}${right}`;
  parsed.lines[task.lineIndex] = task.row.segments.join("|");
  atomicWrite(backlogFile, parsed.lines.join("\n"));
}

function requireEnum(finding, key, errors) {
  if (!ENUMS[key].includes(finding[key])) {
    errors.push(`${finding.id || "(missing id)"}: ${key}=${JSON.stringify(finding[key])} 不合法`);
  }
}

function validateAnchor(finding, key, errors) {
  const anchor = finding[key];
  if (!anchor || typeof anchor !== "object" || !cleanText(anchor.id) || !cleanText(anchor.quote)) {
    errors.push(`${finding.id || "(missing id)"}: ${key} 必须含非空 id + quote`);
  } else {
    for (const field of Object.keys(anchor)) {
      if (!["id", "quote"].includes(field)) {
        errors.push(`${finding.id}: ${key} 含未知字段 ${field}`);
      }
    }
  }
}

function validateFinding(finding) {
  const errors = [];
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) return ["finding 必须是 object"];
  for (const key of Object.keys(finding)) {
    if (!FINDING_FIELDS.has(key)) errors.push(`${finding.id || "(missing id)"}: 未知字段 ${key}`);
  }
  for (const key of REQUIRED_TEXT) {
    if (!cleanText(finding[key])) errors.push(`${finding.id || "(missing id)"}: ${key} 不能为空`);
  }
  for (const key of ["resolution_evidence", "parent_id"]) {
    if (typeof finding[key] !== "string") {
      errors.push(`${finding.id || "(missing id)"}: ${key} 必须是 string（可为空）`);
    }
  }
  if (!/^REV-\d{3,}$/.test(cleanText(finding.id))) {
    errors.push(`${finding.id || "(missing id)"}: id 必须是 REV-001 形式`);
  }
  for (const key of Object.keys(ENUMS)) requireEnum(finding, key, errors);
  validateAnchor(finding, "requirement_anchor", errors);
  validateAnchor(finding, "acceptance_anchor", errors);
  if (finding.status === "resolved" && !cleanText(finding.resolution_evidence)) {
    errors.push(`${finding.id}: resolved 必须提供 resolution_evidence`);
  }
  if (finding.status === "open" && cleanText(finding.resolution_evidence)) {
    errors.push(`${finding.id}: open finding 不得伪带 resolution_evidence`);
  }
  if (
    finding.severity === "blocker" &&
    !["confirmed-requirement", "security", "data-loss", "irreversibility"].includes(finding.risk_class)
  ) {
    errors.push(`${finding.id}: blocker 必须锚定已确认需求、安全、数据丢失或不可逆风险`);
  }
  if (
    finding.severity === "major" &&
    ["preference", "low-risk"].includes(finding.risk_class)
  ) {
    errors.push(`${finding.id}: 偏好/低风险不能升级为 major`);
  }
  if (
    finding.scope_effect === "expansion" &&
    !(finding.severity === "minor" && finding.disposition === "future")
  ) {
    errors.push(`${finding.id}: 新增范围只能作为 minor/future 建议，不能成为通过条件`);
  }
  if (finding.disposition === "probe") {
    const probe = finding.probe;
    if (!probe || typeof probe !== "object" || Array.isArray(probe)) {
      errors.push(`${finding.id}: disposition=probe 必须提供 bounded probe`);
    } else {
      const allowedProbeFields = new Set([
        "question",
        "timebox_minutes",
        "allowed_write_globs",
        "forbidden_operations",
        "teardown",
        "evidence_expected",
      ]);
      for (const key of Object.keys(probe)) {
        if (!allowedProbeFields.has(key)) errors.push(`${finding.id}: probe 含未知字段 ${key}`);
      }
      for (const key of ["question", "teardown", "evidence_expected"]) {
        if (!cleanText(probe[key])) errors.push(`${finding.id}: probe.${key} 不能为空`);
      }
      if (!(Number.isInteger(probe.timebox_minutes) && probe.timebox_minutes > 0 && probe.timebox_minutes <= 240)) {
        errors.push(`${finding.id}: probe.timebox_minutes 必须为 1..240`);
      }
      if (!Array.isArray(probe.allowed_write_globs) || !probe.allowed_write_globs.length) {
        errors.push(`${finding.id}: probe.allowed_write_globs 至少一项`);
      }
      if (!Array.isArray(probe.forbidden_operations) || !probe.forbidden_operations.length) {
        errors.push(`${finding.id}: probe.forbidden_operations 至少一项`);
      }
    }
  } else if (finding.probe != null) {
    errors.push(`${finding.id}: 只有 disposition=probe 可带 probe 字段`);
  }
  return errors;
}

function verifyLineReference(value, documents, allowedKinds) {
  const match = cleanText(value).match(LINE_REF_PATTERN);
  if (!match) {
    return {
      error:
        `origin_ref 必须是 SPEC-LINE:<line>:<16hex> 或 ` +
        `CONSTITUTION-LINE:<line>:<16hex> 可验证行锚点`,
    };
  }
  const [, kind, lineText, claimed] = match;
  if (!allowedKinds.includes(kind)) {
    return { error: `origin_ref 此处只能引用 ${allowedKinds.join(" / ")} 行` };
  }
  const lineNumber = Number(lineText);
  const lines = logicalLines(documents[kind]);
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) {
    return { error: `${kind}-LINE 行号越界: ${lineNumber}` };
  }
  const line = lines[lineNumber - 1];
  if (!cleanText(line)) return { error: `${kind}-LINE:${lineNumber} 不得引用空行` };
  const actual = lineFingerprint(line);
  if (claimed !== actual) {
    return {
      error: `${kind}-LINE:${lineNumber} 指纹不匹配: ${claimed} != ${actual}`,
    };
  }
  return { kind, lineNumber, fingerprint: actual, line };
}

function verifyEvidenceReference(root, value) {
  const match = cleanText(value).match(EVIDENCE_REF_PATTERN);
  if (!match) {
    return {
      error:
        "origin_ref 必须用 EVIDENCE-SHA256:<64hex>:<project-relative-path> 绑定项目内证据文件",
    };
  }
  const [, claimed, relativePath] = match;
  let file;
  try {
    file = resolveInside(root, relativePath, "证据文件");
  } catch (error) {
    return { error: error.message };
  }
  if (!existsSync(file)) return { error: `证据文件不存在: ${relativePath}` };
  if (!statSync(file).isFile()) return { error: `证据路径不是文件: ${relativePath}` };
  const actual = sha(readFileSync(file));
  if (claimed !== actual) {
    return { error: `证据文件 sha256 不匹配: ${claimed} != ${actual}` };
  }
  return { file, relativePath, sha256: actual };
}

function validateNewFindingOrigin(
  finding,
  { root, previousEvent, specSha, specText, constitutionText },
) {
  const errors = [];
  const documents = { SPEC: specText, CONSTITUTION: constitutionText };
  if (finding.origin === "changed-lines") {
    if (previousEvent.spec_sha256 === specSha) {
      errors.push(`${finding.id}: changed-lines 要求 SPEC 相对上一轮确有变化`);
      return errors;
    }
    const reference = verifyLineReference(finding.origin_ref, documents, ["SPEC"]);
    if (reference.error) {
      errors.push(`${finding.id}: changed-lines ${reference.error}`);
      return errors;
    }
    if (
      previousEvent.spec_line_fingerprint_algorithm !== LINE_FINGERPRINT_ALGORITHM ||
      !Array.isArray(previousEvent.spec_line_fingerprints)
    ) {
      errors.push(
        `${finding.id}: 上一轮缺少可验证行指纹清单，不能把自报 diff 作为 changed-lines 新门柱`,
      );
      return errors;
    }
    if (previousEvent.spec_line_fingerprints.includes(reference.fingerprint)) {
      errors.push(
        `${finding.id}: ${finding.origin_ref} 的具体文本上一轮已存在，不是新增/修改行`,
      );
    }
    return errors;
  }

  if (finding.origin === "new-evidence") {
    if (
      !["deterministic-check", "runtime-observation", "external-fact"].includes(
        finding.evidence_kind,
      )
    ) {
      errors.push(`${finding.id}: new-evidence 必须来自确定性检查、运行观察或外部事实`);
      return errors;
    }
    const reference = verifyEvidenceReference(root, finding.origin_ref);
    if (reference.error) errors.push(`${finding.id}: new-evidence ${reference.error}`);
    return errors;
  }

  if (finding.origin === "late-critical") {
    if (
      finding.severity !== "blocker" ||
      !["security", "data-loss", "irreversibility"].includes(finding.risk_class)
    ) {
      errors.push(
        `${finding.id}: late-critical 只允许 blocker 级安全、数据丢失或不可逆风险`,
      );
      return errors;
    }
    if (cleanText(finding.origin_ref).startsWith("EVIDENCE-SHA256:")) {
      const reference = verifyEvidenceReference(root, finding.origin_ref);
      if (reference.error) errors.push(`${finding.id}: late-critical ${reference.error}`);
    } else {
      const reference = verifyLineReference(
        finding.origin_ref,
        documents,
        ["SPEC", "CONSTITUTION"],
      );
      if (reference.error) errors.push(`${finding.id}: late-critical ${reference.error}`);
    }
    return errors;
  }

  errors.push(
    `${finding.id}: 复审新增 finding 的 origin 仅可为 changed-lines / new-evidence / late-critical`,
  );
  return errors;
}

function validatePacket(packet, previousEvent, validationContext) {
  const { specSha } = validationContext;
  const errors = [];
  if (!packet || packet.schema !== "spec-review-round/v2") {
    return ["schema 必须为 spec-review-round/v2"];
  }
  for (const key of Object.keys(packet)) {
    if (!["schema", "review_kind", "summary", "findings"].includes(key)) {
      errors.push(`review packet 未知字段 ${key}`);
    }
  }
  if (!["initial", "recheck"].includes(packet.review_kind)) {
    errors.push("review_kind 必须为 initial 或 recheck");
  }
  if (!cleanText(packet.summary)) errors.push("summary 不能为空");
  if (!Array.isArray(packet.findings)) errors.push("findings 必须是数组");
  if (errors.length) return errors;

  const seen = new Set();
  for (const finding of packet.findings) {
    errors.push(...validateFinding(finding));
    if (seen.has(finding.id)) errors.push(`${finding.id}: 同一轮重复`);
    seen.add(finding.id);
  }

  if (!previousEvent) {
    if (packet.review_kind !== "initial") errors.push("首轮必须是 initial 完整审核");
    for (const finding of packet.findings) {
      if (finding.origin !== "baseline") {
        errors.push(`${finding.id}: 首轮 finding 的 origin 必须是 baseline`);
      }
    }
    return errors;
  }

  if (packet.review_kind !== "recheck") errors.push("已有审核历史后只能 record recheck");
  if (previousEvent.round >= 3) {
    errors.push("已达到 3 轮上限；不得重置轮次或继续移动门柱，必须由用户做风险/范围决定");
    return errors;
  }

  const previous = new Map(previousEvent.packet.findings.map((finding) => [finding.id, finding]));
  for (const [id, before] of previous) {
    const after = packet.findings.find((finding) => finding.id === id);
    if (!after) {
      errors.push(`${id}: 复审必须显式携带并销账每个既有 finding`);
      continue;
    }
    for (const key of FROZEN_FIELDS) {
      if (stable(before[key]) !== stable(after[key])) {
        errors.push(`${id}: 复审不得改写既有 finding 的 ${key}（通过条件已冻结）`);
      }
    }
    if (severityRank[after.severity] > severityRank[before.severity]) {
      errors.push(`${id}: 复审不得提高既有 finding 严重度`);
    }
    if (before.status === "resolved" && after.status !== "resolved") {
      errors.push(`${id}: 已销账 finding 不得无新证据重新打开`);
    }
  }

  for (const finding of packet.findings.filter((item) => !previous.has(item.id))) {
    const originErrors = validateNewFindingOrigin(finding, {
      ...validationContext,
      previousEvent,
    });
    errors.push(...originErrors);
    if (originErrors.length) {
      errors.push(
        `${finding.id}: 复审新增 finding 非法；首轮漏看、不可复核自报或普通 baseline 不能成为新门柱`,
      );
    }
  }
  return errors;
}

function verdictFor(findings) {
  if (findings.some((finding) => finding.status === "open" && finding.severity === "blocker")) {
    return "FAIL";
  }
  if (findings.some((finding) => finding.status === "open" && finding.severity === "major")) {
    return "CONCERNS";
  }
  return "PASS";
}

function readEvents(file) {
  if (!existsSync(file)) return [];
  const events = [];
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`review-events.ndjson 第 ${index + 1} 行损坏: ${error.message}`);
    }
  }
  return events;
}

function verifyEventChain(events) {
  const errors = [];
  let previous = "";
  for (const [index, event] of events.entries()) {
    if ((event.previous_event_hash ?? "") !== previous) {
      errors.push(`review-events 第 ${index + 1} 行 previous_event_hash 断链`);
    }
    const { event_hash: claimed, ...body } = event;
    const computed = hashObject(body);
    if (claimed !== computed) errors.push(`review-events 第 ${index + 1} 行 event_hash 不匹配`);
    previous = claimed ?? "";
  }
  return errors;
}

function renderSnapshot(state) {
  const open = state.open_findings;
  const rows = open.length
    ? [
        "| ID | 严重度 | 需求锚点 | 失败模式 | 来源 |",
        "|---|---|---|---|---|",
        ...open.map((finding) => {
          const cell = (value) => cleanText(value).replace(/\|/g, "\\|").replace(/\s+/g, " ");
          return `| ${finding.id} | ${finding.severity} | ${cell(finding.requirement_anchor.id)} | ${cell(finding.failure_mode)} | ${finding.origin} |`;
        }),
      ].join("\n")
    : "当前无未销账问题。";
  const resolved = state.resolved_findings.length
    ? state.resolved_findings.map((finding) => `${finding.id} (${finding.resolution_evidence})`).join("；")
    : "—";
  return [
    "# SPEC Review — current",
    "",
    `- Task: ${state.task_id}`,
    `- Verdict: ${state.verdict}`,
    `- Round: ${state.round}/3 (${state.review_kind})`,
    `- Spec receipt: ${state.spec_sha256.slice(0, 12)}`,
    `- Review receipt: ${state.receipt}`,
    "",
    "## 当前有效问题",
    "",
    rows,
    "",
    `已销账：${resolved}`,
    "",
    "```spec-review-state",
    JSON.stringify(state, null, 2),
    "```",
    "",
  ].join("\n");
}

function validateStateReceipt(state, expectedReceipt) {
  if (!state || state.schema !== "spec-review-state/v2") {
    throw new Error("review snapshot schema 不是 spec-review-state/v2");
  }
  const { receipt, ...body } = state;
  const computed = hashObject(body).slice(0, 12);
  if (receipt !== computed) throw new Error(`review snapshot receipt 自校验失败: ${receipt} != ${computed}`);
  if (expectedReceipt && receipt !== expectedReceipt) {
    throw new Error(`BACKLOG review receipt ${expectedReceipt} 与 snapshot ${receipt} 不一致`);
  }
  return receipt;
}

export function verifyReviewReceipt({
  root,
  taskId,
  reviewCell,
  documentCell = "",
  requirePass = true,
  allowSpecChange = false,
}) {
  const value = cleanText(reviewCell);
  const policy = readReviewConfig(root).receipt_policy;
  if (value === "—") return { kind: "exempt" };
  if (["PASS", "CONCERNS(已处理)"].includes(value)) {
    if (policy === "required") {
      throw new Error(`严格项目不接受旧式审核值「${value}」；请用 reviewctl 生成可校验 receipt`);
    }
    return { kind: "legacy" };
  }
  const match = value.match(receiptPattern);
  if (!match) {
    if (value === "待审" || value === "FAIL" || value.startsWith("CONCERNS")) {
      throw new Error(`审核列为「${value}」；存在未销账问题，不得开工`);
    }
    throw new Error(`审核列值「${value || "(空)"}」不在 allowlist`);
  }

  const eventsFile = path.join(root, "orchestrator", "review-events.ndjson");
  const events = readEvents(eventsFile);
  const chainErrors = verifyEventChain(events);
  if (chainErrors.length) throw new Error(chainErrors.join("\n"));
  const event = [...events].reverse().find((item) => item.task_id === taskId);
  if (!event) throw new Error(`review receipt 缺少任务 ${taskId} 的 hash-chained event`);
  const reviewFile = resolveInside(root, event.review_path, "review snapshot");
  if (!existsSync(reviewFile)) throw new Error(`review current snapshot 不存在: ${relativePortable(root, reviewFile)}`);
  const state = extractState(reviewFile);
  validateStateReceipt(state, match[2]);
  if (state.task_id !== taskId) throw new Error(`review receipt 属于 ${state.task_id}，不是 ${taskId}`);
  const linkedFields = [
    ["round", "round"],
    ["verdict", "verdict"],
    ["spec_path", "spec_path"],
    ["spec_sha256", "spec_sha256"],
    ["constitution_path", "constitution_path"],
    ["constitution_sha256", "constitution_sha256"],
    ["review_path", "review_path"],
  ];
  for (const [stateKey, eventKey] of linkedFields) {
    if (stable(state[stateKey]) !== stable(event[eventKey])) {
      throw new Error(`review snapshot.${stateKey} 与 latest event 不一致`);
    }
  }
  if (state.latest_event_hash !== event.event_hash) {
    throw new Error("review snapshot.latest_event_hash 未指向任务最新 event");
  }
  if (state.verdict !== match[1]) {
    throw new Error(`BACKLOG verdict=${match[1]} 与 snapshot verdict=${state.verdict} 不一致`);
  }
  const eventOpen = event.packet.findings.filter((finding) => finding.status === "open");
  const eventResolved = event.packet.findings
    .filter((finding) => finding.status === "resolved")
    .map((finding) => ({ id: finding.id, resolution_evidence: finding.resolution_evidence }));
  if (stable(state.open_findings) !== stable(eventOpen) || stable(state.resolved_findings) !== stable(eventResolved)) {
    throw new Error("review snapshot findings 与 latest event packet 不一致");
  }

  const documentFiles = markdownTargets(documentCell).map((target) =>
    resolveInside(root, target, "任务文档链接"),
  );
  const specFile = resolveInside(root, event.spec_path, "SPEC");
  if (documentFiles.length && !documentFiles.includes(specFile)) {
    throw new Error(`任务 ${taskId} 文档列未链接 receipt 绑定的 SPEC: ${event.spec_path}`);
  }
  if (!existsSync(specFile)) throw new Error(`SPEC 不存在: ${event.spec_path}`);
  const currentSpecSha = sha(readFileSync(specFile, "utf8"));
  if (!allowSpecChange && state.spec_sha256 !== currentSpecSha) {
    throw new Error(`review receipt 已过期：SPEC hash ${currentSpecSha.slice(0, 12)} != ${state.spec_sha256.slice(0, 12)}`);
  }
  const constitutionFile = resolveInside(root, state.constitution_path, "constitution");
  if (!existsSync(constitutionFile)) throw new Error(`constitution 不存在: ${state.constitution_path}`);
  const currentConstitutionSha = sha(readFileSync(constitutionFile, "utf8"));
  if (state.constitution_sha256 !== currentConstitutionSha) {
    throw new Error("review receipt 已过期：constitution hash 已变化");
  }
  if (requirePass && match[1] !== "PASS") {
    throw new Error(`审核 verdict=${match[1]}；仅 PASS receipt 可开工`);
  }
  return { kind: "receipt", receipt: match[2], verdict: match[1], state, event, reviewFile };
}

function record(args) {
  const taskId = args.positionals[0];
  if (!taskId) throw new Error("用法: reviewctl.mjs record <task-id> --spec ... --constitution ... --input ... --review ... --backlog ...");
  for (const name of ["spec", "constitution", "input", "review", "backlog", "review-mode", "model"]) {
    if (!cleanText(args.flags[name])) throw new Error(`record 缺 --${name}`);
  }

  const backlogFile = realpathSync(path.resolve(process.cwd(), args.flags.backlog));
  const root = realpathSync(path.dirname(backlogFile));
  const specFile = resolveInside(root, args.flags.spec, "SPEC");
  const constitutionFile = resolveInside(root, args.flags.constitution, "constitution");
  const inputFile = resolveInside(root, args.flags.input, "review input");
  const reviewFile = resolveInside(root, args.flags.review, "review snapshot");
  const canonicalReview = adjacentReviewPath(specFile);
  if (reviewFile !== canonicalReview) {
    throw new Error(`review 必须与 SPEC 相邻并命名为 ${relativePortable(root, canonicalReview)}`);
  }
  for (const [label, file] of [
    ["BACKLOG", backlogFile],
    ["SPEC", specFile],
    ["constitution", constitutionFile],
    ["review input", inputFile],
  ]) {
    if (!existsSync(file)) throw new Error(`${label} 不存在: ${relativePortable(root, file)}`);
  }
  const constitutionText = readFileSync(constitutionFile, "utf8");
  if (
    relativePortable(root, constitutionFile) === "PROJECT.md" &&
    /本文件由\s*`?node orchestrator\/process\/pmem\.mjs sync`?\s*生成/.test(constitutionText)
  ) {
    throw new Error(
      "PROJECT.md 是 pmem 自动生成的项目记忆，不能绑定为 constitution；请改用稳定的产品/架构规范（如 SYSTEM_ARCHITECTURE.md 或任务上游 SPEC）",
    );
  }

  let packet;
  try {
    packet = JSON.parse(readFileSync(inputFile, "utf8"));
  } catch (error) {
    throw new Error(`review input JSON 无法解析: ${error.message}`);
  }

  // review snapshot + BACKLOG receipt + event chain are one logical commit.
  // taskctl uses this same project lock, preventing two agents from both
  // succeeding with snapshots assembled from the same stale state.
  const releaseStateLock = acquireStateLock(root, {
    operation: `reviewctl:record:${taskId}`,
  });
  const eventsFile = path.join(root, "orchestrator", "review-events.ndjson");
  const events = readEvents(eventsFile);
  const chainErrors = verifyEventChain(events);
  if (chainErrors.length) throw new Error(chainErrors.join("\n"));
  const previousEvent = [...events].reverse().find((event) => event.task_id === taskId) ?? null;
  const backlogTask = readBacklog(backlogFile).tasks.filter((task) => task.id === taskId);
  if (backlogTask.length !== 1) {
    throw new Error(`BACKLOG 中任务 ${taskId} 必须且只能出现一次（实际 ${backlogTask.length} 次）`);
  }
  const linkedSpecs = markdownTargets(backlogTask[0].document).map((target) =>
    resolveInside(root, target, "任务文档链接"),
  );
  if (!linkedSpecs.includes(specFile)) {
    throw new Error(`任务 ${taskId} 文档列必须显式链接被审 SPEC: ${relativePortable(root, specFile)}`);
  }
  if (previousEvent) {
    verifyReviewReceipt({
      root,
      taskId,
      reviewCell: backlogTask[0].review,
      documentCell: backlogTask[0].document,
      requirePass: false,
      allowSpecChange: true,
    });
    if (previousEvent.spec_path !== relativePortable(root, specFile)) {
      throw new Error(
        `复审不得通过更换 SPEC 文件重置 lineage（上一份 ${previousEvent.spec_path}，当前 ${relativePortable(root, specFile)}）`,
      );
    }
  } else if (existsSync(reviewFile)) {
    throw new Error(
      `${relativePortable(root, reviewFile)} 是 legacy review，reviewctl 不会静默覆盖；请保留只读或显式迁移后再接管`,
    );
  }
  const specText = readFileSync(specFile, "utf8");
  const specSha = sha(specText);
  const packetErrors = validatePacket(packet, previousEvent, {
    root,
    specSha,
    specText,
    constitutionText,
  });
  if (packetErrors.length) throw new Error(packetErrors.join("\n"));

  const round = (previousEvent?.round ?? 0) + 1;
  const verdict = verdictFor(packet.findings);
  const eventBody = {
    schema: "spec-review-event/v2",
    task_id: taskId,
    round,
    review_kind: packet.review_kind,
    verdict,
    spec_path: relativePortable(root, specFile),
    spec_sha256: specSha,
    spec_line_fingerprint_algorithm: LINE_FINGERPRINT_ALGORITHM,
    spec_line_fingerprints: lineFingerprints(specText),
    constitution_path: relativePortable(root, constitutionFile),
    constitution_sha256: sha(constitutionText),
    review_path: relativePortable(root, reviewFile),
    review_mode: args.flags["review-mode"],
    model: args.flags.model,
    policy: "convergent-review/v2",
    reviewctl_sha256: sha(readFileSync(SELF, "utf8")),
    recorded_at: new Date().toISOString(),
    previous_event_hash: events.at(-1)?.event_hash ?? "",
    packet,
  };
  const event = { ...eventBody, event_hash: hashObject(eventBody) };
  const openFindings = packet.findings.filter((finding) => finding.status === "open");
  const resolvedFindings = packet.findings
    .filter((finding) => finding.status === "resolved")
    .map((finding) => ({
      id: finding.id,
      resolution_evidence: finding.resolution_evidence,
    }));
  const stateBody = {
    schema: "spec-review-state/v2",
    task_id: taskId,
    round,
    max_rounds: 3,
    review_kind: packet.review_kind,
    verdict,
    summary: packet.summary,
    spec_path: event.spec_path,
    spec_sha256: event.spec_sha256,
    constitution_path: event.constitution_path,
    constitution_sha256: event.constitution_sha256,
    review_path: event.review_path,
    review_mode: event.review_mode,
    model: event.model,
    policy: event.policy,
    latest_event_hash: event.event_hash,
    open_findings: openFindings,
    resolved_findings: resolvedFindings,
  };
  const state = { ...stateBody, receipt: hashObject(stateBody).slice(0, 12) };

  const beforeReview = existsSync(reviewFile) ? readFileSync(reviewFile, "utf8") : null;
  const beforeBacklog = readFileSync(backlogFile, "utf8");
  const beforeEvents = existsSync(eventsFile) ? readFileSync(eventsFile, "utf8") : null;
  try {
    atomicWrite(reviewFile, renderSnapshot(state));
    setBacklogReview(backlogFile, taskId, `${verdict}[REV:${state.receipt}]`);
    mkdirSync(path.dirname(eventsFile), { recursive: true });
    atomicWrite(eventsFile, `${beforeEvents ?? ""}${JSON.stringify(event)}\n`);
  } catch (error) {
    if (beforeReview === null) {
      try {
        if (existsSync(reviewFile)) unlinkSync(reviewFile);
      } catch {
        // Best effort; audit will fail closed if the filesystem itself is failing.
      }
    } else {
      try {
        atomicWrite(reviewFile, beforeReview);
      } catch {}
    }
    try {
      atomicWrite(backlogFile, beforeBacklog);
    } catch {}
    if (beforeEvents !== null) {
      try {
        atomicWrite(eventsFile, beforeEvents);
      } catch {}
    } else {
      try {
        if (existsSync(eventsFile)) unlinkSync(eventsFile);
      } catch {}
    }
    throw new Error(`review transaction 未提交，已回滚可恢复文件: ${error.message}`);
  }
  releaseStateLock();

  console.log(
    `✓ ${taskId} review round ${round}/3 → ${verdict}[REV:${state.receipt}] (${openFindings.length} open)`,
  );
  if (round === 3 && openFindings.length) {
    console.log("! 已到复审上限：不得自动开始第 4 轮；请由用户做风险接受、范围缩减或停止决定。");
  }
}

const transientReceiptDrift = /review receipt 已过期：(SPEC hash .* != .*|constitution hash 已变化)/;

export function auditReviewReceiptFindings({ root, backlogFile, inProgressDrift = "error" }) {
  root = realpathSync(root);
  backlogFile = realpathSync(backlogFile);
  const errors = [];
  const warnings = [];
  const reportTaskError = (task, message) => {
    const rendered = `${task.id}: ${message}`;
    const inProgressHashDrift = /🔨/.test(task.status) && transientReceiptDrift.test(message);
    const canonicalPendingReview = /📋|🔨/.test(task.status) && /审核列为「待审」/.test(message);
    if (inProgressDrift === "warn" && (inProgressHashDrift || canonicalPendingReview)) {
      warnings.push(rendered);
    } else {
      errors.push(rendered);
    }
  };
  const eventsFile = path.join(root, "orchestrator", "review-events.ndjson");
  let events = [];
  try {
    events = readEvents(eventsFile);
    errors.push(...verifyEventChain(events));
  } catch (error) {
    errors.push(error.message);
  }
  const policy = readReviewConfig(root).receipt_policy;
  const active = /📋|🔨|✅|⛔/;
  for (const task of readBacklog(backlogFile).tasks) {
    if (!active.test(task.status)) continue;
    const value = cleanText(task.review);
    if (task.columns.review < 0) {
      if (policy === "required") reportTaskError(task, "strict 项目 BACKLOG 缺少「审核」列");
      else if (
        /🔨|✅/.test(task.status) &&
        (/待审|FAIL/.test(task.status) || (/CONCERNS/.test(task.status) && !/已处理/.test(task.status)))
      ) {
        reportTaskError(task, "legacy 状态中仍含未放行审核标记");
      }
      continue;
    }
    if (value === "—") continue;
    if (["PASS", "CONCERNS(已处理)"].includes(value) && policy !== "required") continue;
    try {
      const verified = verifyReviewReceipt({
        root,
        taskId: task.id,
        reviewCell: value,
        documentCell: task.document,
        requirePass: false,
      });
      if (/🔨|✅/.test(task.status) && verified.kind === "receipt" && verified.verdict !== "PASS") {
        reportTaskError(task, `状态 ${task.status} 但审核 verdict=${verified.verdict}`);
      }
    } catch (error) {
      if (
        /🔨|✅/.test(task.status) ||
        receiptPattern.test(value) ||
        (policy === "required" && value !== "待审")
      ) {
        reportTaskError(task, error.message);
      }
    }
  }
  if (events.length && !errors.length) {
    const latest = new Map();
    for (const event of events) latest.set(event.task_id, event);
    for (const event of latest.values()) {
      const reviewFile = path.resolve(root, event.review_path);
      if (!existsSync(reviewFile)) errors.push(`${event.task_id}: review snapshot 缺失 ${event.review_path}`);
    }
  }
  return { errors, warnings };
}

export function auditReviewReceipts({ root, backlogFile }) {
  return auditReviewReceiptFindings({ root, backlogFile, inProgressDrift: "error" }).errors;
}

function audit(args) {
  const backlogFile = path.resolve(process.cwd(), args.flags.backlog ?? "BACKLOG.md");
  if (!existsSync(backlogFile)) throw new Error(`BACKLOG 不存在: ${backlogFile}`);
  const root = path.dirname(backlogFile);
  const errors = auditReviewReceipts({ root, backlogFile });
  if (errors.length) throw new Error(errors.join("\n"));
  if (!args.boolean.has("quiet")) console.log("✓ review receipts + event chain PASS");
}

function context(args) {
  const taskId = args.positionals[0];
  if (!taskId) throw new Error("用法: reviewctl.mjs context <task-id> [--backlog BACKLOG.md]");
  const backlogFile = path.resolve(process.cwd(), args.flags.backlog ?? "BACKLOG.md");
  const root = realpathSync(path.dirname(backlogFile));
  const events = readEvents(path.join(root, "orchestrator", "review-events.ndjson"));
  const chainErrors = verifyEventChain(events);
  if (chainErrors.length) throw new Error(chainErrors.join("\n"));
  const event = [...events].reverse().find((item) => item.task_id === taskId);
  if (!event) throw new Error(`任务 ${taskId} 尚无 v2 review history`);
  const specFile = resolveInside(root, event.spec_path, "SPEC");
  if (!existsSync(specFile)) throw new Error(`SPEC 不存在: ${event.spec_path}`);
  const currentSpecText = readFileSync(specFile, "utf8");
  console.log(
    JSON.stringify(
      {
        schema: "spec-review-recheck-context/v1",
        task_id: taskId,
        previous_round: event.round,
        previous_verdict: event.verdict,
        previous_spec_sha256: event.spec_sha256,
        previous_packet: event.packet,
        changed_line_refs: changedLineReferences(event, currentSpecText),
        origin_ref_formats: {
          changed_lines: "SPEC-LINE:<line>:<16hex>（从 changed_line_refs 选择）",
          new_evidence: "EVIDENCE-SHA256:<64hex>:<project-relative-path>",
          late_critical:
            "SPEC-LINE:<line>:<16hex> | CONSTITUTION-LINE:<line>:<16hex> | EVIDENCE-SHA256:<64hex>:<path>",
        },
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv) {
  const command = argv[0];
  const positionals = [];
  const flags = {};
  const boolean = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      boolean.add(key);
    }
  }
  return { command, positionals, flags, boolean };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "record") record(args);
    else if (args.command === "audit") audit(args);
    else if (args.command === "context") context(args);
    else throw new Error("用法: reviewctl.mjs <record|audit|context> ...");
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) main();
