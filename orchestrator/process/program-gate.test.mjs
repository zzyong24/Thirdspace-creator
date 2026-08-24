import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, "program-gate.mjs");
const TEMPLATES = path.resolve(HERE, "..", "templates");

function run(args, cwd) {
  return spawnSync(process.execPath, [GATE, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeRepo(parent, id) {
  const root = path.join(parent, id);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), `${id}\n`);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "program-gate@example.test"]);
  git(root, ["config", "user.name", "Program Gate Test"]);
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", `init ${id}`]);
  return { root, commit: git(root, ["rev-parse", "HEAD"]) };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "program-gate-"));
  const reposRoot = path.join(root, "repos");
  const repos = Object.fromEntries(
    ["growth", "activity", "creator"].map((id) => [id, makeRepo(reposRoot, id)]),
  );
  const programRoot = path.join(root, "coordinator");
  const control = path.join(programRoot, "orchestrator", "program");
  fs.mkdirSync(path.join(control, "evidence"), { recursive: true });
  fs.mkdirSync(path.join(control, "executions"), { recursive: true });
  for (const step of ["create", "purchase", "activate", "consume"]) {
    fs.writeFileSync(path.join(control, "evidence", `${step}.txt`), `${step}-observed\n`);
  }

  const steps = [
    { id: "STEP-CREATE", owner_component: "growth", actor: "admin", action: "创建产品", postcondition: "产品可回读" },
    { id: "STEP-PURCHASE", owner_component: "growth", actor: "partner", action: "采购库存", postcondition: "库存增加" },
    { id: "STEP-ACTIVATE", owner_component: "activity", actor: "customer", action: "激活权益", postcondition: "激活状态可查" },
    { id: "STEP-CONSUME", owner_component: "creator", actor: "customer", action: "读取模型配置", postcondition: "配置生效" },
  ];
  const config = {
    schema: "product-program/v1",
    program_id: "thirdspace",
    completion_authority: "program-gate",
    components: Object.entries(repos).map(([id, repo]) => ({
      id,
      repo_path: repo.root,
    })),
    journeys: [
      {
        id: "J-001",
        title: "官方建品到客户端使用",
        critical: true,
        depends_on: [],
        component_ids: ["growth", "activity", "creator"],
        steps,
        verify_commands: [
          {
            id: "E2E-J001",
            cwd: repos.growth.root,
            command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('cross-repo-ok')"`,
          },
        ],
        receipt: "orchestrator/program/receipts/J-001.json",
      },
    ],
  };
  writeJson(path.join(control, "program.config.json"), config);

  const releaseSet = {
    schema: "program-release-set/v1",
    environment: "production",
    generated_at: "2026-07-30T12:00:00.000Z",
    components: Object.fromEntries(
      Object.entries(repos).map(([id, repo]) => [
        id,
        {
          commit_sha: repo.commit,
          deploy_url: `https://${id}.example.test`,
          deployed_at: "2026-07-30T12:00:00.000Z",
        },
      ]),
    ),
  };
  const releaseFile = path.join(control, "release-set.json");
  writeJson(releaseFile, releaseSet);

  const receipt = {
    schema: "program-journey-receipt/v1",
    journey_id: "J-001",
    environment: "production",
    release_set_sha256: sha256(releaseFile),
    observed_at: "2026-07-30T12:10:00.000Z",
    non_fixture: true,
    test_entity_refs: ["product:prod-live-001", "activation:act-live-001"],
    steps: steps.map((step) => ({
      id: step.id,
      status: "pass",
      evidence_refs: [
        `orchestrator/program/evidence/${step.id.replace("STEP-", "").toLowerCase()}.txt`,
      ],
      observed_ref: `${step.id}:observed`,
    })),
    postconditions: {
      read_after_write: true,
      settled: true,
      refresh: true,
      repeat_safe: true,
    },
    open_defects: [],
  };
  writeJson(path.join(control, "receipts", "J-001.json"), receipt);
  return { root: programRoot, control, repos, config, releaseSet, receipt };
}

