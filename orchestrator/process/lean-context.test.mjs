import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const CONTEXT_PLAN = path.join(HERE, "context-plan.mjs");
const COMPACT_DESIGN_NOTES = "skipped-by-DEC-000 (class S); compact DESIGN stays inside PRODUCT_SPEC.md";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Lean Test",
  GIT_AUTHOR_EMAIL: "lean@example.test",
  GIT_COMMITTER_NAME: "Lean Test",
  GIT_COMMITTER_EMAIL: "lean@example.test",
};

function words(relative) {
  return fs.readFileSync(path.join(SKILL, relative), "utf8").trim().split(/\s+/).filter(Boolean).length;
}

function contextFixture({ conditional = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lean-context-plan-"));
  const processDir = path.join(root, "orchestrator", "process");
  fs.mkdirSync(processDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml"),
    'project:\n  current_stage: "1-plan"\nscale_class: "S"\n',
  );
  fs.writeFileSync(
    path.join(processDir, "reconcile.config.json"),
    `${JSON.stringify({
      receipt_policy: "required",
      program_completion_required: false,
      execution_mode: "interactive",
      autonomy_level: "interactive",
      context_policy: { mode: "adaptive", project_packs: [] },
    }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(processDir, ".skill-version"), `version=test\nskill_dir=${SKILL}\n`);
  fs.writeFileSync(
    path.join(processDir, "modules.config.json"),
    `${JSON.stringify({
      modules: {
        surface: {
          task_id: "T-UI",
          tasks: ["implementation"],
          context_packs: ["ui"],
          write_set: ["src/web/**"],
        },
      },
    }, null, 2)}\n`,
  );
  if (conditional) {
    fs.writeFileSync(path.join(processDir, "boundaries.config.json"), "{}\n");
    fs.writeFileSync(path.join(processDir, "knowledge.config.json"), "{}\n");
  }
  return root;
}

function plannedReads(root, stage, task = null) {
  const args = [CONTEXT_PLAN, "--root", root, "--stage", stage, "--json"];
  if (task) args.splice(args.length - 1, 0, "--task", task);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(path.isAbsolute(plan.read_root), true, `read_root must be absolute: ${plan.read_root}`);
  return plan;
}

function initSmallProject(prefix = "lean-init-s-") {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), prefix)), "project");
  const init = spawnSync("bash", [path.join(SKILL, "tools", "init-project.sh"), root, "--triage", "S", "--topology", "single", "--name", "Lean"], {
    cwd: SKILL,
    encoding: "utf8",
    env: GIT_ENV,
  });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  return root;
}

function reconcile(root) {
  return spawnSync(process.execPath, [path.join(root, "orchestrator", "process", "reconcile.mjs"), "--concise"], {
    cwd: root,
    encoding: "utf8",
  });
}

function commitAll(root, message) {
  const result = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8", env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const commit = spawnSync("git", ["commit", "-q", "-m", message], { cwd: root, encoding: "utf8", env: GIT_ENV });
  assert.equal(commit.status, 0, commit.stderr || commit.stdout);
}

test("高频入口、路由和产品总纲模板都有硬上下文预算", () => {
  assert.equal(words("SKILL.md") <= 1200, true, `SKILL.md=${words("SKILL.md")} words`);
  assert.equal(words("prompts/stage-router.md") <= 260, true, `stage-router=${words("prompts/stage-router.md")} words`);
  assert.equal(words("templates/PRODUCT_SPEC_TEMPLATE.md") <= 800, true, `PRODUCT_SPEC template=${words("templates/PRODUCT_SPEC_TEMPLATE.md")} words`);
  const router = fs.readFileSync(path.join(SKILL, "prompts", "stage-router.md"), "utf8");
  assert.doesNotMatch(router, /lessonctl\.mjs context|ASSET_INDEX|decisions\/PATTERNS|step 6\.5|6\.5/);
});

test("强模型入口默认只做按需规划，Task Packet 只服务需要确定性交接的执行形态", () => {
  const agents = fs.readFileSync(path.join(SKILL, "AGENTS_TEMPLATE.md"), "utf8");
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  const modules = JSON.parse(fs.readFileSync(path.join(SKILL, "process", "modules.config.example.json"), "utf8"));

  assert.match(agents, /每个 BUILD|every BUILD/i);
  assert.match(agents, /context-plan\.mjs/);
  assert.match(agents, /(?:派发|dispatch|parallel|autonomous|自治)[\s\S]{0,180}context-compile\.mjs|context-compile\.mjs[\s\S]{0,180}(?:派发|dispatch|parallel|autonomous|自治)/i);
  assert.doesNotMatch(agents, /For BUILD, generate the current Task Packet/i);

  assert.match(skill, /交互|interactive/i);
  assert.match(skill, /context-plan\.mjs/);
  assert.match(skill, /(?:派发|dispatch|parallel|autonomous|自治)[\s\S]{0,180}context-compile\.mjs|context-compile\.mjs[\s\S]{0,180}(?:派发|dispatch|parallel|autonomous|自治)/i);

  assert.match(modules._meta.context_inference, /current step|当前步骤/i);
  assert.match(modules._meta.context_inference, /project authorit|required_project_reads|项目权威/i);
  assert.doesNotMatch(modules._meta.LESSON, /20\d{2}-\d{2}-\d{2}|happened|this exact mistake/i);
});

test("fresh buildout 先铺功能，正式审核只在 maintenance 条件包中出现", () => {
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  const agents = fs.readFileSync(path.join(SKILL, "AGENTS_TEMPLATE.md"), "utf8");
  const backlog = fs.readFileSync(path.join(SKILL, "templates", "BACKLOG_TEMPLATE.md"), "utf8");
  const plan = fs.readFileSync(path.join(SKILL, "workflows", "v3-1-plan.md"), "utf8");
  const harness = fs.readFileSync(path.join(SKILL, "process", "harness", "README.md"), "utf8");

  assert.match(skill, /buildout[\s\S]{0,240}maintenance/i);
  assert.match(skill, /buildout[\s\S]{0,240}(?:不|skip|without).*formal|formal[\s\S]{0,240}maintenance/i);
  assert.match(agents, /delivery-phase\.mjs/);
  assert.match(agents, /buildout[\s\S]{0,240}(?:implementation|实现)[\s\S]{0,240}(?:acceptance|验收)/i);
  assert.match(backlog, /buildout[\s\S]{0,300}审核列.*—/i);
  assert.match(plan, /buildout[\s\S]{0,300}(?:不运行|不生成|免于).*spec-review/i);
  assert.match(harness, /buildout[\s\S]{0,300}(?:skip|不运行|跳过).*review/i);
  assert.doesNotMatch(harness, /two independent read-only passes review every vertical/i);
});

test("产品门按证据风险加深，不把可选思考工具当全项目仪式", () => {
  const gate = fs.readFileSync(path.join(SKILL, "gates", "01-product-gate.md"), "utf8");
  assert.match(gate, /Conditional depth|evidence-triggered/i);
  assert.match(gate, /not mandatory fields/i);
  assert.doesNotMatch(gate, /PR-FAQ 存在|被否决的产品形态\s*\*\*≥|Pre-mortem ≥3|Appetite 一句话存在/);
});

test("合同、评审和范围门不会把已删的空表仪式重新长回来", () => {
  const service = fs.readFileSync(path.join(SKILL, "templates", "SERVICE_CONTRACT_TEMPLATE.md"), "utf8");
  const backend = fs.readFileSync(path.join(SKILL, "templates", "BACKEND_SPEC_TEMPLATE.md"), "utf8");
  const contract = fs.readFileSync(path.join(SKILL, "workflows", "v3-2-contract.md"), "utf8");
  const scope = fs.readFileSync(path.join(SKILL, "gates", "03-scope-budget-gate.md"), "utf8");
  const reviewer = fs.readFileSync(path.join(SKILL, "prompts", "spec-reviewer.md"), "utf8");
  const crossAudit = fs.readFileSync(path.join(SKILL, "prompts", "spec-cross-audit.md"), "utf8");

  assert.match(service, /仅当.*实际作出[“"]X 已存在|[Xx].*已存在.*时使用本节/s);
  assert.doesNotMatch(service, /现网事实.*必填|条件附录[\s\S]{0,120}无行可空/);
  assert.match(backend, /major component, runtime, external\s+dependency|build-vs-reuse/s);
  assert.doesNotMatch(backend, /OSS 调研\(必填|skipped or hollow.*completeness/is);
  assert.doesNotMatch(contract, /每个自研组件先问/);
  assert.match(contract, /仅在新增重大组件|build-vs-reuse/);
  assert.doesNotMatch(scope, /五大风险表行|风险表背书/);
  assert.match(scope, /ASM\/DEC \+ AC/);
  assert.match(reviewer, /只核查 spec 实际作出的事实断言/);
  assert.match(reviewer, /未触发.*不得.*finding/s);
  assert.match(crossAudit, /claim\/risk trigger|claim-triggered/);
});

test("context-plan 的默认与条件热路径不注入项目或供应商政策", () => {
  const normal = contextFixture();
  const conditional = contextFixture({ conditional: true });
  const plans = [
    ...["1-plan", "2-contract", "3-design", "4-build", "5-ship"]
      .map((stage) => plannedReads(normal, stage)),
    plannedReads(normal, "4-build", "T-UI"),
    plannedReads(conditional, "4-build", "T-UI"),
  ];
  const visited = new Map();
  for (const plan of plans) {
    for (const relative of plan.required_reads) {
      const absolute = path.resolve(plan.read_root, relative);
      const fromRoot = path.relative(plan.read_root, absolute);
      assert.equal(fromRoot.startsWith("..") || path.isAbsolute(fromRoot), false, relative);
      assert.equal(fs.statSync(absolute).isFile(), true, relative);
      visited.set(absolute, relative);
    }
  }
  assert.equal(visited.size > 20, true, `only ${visited.size} planned reads were audited`);
  assert.equal(plans.at(-1).packs.some((pack) => pack.id === "architecture"), true);
  assert.equal(plans.at(-1).packs.some((pack) => pack.id === "knowledge"), true);

  const forbiddenIdentity = /CreatorOS|Thirdspace(?:-creator)?|Moonlit|Douyin|Stitch|gpt-image(?:-\d+)?|MiniMax|DaVinci|HOUSE_STYLE|house style/i;
  for (const [absolute, relative] of visited) {
    assert.doesNotMatch(fs.readFileSync(absolute, "utf8"), forbiddenIdentity, relative);
  }

  const changedPolicies = [
    "rules/product-integrity-rules.md",
    "gates/05-ui-gate.md",
    "templates/UI_RULES_TEMPLATE.md",
    "gates/14-integration-gate.md",
    "gates/15b-contract-completeness-gate.md",
    "gates/02-architecture-boundary-gate.md",
    "rules/knowledge-layer-rules.md",
    "workflows/_COMMON.md",
  ];
  for (const relative of changedPolicies) {
    const body = fs.readFileSync(path.join(SKILL, relative), "utf8").replaceAll("T-106", "");
    assert.doesNotMatch(body, /20\d{2}-\d{2}-\d{2}|\bT-\d{3,}\b|\b(?:v\d+\.\d+(?:\.\d+)?|394|308|839|87%)\b/i, relative);
  }
});

test("通用脚手架的默认配置与可加载文档不绑定具体项目身份", () => {
  const files = [
    "process/asset-mine-local.mjs",
    "process/asset-mine-local.config.example.json",
    "rules/field-lessons.md",
    "rules/task-ledger-rules.md",
    "prompts/product-audit.md",
    "prompts/asset-distill.md",
    "process/taskctl.mjs",
    "templates/HOUSE_STYLE.md",
    "templates/UI_MOCK_PROMPT_TEMPLATE.md",
  ];
  const projectIdentity = /CreatorOS|Thirdspace|Moonlit|Douyin|zzyong24|moonlitclear|SZYMR|Foreign-trade|@creatoros|~\/Workbase/i;
  for (const relative of files) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(SKILL, relative), "utf8"),
      projectIdentity,
      relative,
    );
  }
  const lessons = fs.readFileSync(path.join(SKILL, "rules", "field-lessons.md"), "utf8");
  assert.doesNotMatch(lessons, /\bT-\d{3}\b|\bDEC-\d{3}\b|\bAPI-\d{3}\b/);
  assert.equal(
    lessons.trim().split(/\s+/).filter(Boolean).length <= 500,
    true,
    "field lessons must stay a compact cross-domain pattern library; incident narratives belong in case studies",
  );
});

test("SessionStart 默认只注入一个队头任务且小于 4KiB", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lean-session-"));
  const rows = Array.from({ length: 10 }, (_, index) =>
    `| T-${String(index + 1).padStart(3, "0")} | ${"很长任务描述".repeat(25)} | ${index === 0 ? "🔨" : "📋"} | SPEC.md | ${"说明".repeat(80)} |`,
  );
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    `| ID | 任务 | 状态 | 文档 | 一句话 |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
  const result = spawnSync("bash", [path.join(SKILL, "templates", "hooks", "session-start.sh")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /T-001/);
  assert.doesNotMatch(result.stdout, /T-002/);
  assert.equal(Buffer.byteLength(result.stdout) <= 4096, true, `SessionStart=${Buffer.byteLength(result.stdout)} bytes`);
});

test("fresh S 把 compact DESIGN 路径与 adaptive context policy 编译进控制面", () => {
  const root = initSmallProject();
  const manifest = fs.readFileSync(path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml"), "utf8");
  const design = manifest.match(/  "3-design":\n([\s\S]*?)(?=\n  "4-build":)/)?.[1] ?? "";
  assert.match(design, /^    status: "compact"$/m);
  assert.match(design, /^    gate_status: "not-run"$/m);
  assert.match(design, new RegExp(`^    notes: "${COMPACT_DESIGN_NOTES.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"$`, "m"));
  const config = JSON.parse(fs.readFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), "utf8"));
  assert.deepEqual(config.context_policy, { mode: "adaptive", project_packs: [] });

  const result = reconcile(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /reconcile clean/i);
  assert.doesNotMatch(result.stdout, /warning|\[OK\]/i);
  assert.equal(result.stdout.trim().split("\n").length <= 8, true, result.stdout);
});

test("compact 是 S/3-design/DEC-000 的精确非风险状态，router 与 schema 使用同一合同", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SKILL, "process", "manifest.schema.json"), "utf8"));
  assert.equal(schema.definitions.status.enum.includes("compact"), true);

  const template = fs.readFileSync(path.join(SKILL, "templates", "ARTIFACT_MANIFEST_TEMPLATE.yaml"), "utf8");
  assert.match(template, /valid_statuses:[\s\S]*- "compact"/);
  const router = fs.readFileSync(path.join(SKILL, "prompts", "stage-router.md"), "utf8");
  assert.match(router, /not `passed` \/ `accepted-risk` \/ `compact`/);
  const stateMachine = fs.readFileSync(path.join(SKILL, "rules", "orchestrator-state-machine.md"), "utf8");
  assert.match(stateMachine, /`compact`[\s\S]*scale_class S[\s\S]*3-design[\s\S]*DEC-000/i);
  assert.match(stateMachine, /不等于|not.*accepted-risk/i);
});

