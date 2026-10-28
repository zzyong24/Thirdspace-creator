// Pure preparation/verification: this module never writes files or changes Git state.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const MANIFEST_SCHEMA = "review-ledger-migration/v1";
const IMPORT_SCHEMA = "review-ledger-import/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^T-[0-9]+(?:-[a-zA-Z0-9-]+)?$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) throw new Error(`${label} 未知/缺失字段: ${[...unknown, ...missing].join(", ")}`);
}
function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
}
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function safePath(root, value, label) {
  nonempty(value, `${label} 路径`);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) ||
      value === "." || value.endsWith("/") || path.posix.normalize(value) !== value || value.split("/").includes("..")) {
    throw new Error(`${label} 路径必须是规范的项目内相对路径: ${value}`);
  }
  const absolute = path.resolve(root, value);
  if (!inside(root, absolute)) throw new Error(`${label} 路径越出root: ${value}`);
  let current = root;
  for (const segment of value.split("/")) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      let real;
      try { real = fs.realpathSync(current); } catch { throw new Error(`${label} 路径含无效symlink: ${value}`); }
      if (!inside(root, real)) throw new Error(`${label} symlink路径越出root: ${value}`);
    }
  }
  return absolute;
}
function readBytes(root, relative, label) {
  const file = safePath(root, relative, label);
  if (!fs.statSync(file).isFile()) throw new Error(`${label} 路径不是文件`);
  return fs.readFileSync(file);
}
function text(bytes, label) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error(`${label} 不是有效UTF-8`); }
}
function decisions(root) {
  const relative = "orchestrator/DECISION_LOG.md";
  const file = safePath(root, relative, "DECISION_LOG");
  if (!fs.existsSync(file)) return [];
  const result = [];
  const document = text(readBytes(root, relative, "DECISION_LOG"), "DECISION_LOG");
  for (const match of document.matchAll(/^```text\s*\r?\n([\s\S]*?)^```\s*$/gm)) {
    if (!/^Authorization-Kind:\s*review-ledger-migration\s*$/m.test(match[1])) continue;
    const fields = new Map();
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/);
      if (!field) continue;
      if (fields.has(field[1])) throw new Error(`DEC 授权字段重复: ${field[1]}`);
      fields.set(field[1], field[2]);
    }
    if (fields.get("Authorization-Kind") === "review-ledger-migration") result.push(fields);
  }
  return result;
}
function validateAuthorization(root, manifest, manifestPath, digest) {
  const matches = decisions(root).filter((fields) => fields.get("ID") === manifest.authorized_by);
  if (matches.length !== 1) throw new Error(`${manifest.authorized_by} 必须有唯一review-ledger-migration授权`);
  const grant = matches[0];
  if (grant.get("Owner") !== "user" || grant.get("Status") !== "active") throw new Error(`${manifest.authorized_by} 授权必须Owner=user且Status=active`);
  if (grant.get("Manifest-Path") !== manifestPath || grant.get("Manifest-SHA256") !== digest) throw new Error(`${manifest.authorized_by} 授权Manifest-Path/SHA256与manifest不匹配`);
}
function validateManifest(root, manifest) {
  exactKeys(manifest, ["schema", "id", "authorized_by", "created_at", "expected_ledger_sha256", "task_mappings", "base", "incoming", "damaged"], "manifest");
  if (manifest.schema !== MANIFEST_SCHEMA) throw new Error("未知manifest schema");
  nonempty(manifest.id, "manifest.id");
  if (!/^DEC-[0-9]+$/.test(manifest.authorized_by)) throw new Error("manifest.authorized_by 必须引用DEC授权");
  if (typeof manifest.created_at !== "string" || !Number.isFinite(Date.parse(manifest.created_at))) throw new Error("manifest.created_at 必须是有效时间");
  if (!SHA256.test(manifest.expected_ledger_sha256)) throw new Error("manifest expected_ledger_sha256无效");
  const sourcePaths = new Set();
  for (const name of ["base", "incoming", "damaged"]) {
    const source = manifest[name];
    exactKeys(source, ["commit", "path", "sha256"], `manifest.${name}`);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.commit) || !SHA256.test(source.sha256)) throw new Error(`manifest.${name} commit/sha256无效`);
    safePath(root, source.path, `manifest.${name}`);
    if (sourcePaths.has(source.path)) throw new Error("manifest来源路径重复");
    sourcePaths.add(source.path);
  }
  if (manifest.expected_ledger_sha256 !== manifest.damaged.sha256) throw new Error("expected_ledger_sha256未绑定损坏原件hash");
  if (!Array.isArray(manifest.task_mappings)) throw new Error("manifest.task_mappings必须是数组");
  const sourceTasks = new Set(), targetTasks = new Set(), targetReviews = new Set();
  for (const mapping of manifest.task_mappings) {
    exactKeys(mapping, ["source_task_id", "target_task_id", "source_spec_path", "spec_path", "source_review_path", "review_path"], "task mapping");
    if (!TASK_ID.test(mapping.source_task_id) || !TASK_ID.test(mapping.target_task_id)) throw new Error("mapping task ID无效");
    for (const name of ["source_spec_path", "spec_path", "source_review_path", "review_path"]) safePath(root, mapping[name], `mapping.${name}`);
    if (sourceTasks.has(mapping.source_task_id) || targetTasks.has(mapping.target_task_id) || targetReviews.has(mapping.review_path)) throw new Error("mapping重复或目标合流冲突");
    sourceTasks.add(mapping.source_task_id); targetTasks.add(mapping.target_task_id); targetReviews.add(mapping.review_path);
  }
}
function sourceChain(root, bytes, label) {
  const raw = text(bytes, label), events = [];
  let previous = "";
  const seen = new Set();
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error(`${label} 第${index + 1}行JSON损坏`); }
    if (!event || typeof event !== "object" || Array.isArray(event) || event.schema !== "spec-review-event/v2" || !TASK_ID.test(event.task_id)) throw new Error(`${label} 第${index + 1}行event无效`);
    const { event_hash: claimed, ...body } = event;
    if (!SHA256.test(claimed) || claimed !== sha(stable(body))) throw new Error(`${label} 第${index + 1}行event hash不匹配`);
    if ((event.previous_event_hash ?? "") !== previous) throw new Error(`${label} 第${index + 1}行hash chain断链`);
    if (seen.has(claimed)) throw new Error(`${label} 重复event hash`);
    if (Object.hasOwn(event, "migration")) throw new Error(`${label} 不支持已含migration的来源链`);
    for (const name of ["spec_path", "review_path", "constitution_path"]) safePath(root, event[name], `${label} event.${name}`);
    seen.add(claimed); previous = claimed; events.push(event);
  }
  if (!events.length) throw new Error(`${label} 原链为空`);
  return { raw, events };
}
function readSource(root, source, name, verifyGitSources) {
  const bytes = readBytes(root, source.path, name);
  if (sha(bytes) !== source.sha256) throw new Error(`${name} archive sha256不匹配`);
  if (verifyGitSources) {
    let gitBytes;
    try {
      gitBytes = execFileSync("git", ["-C", root, "show", `${source.commit}:orchestrator/review-events.ndjson`], {
        maxBuffer: 64 * 1024 * 1024, timeout: 120000, stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) { throw new Error(`${name} Git来源commit/blob不可读取: ${error.message}`); }
    if (!bytes.equals(gitBytes)) throw new Error(`${name} archive与Git来源blob字节不一致`);
  }
  return bytes;
}

export function buildLedgerMigration({ root, manifestPath, verifyGitSources = false }) {
  root = fs.realpathSync(path.resolve(root));
  const manifestBytes = readBytes(root, manifestPath, "manifest");
  let manifest;
  try { manifest = JSON.parse(text(manifestBytes, "manifest")); } catch (error) { throw new Error(`manifest解析失败: ${error.message}`); }
  validateManifest(root, manifest);
  const manifestSha256 = sha(manifestBytes);
  validateAuthorization(root, manifest, manifestPath, manifestSha256);
  const base = sourceChain(root, readSource(root, manifest.base, "base", verifyGitSources), "base");
  const incoming = sourceChain(root, readSource(root, manifest.incoming, "incoming", verifyGitSources), "incoming");
  // This is deliberately not parsed or chain-validated: it is the damaged original.
  readSource(root, manifest.damaged, "damaged", verifyGitSources);
  let common = 0;
  while (common < Math.min(base.events.length, incoming.events.length) && stable(base.events[common]) === stable(incoming.events[common])) common++;
  if (!common) throw new Error("两条来源链没有共同前缀");
  const tail = incoming.events.slice(common);
  if (!tail.length) throw new Error("incoming没有待导入的共同前缀后事件");
  const union = new Set(base.events.map((event) => event.event_hash));
  for (const event of tail) {
    if (union.has(event.event_hash)) throw new Error("共同前缀后来源并集出现重复event，无法一一覆盖");
    union.add(event.event_hash);
  }
  const mappings = new Map(manifest.task_mappings.map((mapping) => [mapping.source_task_id, mapping]));
  const baseTasks = new Set(base.events.map((event) => event.task_id));
  const tailTasks = new Set(tail.map((event) => event.task_id));
  for (const mapping of mappings.values()) {
    const sourceEvents = tail.filter((event) => event.task_id === mapping.source_task_id);
    if (!sourceEvents.length || sourceEvents.some((event) => event.spec_path !== mapping.source_spec_path || event.review_path !== mapping.source_review_path)) throw new Error(`mapping来源task/spec/review并非逐一绑定: ${mapping.source_task_id}`);
    if (mapping.source_task_id !== mapping.target_task_id && (baseTasks.has(mapping.target_task_id) || tailTasks.has(mapping.target_task_id))) throw new Error(`mapping目标与不同源ID冲突: ${mapping.target_task_id}`);
  }
  const mappedReviewOwners = new Map();
  for (const event of [...base.events, ...tail]) {
    const mapping = tail.includes(event) ? mappings.get(event.task_id) : undefined;
    const targetTask = mapping?.target_task_id ?? event.task_id;
    const targetReview = mapping?.review_path ?? event.review_path;
    // Existing shared snapshots remain historical; newly mapped destinations cannot take another task's snapshot.
    if (mapping && mappedReviewOwners.has(targetReview) && mappedReviewOwners.get(targetReview) !== targetTask) throw new Error(`mapping review路径与不同任务冲突: ${targetReview}`);
    if (!mapping && [...mappings.values()].some((item) => item.review_path === targetReview && item.target_task_id !== targetTask)) throw new Error(`mapping review路径与不同任务冲突: ${targetReview}`);
    mappedReviewOwners.set(targetReview, targetTask);
  }
  const events = [...base.events];
  const imported = tail.map((source, offset) => {
    const { event_hash: sourceHash, ...sourceBody } = source;
    const mapping = mappings.get(source.task_id);
    const body = { ...sourceBody, task_id: mapping?.target_task_id ?? source.task_id,
      spec_path: mapping?.spec_path ?? source.spec_path, review_path: mapping?.review_path ?? source.review_path,
      previous_event_hash: events.at(-1).event_hash,
      migration: { schema: IMPORT_SCHEMA, manifest_path: manifestPath, manifest_sha256: manifestSha256,
        source_event_hash: sourceHash, source_index: common + offset },
    };
    const event = { ...body, event_hash: sha(stable(body)) };
    events.push(event); return event;
  });
  const separator = base.raw.endsWith("\n") ? "" : "\n";
  return { events, ledgerText: `${base.raw}${separator}${imported.map((event) => JSON.stringify(event)).join("\n")}\n`,
    manifest, manifestPath, manifestSha256,
    sourcePaths: [manifest.base.path, manifest.incoming.path, manifest.damaged.path],
    summary: { base_events: base.events.length, incoming_events: incoming.events.length, common_prefix_events: common,
      imported_events: imported.length, total_events: events.length, union_events: union.size, mapped_tasks: mappings.size },
  };
}

export function verifyMigrationProvenance({ root, events, ledgerText }) {
  try {
    root = fs.realpathSync(path.resolve(root));
    if (!Array.isArray(events)) throw new Error("events必须是数组");
    const manifestPaths = new Set();
    for (const grant of decisions(root)) {
      const declaredPath = grant.get("Manifest-Path");
      if (!declaredPath) throw new Error("migration授权缺Manifest-Path，无法验证完整导入批");
      safePath(root, declaredPath, "授权manifest"); manifestPaths.add(declaredPath);
    }
    for (const event of events) {
      if (!event || typeof event !== "object" || !Object.hasOwn(event, "migration")) continue;
      exactKeys(event.migration, ["schema", "manifest_path", "manifest_sha256", "source_event_hash", "source_index"], "event.migration");
      if (event.migration.schema !== IMPORT_SCHEMA) throw new Error("未知migration schema");
      if (!SHA256.test(event.migration.manifest_sha256) || !SHA256.test(event.migration.source_event_hash) || !Number.isSafeInteger(event.migration.source_index) || event.migration.source_index < 0) throw new Error("migration来源元数据无效");
      safePath(root, event.migration.manifest_path, "migration manifest");
      manifestPaths.add(event.migration.manifest_path);
    }
    for (const manifestPath of manifestPaths) {
      const expected = buildLedgerMigration({ root, manifestPath });
      if (ledgerText !== undefined) {
        if (typeof ledgerText !== "string") throw new Error("ledgerText必须是实际账本UTF-8文本");
        const baseText = text(readBytes(root, expected.manifest.base.path, "base"), "base");
        if (!ledgerText.startsWith(baseText)) throw new Error(`${manifestPath} 基础链原始字节被改写`);
        const parsed = ledgerText.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
        if (stable(parsed) !== stable(events)) throw new Error("ledgerText与所校验events不一致");
      }
      if (events.length < expected.events.length) throw new Error(`${manifestPath} 导入批缺失事件`);
      for (let index = 0; index < expected.events.length; index++) {
        if (stable(events[index]) !== stable(expected.events[index])) throw new Error(`${manifestPath} 第${index + 1}行基础/导入事件与封存来源重构不一致`);
      }
      if (events.slice(expected.events.length).some((event) => event?.migration?.manifest_path === manifestPath)) throw new Error(`${manifestPath} 导入批重复或错序`);
    }
    return [];
  } catch (error) { return [`review migration provenance: ${error.message}`]; }
}
