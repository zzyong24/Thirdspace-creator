import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(HERE, "frontend-validation.mjs");
const TASKCTL = path.join(HERE, "taskctl.mjs");
const VERIFY_COMMAND = `node -e "process.stdout.write('journey-ok')"`;

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function writeBlock(file, tag, value) {
  fs.writeFileSync(file, `# Evidence\n\n\`\`\`${tag}\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`);
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function gitHead(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

function fileSha(file) {
  return createHash("sha256").update(fs.readFileSync(file, "utf8"), "utf8").digest("hex");
}

function setup({ strict = false, verifyCommand = "" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-validation-"));
  fs.mkdirSync(path.join(root, "orchestrator"), { recursive: true });
  if (strict) {
    fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "orchestrator", "process", "reconcile.config.json"),
      JSON.stringify({
        receipt_policy: "required",
        frontend_verify_commands: { "content-radar:e2e": verifyCommand },
      }),
    );
  }
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "# BACKLOG",
      "",
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 | 一句话 |",
      "|---|---|---|---|---|---|---|",
      "| T-RADAR | 内容雷达分类切换 | 🔨 | [PAGE](PAGE.md) | — | 待验 | 列表/选择/详情连续 |",
      "",
    ].join("\n"),
  );
  const contract = {
    schema: "frontend-journey-contract/v1",
    task_id: "T-RADAR",
    required_checks: [
      { id: "AC-RADAR-LIST", test_id: "E2E-RADAR-01" },
      { id: "AC-RADAR-SELECTION", test_id: "E2E-RADAR-01" },
      { id: "AC-RADAR-DETAIL", test_id: "E2E-RADAR-01" },
      { id: "AC-RADAR-NEXT", test_id: "E2E-RADAR-01" },
    ],
    required_conditions: ["loading", "empty", "error", "back", "refresh", "repeat"],
    watched_paths: ["src"],
    viewports: [
      { width: 1440, height: 900 },
      { width: 1024, height: 700 },
    ],
    coherence_groups: [
      {
        id: "radar-master-detail",
        pattern: "master-detail",
        control: "source-category",
        collection: "topic-list",
        selection: "selected-topic",
        detail: "topic-detail",
        transition: "source-category-change",
        policy: "clear-or-reselect",
        check_ids: {
          collection_matches_control: "AC-RADAR-LIST",
          selection_valid_or_empty: "AC-RADAR-SELECTION",
          detail_matches_selection_or_empty: "AC-RADAR-DETAIL",
          next_action_when_empty: "AC-RADAR-NEXT",
        },
      },
    ],
  };
  writeBlock(path.join(root, "PAGE.md"), "frontend-journey-contract", contract);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "ui.js"), "export const ui = 'ready';\n");
  if (strict) {
    git(root, ["init"]);
    git(root, ["config", "user.email", "frontend-validation@example.test"]);
    git(root, ["config", "user.name", "Frontend Validation Test"]);
    git(root, ["add", "BACKLOG.md", "PAGE.md", "src/ui.js", "orchestrator/process/reconcile.config.json"]);
    git(root, ["commit", "-m", "initial UI"]);
  }
  return root;
}

function baseReport(overrides = {}) {
  return {
    schema: "frontend-validation/v1",
    task_id: "T-RADAR",
    contract_path: "PAGE.md",
    commit_sha: "abcdef123456",
    observed_at: "2026-07-27T12:00:00.000Z",
    run: {
      verify_key: "content-radar:e2e",
      command: "pnpm playwright test content-radar.spec.ts",
      exit_code: 0,
      output_ref: "playwright: 1 passed",
    },
    environment: {
      surface: "desktop-web",
      runtime: "chromium@140",
      viewports: [
        { width: 1440, height: 900, result: "pass" },
        { width: 1024, height: 700, result: "pass" },
      ],
    },
    data: {
      mode: "non-fixture",
      witnesses: [
        { id: "opaque-A1", role: "category-A" },
        { id: "opaque-B1", role: "category-B" },
      ],
    },
    levels: {
      logic: { status: "pass", evidence_ref: "selector.test.ts" },
      surface: { status: "pass", evidence_ref: "content-radar.spec.ts" },
      journey: { status: "pass", evidence_ref: "playwright: 1 passed" },
      experience: { status: "not-requested", evidence_ref: "SHIP confirmation pending" },
    },
    checks: [],
    coverage: ["loading", "empty", "error", "back", "refresh", "repeat"].map((condition) => ({
      condition,
      result: "pass",
      evidence_ref: `E2E-${condition}`,
      reason: "",
    })),
    tdd_red_ref: "red-log: stale detail was visible",
    open_defects: [],
    status: "pass",
    ...overrides,
  };
}

