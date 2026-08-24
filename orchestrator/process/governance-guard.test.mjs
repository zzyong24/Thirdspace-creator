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
