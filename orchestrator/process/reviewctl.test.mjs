import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEWCTL = path.join(HERE, "reviewctl.mjs");
const TASKCTL = path.join(HERE, "taskctl.mjs");
const BACKLOG_HOOK = path.resolve(HERE, "..", "templates", "hooks", "backlog-guard.sh");

function tempProject({ strict = true, review = "待审", status = "📋", acceptance = "—" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reviewctl-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "# BACKLOG",
      "",
      "| ID | 任务 | 状态 | 文档 | 审核 | 验收 | 一句话 |",
      "|---|---|---|---|---|---|---|",
      `| T-101 | 内容雷达 | ${status} | [SPEC](SPEC.md) | ${review} | ${acceptance} | 分类与详情一致 |`,
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "SPEC.md"), "# SPEC\n\nFR-101：切换分类后只显示该分类选题。\n");
  fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# Constitution\n\nFR-101 属于确认范围。\n");
  fs.writeFileSync(path.join(root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({ schema: "threat-model/v1", threats: [{ id: "THREAT-001", status: "approved", owner: "user", actor: "外部攻击者", assets: ["用户数据"], capabilities: ["读取导出文件"], acceptance_ids: ["AC-101"] }] }));
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    JSON.stringify({ receipt_policy: strict ? "required" : "legacy" }),
  );
  return root;
}

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function objectHash(value) {
  return sha256(stable(value));
}

function specLineRef(root, lineNumber) {
  const lines = fs.readFileSync(path.join(root, "SPEC.md"), "utf8").split(/\r?\n/);
  return `SPEC-LINE:${lineNumber}:${sha256(lines[lineNumber - 1]).slice(0, 16)}`;
}

function evidenceRef(root, relativePath) {
  return `EVIDENCE-SHA256:${sha256(fs.readFileSync(path.join(root, relativePath), "utf8"))}:${relativePath}`;
}

function finding(overrides = {}) {
  return {
    id: "REV-001",
    status: "open",
    severity: "major",
    category: "completeness",
    requirement_anchor: { id: "FR-101", quote: "切换分类后只显示该分类选题" },
    acceptance_anchor: { id: "AC-101", quote: "列表与选择、详情必须一致" },
    where: "FR-101",
    failure_mode: "实现者可以只过滤列表而保留已经不可见的选择，页面状态自相矛盾。",
    evidence_kind: "spec-contradiction",
    evidence_ref: "SPEC.md#FR-101",
    risk_class: "confirmed-requirement",
    disposition: "mitigate",
    remedy_type: "clarify",
    scope_effect: "none",
    origin: "baseline",
    origin_ref: "round-1 full review",
    suggestion: "明确分类变化后的唯一选择与详情策略。",
    resolution_evidence: "",
    parent_id: "",
    threat_model_id: "THREAT-001",
    ...overrides,
  };
}

function writePacket(root, name, packet) {
  const p = path.join(root, name);
  fs.writeFileSync(p, JSON.stringify(packet, null, 2));
  return p;
}