function passingChecks() {
  return ["LIST", "SELECTION", "DETAIL", "NEXT"].map((name) => ({
    id: `AC-RADAR-${name}`,
    test_id: "E2E-RADAR-01",
    result: "pass",
    evidence_ref: `content-radar.spec.ts#${name.toLowerCase()}`,
  }));
}

function enableVisibleCopyGuard(root) {
  const page = path.join(root, "PAGE.md");
  const contract = JSON.parse(
    fs.readFileSync(page, "utf8").match(/```frontend-journey-contract\n([\s\S]*?)\n```/)[1],
  );
  contract.schema = "frontend-journey-contract/v2";
  contract.copy_guard = { forbid_internal_ids: true };
  writeBlock(page, "frontend-journey-contract", contract);
}

function writeVisibleCopyArtifact(root, texts) {
  const artifact = {
    schema: "frontend-visible-copy/v1",
    task_id: "T-RADAR",
    commit_sha: "abcdef123456",
    captures: [
      {
        checkpoint: "settled-normal",
        check_ids: ["AC-RADAR-LIST", "AC-RADAR-SELECTION", "AC-RADAR-DETAIL", "AC-RADAR-NEXT"],
        viewport: { width: 1440, height: 900 },
        text: texts.join("\n"),
      },
      {
        checkpoint: "settled-minimum",
        check_ids: ["AC-RADAR-LIST", "AC-RADAR-SELECTION", "AC-RADAR-DETAIL", "AC-RADAR-NEXT"],
        viewport: { width: 1024, height: 700 },
        text: texts.join("\n"),
      },
    ],
  };
  const file = path.join(root, "visible-copy.json");
  fs.writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
  return {
    artifact_path: "visible-copy.json",
    artifact_sha256: fileSha(file),
  };
}

function strictReport(root, overrides = {}) {
  return baseReport({
    contract_sha: fileSha(path.join(root, "PAGE.md")).slice(0, 12),
    commit_sha: gitHead(root),
    run: {
      verify_key: "content-radar:e2e",
      command: VERIFY_COMMAND,
      exit_code: 0,
      output_ref: "taskctl captured output hash",
    },
    checks: passingChecks(),
    ...overrides,
  });
}

function completeStrictReceipt(root, report = strictReport(root)) {
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    report,
  );
  const result = run(
    TASKCTL,
    [
      "complete",
      "T-RADAR",
      "--backlog",
      "BACKLOG.md",
      "--evidence",
      "FRONTEND_VALIDATION_REPORT.md",
    ],
    root,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test("内容雷达：列表测试全绿但 selection/detail 后置条件缺失时稳定 FAIL", () => {
  const root = setup();
  const broken = baseReport({
    checks: [{ id: "AC-RADAR-LIST", test_id: "E2E-RADAR-01", result: "pass", evidence_ref: "列表为 B1" }],
  });
  writeBlock(path.join(root, "FRONTEND_VALIDATION_REPORT.md"), "frontend-validation", broken);
  const r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1, "局部绿色不得替代 master-detail 一致性");
  assert.match(r.stderr + r.stdout, /AC-RADAR-SELECTION/);
  assert.match(r.stderr + r.stdout, /AC-RADAR-DETAIL/);
});

