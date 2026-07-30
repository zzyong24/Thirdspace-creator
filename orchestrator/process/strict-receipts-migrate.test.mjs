import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATOR = path.join(HERE, "strict-receipts-migrate.mjs");
const TASKCTL = path.join(HERE, "taskctl.mjs");
const TEMPLATES = path.resolve(HERE, "..", "templates");

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function legacyProject({ explicitLegacy = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "strict-receipts-"));
  const control = path.join(root, "orchestrator");
  fs.mkdirSync(control, { recursive: true });
  fs.cpSync(HERE, path.join(control, "process"), { recursive: true });
  for (const name of [
    "ARTIFACT_MANIFEST",
    "ID_REGISTRY",
    "DECISION_LOG",
    "TRACEABILITY_MATRIX",
  ]) {
    fs.copyFileSync(
      path.join(TEMPLATES, `${name}_TEMPLATE.${name === "ARTIFACT_MANIFEST" ? "yaml" : "md"}`),
      path.join(control, `${name}.${name === "ARTIFACT_MANIFEST" ? "yaml" : "md"}`),
    );
  }
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "# Legacy",
      "",
      "| ID | 任务 | 状态 | 文档 | 审核 | 下一步 |",
      "| --- | --- | --- | --- | --- | --- |",
      "| T-UI | 产品→套餐→销售方案 | 🔨 进行中 | [页面](PAGE.md) | — | 部署验证 |",
      "| T-DOC | 更新说明 | 📋 待办 | [说明](DOC.md) | 待审 | 完成说明 |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "PAGE.md"), "# page\n");
  fs.writeFileSync(path.join(root, "DOC.md"), "# doc\n");
  fs.writeFileSync(
    path.join(control, "process", "reconcile.config.json"),
    `${JSON.stringify({
      work_branch: "main",
      control_root: "orchestrator",
      ...(explicitLegacy ? { receipt_policy: "legacy" } : {}),
      probes: [],
    }, null, 2)}\n`,
  );
  return root;
}

test("--help 只展示用法且不要求项目上下文", () => {
  const result = run(MIGRATOR, ["--help"], os.tmpdir());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /check|apply|--non-ui/);
});

test("缺 receipt_policy 的旧项目 reconcile 必须 fail-closed", () => {
  const root = legacyProject();
  const result = run(path.join(root, "orchestrator", "process", "reconcile.mjs"), [], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /receipt_policy|required|迁移/i);
});

test("显式 legacy 也不能继续完成任务", () => {
  const root = legacyProject({ explicitLegacy: true });
  const result = run(
    TASKCTL,
    ["complete", "T-UI", "--backlog", "BACKLOG.md", "--evidence", "截图和单测都绿"],
    root,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /legacy|迁移|required/i);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /🔨 进行中/);
});

test("migrator check 识别缺列，apply 以可恢复事务升级为 strict 且默认全部待验", () => {
  const root = legacyProject();
  let result = run(MIGRATOR, ["check"], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /验收|receipt_policy/);

  result = run(MIGRATOR, ["apply"], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  assert.match(backlog, /\|\s*验收\s*\|/);
  assert.equal((backlog.match(/待验/g) ?? []).length, 2);
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), "utf8"),
  );
  assert.equal(config.receipt_policy, "required");
  assert.deepEqual(config.frontend_verify_commands, {});

  result = run(MIGRATOR, ["check"], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("迁移后普通证据文本不能完成 UI 任务", () => {
  const root = legacyProject();
  let result = run(MIGRATOR, ["apply"], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(
    TASKCTL,
    ["complete", "T-UI", "--backlog", "BACKLOG.md", "--evidence", "截图和单测都绿"],
    root,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /UI 旅程验收失败|report|报告/i);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /🔨 进行中/);
});

test("--non-ui 只允许明确列出的任务验收为破折号", () => {
  const root = legacyProject();
  const result = run(MIGRATOR, ["apply", "--non-ui", "T-DOC"], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  const docRow = backlog.split(/\r?\n/).find((line) => line.includes("T-DOC"));
  const uiRow = backlog.split(/\r?\n/).find((line) => line.includes("T-UI"));
  assert.match(docRow, /—/);
  assert.match(uiRow, /待验/);
});

test("上次进程若在双文件提交中断，下一次调用先恢复一致旧状态", () => {
  const root = legacyProject();
  const processDir = path.join(root, "orchestrator", "process");
  const backlogFile = path.join(root, "BACKLOG.md");
  const configFile = path.join(processDir, "reconcile.config.json");
  const journalFile = path.join(processDir, ".strict-receipts-transaction.json");
  const backlogBackup = path.join(processDir, ".strict-receipts-BACKLOG.before");
  const configBackup = path.join(processDir, ".strict-receipts-config.before");
  const backlogBefore = fs.readFileSync(backlogFile, "utf8");
  const configBefore = fs.readFileSync(configFile, "utf8");
  const configAfter = `${JSON.stringify(
    {
      ...JSON.parse(configBefore),
      receipt_policy: "required",
      frontend_verify_commands: {},
    },
    null,
    2,
  )}\n`;
  const backlogAfter = `${backlogBefore}\n<!-- simulated next backlog -->\n`;

  fs.writeFileSync(backlogBackup, backlogBefore);
  fs.writeFileSync(configBackup, configBefore);
  fs.writeFileSync(
    journalFile,
    `${JSON.stringify({
      schema: "strict-receipts-transaction/v1",
      config_existed: true,
      backlog_before_sha256: digest(backlogBefore),
      config_before_sha256: digest(configBefore),
      backlog_after_sha256: digest(backlogAfter),
      config_after_sha256: digest(configAfter),
    })}\n`,
  );
  fs.writeFileSync(configFile, configAfter);

  const result = run(MIGRATOR, ["check"], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /恢复|recovery|receipt_policy/i);
  assert.equal(fs.readFileSync(backlogFile, "utf8"), backlogBefore);
  assert.equal(fs.readFileSync(configFile, "utf8"), configBefore);
  assert.equal(fs.existsSync(journalFile), false);
  assert.equal(fs.existsSync(backlogBackup), false);
  assert.equal(fs.existsSync(configBackup), false);
});
