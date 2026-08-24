import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, "research-gate.mjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-first-gate-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "evidence"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "research"), { recursive: true });
  fs.mkdirSync(path.join(root, "Workbench", "worker"), { recursive: true });
  fs.writeFileSync(path.join(root, "Workbench", "worker", "model_gateway.py"), "request_body = {}\n");
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 | 一句话 |",
      "|---|---|---|---|---|---|---|",
      "| T-022 | 企业资产 | 🔨 | [spec](docs/specs/T-022.md) | PASS[REV:abc] | — | 当前实现 |",
      "| T-031 | 研究结构化输出 | 📋 | [card](docs/research/T-031.md) | — | — | 有界研究 |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), "# Decision Log\n");
  fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), JSON.stringify({
    research_verify_commands: { contract_probe: "node -e \"process.exit(0)\"" },
  }));
  fs.writeFileSync(path.join(root, "docs", "evidence", "failure.md"), "assets[0].kind contract mismatch\n");
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [GATE, ...args, "--root", root], {
    cwd: root,
    encoding: "utf8",
  });
}

function markOpen(root, card = "docs/research/T-031.md") {
  fs.appendFileSync(
    path.join(root, "orchestrator", "events.ndjson"),
    `${JSON.stringify({ ts: "2026-08-23T00:00:00.000Z", actor: "research-gate", action: "research_open", task: "T-022", research_task: "T-031", card })}\n`,
  );
}

function writeCard(root, overrides = {}) {
  const probeArtifact = path.join(root, "docs", "evidence", "strict-probe.json");
  fs.writeFileSync(probeArtifact, '{"gapKind":"proof"}\n');
  const probeSha = createHash("sha256").update(fs.readFileSync(probeArtifact)).digest("hex");
  const card = {
    schema: "research-first-gate/v2",
    task_id: "T-022",
    research_task_id: "T-031",
    status: "validated",
    problem_statement: "一个被要求保持稳定的输出反复违反既定合同。",
    failure_family: "output-contract-instability",
    observed_invariant: "已发布输出必须满足已批准合同。",
    trigger_kinds: ["repeated-failure-family", "violated-invariant"],
    paused_actions: ["further-production-changes", "broadened-workaround", "repeated-full-system-runs", "irreversible-operations"],
    evidence: {
      authoritative: [{ kind: "official-doc", ref: "https://example.com/contract", claim: "供应方声明该模式可约束输出结构" }],
      local: [{ kind: "source-code", path: "Workbench/worker/model_gateway.py", locator: "request_body", observation: "当前路径没有启用该约束" }],
      experiments: [{ question: "启用约束后是否消除结构偏差？", command: "node probe.mjs", environment: "local test fixture", result: "结构偏差消失", artifact_path: "docs/evidence/strict-probe.json", artifact_sha256: probeSha }],
    },
    options: [
      { id: "OPT-1", outcome: "最小约束试点", tradeoffs: "需要改一条边界", scope: "单一输出", falsified_by: "探针仍然偏离合同" },
      { id: "OPT-2", outcome: "保持现状", tradeoffs: "保留已知不稳定", scope: "不改代码", falsified_by: "当前发布标准不接受偏差" },
    ],
    recommendation: "OPT-1",
    validation: {
      timebox_minutes: 120,
      max_experiments: 2,
      acceptance_criteria: [
        { name: "contract_pass_rate", target: "100%", measurement: "固定样本探针", observed: "100%", verify_key: "contract_probe", evidence_path: "docs/evidence/strict-probe.json", evidence_sha256: probeSha },
        { name: "regression_count", target: "0", measurement: "现有回归集", observed: "0", verify_key: "contract_probe", evidence_path: "docs/evidence/strict-probe.json", evidence_sha256: probeSha },
      ],
      resume_criteria: "pilot evidence recorded and required decisions confirmed",
    },
    decision_impacts: ["data-contract", "release-criteria"],
    decision_ids: ["DEC-036"],
    ...overrides,
  };
  const file = path.join(root, "docs", "research", "T-031.md");
  fs.writeFileSync(file, `# T-031\n\n\`\`\`research-first-gate/v2\n${JSON.stringify(card, null, 2)}\n\`\`\`\n`);
  return file;
}