test("真实浏览器、互斥 witness、两档窗口与全部后置条件齐全时 PASS", () => {
  const root = setup();
  const checks = ["LIST", "SELECTION", "DETAIL", "NEXT"].map((name) => ({
    id: `AC-RADAR-${name}`,
    test_id: "E2E-RADAR-01",
    result: "pass",
    evidence_ref: `content-radar.spec.ts#${name.toLowerCase()}`,
  }));
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    baseReport({ checks }),
  );
  const r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /frontend journey evidence PASS/i);
});

test("可见文案证据出现 T106 / API-203 时，即使旅程全绿也必须 FAIL", () => {
  const root = setup();
  enableVisibleCopyGuard(root);
  const visibleCopy = writeVisibleCopyArtifact(root, [
    "内容雷达",
    "生成个啥 T106",
    "调用 API-203",
  ]);
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    baseReport({ checks: passingChecks(), visible_copy: visibleCopy }),
  );
  const r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1, "内部追踪 ID 不得成为用户文案");
  assert.match(r.stderr + r.stdout, /T106/);
  assert.match(r.stderr + r.stdout, /API-203/);
});

test("可见文案出现实现术语或原始错误暗号时，即使没有控制编号也必须 FAIL", () => {
  const root = setup();
  enableVisibleCopyGuard(root);
  const visibleCopy = writeVisibleCopyArtifact(root, [
    "充值失败，请提供 Trace ID",
    "IDEMPOTENCY_KEY_REQUIRED",
    "provider schema enum 配置错误",
  ]);
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    baseReport({ checks: passingChecks(), visible_copy: visibleCopy }),
  );
  const r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1, "实现术语和机器错误码不得成为用户文案");
  assert.match(r.stderr + r.stdout, /Trace ID|IDEMPOTENCY_KEY_REQUIRED|provider/i);
});

test("声明可见文案 guard 后，缺浏览器文本证据不能 PASS；正常文案可以 PASS", () => {
  const root = setup();
  enableVisibleCopyGuard(root);
  const reportFile = path.join(root, "FRONTEND_VALIDATION_REPORT.md");
  writeBlock(
    reportFile,
    "frontend-validation",
    baseReport({ checks: passingChecks() }),
  );
  let r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1, "有 copy guard 就必须提交可机械扫描的真实可见文本");
  assert.match(r.stderr + r.stdout, /visible_copy|可见文案/i);

  const visibleCopy = writeVisibleCopyArtifact(root, ["内容雷达", "生成内容", "查看详情"]);
  writeBlock(
    reportFile,
    "frontend-validation",
    baseReport({ checks: passingChecks(), visible_copy: visibleCopy }),
  );
  r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("taskctl 对待验 UI 任务拒绝任意绿色文字，只接受可验证报告并写 receipt", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  let r = run(
    TASKCTL,
    ["complete", "T-RADAR", "--backlog", "BACKLOG.md", "--evidence", "unit tests green"],
    root,
  );
  assert.equal(r.status, 1, "待验任务不再接受任意 evidence 字符串");
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /T-RADAR.*🔨.*待验/);

  const checks = ["LIST", "SELECTION", "DETAIL", "NEXT"].map((name) => ({
    id: `AC-RADAR-${name}`,
    test_id: "E2E-RADAR-01",
    result: "pass",
    evidence_ref: `content-radar.spec.ts#${name.toLowerCase()}`,
  }));
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    strictReport(root, { checks }),
  );
  r = run(
    TASKCTL,
    [
      "complete",
      "T-RADAR",
      "--backlog",
      "BACKLOG.md",
      "--evidence",
      "FRONTEND_VALIDATION_REPORT.md",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  assert.match(backlog, /T-RADAR.*✅.*PASS:[a-f0-9]{12}/);
  const event = JSON.parse(
    fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8").trim().split("\n").at(-1),
  );
  assert.equal(event.report, "FRONTEND_VALIDATION_REPORT.md");
  assert.match(event.report_sha, /^[a-f0-9]{12}$/);
});