function enableCanonicalFlow(fixture) {
  const flowFile = path.join(fixture.root, "docs", "journeys", "FLOW-001.md");
  fs.mkdirSync(path.dirname(flowFile), { recursive: true });
  fs.writeFileSync(
    flowFile,
    [
      "<!-- truth: canonical -->",
      "# FLOW-001 官方建品到客户端使用",
      "",
      "| Step-ID | Depends-On | 模块 |",
      "|---|---|---|",
      "| STEP-CREATE | — | growth |",
      "| STEP-PURCHASE | STEP-CREATE | growth |",
      "| STEP-ACTIVATE | STEP-PURCHASE | activity |",
      "| STEP-CONSUME | STEP-ACTIVATE | creator |",
      "",
    ].join("\n"),
  );
  const journey = fixture.config.journeys[0];
  journey.canonical_flow = {
    path: "docs/journeys/FLOW-001.md",
    sha256: sha256(flowFile),
  };
  journey.steps = journey.steps.map((step, index, all) => ({
    id: step.id,
    owner_component: step.owner_component,
    depends_on: index === 0 ? [] : [all[index - 1].id],
  }));
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  return flowFile;
}

test("--help 输出从项目根可直接执行的 vendored 路径", () => {
  const result = run(["--help"], os.tmpdir());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /orchestrator\/process\/program-gate\.mjs/);
  assert.doesNotMatch(result.stdout, /node process\/program-gate\.mjs/);
});

test("三个仓库各自绿色但缺 program execution 时仍然 NO-GO", () => {
  const fixture = setup();
  const result = run([], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /execution|执行回执|NO-GO/i);
});

test("--execute 运行跨仓命令并写入绑定 release set 的执行回执", () => {
  const fixture = setup();
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const execution = path.join(fixture.control, "executions", "J-001.json");
  assert.equal(fs.existsSync(execution), true);
  const value = JSON.parse(fs.readFileSync(execution, "utf8"));
  assert.equal(value.status, "pass");
  assert.equal(value.release_set_sha256, sha256(path.join(fixture.control, "release-set.json")));
  assert.deepEqual(value.commands.map((item) => item.id), ["E2E-J001"]);

  result = run([], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /GO/);
});

test("release set 缺任一参与项目时不能用本仓绿色冒充整体完成", () => {
  const fixture = setup();
  delete fixture.releaseSet.components.activity;
  writeJson(path.join(fixture.control, "release-set.json"), fixture.releaseSet);
  fixture.receipt.release_set_sha256 = sha256(path.join(fixture.control, "release-set.json"));
  writeJson(path.join(fixture.control, "receipts", "J-001.json"), fixture.receipt);
  const result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /activity/);
});

test("program 旅程必须真实跨项目且每个参与组件至少拥有一个步骤", () => {
  const single = setup();
  single.config.journeys[0].component_ids = ["growth"];
  single.config.journeys[0].steps = single.config.journeys[0].steps.filter(
    (step) => step.owner_component === "growth",
  );
  writeJson(path.join(single.control, "program.config.json"), single.config);
  let result = run(["--execute", "J-001"], single.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /component_ids.*至少包含两个/);

  const uncovered = setup();
  uncovered.config.journeys[0].steps = uncovered.config.journeys[0].steps.filter(
    (step) => step.owner_component !== "activity",
  );
  writeJson(path.join(uncovered.control, "program.config.json"), uncovered.config);
  result = run(["--execute", "J-001"], uncovered.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /activity.*步骤|步骤.*activity/);
});

test("receipt 漏步骤或绑定旧 release set 时稳定失败", () => {
  const fixture = setup();
  fixture.receipt.steps = fixture.receipt.steps.filter((item) => item.id !== "STEP-ACTIVATE");
  fixture.receipt.release_set_sha256 = "0".repeat(64);
  writeJson(path.join(fixture.control, "receipts", "J-001.json"), fixture.receipt);
  const result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /STEP-ACTIVATE|release_set_sha256/);
});