test("reconcile 对 compact 非 S、错 stage、错 notes 均 fail-closed，只有精确形态豁免顺序门", () => {
  const root = initSmallProject("compact-contract-");
  const manifestFile = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const decisionFile = path.join(root, "orchestrator", "DECISION_LOG.md");
  const original = fs.readFileSync(manifestFile, "utf8");
  const originalDecisions = fs.readFileSync(decisionFile, "utf8");

  const cases = [
    {
      name: "non-S",
      mutate: (body) => body.replace('scale_class: "S"', 'scale_class: "M"'),
      expected: /compact.*scale_class.*S/i,
    },
    {
      name: "wrong stage",
      mutate: (body) => body.replace(
        /(  "4-build":\n\s+)status: "not-started"/,
        '$1status: "compact"',
      ),
      expected: /compact.*only.*3-design|compact.*仅.*3-design/i,
    },
    {
      name: "wrong notes",
      mutate: (body) => body.replace(COMPACT_DESIGN_NOTES, `${COMPACT_DESIGN_NOTES}; altered`),
      expected: /compact.*notes/i,
      alsoExpected: /3-design has started.*2-contract/i,
    },
  ];

  for (const fixture of cases) {
    fs.writeFileSync(manifestFile, fixture.mutate(original));
    fs.writeFileSync(decisionFile, originalDecisions);
    const result = reconcile(root);
    assert.equal(result.status, 1, `${fixture.name}: ${result.stderr || result.stdout}`);
    assert.match(result.stdout, fixture.expected, fixture.name);
    if (fixture.alsoExpected) assert.match(result.stdout, fixture.alsoExpected, fixture.name);
  }

  fs.writeFileSync(manifestFile, original);
  fs.writeFileSync(decisionFile, originalDecisions.replace("ID: DEC-000", "ID: DEC-REMOVED"));
  const missingDecision = reconcile(root);
  assert.equal(missingDecision.status, 1, missingDecision.stderr || missingDecision.stdout);
  assert.match(missingDecision.stdout, /compact.*DEC-000|DEC-000.*compact/i);
});