test("fixture/jsdom、重复 viewport、同一 witness 冒充两类都会 fail-closed", () => {
  const root = setup();
  const page = path.join(root, "PAGE.md");
  const contract = JSON.parse(
    fs.readFileSync(page, "utf8").match(/```frontend-journey-contract\n([\s\S]*?)\n```/)[1],
  );
  contract.viewports[1] = { ...contract.viewports[0] };
  writeBlock(page, "frontend-journey-contract", contract);
  const checks = ["LIST", "SELECTION", "DETAIL", "NEXT"].map((name) => ({
    id: `AC-RADAR-${name}`,
    test_id: "E2E-RADAR-01",
    result: "pass",
    evidence_ref: `content-radar.spec.ts#${name.toLowerCase()}`,
  }));
  const report = baseReport({
    environment: {
      surface: "desktop-web",
      runtime: "jsdom",
      viewports: [
        { width: 1440, height: 900, result: "pass" },
        { width: 1024, height: 700, result: "pass" },
      ],
    },
    data: {
      mode: "fixture",
      witnesses: [
        { id: "same", role: "category-A" },
        { id: "same", role: "category-B" },
      ],
    },
    checks,
  });
  writeBlock(path.join(root, "FRONTEND_VALIDATION_REPORT.md"), "frontend-validation", report);
  const r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /viewport.*唯一|jsdom|non-fixture|不同 id/i);
});

test("required condition 不能用口头 N/A 豁免；篡改已完成报告会让 audit 变红", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  const checks = ["LIST", "SELECTION", "DETAIL", "NEXT"].map((name) => ({
    id: `AC-RADAR-${name}`,
    test_id: "E2E-RADAR-01",
    result: "pass",
    evidence_ref: `content-radar.spec.ts#${name.toLowerCase()}`,
  }));
  const reportFile = path.join(root, "FRONTEND_VALIDATION_REPORT.md");
  const report = baseReport({
    checks,
    coverage: baseReport().coverage.map((item) =>
      item.condition === "refresh"
        ? { ...item, result: "not-applicable", reason: "暂不测刷新" }
        : item,
    ),
  });
  writeBlock(reportFile, "frontend-validation", report);
  let r = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    root,
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /refresh.*必须.*pass/i);

  writeBlock(
    reportFile,
    "frontend-validation",
    strictReport(root, { checks }),
  );
  r = run(
    TASKCTL,
    [
      "complete",
      "T-RADAR",
      "--backlog",
      "BACKLOG.md",
      "--evidence",
      "FRONTEND_VALIDATION_REPORT.md",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  fs.appendFileSync(reportFile, "\n<!-- tampered after completion -->\n");
  r = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /hash 已变化|receipt/i);
});

test("strict 项目删除验收列不能绕过 UI receipt audit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-validation-strict-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    JSON.stringify({ receipt_policy: "required" }),
  );
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 文档 | 审核 |",
      "|---|---|---|---|---|",
      "| T-STRICT | UI | ✅ | [PAGE](PAGE.md) | — |",
      "",
    ].join("\n"),
  );
  const r = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /缺少「验收」列|缺.*验收/i);
});

test("strict audit 只检查执行任务表，暂停池的旧格式索引不要求验收列", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-validation-paused-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    JSON.stringify({ receipt_policy: "required" }),
  );
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |",
      "|---|---|---|---|---|---|---|",
      "| T-ACTIVE | 非 UI 控制面 | 🔨 | — | — | [SPEC](SPEC.md) | 实现中 |",
      "",
      "## ⏸️ 暂停池",
      "",
      "| ID | 任务 | 搁置 | 文档 | 恢复条件 |",
      "|---|---|---|---|---|",
      "| T-PAUSED | 历史暂停任务 | ⏸️ | [详情](PAUSED.md) | 等用户恢复 |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "SPEC.md"), "# SPEC\n");
  const result = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("strict UI complete 只持久化命令输出摘要，不泄漏 stdout/stderr", () => {
  const stdoutSecret = "stdout-secret-should-not-persist";
  const stderrSecret = "stderr-secret-should-not-persist";
  const verifyCommand =
    `node -e "process.stdout.write('${stdoutSecret}'); process.stderr.write('${stderrSecret}')"`;
  const root = setup({ strict: true, verifyCommand });
  completeStrictReceipt(
    root,
    strictReport(root, {
      run: {
        verify_key: "content-radar:e2e",
        command: verifyCommand,
        exit_code: 0,
        output_ref: "taskctl captured output summary",
      },
    }),
  );
  const eventsText = fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8");
  const event = JSON.parse(
    eventsText.trim(),
  );
  assert.equal(event.verification_executed, true);
  assert.match(event.verification_command_sha, /^[a-f0-9]{12}$/);
  assert.match(event.verification_output_sha, /^[a-f0-9]{12}$/);
  assert.equal(
    event.verification_output_bytes,
    Buffer.byteLength(`${stdoutSecret}${stderrSecret}`, "utf8"),
  );
  for (const rawField of [
    "verification_output_tail",
    "verification_stdout",
    "verification_stderr",
  ]) {
    assert.equal(rawField in event, false, `${rawField} 不得持久化`);
  }
  assert.doesNotMatch(eventsText, new RegExp(`${stdoutSecret}|${stderrSecret}`));
  const audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
});