test("同一任务第二次技术干预仍未恢复不变量时自动暂停并开启研究门", () => {
  const root = fixture();
  writeCard(root, { status: "researching" });
  const args = [
    "observe", "T-022",
    "--family", "output-contract-instability",
    "--trigger", "violated-invariant",
    "--evidence", "docs/evidence/failure.md",
    "--cost", "high",
    "--research-task", "T-031",
    "--card", "docs/research/T-031.md",
  ];
  let result = run(root, ...args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(root, ...args);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /RESEARCH_REQUIRED|研究门/);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-022[^\n]+⏸️/);
  const events = fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8");
  assert.match(events, /research_open/);
  assert.match(events, /output-contract-instability/);
});

test("研究卡缺权威依据、当前系统证据、区分性实验或候选取舍时拒绝恢复", () => {
  const root = fixture();
  writeCard(root, {
    evidence: { authoritative: [], local: [], experiments: [] },
    options: [],
  });
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /official|官方|current code|当前代码|probe|探针|options|候选/i);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-022[^\n]+⏸️/);
});

test("数据契约或发布标准变化只有候选 DEC 时必须等待用户确认", () => {
  const root = fixture();
  writeCard(root);
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  fs.writeFileSync(
    path.join(root, "orchestrator", "DECISION_LOG.md"),
    "ID: DEC-036\nType: technical-decision-candidate\nOwner: agent\nStatus: needs-user-confirmation\n",
  );
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md", "--decision", "DEC-036");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /用户确认|Owner: user|needs-user-confirmation/i);
});

test("有界研究完成且高影响决策由用户确认后才允许回到待办", () => {
  const root = fixture();
  writeCard(root);
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  fs.writeFileSync(
    path.join(root, "orchestrator", "DECISION_LOG.md"),
    "ID: DEC-036\nType: technical-decision\nOwner: user\nSource: user confirmation 2026-08-23\nStatus: active\n",
  );
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md", "--decision", "DEC-036");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-022[^\n]+📋/);
  assert.match(fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8"), /research_resume/);
});

test("同一任务连续两个相关技术失败不能靠交替 trigger kind 延迟研究门", () => {
  const root = fixture();
  writeCard(root, { status: "researching", trigger_kinds: ["violated-invariant", "non-deterministic-behavior"] });
  let result = run(root, "observe", "T-022", "--family", "output-contract-instability", "--trigger", "violated-invariant", "--evidence", "docs/evidence/failure.md", "--research-task", "T-031", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(root, "observe", "T-022", "--family", "output-contract-instability", "--trigger", "non-deterministic-behavior", "--evidence", "docs/evidence/failure.md", "--research-task", "T-031", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-022[^\n]+⏸️/);
});

test("resume 必须绑定最近 research_open 的同一张卡，不能换预填卡关门", () => {
  const root = fixture();
  const original = writeCard(root, { status: "researching" });
  const args = ["observe", "T-022", "--family", "output-contract-instability", "--trigger", "violated-invariant", "--evidence", "docs/evidence/failure.md", "--research-task", "T-031", "--card", "docs/research/T-031.md"];
  run(root, ...args);
  const opened = run(root, ...args);
  assert.equal(opened.status, 2, opened.stderr || opened.stdout);
  const alternate = path.join(root, "docs", "research", "alternate.md");
  fs.copyFileSync(original, alternate);
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), "ID: DEC-036\nType: technical-decision\nOwner: user\nSource: user confirmation\nStatus: active\n");
  const result = run(root, "resume", "T-022", "--card", "docs/research/alternate.md", "--decision", "DEC-036");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /research_open|同一张卡|绑定/i);
});

test("空壳官方资料、不存在的代码路径和未绑定探针工件不能洗绿研究卡", () => {
  const root = fixture();
  writeCard(root, {
    evidence: {
      authoritative: [{}],
      local: [{ kind: "source-code", path: "missing.py", locator: "line 1", observation: "claim" }],
      experiments: [{ question: "是否成立？", command: "echo ok", environment: "fixture", result: "ok", artifact_sha256: "a".repeat(64) }],
    },
    options: [{ id: "OPT-1" }, { id: "OPT-2" }],
  });
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), "ID: DEC-036\nType: technical-decision\nOwner: user\nSource: user confirmation\nStatus: active\n");
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md", "--decision", "DEC-036");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /官方|URL|代码路径|artifact|工件|tradeoffs|取舍/i);
});