test("compact DESIGN 只在下游未就绪时允许占位；合同通过后必须有可实现 IA 与草图", () => {
  const root = initSmallProject("compact-readiness-");
  const manifestFile = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const productSpecFile = path.join(root, "PRODUCT_SPEC.md");
  const manifest = fs.readFileSync(manifestFile, "utf8")
    .replace(/(  "1-plan":\n\s+)status: "not-started"/, '$1status: "passed"')
    .replace(/(  "1-plan":[\s\S]*?\n\s+)gate_status: "not-run"/, '$1gate_status: "pass"')
    .replace(/(  "2-contract":\n\s+)status: "not-started"/, '$1status: "passed"')
    .replace(/(  "2-contract":[\s\S]*?\n\s+)gate_status: "not-run"/, '$1gate_status: "pass"');
  fs.writeFileSync(manifestFile, manifest);
  fs.writeFileSync(productSpecFile, fs.readFileSync(path.join(SKILL, "templates", "PRODUCT_SPEC_TEMPLATE.md"), "utf8"));
  commitAll(root, "test: make compact design downstream-eligible");

  const missing = reconcile(root);
  assert.equal(missing.status, 1, missing.stderr || missing.stdout);
  assert.match(missing.stdout, /compact.*(?:IA|information architecture)/i);
  assert.match(missing.stdout, /compact sketch|页面草图|交互草图/i);

  const readySpec = fs.readFileSync(productSpecFile, "utf8")
    .replace('| `IA-001` | | | | |', '| `IA-001` | 工作台 | 查看并完成首要任务 | FLOW-001 | 显示下一步与重试入口 |')
    .replace('- Compact sketch: `<入口 → 主要内容/操作 → 空、错、成功状态的反馈与下一步>`', '- Compact sketch: 工作台入口 → 首要任务卡与完成操作 → 空状态给出创建入口，错误状态给出重试。');
  fs.writeFileSync(productSpecFile, readySpec);
  commitAll(root, "test: complete compact design evidence");

  const ready = reconcile(root);
  assert.equal(ready.status, 0, ready.stderr || ready.stdout);
  assert.doesNotMatch(ready.stdout, /compact.*(?:IA|sketch|草图)/i);
});