test("strict contract 必须声明 watched_paths，report receipt 绑定完整 contract 文件", () => {
  const missingPathsRoot = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  const pageFile = path.join(missingPathsRoot, "PAGE.md");
  const contract = JSON.parse(
    fs.readFileSync(pageFile, "utf8").match(/```frontend-journey-contract\n([\s\S]*?)\n```/)[1],
  );
  delete contract.watched_paths;
  writeBlock(pageFile, "frontend-journey-contract", contract);
  writeBlock(
    path.join(missingPathsRoot, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    strictReport(missingPathsRoot),
  );
  let result = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    missingPathsRoot,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /watched_paths.*非空/i);

  contract.watched_paths = ["src/does-not-exist"];
  writeBlock(pageFile, "frontend-journey-contract", contract);
  writeBlock(
    path.join(missingPathsRoot, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    strictReport(missingPathsRoot),
  );
  result = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR"],
    missingPathsRoot,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /watched_paths.*不存在/i);

  const boundRoot = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  completeStrictReceipt(boundRoot);
  fs.appendFileSync(path.join(boundRoot, "PAGE.md"), "\n<!-- changed after receipt -->\n");
  result = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], boundRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /contract_sha.*不一致/i);
});

test("strict completion 拒绝任意历史 commit，即使 HEAD 只多了无关提交", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  const testedCommit = gitHead(root);
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "note.md"), "unrelated\n");
  git(root, ["add", "docs/note.md"]);
  git(root, ["commit", "-m", "unrelated docs"]);
  writeBlock(
    path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
    "frontend-validation",
    strictReport(root, { commit_sha: testedCommit }),
  );

  const result = run(
    VALIDATOR,
    ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR", "--execute"],
    root,
  );
  assert.equal(result.status, 1, "strict completion 必须绑定执行当下的 HEAD");
  assert.match(result.stderr + result.stdout, /commit_sha.*HEAD|当前 HEAD/i);
});

test("strict completion 对 watched_paths 的 unstaged、staged、untracked 漂移全部 fail-closed", () => {
  const cases = [
    {
      name: "unstaged",
      mutate(root) {
        fs.appendFileSync(path.join(root, "src", "ui.js"), "// unstaged\n");
      },
    },
    {
      name: "staged",
      mutate(root) {
        fs.appendFileSync(path.join(root, "src", "ui.js"), "// staged\n");
        git(root, ["add", "src/ui.js"]);
      },
    },
    {
      name: "untracked",
      mutate(root) {
        fs.writeFileSync(path.join(root, "src", "new-ui.js"), "export const next = true;\n");
      },
    },
  ];

  for (const scenario of cases) {
    const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
    scenario.mutate(root);
    writeBlock(
      path.join(root, "FRONTEND_VALIDATION_REPORT.md"),
      "frontend-validation",
      strictReport(root),
    );
    const result = run(
      VALIDATOR,
      ["validate", "--report", "FRONTEND_VALIDATION_REPORT.md", "--task", "T-RADAR", "--execute"],
      root,
    );
    assert.equal(result.status, 1, `${scenario.name} watched-path drift 必须拒绝完成`);
    assert.match(result.stderr + result.stdout, /watched_paths|代码漂移|dirty/i);
  }
});