test("任意技术问题可用项目自己的 failure family 与通用 trigger 开门", () => {
  const root = fixture();
  writeCard(root, {
    status: "researching",
    failure_family: "persistence-locking",
    trigger_kinds: ["violated-invariant", "unsuccessful-intervention-churn"],
  });
  const common = [
    "--family", "persistence-locking",
    "--evidence", "docs/evidence/failure.md",
    "--research-task", "T-031",
    "--card", "docs/research/T-031.md",
  ];
  let result = run(root, "observe", "T-022", "--trigger", "violated-invariant", ...common);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(root, "observe", "T-022", "--trigger", "unsuccessful-intervention-churn", ...common);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8"), /persistence-locking/);
});

test("未知外部能力可立即暂停，且恢复接受领域自定义验收指标", () => {
  const root = fixture();
  const artifact = path.join(root, "docs", "evidence", "sdk-probe.txt");
  fs.writeFileSync(artifact, "feature unsupported in sandbox\n");
  const artifactSha = createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), JSON.stringify({
    research_verify_commands: { sdk_probe: "node -e \"const fs=require('fs');process.exit(fs.readFileSync('docs/evidence/sdk-probe.txt','utf8').includes('unsupported')?0:1)\"" },
  }));
  const card = {
    schema: "research-first-gate/v2",
    task_id: "T-022",
    research_task_id: "T-031",
    status: "validated",
    problem_statement: "需要确认供应商 SDK 是否支持离线恢复。",
    failure_family: "vendor-offline-recovery",
    observed_invariant: "断网后不得丢失已确认操作。",
    trigger_kinds: ["external-capability-unknown"],
    paused_actions: ["further-production-changes", "broadened-workaround", "repeated-full-system-runs", "irreversible-operations"],
    evidence: {
      authoritative: [{ kind: "official-doc", ref: "https://vendor.example/sdk", claim: "文档未声明离线恢复能力" }],
      local: [{ kind: "runtime", path: "Workbench/worker/model_gateway.py", locator: "request path", observation: "当前实现依赖该 SDK" }],
      experiments: [{ question: "SDK 在断网恢复后是否重放？", command: "vendor-sdk-probe", environment: "sandbox", result: "not supported", artifact_path: "docs/evidence/sdk-probe.txt", artifact_sha256: artifactSha }],
    },
    options: [
      { id: "OPT-1", outcome: "隔离适配层", tradeoffs: "增加小型适配代码", scope: "该 SDK", falsified_by: "供应商原生支持" },
      { id: "OPT-2", outcome: "延后离线能力", tradeoffs: "本期不承诺离线恢复", scope: "发布范围", falsified_by: "离线是硬验收" },
    ],
    recommendation: "OPT-1",
    validation: {
      timebox_minutes: 90,
      max_experiments: 2,
      acceptance_criteria: [
        { name: "offline_replay_loss", target: "0", measurement: "10 次断网恢复探针", observed: "0", verify_key: "sdk_probe", evidence_path: "docs/evidence/sdk-probe.txt", evidence_sha256: artifactSha },
        { name: "recovery_p95", target: "< 3s", measurement: "探针计时", observed: "2.4s", verify_key: "sdk_probe", evidence_path: "docs/evidence/sdk-probe.txt", evidence_sha256: artifactSha },
      ],
      resume_criteria: "两项标准均达到并记录证据",
    },
    decision_impacts: ["none"],
    decision_ids: [],
  };
  fs.writeFileSync(path.join(root, "docs", "research", "T-031.md"), `# T-031\n\n\`\`\`research-first-gate/v2\n${JSON.stringify(card, null, 2)}\n\`\`\`\n`);
  const result = run(root, "observe", "T-022", "--family", "vendor-offline-recovery", "--trigger", "external-capability-unknown", "--evidence", "docs/evidence/failure.md", "--research-task", "T-031", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const resumed = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-022[^\n]+📋/);
});

test("researching 卡或未达标验收不得用非空文字洗绿恢复", () => {
  const root = fixture();
  writeCard(root, {
    status: "researching",
    validation: {
      timebox_minutes: 60,
      max_experiments: 1,
      acceptance_criteria: [
        { name: "deadlock_rate", target: "0", measurement: "stress probe", observed: "3", passed: false, evidence_path: "docs/evidence/strict-probe.json" },
        { name: "lock_wait_p95", target: "<50ms", measurement: "trace", observed: "900ms", passed: false, evidence_path: "docs/evidence/strict-probe.json" },
      ],
      resume_criteria: "both pass",
    },
  });
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md", "--decision", "DEC-036");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /validated|passed=true/i);
});

