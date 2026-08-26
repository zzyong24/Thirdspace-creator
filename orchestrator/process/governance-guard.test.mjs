import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "governance-guard.mjs");
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "governance-guard-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  fs.writeFileSync(path.join(root, "PRODUCT_SPEC.md"), "# Product\n");
  fs.writeFileSync(path.join(root, "orchestrator", "SCOPE_AUTHORIZATIONS.json"), JSON.stringify({ schema: "scope-authorizations/v1", authorizations: [] }));
  fs.writeFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), JSON.stringify({ schema: "complexity-ledger/v1", entries: [] }));
  return root;
}
function run(root, args = ["check", "--root", root]) { return spawnSync(process.execPath, [GUARD, ...args], { cwd: root, encoding: "utf8" }); }

test("[REV-ADD] 不能被继续推进/scope-envelope 批量洗成 approved scope", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "PRODUCT_SPEC.md"), "# Product\n[REV-ADD] FR-102 user_input_attestations\n[REV-ADD] AC-202 不可伪造输入\n");
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), "ID: DEC-022\nOwner: user\nDecision: L2 scope-envelope，继续推进。\nStatus: active\n");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /FR-102|AC-202/);
  assert.match(r.stdout + r.stderr, /逐项|scope authorization|REV-ADD/i);
});

test("域表 API 不变但新增 Swift/native app/Keychain/IPC 仍触发 complexity budget", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "T-029_SPEC.md"), "Swift native app + Developer ID + Keychain + IPC broker + OS entitlement + independent attestation protocol\n");
  const r = run(root);
  assert.equal(r.status, 1);
  for (const term of ["language_toolchain", "native_executable", "credential_store", "ipc", "os_signing", "evidence_protocol"]) assert.match(r.stdout + r.stderr, new RegExp(term));
});

test("兼容规格复用并委派既有 attestation 合同，不算新增 evidence protocol", () => {
  const root = fixture();
  const rel = "docs/features/profile/PROFILE_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "# Compatibility contract",
    "This facade reuses the existing stable operation API-004 and delegates attestation validation to its current owner.",
    "It inherits the existing receipt and state machine; it must not create a new evidence protocol, approval owner, repository, store, scheduler, or runtime state.",
    "",
  ].join("\n"));

  const before = fs.readFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), "utf8");
  const result = run(root, ["task-preflight", "--root", root, "--task", "TASK-REVIEW", "--write-set", rel]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), "utf8"), before,
    "a reuse-only task must not need an out-of-write-set ledger mutation");
});

test("非产品特例：薪资导出复用既有签名 attestation verifier 不触发新机制", () => {
  const root = fixture();
  const rel = "docs/features/payroll/EXPORT_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "Payroll export compatibility note: retain the established SEC-API-009 attestation term.",
    "The adapter delegates verification to the existing signing service and owns no approval workflow, persistence, runtime state, or verification operation.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "PAYROLL-EXPORT", "--write-set", rel]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("产品领域里的 challenge/self-attestation 裸词不自动升级为证据协议", () => {
  const root = fixture();
  const rel = "docs/features/wellness/HABIT_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "Users join a 30-day wellness challenge and submit a daily self-attestation through the current form.",
    "This is a product-domain check-in; no verifier, proof exchange, protocol owner, persistence, or runtime workflow is introduced.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "WELLNESS-CHECKIN", "--write-set", rel]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("复用既有 verifier 时，同段新增普通 UI 文案不等于新增协议", () => {
  const root = fixture();
  const rel = "docs/features/settings/SETTINGS_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "The settings screen reuses the existing attestation verifier and stable verification operation.",
    "This task adds a new user-facing label and confirmation copy; it creates no protocol owner, store, scheduler, or runtime state.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "SETTINGS-COPY", "--write-set", rel]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("新 EvidenceProtocol owner、持久化、状态和操作即使未使用旧关键词也必须 fail-closed", () => {
  const root = fixture();
  const rel = "docs/features/approvals/APPROVAL_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "This task introduces EvidenceProtocolV2 as a separate approval system.",
    "ApprovalService is the new owner and persists proof records in EvidenceProtocolStore.",
    "The runtime states are pending, verified, and revoked; operations issueProof, verifyProof, and revokeApproval mutate that state.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "APPROVALS-NEW", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /evidence_protocol/);
});