test("accepted-risk 必须绑定用户 DEC、显式取舍字段和真实 gate evidence", () => {
  const root = initSmallProject("accepted-risk-contract-");
  const manifestFile = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const decisionFile = path.join(root, "orchestrator", "DECISION_LOG.md");
  const configFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const originalConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));
  fs.writeFileSync(configFile, `${JSON.stringify({ ...originalConfig, probes: [] }, null, 2)}\n`);
  fs.writeFileSync(
    manifestFile,
    fs.readFileSync(manifestFile, "utf8")
      .replace(/(  "1-plan":\n\s+)status: "not-started"/, '$1status: "accepted-risk"')
      .replace(/(  "1-plan":[\s\S]*?\n\s+)gate_status: "not-run"/, '$1gate_status: "accepted-risk"')
      .replace(/(  "1-plan":[\s\S]*?\n\s+)notes: ""/, '$1notes: "accepted-risk: DEC-101"'),
  );
  fs.appendFileSync(decisionFile, `\n\`\`\`text
ID: DEC-101
Date: 2026-08-24
Stage: 1-plan
Type: accepted-risk
Decision: Proceed despite one named product-gate finding.
Violation: The primary user evidence is incomplete.
Why needed: A bounded probe is required before stronger evidence can exist.
Simpler alternative rejected because: Waiting produces no new evidence.
Gate-Attempt: 01-product-gate
Gate-Evidence: orchestrator/evidence/dec-101/product-gate.txt
Source: explicit user response
Affected Artifacts: PRODUCT_SPEC.md
Invalidates: none
Owner: agent
Revisit Trigger: the bounded probe completes
Status: active
\`\`\`\n`);

  const agentOwned = reconcile(root);
  assert.equal(agentOwned.status, 1, agentOwned.stderr || agentOwned.stdout);
  assert.match(agentOwned.stdout, /accepted-risk.*(?:Owner: user|user-owned)/i);

  fs.writeFileSync(decisionFile, fs.readFileSync(decisionFile, "utf8").replace('Owner: agent\nRevisit Trigger: the bounded probe completes', 'Owner: user\nRevisit Trigger: the bounded probe completes'));
  const missingEvidence = reconcile(root);
  assert.equal(missingEvidence.status, 1, missingEvidence.stderr || missingEvidence.stdout);
  assert.match(missingEvidence.stdout, /accepted-risk.*gate[- ]evidence/i);

  const evidenceFile = path.join(root, "orchestrator", "evidence", "dec-101", "product-gate.txt");
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, "01-product-gate attempted and returned fail: primary user evidence incomplete.\n");
  const valid = reconcile(root);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.doesNotMatch(valid.stdout, /accepted-risk.*(?:invalid|missing|requires)/i);
});