test("audit 允许 receipt 后的无关提交，但 watched_paths 的后续提交会使 receipt 失效", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  completeStrictReceipt(root);

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "note.md"), "unrelated\n");
  git(root, ["add", "docs/note.md"]);
  git(root, ["commit", "-m", "unrelated docs"]);
  let audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);

  fs.appendFileSync(path.join(root, "src", "ui.js"), "// changed after receipt\n");
  git(root, ["add", "src/ui.js"]);
  git(root, ["commit", "-m", "change watched UI"]);
  audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(audit.status, 1);
  assert.match(audit.stderr + audit.stdout, /watched_paths|代码.*变化|receipt.*失效/i);
});

test("已完成 UI 任务用 revalidate 换发当前 HEAD receipt，历史完成事件保持不变", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  completeStrictReceipt(root);
  const originalEvents = fs.readFileSync(
    path.join(root, "orchestrator", "events.ndjson"),
    "utf8",
  );

  fs.appendFileSync(path.join(root, "src", "ui.js"), "// release revalidation\n");
  git(root, ["add", "src/ui.js"]);
  git(root, ["commit", "-m", "release UI change"]);
  writeBlock(
    path.join(root, "REVALIDATION_REPORT.md"),
    "frontend-validation",
    strictReport(root),
  );

  const result = run(
    TASKCTL,
    [
      "revalidate",
      "T-RADAR",
      "--backlog",
      "BACKLOG.md",
      "--evidence",
      "REVALIDATION_REPORT.md",
    ],
    root,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const events = fs
    .readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(events.length, 2);
  assert.equal(events[0].action, "complete");
  assert.equal(events[1].action, "revalidate");
  assert.ok(
    fs.readFileSync(path.join(root, "orchestrator", "events.ndjson"), "utf8")
      .startsWith(originalEvents),
    "revalidate 必须 append，不得重写历史完成事件",
  );
  const audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
});

test("audit 拒绝 watched_paths 当前 dirty，并校验 completion event 的 commit 绑定", () => {
  const dirtyRoot = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  completeStrictReceipt(dirtyRoot);
  fs.writeFileSync(path.join(dirtyRoot, "src", "untracked-ui.js"), "export const dirty = true;\n");
  let audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], dirtyRoot);
  assert.equal(audit.status, 1);
  assert.match(audit.stderr + audit.stdout, /watched_paths|代码漂移|dirty/i);

  const bindingRoot = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  completeStrictReceipt(bindingRoot);
  fs.mkdirSync(path.join(bindingRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(bindingRoot, "docs", "note.md"), "unrelated\n");
  git(bindingRoot, ["add", "docs/note.md"]);
  git(bindingRoot, ["commit", "-m", "unrelated docs"]);
  const eventsFile = path.join(bindingRoot, "orchestrator", "events.ndjson");
  const event = JSON.parse(fs.readFileSync(eventsFile, "utf8").trim());
  event.commit_sha = gitHead(bindingRoot);
  fs.writeFileSync(eventsFile, `${JSON.stringify(event)}\n`);
  audit = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], bindingRoot);
  assert.equal(audit.status, 1);
  assert.match(audit.stderr + audit.stdout, /completion event.*commit|commit.*不一致/i);
});

test("链接 journey contract 的 UI 任务不能把验收改成 — 绕过", () => {
  const root = setup({ strict: true, verifyCommand: VERIFY_COMMAND });
  const backlogFile = path.join(root, "BACKLOG.md");
  fs.writeFileSync(
    backlogFile,
    fs.readFileSync(backlogFile, "utf8").replace("| — | 待验 |", "| — | — |"),
  );
  let r = run(
    TASKCTL,
    ["complete", "T-RADAR", "--backlog", "BACKLOG.md", "--evidence", "unit green"],
    root,
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /journey contract.*验收|不得标 —/i);
  r = run(VALIDATOR, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /不能以 验收=— 绕过/);
});