test("验收自报不能恢复：证据 hash 与 allowlisted verify command 都必须现场成立", () => {
  const root = fixture();
  writeCard(root);
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  fs.appendFileSync(path.join(root, "docs", "evidence", "strict-probe.json"), "tampered\n");
  let result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /evidence hash|证据.*hash|hash 不匹配/i);

  writeCard(root);
  fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), JSON.stringify({ research_verify_commands: { contract_probe: "node -e \"process.exit(7)\"" } }));
  result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /现场验证失败|exit 7/i);
});

test("跨平台签名问题可用二进制证据和项目指标完成同一套恢复门", () => {
  const root = fixture();
  const binaryRel = "docs/evidence/signed-probe.bin";
  const binary = Buffer.from([0, 255, 1, 128, 65, 0, 66]);
  fs.writeFileSync(path.join(root, binaryRel), binary);
  const binarySha = createHash("sha256").update(binary).digest("hex");
  fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), JSON.stringify({
    research_verify_commands: { signing_probe: "node -e \"const fs=require('fs');process.exit(fs.readFileSync('docs/evidence/signed-probe.bin').length===7?0:1)\"" },
  }));
  const card = {
    schema: "research-first-gate/v2", task_id: "T-022", research_task_id: "T-031", status: "validated",
    problem_statement: "相同产物在另一平台签名后无法启动。", failure_family: "cross-platform-path-signing",
    observed_invariant: "发布产物必须在支持的平台完成路径回环和签名验证。",
    trigger_kinds: ["high-cost-feedback-loop"], paused_actions: ["further-production-changes", "broadened-workaround", "repeated-full-system-runs", "irreversible-operations"],
    evidence: {
      authoritative: [{ kind: "standard", ref: "https://example.com/platform-signing-standard", claim: "签名覆盖原始字节" }],
      local: [{ kind: "config", path: "Workbench/worker/model_gateway.py", locator: "build config", observation: "目标平台使用不同路径规范" }],
      experiments: [{ question: "规范化路径后签名是否稳定？", command: "signing-probe", environment: "isolated device", result: "stable", artifact_path: binaryRel, artifact_sha256: binarySha }],
    },
    options: [
      { id: "OPT-1", outcome: "边界处规范化路径", tradeoffs: "增加一处适配", scope: "签名输入", falsified_by: "规范化后仍失败" },
      { id: "OPT-2", outcome: "限制单平台发布", tradeoffs: "缩小支持范围", scope: "本次发布", falsified_by: "跨平台已是硬验收" },
    ], recommendation: "OPT-1",
    validation: { timebox_minutes: 120, max_experiments: 1, acceptance_criteria: [
      { name: "signature_verify", target: "pass", measurement: "目标平台验证", observed: "pass", verify_key: "signing_probe", evidence_path: binaryRel, evidence_sha256: binarySha },
      { name: "path_round_trip", target: "100%", measurement: "路径样本回环", observed: "100%", verify_key: "signing_probe", evidence_path: binaryRel, evidence_sha256: binarySha },
    ], resume_criteria: "两项验证通过" }, decision_impacts: ["none"], decision_ids: [],
  };
  fs.writeFileSync(path.join(root, "docs", "research", "T-031.md"), `# T-031\n\n\`\`\`research-first-gate/v2\n${JSON.stringify(card, null, 2)}\n\`\`\`\n`);
  const opened = run(root, "observe", "T-022", "--family", "cross-platform-path-signing", "--trigger", "high-cost-feedback-loop", "--evidence", binaryRel, "--research-task", "T-031", "--card", "docs/research/T-031.md");
  assert.equal(opened.status, 2, opened.stderr || opened.stdout);
  const resumed = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
});

test("v1 研究卡在旧项目中显式 fail-closed，不得静默按案例特化规则恢复", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "docs", "research", "T-031.md"), "```research-first-gate/v1\n{\"schema\":\"research-first-gate/v1\"}\n```\n");
  fs.writeFileSync(path.join(root, "BACKLOG.md"), fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace("T-022 | 企业资产 | 🔨", "T-022 | 企业资产 | ⏸️"));
  markOpen(root);
  const result = run(root, "resume", "T-022", "--card", "docs/research/T-031.md");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /v1.*迁移.*v2|v2.*迁移/i);
});