test("concise 明确区分 clean、warning、error，且 warning 不被摘要隐藏", () => {
  const root = initSmallProject("concise-shapes-");
  const manifestFile = path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml");
  const configFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const originalManifest = fs.readFileSync(manifestFile, "utf8");
  const originalConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));

  const clean = reconcile(root);
  assert.equal(clean.status, 0, clean.stderr || clean.stdout);
  assert.match(clean.stdout, /reconcile clean/i);

  fs.writeFileSync(configFile, `${JSON.stringify({ ...originalConfig, probes: [] }, null, 2)}\n`);
  fs.writeFileSync(
    manifestFile,
    originalManifest
      .replace('current_stage: "1-plan"', 'current_stage: "missing-stage"')
      .replace(/updated_at: "\d{4}-\d{2}-\d{2}"/, 'updated_at: "run-unknown"'),
  );
  const warning = reconcile(root);
  assert.equal(warning.status, 0, warning.stderr || warning.stdout);
  assert.match(warning.stdout, /completed with warnings|inconclusive/i);
  assert.doesNotMatch(warning.stdout, /reconcile clean/i);
  assert.match(warning.stdout, /no probes configured/i);
  assert.match(warning.stdout, /full report/i);
  assert.equal((warning.stdout.match(/^  !/gm) ?? []).length <= 3, true, warning.stdout);
  assert.equal(warning.stdout.trim().split("\n").length <= 8, true, warning.stdout);

  fs.writeFileSync(configFile, `${JSON.stringify(originalConfig, null, 2)}\n`);
  fs.writeFileSync(manifestFile, originalManifest.replace(COMPACT_DESIGN_NOTES, `${COMPACT_DESIGN_NOTES}; altered`));
  const error = reconcile(root);
  assert.equal(error.status, 1, error.stderr || error.stdout);
  assert.match(error.stdout, /reconcile failed/i);
  assert.doesNotMatch(error.stdout, /reconcile clean/i);
  assert.match(error.stdout, /full report/i);
  assert.equal(error.stdout.trim().split("\n").length <= 8, true, error.stdout);
});