test("声称复用格式但同时新增 owner 与持久化，不能借 reuse 文案洗掉 complexity", () => {
  const root = fixture();
  const rel = "docs/features/approvals/COMPAT_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "The new approval system reuses the legacy attestation payload format.",
    "However, ApprovalService becomes a new owner, creates its own challenge store, and exposes issue/verify/revoke operations with mutable pending state.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "APPROVALS-COMPAT", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /evidence_protocol/);
});

test("其他 task 的 ledger entry 不能替当前 task 授权新协议", () => {
  const root = fixture();
  const rel = "docs/features/approvals/SECOND_PROTOCOL_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), "Create an independent attestation protocol owned by a new approval service.\n");
  fs.writeFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), JSON.stringify({
    schema: "complexity-ledger/v1",
    entries: [{
      task_id: "OTHER-TASK", files: [rel], file_sha256: createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex"),
      categories: ["evidence_protocol"], disposition: "in-budget",
    }],
  }));

  const result = run(root, ["task-preflight", "--root", root, "--task", "CURRENT-TASK", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /evidence_protocol/);
});

test("物理 marker 只看所在 clause：既有 Keychain + 新 UI 或明确否定都不触发", () => {
  const root = fixture();
  const rel = "docs/features/settings/KEYCHAIN_COMPAT_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "The adapter reuses the existing Keychain integration.",
    "This task adds a new user-facing label.",
    "It does not introduce a Keychain, credential store, or key store.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "SETTINGS-KEYCHAIN", "--write-set", rel]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("replace/migrate 既有能力为新 XPC broker 仍是新增物理机制", () => {
  const root = fixture();
  const rel = "docs/features/credentials/CREDENTIAL_MIGRATION_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), "Replace the existing Keychain integration with an XPC credential broker and migrate writes into that process.\n");

  const result = run(root, ["task-preflight", "--root", root, "--task", "CREDENTIAL-MIGRATION", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /credential_store/);
  assert.match(result.stdout + result.stderr, /ipc/);
});

test("EvidenceProtocol 的 owner/store/state/operations 声明无需写 new 也必须触发", () => {
  const root = fixture();
  const rel = "docs/features/approvals/DECLARATIVE_PROTOCOL_SPEC.md";
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), [
    "EvidenceProtocolV2 is owned by ApprovalService.",
    "It persists proof records in EvidenceProtocolStore.",
    "Runtime states are pending, verified, and revoked.",
    "Operations issueProof, verifyProof, and revokeApproval mutate the protocol.",
    "",
  ].join("\n"));

  const result = run(root, ["task-preflight", "--root", root, "--task", "APPROVALS-DECLARATIVE", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /evidence_protocol/);
});

test("task-preflight 缺 task 或 write-set 时 fail-closed", () => {
  const root = fixture();
  let result = run(root, ["task-preflight", "--root", root, "--write-set", "PRODUCT_SPEC.md"]);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /--task/i);

  result = run(root, ["task-preflight", "--root", root, "--task", "TASK-BOUND"]);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /--write-set/i);
});

