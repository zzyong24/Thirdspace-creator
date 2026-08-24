#!/usr/bin/env node
// Executable guard for review-added scope and vertical implementation complexity.
// Product authorization and historical quarantine are deliberately different: an exact historical
// baseline can keep old debt from blocking another task, but can never approve that debt or future changes.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const relPath = (root, file) => path.relative(root, file).split(path.sep).join("/");
const readJson = (file, fallback) => {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`${path.basename(file)} invalid JSON: ${error.message}`); }
};
function filesUnder(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "orchestrator", "archive", ".next", "dist", "build"].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(md|json|ya?ml|toml|swift|ts|js|py|rs|go|sh)$/i.test(entry.name) || ["Package.swift", "Dockerfile"].includes(entry.name)) out.push(absolute);
    }
  };
  walk(root);
  return out;
}
const MARKERS = {
  runtime: /\b(new runtime|runtime service|Deno|Bun|JVM|\.NET runtime)\b/i,
  language_toolchain: /\b(Swift|Xcode|Rust|Cargo|Gradle toolchain)\b/i,
  native_executable: /\b(native app|native executable|\.app bundle|launchd|daemon|broker executable)\b/i,
  os_signing: /\b(Developer ID|code ?sign|Hardened Runtime|entitlement|provisioning profile|TeamID)\b/i,
  credential_store: /\b(Keychain|credential store|key store|keyring|SecItem(?:Add|Update|Copy))\b/i,
  ipc: /\b(IPC|XPC|Unix (?:domain )?socket|named pipe|message port)\b/i,
  trust_boundary: /\b(trust boundary|same[- ]UID|malicious process|privilege boundary)\b/i,
  installer_deploy: /\b(installer|pkgbuild|notarization|deployment step|install script)\b/i,
  evidence_protocol: /\b(attestation|challenge|nonce|independent evidence protocol|不可伪造输入|五类.{0,8}证据)\b/i,
};
const sorted = (values) => [...new Set(values ?? [])].map(String).sort();
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function taskThreats(threatModel, taskId, file) {
  return (threatModel.threats ?? [])
    .filter((threat) => threat.task_id === taskId && (threat.file === file || (threat.files ?? []).includes(file)))
    .map((threat) => ({
      threat_id: threat.id,
      actor: threat.actor,
      assets: sorted(threat.assets),
      capabilities: sorted(threat.capabilities),
      acceptance_ids: sorted(threat.acceptance_ids),
      status: threat.status,
    }))
    .sort((left, right) => String(left.threat_id).localeCompare(String(right.threat_id)));
}
function signalsFor(root, file, taskId, threatModel) {
  const text = fs.readFileSync(file, "utf8");
  const relative = relPath(root, file);
  const revAddIds = sorted([...text.matchAll(/\[REV-ADD\][^\n]*?\b((?:FR|NFR|AC|ENT|FLOW|API|TEST|REL|SEC)-\d+)\b/g)].map((match) => match[1]));
  const categories = Object.entries(MARKERS)
    .filter(([category, pattern]) => pattern.test(text) || (category === "language_toolchain" && /\.swift$/i.test(file)))
    .map(([category]) => category)
    .sort();
  return {
    text, file: relative, file_sha256: sha(text), categories, rev_add_ids: revAddIds,
    threat_tuples: taskThreats(threatModel, taskId, relative),
  };
}
function pathMatches(relative, declared) {
  const normalized = String(declared).replace(/^\.\//, "").replace(/\\/g, "/");
  const prefix = normalized.split("*", 1)[0].replace(/\/$/, "");
  if (!prefix) return false;
  return normalized.includes("*") ? relative === prefix || relative.startsWith(`${prefix}/`) : relative === normalized || relative.startsWith(`${normalized}/`);
}
function activeBinding(root, requestedTask, requestedWriteSet) {
  if (requestedTask) return { taskId: String(requestedTask).split(":", 1)[0], writeSet: requestedWriteSet ?? [] };
  const pending = path.join(root, "orchestrator", ".autonomy-iteration.json");
  if (!fs.existsSync(pending)) return { taskId: "", writeSet: [] };
  const active = readJson(pending, {}).task_id ?? "";
  const vertical = String(active).split(":", 1)[0];
  const modules = readJson(path.join(root, "orchestrator", "process", "modules.config.json"), { modules: {} }).modules ?? {};
  const config = modules[vertical] ?? {};
  return { taskId: config.task_id ?? vertical, writeSet: config.write_set ?? [] };
}
function markerShapeErrors(marker) {
  const errors = [];
  if (marker?.schema !== "governance-historical-baseline/v1") errors.push("schema");
  if (!marker?.task_id || !marker?.file || !/^[a-f0-9]{64}$/i.test(marker?.file_sha256 ?? "")) errors.push("task_id/file/file_sha256");
  if (marker?.status !== "quarantined" || !String(marker?.reason ?? "").trim()) errors.push("status/reason");
  for (const field of ["categories", "rev_add_ids", "threat_tuples"]) if (!Array.isArray(marker?.[field])) errors.push(field);
  return errors;
}
function exactMarker(marker, signals, taskId) {
  return marker.task_id === taskId && marker.file === signals.file && marker.file_sha256 === signals.file_sha256
    && sameJson(sorted(marker.categories), signals.categories)
    && sameJson(sorted(marker.rev_add_ids), signals.rev_add_ids)
    && sameJson(marker.threat_tuples, signals.threat_tuples);
}
function loadState(root) {
  const errors = [];
  const scopeFile = path.join(root, "orchestrator", "SCOPE_AUTHORIZATIONS.json");
  if (!fs.existsSync(scopeFile)) errors.push("missing orchestrator/SCOPE_AUTHORIZATIONS.json (run supported migration; no legacy DEC is inferred)");
  const scope = readJson(scopeFile, { schema: "scope-authorizations/v1", authorizations: [] });
  if (scope.schema !== "scope-authorizations/v1" || !Array.isArray(scope.authorizations)) errors.push("SCOPE_AUTHORIZATIONS.json schema must be scope-authorizations/v1");
  const complexityFile = path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json");
  if (!fs.existsSync(complexityFile)) errors.push("missing orchestrator/COMPLEXITY_LEDGER.json (explicit baseline migration required)");
  const ledger = readJson(complexityFile, { schema: "complexity-ledger/v1", entries: [], historical_baselines: [] });
  if (ledger.schema !== "complexity-ledger/v1" || !Array.isArray(ledger.entries)) errors.push("COMPLEXITY_LEDGER.json schema must be complexity-ledger/v1");
  if (ledger.historical_baselines != null && !Array.isArray(ledger.historical_baselines)) errors.push("COMPLEXITY_LEDGER.json historical_baselines must be an array");
  for (const marker of ledger.historical_baselines ?? []) {
    const invalid = markerShapeErrors(marker);
    if (invalid.length) errors.push(`historical baseline marker invalid (${invalid.join(", ")})`);
  }
  const threatModel = readJson(path.join(root, "orchestrator", "THREAT_MODEL.json"), { schema: "threat-model/v1", threats: [] });
  if (threatModel.schema !== "threat-model/v1" || !Array.isArray(threatModel.threats)) errors.push("THREAT_MODEL.json schema must be threat-model/v1");
  return { errors, scope, ledger, threatModel, complexityFile };
}
function errorsForFile(root, file, taskId, state) {
  const signals = signalsFor(root, file, taskId, state.threatModel);
  const errors = [];
  const markers = (state.ledger.historical_baselines ?? []).filter((marker) => marker.task_id === taskId && marker.file === signals.file);
  if (markers.length > 1) errors.push(`${signals.file}: multiple historical baselines for ${taskId}`);
  if (markers.length) {
    if (exactMarker(markers[0], signals, taskId)) {
      errors.push(`${taskId} ${signals.file}: exact historical governance debt remains quarantined; baseline is not product/scope/threat authorization`);
      return errors;
    }
    errors.push(`${taskId} ${signals.file}: historical baseline hash/markers changed; new scope or complexity remains red`);
  }
  for (const id of signals.rev_add_ids) {
    const authorized = (state.scope.authorizations ?? []).some((authorization) => authorization.owner === "user" && authorization.purpose === "product-scope" && authorization.spec_path === signals.file && authorization.spec_sha256 === signals.file_sha256 && Array.isArray(authorization.approved_ids) && authorization.approved_ids.includes(id));
    if (!authorized) errors.push(`${signals.file}: [REV-ADD] ${id} lacks itemized user scope authorization bound to this spec hash; continue/L2/scope-envelope DEC cannot approve it`);
  }
  for (const category of signals.categories) {
    const covered = (state.ledger.entries ?? []).some((entry) => Array.isArray(entry.categories) && entry.categories.includes(category) && Array.isArray(entry.files) && entry.files.includes(signals.file) && ["baseline-migrated", "in-budget", "defer-hardening", "approved-threat-model"].includes(entry.disposition) && entry.task_id);
    if (!covered) errors.push(`${signals.file}: unledgered complexity marker ${category}; record structured budget entry and default non-essential hardening to a later task`);
  }
  return errors;
}

export function auditGovernance(root, options = {}) {
  const state = loadState(root);
  const errors = [...state.errors];
  let binding = { taskId: options.taskId ?? "", writeSet: options.writeSet ?? [] };
  if (options.scope === "active") binding = activeBinding(root, "", []);
  const all = filesUnder(root);
  const files = binding.taskId
    ? all.filter((file) => (binding.writeSet ?? []).some((declared) => pathMatches(relPath(root, file), declared)))
    : options.scope === "active" ? [] : all;
  for (const file of files) errors.push(...errorsForFile(root, file, binding.taskId, state));
  return errors;
}
export function taskGovernanceErrors(root, taskId, writeSet) {
  return auditGovernance(root, { taskId, writeSet });
}
export function governanceDebtReport(root) {
  const state = loadState(root);
  const findings = [];
  for (const marker of state.ledger.historical_baselines ?? []) {
    const absolute = path.resolve(root, marker.file ?? "");
    if (!fs.existsSync(absolute)) { findings.push(`${marker.task_id ?? "?"} ${marker.file ?? "?"}: historical governance debt source missing`); continue; }
    const signals = signalsFor(root, absolute, marker.task_id, state.threatModel);
    findings.push(exactMarker(marker, signals, marker.task_id)
      ? `${marker.task_id} ${marker.file}: historical governance debt quarantined (exact hash; non-authorizing)`
      : `${marker.task_id} ${marker.file}: historical governance baseline stale; candidate task remains red`);
  }
  return findings;
}
function baselineMarker(root, taskId, file, reason, state) {
  const absolute = path.resolve(root, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${file}: baseline source file missing`);
  const signals = signalsFor(root, absolute, taskId, state.threatModel);
  if (signals.categories.includes("trust_boundary") && !signals.threat_tuples.length) throw new Error(`${file}: trust-boundary debt requires an exact structured threat tuple bound to task_id + file`);
  return {
    schema: "governance-historical-baseline/v1", status: "quarantined", task_id: taskId,
    file: signals.file, file_sha256: signals.file_sha256, categories: signals.categories,
    rev_add_ids: signals.rev_add_ids, threat_tuples: signals.threat_tuples, reason: String(reason).trim(),
  };
}
function main() {
  const args = process.argv.slice(2); const at = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; };
  const command = args[0] ?? "check"; const root = path.resolve(at("--root") || process.cwd());
  try {
    const state = loadState(root);
    if (command === "baseline-marker") {
      const taskId = at("--task"), file = at("--file"), reason = at("--reason");
      if (!taskId || !file || !reason) throw new Error("baseline-marker requires --task, --file, and --reason");
      console.log(JSON.stringify(baselineMarker(root, taskId, file, reason, state), null, 2)); return;
    }
    if (command === "baseline-apply") {
      const markerFile = at("--marker"); if (!markerFile) throw new Error("baseline-apply requires --marker <json>");
      const marker = readJson(path.resolve(root, markerFile), null); const invalid = markerShapeErrors(marker);
      if (invalid.length) throw new Error(`baseline marker invalid: ${invalid.join(", ")}`);
      const expected = baselineMarker(root, marker.task_id, marker.file, marker.reason, state);
      if (!sameJson(marker, expected)) throw new Error("baseline marker no longer matches exact task/file/hash/categories/REV-ADD/threat tuple");
      state.ledger.historical_baselines ??= [];
      if (state.ledger.historical_baselines.some((entry) => entry.task_id === marker.task_id && entry.file === marker.file)) throw new Error("historical baseline already exists for task/file; never extend it in place");
      state.ledger.historical_baselines.push(marker);
      const temporary = `${state.complexityFile}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(state.ledger, null, 2)}\n`, { flag: "wx" }); fs.renameSync(temporary, state.complexityFile);
      console.log(`✓ historical governance baseline installed for ${marker.task_id} ${marker.file} (quarantine only; no authorization)`); return;
    }
    const taskId = at("--task"); const writeSet = args.flatMap((value, index) => value === "--write-set" && args[index + 1] ? [args[index + 1]] : []);
    const errors = command === "task-preflight" ? taskGovernanceErrors(root, taskId, writeSet) : auditGovernance(root);
    if (errors.length) { console.error(`governance-guard HALT (${errors.length})\n${errors.map((error) => `  ✗ ${error}`).join("\n")}`); process.exit(1); }
    console.log("✓ governance guard: review-added scope and complexity budget clean");
  } catch (error) { console.error(`✗ ${error.message}`); process.exit(2); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) main();