test("新一轮跨仓命令失败会留下 FAIL 回执，不能沿用旧绿色", () => {
  const fixture = setup();
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  fixture.config.journeys[0].verify_commands[0].command =
    `${JSON.stringify(process.execPath)} -e "process.exit(7)"`;
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);

  const execution = JSON.parse(
    fs.readFileSync(path.join(fixture.control, "executions", "J-001.json"), "utf8"),
  );
  assert.equal(execution.status, "fail");
  assert.equal(execution.commands[0].exit_code, 7);

  result = run([], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /FAIL|NO-GO/i);
});

test("执行回执只保存输出摘要，绝不把命令中的密钥或用户数据落盘", () => {
  const fixture = setup();
  const secret = "sk-live-never-persist-this";
  fixture.config.journeys[0].verify_commands[0].command =
    `${JSON.stringify(process.execPath)} -e "process.stdout.write('${secret}')"`;
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  const result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const raw = fs.readFileSync(path.join(fixture.control, "executions", "J-001.json"), "utf8");
  assert.doesNotMatch(raw, new RegExp(secret));
  const execution = JSON.parse(raw);
  assert.match(execution.commands[0].stdout_sha256, /^[a-f0-9]{64}$/);
  assert.equal(execution.commands[0].stdout_bytes, Buffer.byteLength(secret));
  assert.equal("stdout" in execution.commands[0], false);
  assert.equal("stderr" in execution.commands[0], false);
});

test("手工伪造当前 execution 不能绕过本轮真实命令", () => {
  const fixture = setup();
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const failing =
    `${JSON.stringify(process.execPath)} -e "process.exit(23)"`;
  fixture.config.journeys[0].verify_commands[0].command = failing;
  const configFile = path.join(fixture.control, "program.config.json");
  writeJson(configFile, fixture.config);

  const executionFile = path.join(fixture.control, "executions", "J-001.json");
  const forged = JSON.parse(fs.readFileSync(executionFile, "utf8"));
  forged.program_config_sha256 = sha256(configFile);
  forged.config_sha256 = sha256(configFile);
  forged.status = "pass";
  forged.finished_at = new Date().toISOString();
  forged.commands[0].command_sha256 = sha256Text(failing);
  forged.commands[0].status = "pass";
  forged.commands[0].exit_code = 0;
  forged.errors = [];
  writeJson(executionFile, forged);

  result = run(["--audit", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /23|命令|fresh|本轮|NO-GO/i);
  const afterAudit = JSON.parse(fs.readFileSync(executionFile, "utf8"));
  assert.equal(afterAudit.status, "fail");
  assert.equal(afterAudit.commands[0].exit_code, 23);
});

test("验证命令绑定 deployed commit，不能用本地未部署修复给旧线上版本洗绿", () => {
  const fixture = setup();
  fs.writeFileSync(path.join(fixture.repos.growth.root, "NEXT.md"), "next iteration\n");
  git(fixture.repos.growth.root, ["add", "NEXT.md"]);
  git(fixture.repos.growth.root, ["commit", "-q", "-m", "next local iteration"]);
  fixture.config.journeys[0].verify_commands[0].command =
    `${JSON.stringify(process.execPath)} -e "process.exit(require('node:fs').existsSync('NEXT.md') ? 0 : 29)"`;
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /29|命令|NO-GO/i);

  fixture.config.journeys[0].verify_commands[0].command =
    `${JSON.stringify(process.execPath)} -e "process.exit(require('node:fs').existsSync('NEXT.md') ? 31 : 0)"`;
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("release_identity 绑定 required commit/only parent，并向 detached checkout 命令暴露只读身份", () => {
  const fixture = setup();
  const growth = fixture.repos.growth;
  fs.writeFileSync(path.join(growth.root, "RELEASE.md"), "approved release\n");
  git(growth.root, ["add", "RELEASE.md"]);
  git(growth.root, ["commit", "-q", "-m", "approved release"]);
  const requiredCommit = git(growth.root, ["rev-parse", "HEAD"]);
  const onlyParent = growth.commit;
  fixture.config.components.find((item) => item.id === "growth").release_identity = {
    required_commit: requiredCommit,
    only_parent: onlyParent,
  };
  fixture.releaseSet.components.growth.commit_sha = requiredCommit;
  const releaseFile = path.join(fixture.control, "release-set.json");
  writeJson(releaseFile, fixture.releaseSet);
  fixture.receipt.release_set_sha256 = sha256(releaseFile);
  writeJson(path.join(fixture.control, "receipts", "J-001.json"), fixture.receipt);
  fixture.config.journeys[0].verify_commands[0].command =
    `${JSON.stringify(process.execPath)} -e ${JSON.stringify([
      "const {spawnSync}=require('node:child_process')",
      `if(process.env.PROGRAM_GATE_COMPONENT_GROWTH_REQUIRED_COMMIT!==${JSON.stringify(requiredCommit)})process.exit(41)`,
      `if(process.env.PROGRAM_GATE_COMPONENT_GROWTH_ONLY_PARENT!==${JSON.stringify(onlyParent)})process.exit(42)`,
      `if(process.env.PROGRAM_GATE_COMPONENT_GROWTH_COMMIT!==${JSON.stringify(requiredCommit)})process.exit(43)`,
      "if(!process.env.PROGRAM_GATE_COMPONENT_GROWTH_ROOT)process.exit(44)",
      "if(spawnSync('git',['rev-parse','--abbrev-ref','HEAD'],{encoding:'utf8'}).stdout.trim()!=='HEAD')process.exit(45)",
    ].join(';'))}`;
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);

  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  fixture.releaseSet.components.growth.commit_sha = onlyParent;
  writeJson(releaseFile, fixture.releaseSet);
  fixture.receipt.release_set_sha256 = sha256(releaseFile);
  writeJson(path.join(fixture.control, "receipts", "J-001.json"), fixture.receipt);
  result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /required_commit|release identity|批准.*commit/i);
});