test("同 task ledger entry 必须绑定当前文件 hash，不能覆盖后续新增协议", () => {
  const root = fixture();
  const rel = "docs/features/approvals/HASH_BOUND_SPEC.md";
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "Create an independent attestation protocol owned by ApprovalService.\n");
  const oldHash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(root, "orchestrator", "COMPLEXITY_LEDGER.json"), JSON.stringify({
    schema: "complexity-ledger/v1",
    entries: [{ task_id: "APPROVALS-HASH", files: [rel], file_sha256: oldHash, categories: ["evidence_protocol"], disposition: "in-budget" }],
  }));
  fs.appendFileSync(file, "Implement EvidenceProtocolV2 with a separate owner, store, states, and issueProof/verifyProof operations.\n");

  const result = run(root, ["task-preflight", "--root", root, "--task", "APPROVALS-HASH", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /hash|evidence_protocol|ledger/i);
});

test("historical baseline source 与 marker JSON 都不能逃逸项目根目录", () => {
  const root = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "governance-outside-"));
  const source = path.join(outside, "OUTSIDE_SPEC.md");
  fs.writeFileSync(source, "independent attestation protocol\n");
  const escapedSource = path.relative(root, source);

  let result = run(root, ["baseline-marker", "--root", root, "--task", "ESCAPE", "--file", escapedSource, "--reason", "must stay inside"]);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /outside|project root|escape/i);

  const markerFile = path.join(outside, "marker.json");
  fs.writeFileSync(markerFile, JSON.stringify({
    schema: "governance-historical-baseline/v1", status: "quarantined", task_id: "ESCAPE",
    file: escapedSource, file_sha256: createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
    categories: ["evidence_protocol"], rev_add_ids: [], threat_tuples: [], reason: "must stay inside",
  }));
  result = run(root, ["baseline-apply", "--root", root, "--marker", path.relative(root, markerFile)]);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /outside|project root|escape/i);
});

test("T-029 历史 governance 污染不阻断只写 T-024 write-set 的 task preflight", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, "docs", "tasks"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "t024"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "tasks", "T-029.md"), "[REV-ADD] AC-901 same-UID Swift native app Keychain IPC\n");
  fs.writeFileSync(path.join(root, "src", "t024", "report.ts"), "export const report = true;\n");

  const result = run(root, ["task-preflight", "--root", root, "--task", "T-024", "--write-set", "src/t024/**"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("historical marker 精确绑定 task/file/hash/categories/REV-ADD/threat tuple；迁移后仍 quarantine 本 task", () => {
  const root = fixture();
  const rel = "docs/tasks/T-029.md";
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "[REV-ADD] AC-901 Swift native app same-UID malicious process\n");
  fs.writeFileSync(path.join(root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({
    schema: "threat-model/v1",
    threats: [{
      id: "THREAT-OLD-1", task_id: "T-029", files: [rel], status: "unapproved-historical",
      actor: "same-UID malicious process", assets: ["local migration database"],
      capabilities: ["send forged IPC request"], acceptance_ids: ["AC-901"],
    }],
  }));

  let result = run(root, ["baseline-marker", "--root", root, "--task", "T-029", "--file", rel, "--reason", "legacy incident debt"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const marker = JSON.parse(result.stdout);
  assert.equal(marker.task_id, "T-029");
  assert.equal(marker.file, rel);
  assert.equal(marker.file_sha256, createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
  assert.deepEqual(marker.rev_add_ids, ["AC-901"]);
  assert.equal(marker.categories.includes("language_toolchain"), true);
  assert.equal(marker.categories.includes("trust_boundary"), true);
  assert.deepEqual(marker.threat_tuples, [{
    threat_id: "THREAT-OLD-1", actor: "same-UID malicious process", assets: ["local migration database"],
    capabilities: ["send forged IPC request"], acceptance_ids: ["AC-901"], status: "unapproved-historical",
  }]);

  const markerFile = path.join(root, "marker.json");
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  result = run(root, ["baseline-apply", "--root", root, "--marker", markerFile]);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = run(root, ["task-preflight", "--root", root, "--task", "T-029", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /historical|quarantine|debt/i);

  fs.appendFileSync(file, "Keychain credential store\n");
  result = run(root, ["task-preflight", "--root", root, "--task", "T-029", "--write-set", rel]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /hash|changed|credential_store|marker/i);
});