test("复审既有 finding 只允许销账字段变化，证据、处置和建议等全部冻结", () => {
  const frozenMutations = [
    ["category", "consistency"],
    ["requirement_anchor", { id: "FR-101", quote: "改写后的需求锚点" }],
    ["acceptance_anchor", { id: "AC-101", quote: "改写后的验收锚点" }],
    ["where", "另一个章节"],
    ["failure_mode", "改成另一套通过条件。"],
    ["evidence_kind", "deterministic-check"],
    ["evidence_ref", "tests/other.log"],
    ["risk_class", "security"],
    ["disposition", "avoid"],
    ["remedy_type", "remove"],
    ["scope_effect", "narrowing"],
    ["origin", "changed-lines"],
    ["origin_ref", "另一个来源"],
    ["suggestion", "改成 Reviewer 新偏好的方案。"],
    ["parent_id", "REV-999"],
  ];

  for (const [field, value] of frozenMutations) {
    const root = tempProject();
    const initial = writePacket(root, "round-1.json", {
      schema: "spec-review-round/v2",
      review_kind: "initial",
      summary: "首轮。",
      findings: [finding()],
    });
    let r = run(
      REVIEWCTL,
      [
        "record",
        "T-101",
        "--spec",
        "SPEC.md",
        "--constitution",
        "CONSTITUTION.md",
        "--input",
        initial,
        "--review",
        "SPEC.review.md",
        "--backlog",
        "BACKLOG.md",
        "--review-mode",
        "cross-family",
        "--model",
        "test-reviewer",
      ],
      root,
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const recheck = writePacket(root, "round-2.json", {
      schema: "spec-review-round/v2",
      review_kind: "recheck",
      summary: `试图改写 ${field}。`,
      findings: [finding({ [field]: value })],
    });
    r = run(
      REVIEWCTL,
      [
        "record",
        "T-101",
        "--spec",
        "SPEC.md",
        "--constitution",
        "CONSTITUTION.md",
        "--input",
        recheck,
        "--review",
        "SPEC.review.md",
        "--backlog",
        "BACKLOG.md",
        "--review-mode",
        "cross-family",
        "--model",
        "test-reviewer",
      ],
      root,
    );
    assert.equal(r.status, 1, `${field} 不应在复审中被改写`);
    assert.match(r.stderr + r.stdout, new RegExp(field.replace("_", "[ _]"), "i"));
  }
});

test("R3 继续冻结 R2 条件，并允许严重度单向下降", () => {
  const root = tempProject();
  const args = (input) => [
    "record",
    "T-101",
    "--spec",
    "SPEC.md",
    "--constitution",
    "CONSTITUTION.md",
    "--input",
    input,
    "--review",
    "SPEC.review.md",
    "--backlog",
    "BACKLOG.md",
    "--review-mode",
    "cross-family",
    "--model",
    "test-reviewer",
  ];
  const probe = {
    question: "原子替换是否可用？",
    timebox_minutes: 30,
    allowed_write_globs: ["orchestrator/probes/T-101/**"],
    forbidden_operations: ["production deploy"],
    teardown: "删除临时产物。",
    evidence_expected: "运行日志。",
  };
  let packet = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "首轮。",
    findings: [finding({ disposition: "probe", remedy_type: "probe", probe })],
  });
  let r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  packet = writePacket(root, "round-2.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "证据降低了严重度。",
    findings: [
      finding({
        severity: "minor",
        disposition: "probe",
        remedy_type: "probe",
        probe,
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  packet = writePacket(root, "round-3.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "试图在第三轮改变 probe 通过条件。",
    findings: [
      finding({
        severity: "minor",
        disposition: "probe",
        remedy_type: "probe",
        probe: { ...probe, question: "顺便验证 Reviewer 新想到的另一件事？" },
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /probe.*冻结|probe.*不得改写/i);
});

test("共享同一 SPEC 的任务可迁移到任务级 review snapshot 且不覆盖另一任务", () => {
  const root = tempProject();
  const packet = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "首轮通过。",
    findings: [],
  });
  let r = run(
    REVIEWCTL,
    [
      "record", "T-101", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md",
      "--input", packet, "--review", "SPEC.review.md", "--backlog", "BACKLOG.md",
      "--review-mode", "cross-family", "--model", "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);

  fs.appendFileSync(
    path.join(root, "BACKLOG.md"),
    "| T-102 | 共享规格任务 | 📋 | [SPEC](SPEC.md) | 待审 | — | 验证任务级快照 |\n",
  );
  const eventsFile = path.join(root, "orchestrator", "review-events.ndjson");
  const events = fs.readFileSync(eventsFile, "utf8").trim().split("\n").map(JSON.parse);
  const source = events.at(-1);
  const { event_hash: sourceHash, ...sourceBody } = source;
  const collidedBody = {
    ...sourceBody,
    task_id: "T-102",
    recorded_at: "2026-09-21T00:00:00.000Z",
    previous_event_hash: sourceHash,
  };
  const collided = { ...collidedBody, event_hash: objectHash(collidedBody) };
  fs.appendFileSync(eventsFile, `${JSON.stringify(collided)}\n`);

  r = run(REVIEWCTL, ["migrate-shared-review", "T-102", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "SPEC.review.md"), "utf8").match(/```spec-review-state\n([\s\S]*?)\n```/)[1]).task_id, "T-101");
  const scoped = path.join(root, "SPEC.T-102.review.md");
  assert.equal(fs.existsSync(scoped), true);
  assert.equal(JSON.parse(fs.readFileSync(scoped, "utf8").match(/```spec-review-state\n([\s\S]*?)\n```/)[1]).task_id, "T-102");
  r = run(REVIEWCTL, ["audit", "--backlog", "BACKLOG.md", "--quiet"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const recheck = writePacket(root, "round-2.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "任务级快照迁移后可继续独立复审。",
    findings: [],
  });
  r = run(
    REVIEWCTL,
    [
      "record", "T-102", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md",
      "--input", recheck, "--review", "SPEC.T-102.review.md", "--backlog", "BACKLOG.md",
      "--review-mode", "cross-family", "--model", "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(JSON.parse(fs.readFileSync(scoped, "utf8").match(/```spec-review-state\n([\s\S]*?)\n```/)[1]).round, 2);
});

test("changed-lines 必须引用相对上一轮实际新增或修改的 SPEC 行指纹", () => {
  const root = tempProject();
  const args = (input) => [
    "record",
    "T-101",
    "--spec",
    "SPEC.md",
    "--constitution",
    "CONSTITUTION.md",
    "--input",
    input,
    "--review",
    "SPEC.review.md",
    "--backlog",
    "BACKLOG.md",
    "--review-mode",
    "cross-family",
    "--model",
    "test-reviewer",
  ];
  let packet = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "首轮无问题。",
    findings: [],
  });
  let r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  fs.appendFileSync(path.join(root, "SPEC.md"), "\n新增：失败时删除本地草稿。\n");
  const context = run(REVIEWCTL, ["context", "T-101", "--backlog", "BACKLOG.md"], root);
  assert.equal(context.status, 0, context.stderr || context.stdout);
  assert.ok(
    JSON.parse(context.stdout).changed_line_refs.some(
      (item) => item.origin_ref === specLineRef(root, 5),
    ),
    "context 应直接给 Reviewer 可用且可复核的 changed-lines 引用",
  );
  packet = writePacket(root, "round-2-fake.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "只靠自报 diff。",
    findings: [
      finding({
        id: "REV-002",
        severity: "blocker",
        risk_class: "data-loss",
        origin: "changed-lines",
        origin_ref: "SPEC.md 本轮新增“失败时删除本地草稿”",
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 1, "非结构化自报不得证明 changed-lines");
  assert.match(r.stderr + r.stdout, /SPEC-LINE|指纹|origin_ref/i);

  packet = writePacket(root, "round-2-old-line.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "引用旧行冒充新 diff。",
    findings: [
      finding({
        id: "REV-002",
        severity: "blocker",
        risk_class: "data-loss",
        origin: "changed-lines",
        origin_ref: specLineRef(root, 1),
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 1, "上一轮已存在的行不能冒充 changed-lines");
  assert.match(r.stderr + r.stdout, /上一轮|新增|修改/i);

  packet = writePacket(root, "round-2-valid.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "新行确实引入数据丢失。",
    findings: [
      finding({
        id: "REV-002",
        severity: "blocker",
        risk_class: "data-loss",
        origin: "changed-lines",
        origin_ref: specLineRef(root, 5),
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("纯空白改动不能伪装成 changed-lines 新门柱", () => {
  const root = tempProject();
  const args = (input) => [
    "record",
    "T-101",
    "--spec",
    "SPEC.md",
    "--constitution",
    "CONSTITUTION.md",
    "--input",
    input,
    "--review",
    "SPEC.review.md",
    "--backlog",
    "BACKLOG.md",
    "--review-mode",
    "cross-family",
    "--model",
    "test-reviewer",
  ];
  let packet = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "首轮无问题。",
    findings: [],
  });
  let r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const specFile = path.join(root, "SPEC.md");
  fs.writeFileSync(
    specFile,
    fs
      .readFileSync(specFile, "utf8")
      .replace(
        "FR-101：切换分类后只显示该分类选题。",
        "   FR-101：切换分类后只显示该分类选题。   ",
      ),
  );
  const context = run(REVIEWCTL, ["context", "T-101", "--backlog", "BACKLOG.md"], root);
  assert.equal(context.status, 0, context.stderr || context.stdout);
  assert.deepEqual(JSON.parse(context.stdout).changed_line_refs, []);

  packet = writePacket(root, "round-2.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "试图用纯空白 diff 新增 blocker。",
    findings: [
      finding({
        id: "REV-002",
        severity: "blocker",
        risk_class: "data-loss",
        origin: "changed-lines",
        origin_ref: specLineRef(root, 3),
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /上一轮|新增|修改|指纹/i);
});

test("new-evidence 和 late-critical 必须绑定可复核文件或行锚点", () => {
  const initialRoot = () => {
    const root = tempProject();
    const packet = writePacket(root, "round-1.json", {
      schema: "spec-review-round/v2",
      review_kind: "initial",
      summary: "首轮无问题。",
      findings: [],
    });
    const r = run(
      REVIEWCTL,
      [
        "record",
        "T-101",
        "--spec",
        "SPEC.md",
        "--constitution",
        "CONSTITUTION.md",
        "--input",
        packet,
        "--review",
        "SPEC.review.md",
        "--backlog",
        "BACKLOG.md",
        "--review-mode",
        "cross-family",
        "--model",
        "test-reviewer",
      ],
      root,
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return root;
  };
  const runRecheck = (root, name, newFinding) => {
    const packet = writePacket(root, name, {
      schema: "spec-review-round/v2",
      review_kind: "recheck",
      summary: "复审新增硬证据。",
      findings: [newFinding],
    });
    return run(
      REVIEWCTL,
      [
        "record",
        "T-101",
        "--spec",
        "SPEC.md",
        "--constitution",
        "CONSTITUTION.md",
        "--input",
        packet,
        "--review",
        "SPEC.review.md",
        "--backlog",
        "BACKLOG.md",
        "--review-mode",
        "cross-family",
        "--model",
        "test-reviewer",
      ],
      root,
    );
  };

  let root = initialRoot();
  let r = runRecheck(
    root,
    "new-evidence-fake.json",
    finding({
      id: "REV-002",
      origin: "new-evidence",
      origin_ref: "我运行过测试，失败了",
      evidence_kind: "runtime-observation",
    }),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /EVIDENCE-SHA256|证据文件|origin_ref/i);

  root = initialRoot();
  fs.mkdirSync(path.join(root, "evidence"));
  fs.writeFileSync(path.join(root, "evidence", "runtime.log"), "atomic replace failed\n");
  r = runRecheck(
    root,
    "new-evidence-wrong-sha.json",
    finding({
      id: "REV-002",
      origin: "new-evidence",
      origin_ref: `EVIDENCE-SHA256:${"0".repeat(64)}:evidence/runtime.log`,
      evidence_kind: "runtime-observation",
    }),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /sha256|hash/i);

  root = initialRoot();
  fs.mkdirSync(path.join(root, "evidence"));
  fs.writeFileSync(path.join(root, "evidence", "runtime.log"), "atomic replace failed\n");
  r = runRecheck(
    root,
    "new-evidence-valid.json",
    finding({
      id: "REV-002",
      origin: "new-evidence",
      origin_ref: evidenceRef(root, "evidence/runtime.log"),
      evidence_kind: "runtime-observation",
    }),
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);

  root = initialRoot();
  r = runRecheck(
    root,
    "late-critical-fake.json",
    finding({
      id: "REV-002",
      severity: "blocker",
      risk_class: "security",
      origin: "late-critical",
      origin_ref: "首轮遗漏了这个安全风险",
    }),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /SPEC-LINE|CONSTITUTION-LINE|EVIDENCE-SHA256|锚点/i);

  root = initialRoot();
  r = runRecheck(
    root,
    "late-critical-valid.json",
    finding({
      id: "REV-002",
      severity: "blocker",
      risk_class: "security",
      origin: "late-critical",
      origin_ref: specLineRef(root, 3),
    }),
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("复审拒绝把首轮漏掉、与 diff 无关的普通问题变成新门柱；已知项销账后 PASS", () => {
  const root = tempProject();
  const reviewPath = path.join(root, "SPEC.review.md");
  const initial = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "过滤后的组合状态未定义。",
    findings: [finding()],
  });

  let r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      initial,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /CONCERNS\[REV:[a-f0-9]{12}\]/);

  fs.appendFileSync(path.join(root, "SPEC.md"), "\n修订：visibleIds 按 sourceCategory 过滤。\n");
  const illegal = writePacket(root, "round-2-illegal.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "旧项已修，但发现刷新歧义。",
    findings: [
      finding({
        status: "resolved",
        resolution_evidence: "SPEC.md 修订段 + TEST-101",
      }),
      finding({
        id: "REV-002",
        where: "FR-101 刷新",
        failure_mode: "刷新后是否保留 selectedTopic 未定义。",
        evidence_ref: "SPEC.md#FR-101",
        origin: "baseline",
        origin_ref: "首轮漏看",
        suggestion: "新增刷新规则。",
      }),
    ],
  });
  const beforeIllegalReview = fs.readFileSync(reviewPath, "utf8");
  const beforeIllegalBacklog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  const beforeIllegalEvents = fs.readFileSync(
    path.join(root, "orchestrator", "review-events.ndjson"),
    "utf8",
  );
  r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      illegal,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 1, "首轮漏掉的普通问题不应在复审升级为新 major");
  assert.match(r.stderr + r.stdout, /复审新增 finding|origin/i);
  assert.equal(fs.readFileSync(reviewPath, "utf8"), beforeIllegalReview, "非法复审不得改 snapshot");
  assert.equal(
    fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"),
    beforeIllegalBacklog,
    "非法复审不得改 BACKLOG",
  );
  assert.equal(
    fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8"),
    beforeIllegalEvents,
    "非法复审不得追加 event",
  );

  const clean = writePacket(root, "round-2-clean.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "首轮唯一 finding 已有规格与测试证据，关闭。",
    findings: [
      finding({
        status: "resolved",
        resolution_evidence: "SPEC.md 修订段 + TEST-101",
      }),
    ],
  });
  r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      clean,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /PASS\[REV:[a-f0-9]{12}\]/);
  const reviewText = fs.readFileSync(reviewPath, "utf8");
  assert.equal((reviewText.match(/```spec-review-state/g) ?? []).length, 1, "review 文件只保留一个 current snapshot");
  assert.equal(
    fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8").trim().split("\n").length,
    2,
    "完整轮次历史进 append-only event log",
  );
});

test("复审只允许 changed-lines/new-evidence/late-critical 三类新 finding", () => {
  const root = tempProject();
  const reviewPath = path.join(root, "SPEC.review.md");
  const initial = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "无问题。",
    findings: [],
  });
  let r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      initial,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);

  fs.appendFileSync(path.join(root, "SPEC.md"), "\n新增 diff：错误时删除本地草稿。\n");
  const critical = writePacket(root, "round-2.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "新 diff 引入数据丢失。",
    findings: [
      finding({
        id: "REV-002",
        severity: "blocker",
        risk_class: "data-loss",
        origin: "changed-lines",
        origin_ref: specLineRef(root, 5),
        evidence_kind: "spec-contradiction",
        evidence_ref: "git diff -- SPEC.md",
        failure_mode: "失败路径删除用户尚未提交的唯一草稿，无法恢复。",
        disposition: "mitigate",
        remedy_type: "constraint",
        suggestion: "失败时保留草稿并给出重试入口。",
      }),
    ],
  });
  r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      critical,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), /FAIL\[REV:[a-f0-9]{12}\]/);
});

test("必须靠原型回答的问题只能走有时限、受限写集的 bounded probe", () => {
  const root = tempProject();
  const args = (input) => [
    "record",
    "T-101",
    "--spec",
    "SPEC.md",
    "--constitution",
    "CONSTITUTION.md",
    "--input",
    input,
    "--review",
    "SPEC.review.md",
    "--backlog",
    "BACKLOG.md",
    "--review-mode",
    "cross-family",
    "--model",
    "test-reviewer",
  ];
  let packet = writePacket(root, "probe-invalid.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "需要技术验证。",
    findings: [finding({ disposition: "probe", remedy_type: "probe" })],
  });
  let r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /bounded probe|probe/i);

  packet = writePacket(root, "probe-valid.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "用受限 RAT 收集证据，不进入产品实现。",
    findings: [
      finding({
        disposition: "probe",
        remedy_type: "probe",
        probe: {
          question: "目标运行时是否支持所需原子替换？",
          timebox_minutes: 60,
          allowed_write_globs: ["orchestrator/probes/T-101/**"],
          forbidden_operations: ["production deploy", "real user data", "migration"],
          teardown: "删除临时产物并保留日志。",
          evidence_expected: "运行日志 + 原子性断言结果。",
        },
      }),
    ],
  });
  r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /CONCERNS/);
});

test("taskctl start 拒绝 legacy，严格项目校验 review receipt 与 spec hash", () => {
  const legacy = tempProject({ strict: false, review: "WAT" });
  let r = run(TASKCTL, ["start", "T-101", "--backlog", "BACKLOG.md"], legacy);
  assert.equal(r.status, 1, "未知审核值不能因 denylist 漏洞被放行");

  const legacyPass = tempProject({ strict: false, review: "PASS" });
  r = run(TASKCTL, ["start", "T-101", "--backlog", "BACKLOG.md"], legacyPass);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /legacy|迁移|required/i);

  const strict = tempProject();
  const reviewPath = path.join(strict, "SPEC.review.md");
  const packet = writePacket(strict, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "通过。",
    findings: [],
  });
  r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      packet,
      "--review",
      reviewPath,
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    strict,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  fs.appendFileSync(path.join(strict, "SPEC.md"), "\n评审后偷偷改规格。\n");
  r = run(TASKCTL, ["start", "T-101", "--backlog", "BACKLOG.md"], strict);
  assert.equal(r.status, 1, "评审 receipt 绑定的 spec hash 过期时必须阻断");
  assert.match(r.stderr + r.stdout, /过期|hash|spec/i);
});

test("CONCERNS/FAIL receipt 是可审计结论，但都不是开工授权", () => {
  for (const [severity, expected] of [
    ["major", "CONCERNS"],
    ["blocker", "FAIL"],
  ]) {
    const root = tempProject();
    const packet = writePacket(root, "round-1.json", {
      schema: "spec-review-round/v2",
      review_kind: "initial",
      summary: `${expected} finding`,
      findings: [
        finding({
          severity,
          risk_class: severity === "blocker" ? "data-loss" : "confirmed-requirement",
        }),
      ],
    });
    let r = run(
      REVIEWCTL,
      [
        "record",
        "T-101",
        "--spec",
        "SPEC.md",
        "--constitution",
        "CONSTITUTION.md",
        "--input",
        packet,
        "--review",
        "SPEC.review.md",
        "--backlog",
        "BACKLOG.md",
        "--review-mode",
        "cross-family",
        "--model",
        "test-reviewer",
      ],
      root,
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8"), new RegExp(`${expected}\\[REV:`));
    r = run(REVIEWCTL, ["audit", "--backlog", "BACKLOG.md"], root);
    assert.equal(r.status, 0, `${expected} 是合法 current verdict: ${r.stderr || r.stdout}`);
    r = run(TASKCTL, ["start", "T-101", "--backlog", "BACKLOG.md"], root);
    assert.equal(r.status, 1, `${expected} receipt 不得开工`);
  }
});

test("legacy review 不会被自动覆盖；复审最多三轮且不能换文件重置 lineage", () => {
  const legacyRoot = tempProject();
  const legacyReview = path.join(legacyRoot, "SPEC.review.md");
  fs.writeFileSync(legacyReview, "# old review\n\nRound 1: FAIL\n");
  const packet = writePacket(legacyRoot, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "尝试接管 legacy。",
    findings: [],
  });
  const backlogBefore = fs.readFileSync(path.join(legacyRoot, "BACKLOG.md"), "utf8");
  let r = run(
    REVIEWCTL,
    [
      "record",
      "T-101",
      "--spec",
      "SPEC.md",
      "--constitution",
      "CONSTITUTION.md",
      "--input",
      packet,
      "--review",
      "SPEC.review.md",
      "--backlog",
      "BACKLOG.md",
      "--review-mode",
      "cross-family",
      "--model",
      "test-reviewer",
    ],
    legacyRoot,
  );
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(legacyReview, "utf8"), "# old review\n\nRound 1: FAIL\n");
  assert.equal(fs.readFileSync(path.join(legacyRoot, "BACKLOG.md"), "utf8"), backlogBefore);
  assert.equal(fs.existsSync(path.join(legacyRoot, "orchestrator", "review-events.ndjson")), false);

  const root = tempProject();
  const initial = writePacket(root, "round-1.json", {
    schema: "spec-review-round/v2",
    review_kind: "initial",
    summary: "保持一个 major 供上限测试。",
    findings: [finding()],
  });
  const args = (input, spec = "SPEC.md", review = "SPEC.review.md") => [
    "record",
    "T-101",
    "--spec",
    spec,
    "--constitution",
    "CONSTITUTION.md",
    "--input",
    input,
    "--review",
    review,
    "--backlog",
    "BACKLOG.md",
    "--review-mode",
    "cross-family",
    "--model",
    "test-reviewer",
  ];
  r = run(REVIEWCTL, args(initial), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  for (const round of [2, 3]) {
    const recheck = writePacket(root, `round-${round}.json`, {
      schema: "spec-review-round/v2",
      review_kind: "recheck",
      summary: "问题仍未关闭。",
      findings: [finding()],
    });
    r = run(REVIEWCTL, args(recheck), root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
  fs.writeFileSync(path.join(root, "SPEC-RENAMED.md"), fs.readFileSync(path.join(root, "SPEC.md")));
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    fs
      .readFileSync(path.join(root, "BACKLOG.md"), "utf8")
      .replace("[SPEC](SPEC.md)", "[SPEC](SPEC.md) [renamed](SPEC-RENAMED.md)"),
  );
  const fourth = writePacket(root, "round-4.json", {
    schema: "spec-review-round/v2",
    review_kind: "recheck",
    summary: "试图第四轮。",
    findings: [finding()],
  });
  const eventsBefore = fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8");
  r = run(REVIEWCTL, args(fourth, "SPEC-RENAMED.md", "SPEC-RENAMED.review.md"), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /3 轮|lineage|重置/);
  assert.equal(
    fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8"),
    eventsBefore,
  );
});

test("legacy 无论旧状态如何都禁止开工；strict 缺列或损坏 config fail-closed", () => {
  const makeLegacy = (status, config = null) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "reviewctl-legacy-"));
    fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "BACKLOG.md"),
      [
        "| ID | 任务 | 文档 | 状态 | 一句话 |",
        "|---|---|---|---|---|",
        `| T-OLD | old | [SPEC](SPEC.md) | ${status} | legacy |`,
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(root, "SPEC.md"), "# old\n");
    if (config !== null) {
      fs.writeFileSync(path.join(root, "orchestrator", "process", "reconcile.config.json"), config);
    }
    return root;
  };
  let root = makeLegacy("📋 Round1 FAIL·待原生RAT");
  let r = run(TASKCTL, ["start", "T-OLD", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);

  root = makeLegacy("📋 免审");
  r = run(TASKCTL, ["start", "T-OLD", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /legacy|迁移|required/i);

  root = makeLegacy("📋 免审", JSON.stringify({ receipt_policy: "required" }));
  r = run(TASKCTL, ["start", "T-OLD", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /审核.*验收|strict/i);

  root = makeLegacy("📋 免审", "{ broken");
  r = run(TASKCTL, ["start", "T-OLD", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /config|JSON|读取/i);
});

test("review cycle capability 绑定 task/hash/change IDs、旧 constitution、一次消费；通用 DEC-022 不可回放", () => {
  const root = tempProject();
  const args = (input, extra = []) => [
    "record", "T-101", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md",
    "--input", input, "--review", "SPEC.review.md", "--backlog", "BACKLOG.md",
    "--review-mode", "cross-family", "--model", "test-reviewer", ...extra,
  ];
  let packet = writePacket(root, "r1.json", {
    schema: "spec-review-round/v2", review_kind: "initial", summary: "首轮。", findings: [],
  });
  let r = run(REVIEWCTL, args(packet), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const first = JSON.parse(fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8").trim());
  fs.writeFileSync(path.join(root, "SPEC.md"), "# SPEC\n\nFR-101：切换分类。\n[REV-ADD] FR-102：导出。\n");
  fs.writeFileSync(path.join(root, "CONSTITUTION.md"), "# Constitution\n\n已确认 FR-102 的产品边界。\n");
  fs.writeFileSync(path.join(root, "orchestrator", "DECISION_LOG.md"), [
    "```text", "ID: DEC-022", "Owner: user", "Status: active",
    "Decision: L2 非阻断式持续推进并继续独立 review。", "```", "",
    "```text", "ID: DEC-100", "Owner: user", "Status: active",
    "Authorization-Kind: process-review-cycle", "Task-ID: T-101",
    `Previous-Spec-SHA256: ${first.spec_sha256}`,
    `Previous-Constitution-SHA256: ${first.constitution_sha256}`,
    "Allowed-Change-IDs: FR-102", "Max-Cycles: 1", "Nonce: nonce-t101-cycle2",
    "Decision: 只允许 T-101 的 FR-102 变更开启一次新审核周期。", "```", "",
  ].join("\n"));
  packet = writePacket(root, "cycle2.json", {
    schema: "spec-review-round/v2", review_kind: "initial", summary: "绑定变更的新周期。", findings: [],
  });
  const ordinary = writePacket(root, "ordinary-recheck.json", {
    schema: "spec-review-round/v2", review_kind: "recheck", summary: "尝试不带 capability 复审。", findings: [],
  });
  r = run(REVIEWCTL, args(ordinary), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /constitution hash 已变化/i);
  r = run(REVIEWCTL, args(packet, ["--new-cycle", "DEC-022", "--change-ids", "FR-102"]), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /capability|绑定|Task-ID|Previous-Spec|通用|scope-envelope/i);
  r = run(REVIEWCTL, args(packet, ["--new-cycle", "DEC-100", "--change-ids", "FR-102"]), root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /cycle 2|周期 2/i);
  const eventsAfter = fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8");
  assert.match(eventsAfter, /nonce-t101-cycle2/);
  fs.writeFileSync(path.join(root, "SPEC.md"), `${fs.readFileSync(path.join(root, "SPEC.md"), "utf8")}\nFR-103：打印。\n`);
  const replay = writePacket(root, "cycle3.json", {
    schema: "spec-review-round/v2", review_kind: "initial", summary: "尝试复用。", findings: [],
  });
  r = run(REVIEWCTL, args(replay, ["--new-cycle", "DEC-100", "--change-ids", "FR-102"]), root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /已消费|consum|nonce|一次/i);
});

test("旧项目未绑定的 review-cycle DEC 历史保留但 fail-closed，不可迁移成新授权", () => {
  const root = tempProject();
  const body = { task_id: "T-029", cycle: 2, round: 1, review_kind: "initial", review_cycle_decision: "DEC-022", previous_event_hash: "" };
  const event = { ...body, event_hash: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  fs.writeFileSync(path.join(root, "orchestrator", "review-events.ndjson"), `${JSON.stringify(event)}\n`);
  const r = run(REVIEWCTL, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /T-029.*DEC-022.*legacy|未绑定.*fail-closed|旧.*授权/i);
  assert.match(fs.readFileSync(path.join(root, "orchestrator", "review-events.ndjson"), "utf8"), /DEC-022/, "历史不得被迁移器改写");
});

test("security blocker 必须绑定用户批准的 threat model；same-UID 不能由标签自动升级", () => {
  const root = tempProject();
  fs.writeFileSync(path.join(root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({
    schema: "threat-model/v1",
    threats: [{ id: "THREAT-001", status: "approved", owner: "user", actor: "本地非同 UID 进程", assets: ["客户数据"], capabilities: ["读取导出文件"], acceptance_ids: ["AC-101"] }],
  }));
  const call = (threatId, summary) => {
    const input = writePacket(root, `${summary}.json`, {
      schema: "spec-review-round/v2", review_kind: "initial", summary,
      findings: [finding({ severity: "blocker", category: "security", risk_class: "security", threat_model_id: threatId })],
    });
    return run(REVIEWCTL, ["record", "T-101", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md", "--input", input, "--review", "SPEC.review.md", "--backlog", "BACKLOG.md", "--review-mode", "cross-family", "--model", "test-reviewer"], root);
  };
  let r = call("THREAT-SAME-UID", "same-uid-unapproved");
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /threat|攻击者|批准|same-UID/i);
  r = call("THREAT-001", "approved-threat");
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("existing-project audit 重新验证历史 security blocker 的 threat approval", () => {
  const root = tempProject();
  const input = writePacket(root, "security.json", {
    schema: "spec-review-round/v2", review_kind: "initial", summary: "approved first",
    findings: [finding({ severity: "blocker", category: "security", risk_class: "security" })],
  });
  let r = run(REVIEWCTL, ["record", "T-101", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md", "--input", input, "--review", "SPEC.review.md", "--backlog", "BACKLOG.md", "--review-mode", "cross-family", "--model", "test"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  fs.writeFileSync(path.join(root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({ schema: "threat-model/v1", threats: [] }));
  r = run(REVIEWCTL, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /THREAT-001|threat.*未经用户批准|same-UID/i);
});

test("规则升级前没有 threat_model_id 的只读历史不会被追溯改写", () => {
  const root = tempProject();
  const input = writePacket(root, "legacy-security.json", {
    schema: "spec-review-round/v2", review_kind: "initial", summary: "legacy approved first",
    findings: [finding({ severity: "blocker", category: "security", risk_class: "security" })],
  });
  let r = run(REVIEWCTL, ["record", "T-101", "--spec", "SPEC.md", "--constitution", "CONSTITUTION.md", "--input", input, "--review", "SPEC.review.md", "--backlog", "BACKLOG.md", "--review-mode", "cross-family", "--model", "test"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const eventsFile = path.join(root, "orchestrator", "review-events.ndjson");
  const event = JSON.parse(fs.readFileSync(eventsFile, "utf8").trim());
  delete event.packet.findings[0].threat_model_id;
  const { event_hash: ignored, ...body } = event;
  event.event_hash = objectHash(body);
  fs.writeFileSync(eventsFile, `${JSON.stringify(event)}\n`);
  const reviewFile = path.join(root, "SPEC.review.md");
  const reviewText = fs.readFileSync(reviewFile, "utf8");
  const stateMatch = reviewText.match(/```spec-review-state\s*([\s\S]*?)```/);
  const state = JSON.parse(stateMatch[1]);
  state.latest_event_hash = event.event_hash;
  state.open_findings = event.packet.findings;
  const { receipt: oldReceipt, ...stateBody } = state;
  state.receipt = objectHash(stateBody).slice(0, 12);
  fs.writeFileSync(reviewFile, reviewText.replace(/```spec-review-state[\s\S]*?```/, `\`\`\`spec-review-state\n${JSON.stringify(state, null, 2)}\n\`\`\``));
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8").replace(/(PASS|CONCERNS|FAIL)\[REV:[0-9a-f]{12}\]/, `${state.verdict}[REV:${state.receipt}]`);
  fs.writeFileSync(path.join(root, "BACKLOG.md"), backlog);
  fs.writeFileSync(path.join(root, "orchestrator", "THREAT_MODEL.json"), JSON.stringify({ schema: "threat-model/v1", threats: [] }));

  r = run(REVIEWCTL, ["audit", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("taskctl 的列映射绑定目标所属表，不会被后一个不同表头污染", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskctl-multitable-"));
  fs.mkdirSync(path.join(root, "orchestrator", "process"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "orchestrator", "process", "reconcile.config.json"),
    JSON.stringify({ receipt_policy: "required" }),
  );
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    [
      "| ID | 状态 | 审核 | 验收 | 文档 |",
      "|---|---|---|---|---|",
      "| T-FIRST | 📋 | 待审 | — | [A](A.md) |",
      "",
      "| 任务 | 审核 | ID | 验收 | 文档 | 状态 |",
      "|---|---|---|---|---|---|",
      "| target | — | T-TARGET | — | [B](B.md) | 📋 |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "A.md"), "# A\n");
  fs.writeFileSync(path.join(root, "B.md"), "# B\n");
  const r = run(TASKCTL, ["start", "T-TARGET", "--backlog", "BACKLOG.md"], root);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const backlog = fs.readFileSync(path.join(root, "BACKLOG.md"), "utf8");
  assert.match(backlog, /T-FIRST \| 📋 \| 待审 \| —/);
  assert.match(backlog, /T-TARGET \| — \| \[B\]\(B\.md\) \| 🔨/);
});

test("backlog hook 对 strict Edit 使用 review allowlist（未知值不能漏过）", () => {
  const root = tempProject({ strict: true, review: "WAT" });
  const backlogFile = path.join(root, "BACKLOG.md");
  const before = fs.readFileSync(backlogFile, "utf8");
  const after = before.replace("| 📋 | [SPEC]", "| 🔨 | [SPEC]");
  const result = spawnSync("bash", [BACKLOG_HOOK], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: backlogFile,
        old_string: before,
        new_string: after,
        replace_all: false,
      },
    }),
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /allowlist|阻断/i);
  assert.equal(fs.readFileSync(backlogFile, "utf8"), before, "hook 只裁决，不改文件");
});

test("backlog hook 对 legacy 的直接开工或完成编辑也 fail-closed", () => {
  const root = tempProject({ strict: false, review: "PASS" });
  const backlogFile = path.join(root, "BACKLOG.md");
  const pending = fs.readFileSync(backlogFile, "utf8");
  let result = spawnSync("bash", [BACKLOG_HOOK], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: backlogFile,
        old_string: pending,
        new_string: pending.replace("| 📋 |", "| 🔨 |"),
      },
    }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /legacy|迁移|required/i);

  const running = pending.replace("| 📋 |", "| 🔨 |");
  fs.writeFileSync(backlogFile, running);
  result = spawnSync("bash", [BACKLOG_HOOK], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: backlogFile,
        old_string: running,
        new_string: running.replace("| 🔨 |", "| ✅ |"),
      },
    }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /legacy|迁移|required/i);
});

// T-1429: real transaction failures, including process death, must preserve a
// recoverable journal and refuse to overwrite a third-party edit.
import { runLedgerTransaction, recoverLedgerTransaction } from './reviewctl.mjs';
function transactionFixture() {
  const root = tempProject();
  const operations = [
    { path: 'BACKLOG.md', before: fs.readFileSync(path.join(root, 'BACKLOG.md'), 'utf8'), after: 'new backlog\n' },
    { path: 'orchestrator/review-events.ndjson', before: null, after: 'new ledger\n' },
  ];
  const body = { schema: 'review-ledger-transaction/v1', operations, guards: [] };
  return { root, plan: { ...body, plan_hash: objectHash(body) } };
}
test('迁移事务CAS、锁冲突均拒绝写入', () => {
  const {root, plan} = transactionFixture();
  fs.appendFileSync(path.join(root, 'BACKLOG.md'), 'concurrent\n');
  assert.throws(() => runLedgerTransaction({root, plan, expectedPlanHash: plan.plan_hash}), /CAS/);
  assert.equal(fs.existsSync(path.join(root, 'orchestrator/review-events.ndjson')), false);
  const second = transactionFixture();
  fs.mkdirSync(path.join(second.root, 'orchestrator/.state-write.lock'));
  assert.throws(() => runLedgerTransaction({ ...second, expectedPlanHash: second.plan.plan_hash }), /状态写锁/);
});
test('迁移事务写失败完整回滚，第三方修改不被覆盖', () => {
  for (const foreign of [false, true]) {
    const {root, plan} = transactionFixture();
    assert.throws(() => runLedgerTransaction({root, plan, expectedPlanHash: plan.plan_hash, afterWrite() {
      if (foreign) fs.writeFileSync(path.join(root, 'BACKLOG.md'), 'foreign');
      throw new Error('injected failure');
    }}), /injected failure|第三方/);
    assert.equal(fs.readFileSync(path.join(root, 'BACKLOG.md'), 'utf8'), foreign ? 'foreign' : plan.operations[0].before);
    assert.equal(fs.existsSync(path.join(root, 'orchestrator/review-events.ndjson')), false);
    if (foreign) assert.throws(() => recoverLedgerTransaction({root, expectedPlanHash:plan.plan_hash}), /第三方/);
  }
});
test('迁移进程中断留下journal，可显式回滚并重新执行且幂等', () => {
  const {root,plan} = transactionFixture();
  const source = `import {runLedgerTransaction} from ${JSON.stringify(new URL('./reviewctl.mjs', import.meta.url).href)}; runLedgerTransaction({root:${JSON.stringify(root)},plan:${JSON.stringify(plan)},expectedPlanHash:${JSON.stringify(plan.plan_hash)},afterWrite(){process.exit(73)}});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding:'utf8'});
  assert.equal(child.status, 73, child.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'BACKLOG.md'), 'utf8'), plan.operations[0].after);
  assert.throws(() => runLedgerTransaction({root,plan,expectedPlanHash:plan.plan_hash}), /未完成/);
  recoverLedgerTransaction({root,expectedPlanHash:plan.plan_hash});
  assert.equal(fs.readFileSync(path.join(root, 'BACKLOG.md'), 'utf8'), plan.operations[0].before);
  runLedgerTransaction({root,plan,expectedPlanHash:plan.plan_hash});
  assert.equal(runLedgerTransaction({root,plan,expectedPlanHash:plan.plan_hash}).status, 'already-applied');
});

import { prepareLedgerTransaction } from './reviewctl.mjs';
import { syncBuiltinESMExports } from 'node:module';
test('迁移CLI预演只读，正式事务保留状态，过期SPEC不能开工', () => {
  const root = tempProject();
  const args = input => ['record','T-101','--spec','SPEC.md','--constitution','CONSTITUTION.md','--input',input,'--review','SPEC.review.md','--backlog','BACKLOG.md','--review-mode','homogeneous','--model','fixture'];
  const first = writePacket(root,'first.json',{schema:'spec-review-round/v2',review_kind:'initial',summary:'initial',findings:[]});
  assert.equal(run(REVIEWCTL,args(first),root).status,0);
  const ledger = path.join(root,'orchestrator/review-events.ndjson');
  const base = fs.readFileSync(ledger,'utf8');
  const second = writePacket(root,'second.json',{schema:'spec-review-round/v2',review_kind:'recheck',summary:'recheck',findings:[]});
  assert.equal(run(REVIEWCTL,args(second),root).status,0);
  const incoming = fs.readFileSync(ledger,'utf8');
  const damaged = incoming.replace('"summary":"initial"','"summary":"damaged"');
  fs.writeFileSync(ledger,damaged);
  fs.mkdirSync(path.join(root,'docs/archive'),{recursive:true});
  // Use an adjacent snapshot under docs, as production does, while preserving
  // the source event's original fields in this fixture.
  const manifest = {schema:'review-ledger-migration/v1',id:'cli-test',authorized_by:'DEC-999',created_at:'2026-10-28T00:00:00Z',expected_ledger_sha256:sha256(damaged),task_mappings:[]};
  for (const [i,[name,value]] of Object.entries({base,incoming,damaged}).entries()) {
    manifest[name] = {path:`docs/archive/${name}.ndjson`,sha256:sha256(value),commit:String(i+1).repeat(40)};
    fs.writeFileSync(path.join(root,manifest[name].path),value);
  }
  const raw = JSON.stringify(manifest);
  fs.writeFileSync(path.join(root,'docs/migration.json'),raw);
  fs.writeFileSync(path.join(root,'orchestrator/DECISION_LOG.md'),`\x60\x60\x60text\nID: DEC-999\nAuthorization-Kind: review-ledger-migration\nManifest-Path: docs/migration.json\nManifest-SHA256: ${sha256(raw)}\nOwner: user\nStatus: active\n\x60\x60\x60\n`);
  fs.appendFileSync(path.join(root,'SPEC.md'),'\nFR-102: changed spec\n');
  const before = ['BACKLOG.md','SPEC.review.md','orchestrator/review-events.ndjson'].map(file=>fs.readFileSync(path.join(root,file),'utf8'));
  const dry = run(REVIEWCTL,['migrate-ledger','--manifest','docs/migration.json'],root);
  assert.equal(dry.status,0,dry.stderr);
  assert.deepEqual(JSON.parse(dry.stdout).stale_tasks,['T-101']);
  assert.deepEqual(['BACKLOG.md','SPEC.review.md','orchestrator/review-events.ndjson'].map(file=>fs.readFileSync(path.join(root,file),'utf8')),before);
  assert.equal(fs.existsSync(path.join(root,'orchestrator/.review-ledger-migration.json')),false);
  const originalRead = fs.readFileSync;
  let injected = false;
  let racingPlan;
  fs.readFileSync = function(file, ...args) {
    const value = originalRead(file, ...args);
    if (!injected && file === path.join(fs.realpathSync(root),'BACKLOG.md')) {
      injected = true;
      fs.appendFileSync(file,'FOREIGN-CONCURRENT-UPDATE\n');
    }
    return value;
  };
  syncBuiltinESMExports();
  try { racingPlan = prepareLedgerTransaction({root,manifestPath:'docs/migration.json'}); }
  finally { fs.readFileSync = originalRead; syncBuiltinESMExports(); }
  assert.equal(injected,true);
  assert.throws(()=>runLedgerTransaction({root,plan:racingPlan,expectedPlanHash:racingPlan.plan_hash}),/CAS/);
  assert.match(fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8'),/FOREIGN-CONCURRENT-UPDATE/);
  fs.writeFileSync(path.join(root,'BACKLOG.md'),before[0]);
  const plan = prepareLedgerTransaction({root,manifestPath:'docs/migration.json'});
  // The source's adjacent root-level snapshot is a valid reviewctl target.
  runLedgerTransaction({root,plan,expectedPlanHash:plan.plan_hash});
  const audit = run(REVIEWCTL,['audit'],root);
  assert.equal(audit.status,1);
  assert.match(audit.stderr,/SPEC hash/);
  assert.equal(prepareLedgerTransaction({root,manifestPath:'docs/migration.json'}).status,'already-applied');
  assert.equal(fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8').replace(/REV:[a-f0-9]+/g,'REV:x'),before[0].replace(/REV:[a-f0-9]+/g,'REV:x'));
});

test('回滚预查之后出现第三方修改也不得覆盖', () => {
  const {root,plan} = transactionFixture();
  const source = `import {runLedgerTransaction} from ${JSON.stringify(new URL('./reviewctl.mjs', import.meta.url).href)}; runLedgerTransaction({root:${JSON.stringify(root)},plan:${JSON.stringify(plan)},expectedPlanHash:${JSON.stringify(plan.plan_hash)},afterWrite(){process.exit(73)}});`;
  assert.equal(spawnSync(process.execPath,['--input-type=module','-e',source]).status,73);
  const originalRead = fs.readFileSync;
  let injected = false;
  fs.readFileSync = function(file,...args) {
    const value = originalRead(file,...args);
    if (!injected && file === path.join(fs.realpathSync(root),'BACKLOG.md')) {
      injected = true;
      fs.writeFileSync(file,'FOREIGN-EDITOR-UPDATE');
    }
    return value;
  };
  syncBuiltinESMExports();
  try { assert.throws(()=>recoverLedgerTransaction({root,expectedPlanHash:plan.plan_hash}),/第三方/); }
  finally { fs.readFileSync = originalRead; syncBuiltinESMExports(); }
  assert.equal(fs.readFileSync(path.join(root,'BACKLOG.md'),'utf8'),'FOREIGN-EDITOR-UPDATE');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'orchestrator/.review-ledger-migration.json'),'utf8')).status,'pending');
});


test("索引审核保全历史外链，仍拒绝错误或清空的本任务SPEC绑定",async()=>{
  const root=tempProject();
  const {parseBacklogTaskRows,createTaskMetadata}=await import("./backlog-task-metadata.mjs");
  const {readBacklog}=await import("./reviewctl.mjs");
  try {
    const raw=fs.readFileSync(path.join(root,"BACKLOG.md"),"utf8").replace("[SPEC](SPEC.md)","[SPEC](SPEC.md) [外机](/Users/other/Growth/SPEC.md)");
    const source=parseBacklogTaskRows(raw).tasks[0];
    function index(task,review="待审") {
      const created=createTaskMetadata(task);
      fs.writeFileSync(path.join(root,"BACKLOG-details.md"),created.block);
      fs.writeFileSync(path.join(root,"BACKLOG.md"),`|ID|状态|审核|验收|文档|\n|---|---|---|---|---|\n|T-101|📋|${review}|—|${created.link}|\n`);
    }
    index(source);
    const input=writePacket(root,"indexed-round.json",{schema:"spec-review-round/v2",review_kind:"initial",summary:"索引兼容测试",findings:[]});
    const recorded=run(REVIEWCTL,["record","T-101","--spec","SPEC.md","--constitution","CONSTITUTION.md","--input",input,"--review","SPEC.review.md","--backlog","BACKLOG.md","--review-mode","cross-family","--model","test-reviewer"],root);
    assert.equal(recorded.status,0,recorded.stderr||recorded.stdout);
    const current=readBacklog(path.join(root,"BACKLOG.md")).tasks[0];assert.match(current.review,/^PASS\[REV:/);
    assert.equal(run(REVIEWCTL,["audit","--backlog","BACKLOG.md"],root).status,0);
    fs.writeFileSync(path.join(root,"WRONG.md"),"# 另一个真实SPEC\n");
    for(const document of ["[SPEC](WRONG.md)","—"]) {
      const changed=source.line.replace(source.document,document);
      const task=parseBacklogTaskRows(`|${source.header.join("|")}|\n|${source.header.map(()=>"---").join("|")}|\n${changed}`).tasks[0];
      index(task,current.review);
      const audited=run(REVIEWCTL,["audit","--backlog","BACKLOG.md"],root);
      assert.notEqual(audited.status,0);assert.match(audited.stderr+audited.stdout,/未链接 receipt 绑定的 SPEC/);
    }
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});


test("七列已有receipt不能因错误SPEC缺失被过滤为空而绕过绑定",async t=>{
  const {readBacklog,verifyReviewReceipt}=await import("./reviewctl.mjs");
  for(const document of ["[SPEC](MISSING.md)","docs/features/does-not-exist-t1432-probe.md"])for(const mode of ["audit","verify"])await t.test(`${mode}: ${document}`,()=>{
    const root=tempProject();
    try {
      const input=writePacket(root,"full-round.json",{schema:"spec-review-round/v2",review_kind:"initial",summary:"七列绑定测试",findings:[]});
      const recorded=run(REVIEWCTL,["record","T-101","--spec","SPEC.md","--constitution","CONSTITUTION.md","--input",input,"--review","SPEC.review.md","--backlog","BACKLOG.md","--review-mode","cross-family","--model","test-reviewer"],root);
      assert.equal(recorded.status,0,recorded.stderr||recorded.stdout);
      const file=path.join(root,"BACKLOG.md");
      const valid=fs.readFileSync(file,"utf8");
      fs.writeFileSync(file,valid.replace("[SPEC](SPEC.md)",document));
      const task=readBacklog(file).tasks[0];
      assert.equal(task.metadataReference,undefined);assert.deepEqual(task.documents,[]);
      assert.deepEqual(task.documentDiagnostics,[{target:document.startsWith("[SPEC]")?"MISSING.md":document,reason:"missing-document-not-read"}]);
      if(mode==="audit"){
        const audited=run(REVIEWCTL,["audit","--backlog","BACKLOG.md"],root);
        assert.notEqual(audited.status,0);assert.match(audited.stderr+audited.stdout,/未链接 receipt 绑定的 SPEC/);
      } else assert.throws(()=>verifyReviewReceipt({root:fs.realpathSync(root),taskId:task.id,reviewCell:task.review,documentCell:task.document,documentPaths:task.documents,requireDocumentLink:false}),/未链接 receipt 绑定的 SPEC/);
      if(mode==="verify")assert.doesNotThrow(()=>verifyReviewReceipt({root:fs.realpathSync(root),taskId:task.id,reviewCell:task.review,documentCell:"SPEC.md"}));
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  });
});

test("receipt自身SPEC被删除仍失败，不能降级成历史缺失诊断放行",async()=>{
  const root=tempProject();
  try {
    const input=writePacket(root,"missing-bound-round.json",{schema:"spec-review-round/v2",review_kind:"initial",summary:"绑定文件删除测试",findings:[]});
    const recorded=run(REVIEWCTL,["record","T-101","--spec","SPEC.md","--constitution","CONSTITUTION.md","--input",input,"--review","SPEC.review.md","--backlog","BACKLOG.md","--review-mode","cross-family","--model","test-reviewer"],root);
    assert.equal(recorded.status,0,recorded.stderr||recorded.stdout);
    fs.unlinkSync(path.join(root,"SPEC.md"));
    const audited=run(REVIEWCTL,["audit","--backlog","BACKLOG.md"],root);
    assert.notEqual(audited.status,0);assert.match(audited.stderr+audited.stdout,/SPEC 不存在|未链接 receipt 绑定的 SPEC/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