test("execution 目录 symlink 不得把回执写出 program 根目录", () => {
  const fixture = setup();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "program-gate-outside-"));
  const executions = path.join(fixture.control, "executions");
  fs.rmdirSync(executions);
  fs.symlinkSync(outside, executions, "dir");
  const result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /symlink|越出|executions|NO-GO/i);
  assert.equal(fs.existsSync(path.join(outside, "J-001.json")), false);
});

test("execution 文件本身也不得通过 symlink 引用 program 根外回执", () => {
  const fixture = setup();
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const execution = path.join(fixture.control, "executions", "J-001.json");
  const outside = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "program-gate-execution-file-")),
    "forged.json",
  );
  fs.renameSync(execution, outside);
  fs.symlinkSync(outside, execution);

  result = run(["--audit", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /execution.*symlink|symlink.*execution|NO-GO/i);
});

test("依赖旅程未形成当前 execution 前，后置旅程不能抢跑", () => {
  const fixture = setup();
  const baseJourney = fixture.config.journeys[0];
  const dependent = structuredClone(baseJourney);
  dependent.id = "J-002";
  dependent.title = "客户端消费已激活权益";
  dependent.depends_on = ["J-001"];
  dependent.steps = dependent.steps.map((step, index) => ({
    ...step,
    id: `STEP2-${index + 1}`,
  }));
  dependent.verify_commands = [
    {
      ...dependent.verify_commands[0],
      id: "E2E-J002",
    },
  ];
  dependent.receipt = "orchestrator/program/receipts/J-002.json";
  fixture.config.journeys[0].depends_on = [];
  fixture.config.journeys.push(dependent);
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);

  const receipt = {
    ...fixture.receipt,
    journey_id: "J-002",
    steps: dependent.steps.map((step) => ({
      id: step.id,
      status: "pass",
      evidence_refs: ["orchestrator/program/evidence/create.txt"],
      observed_ref: `${step.id}:observed`,
    })),
  };
  writeJson(path.join(fixture.control, "receipts", "J-002.json"), receipt);

  let result = run(["--execute", "J-002"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /J-001|依赖/);

  result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--execute", "J-002"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("5-ship 声称 passed/accepted-risk 都必须复核 program GO，且删除 config 不能跳过", () => {
  const fixture = setup();
  const orchestrator = path.join(fixture.root, "orchestrator");
  fs.cpSync(HERE, path.join(orchestrator, "process"), { recursive: true });
  for (const name of [
    "ID_REGISTRY",
    "DECISION_LOG",
    "TRACEABILITY_MATRIX",
  ]) {
    fs.copyFileSync(
      path.join(TEMPLATES, `${name}_TEMPLATE.md`),
      path.join(orchestrator, `${name}.md`),
    );
  }
  writeJson(path.join(orchestrator, "SCOPE_AUTHORIZATIONS.json"), { schema: "scope-authorizations/v1", authorizations: [] });
  writeJson(path.join(orchestrator, "COMPLEXITY_LEDGER.json"), { schema: "complexity-ledger/v1", entries: [] });
  writeJson(path.join(orchestrator, "THREAT_MODEL.json"), { schema: "threat-model/v1", threats: [] });
  writeJson(path.join(orchestrator, "DELIVERY_GUARD.json"), { schema: "delivery-guard/v1" });
  let manifest = fs.readFileSync(
    path.join(TEMPLATES, "ARTIFACT_MANIFEST_TEMPLATE.yaml"),
    "utf8",
  );
  manifest = manifest
    .replace(
      /("2-contract":\n(?:.*\n)*?    status: )"not-started"/,
      '$1"passed"',
    )
    .replace(
      /("2-contract":\n(?:.*\n)*?    gate_status: )"not-run"/,
      '$1"pass"',
    )
    .replace(
      /("5-ship":\n(?:.*\n)*?    status: )"not-started"/,
      '$1"passed"',
    )
    .replace(
      /("5-ship":\n(?:.*\n)*?    gate_status: )"not-run"/,
      '$1"pass"',
    );
  fs.writeFileSync(path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"), manifest);
  fs.copyFileSync(path.join(TEMPLATES, "BACKLOG_TEMPLATE.md"), path.join(fixture.root, "BACKLOG.md"));
  writeJson(path.join(orchestrator, "process", "reconcile.config.json"), {
    work_branch: null,
    control_root: "orchestrator",
    receipt_policy: "required",
    program_completion_required: true,
    frontend_verify_commands: {},
    probes: [],
  });

  let result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /program-gate|跨项目|execution|NO-GO/i);

  const acceptedRiskManifest = manifest
    .replace(
      /("5-ship":\n(?:.*\n)*?    status: )"passed"/,
      '$1"accepted-risk"',
    )
    .replace(
      /("5-ship":\n(?:.*\n)*?    gate_status: )"pass"/,
      '$1"not-run"',
    );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    acceptedRiskManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /program-gate|跨项目|execution|NO-GO/i,
  );

  const misspelledShipManifest = acceptedRiskManifest.replace(
    '"5-ship":',
    '"5-shipp":',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    misspelledShipManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /canonical|5-ship|缺失|missing/i,
  );

  const missingShipStatusManifest = acceptedRiskManifest.replace(
    /("5-ship":\n)    status:/,
    "$1    statusx:",
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    missingShipStatusManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /5-ship.*status|status.*5-ship|缺失|missing/i,
  );

  const inlineShadowStatusManifest = acceptedRiskManifest.replace(
    /  "5-ship":\n[\s\S]*?(?=\n# Wire orphan-scan)/,
    '  "5-ship": { xstatus: "not-started", status: "accepted-risk", gate_status: "not-run" }\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    inlineShadowStatusManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /program-gate|跨项目|execution|NO-GO/i,
  );

  const inlineQuotedNoteManifest = acceptedRiskManifest.replace(
    /  "5-ship":\n[\s\S]*?(?=\n# Wire orphan-scan)/,
    '  "5-ship": { status: "not-started", notes: "text, status: draft", gate_status: "not-run" }\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    inlineQuotedNoteManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const malformedInlineSeparatorManifest = acceptedRiskManifest.replace(
    /  "5-ship":\n[\s\S]*?(?=\n# Wire orphan-scan)/,
    '  "5-ship": { status: "not-started",, gate_status: "not-run" }\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    malformedInlineSeparatorManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /malformed inline field|inline.*malformed/i);

  const duplicateBlockStatusManifest = acceptedRiskManifest.replace(
    /("5-ship":\n    status: "accepted-risk"\n)/,
    '$1    status: "not-started"\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    duplicateBlockStatusManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /duplicate.*status|status.*duplicate/i);

  const emptyDuplicateBlockStatusManifest = acceptedRiskManifest.replace(
    /("5-ship":\n)    status: "accepted-risk"\n/,
    '$1    status: "not-started"\n    status:\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    emptyDuplicateBlockStatusManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /duplicate.*status|status.*duplicate/i);

  const emptyDuplicateInlineStatusManifest = acceptedRiskManifest.replace(
    /  "5-ship":\n[\s\S]*?(?=\n# Wire orphan-scan)/,
    '  "5-ship": { status: "not-started", status: "", gate_status: "not-run" }\n',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    emptyDuplicateInlineStatusManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /duplicate.*status|status.*duplicate/i);

  const duplicateStageManifest = acceptedRiskManifest.replace(
    "\n# Wire orphan-scan",
    '  "5-ship": { status: "not-started", gate_status: "not-run" }\n\n# Wire orphan-scan',
  );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    duplicateStageManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /duplicate.*5-ship|5-ship.*duplicate/i);

  const unsupportedDuplicateStageManifest = acceptedRiskManifest
    .replace(
      /("5-ship":\n    status: )"accepted-risk"/,
      '$1"not-started"',
    )
    .replace(
      "\n# Wire orphan-scan",
      '  "5-ship": null\n\n# Wire orphan-scan',
    );
  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    unsupportedDuplicateStageManifest,
  );
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /duplicate.*5-ship|5-ship.*duplicate/i);

  fs.writeFileSync(
    path.join(orchestrator, "ARTIFACT_MANIFEST.yaml"),
    acceptedRiskManifest,
  );
  fs.rmSync(path.join(fixture.control, "program.config.json"));
  result = spawnSync(
    process.execPath,
    [path.join(orchestrator, "process", "reconcile.mjs")],
    { cwd: fixture.root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr + result.stdout,
    /program_completion_required.*program\.config|program\.config.*(?:missing|缺失)/i,
  );
});

test("canonical FLOW 是业务语义真值，内容变化会自动使旧 GO 失效", () => {
  const fixture = setup();
  const flowFile = enableCanonicalFlow(fixture);
  let result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run([], fixture.root);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  fs.appendFileSync(flowFile, "\n新增但尚未重新签核的业务步骤\n");
  result = run([], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /canonical_flow|FLOW|sha256/i);
});

test("canonical FLOW 模式下步骤必须显式无环依赖，不能退回数组顺序猜测", () => {
  const fixture = setup();
  enableCanonicalFlow(fixture);
  const steps = fixture.config.journeys[0].steps;
  steps[0].depends_on = [steps.at(-1).id];
  writeJson(path.join(fixture.control, "program.config.json"), fixture.config);
  const result = run(["--execute", "J-001"], fixture.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /依赖环|depends_on/i);
});
