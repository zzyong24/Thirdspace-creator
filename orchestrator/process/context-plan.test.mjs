import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "context-plan.mjs");

function fixture({
  stage = "4-build",
  triage = "S",
  config = {},
  modules = null,
  progress = null,
  threats = null,
  knowledge = false,
  boundary = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "context-plan-"));
  const processDir = path.join(root, "orchestrator", "process");
  fs.mkdirSync(processDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml"),
    `project:\n  current_stage: "${stage}"\nscale_class: "${triage}"\n`,
  );
  fs.writeFileSync(
    path.join(processDir, "reconcile.config.json"),
    `${JSON.stringify({
      receipt_policy: "required",
      program_completion_required: false,
      execution_mode: "interactive",
      autonomy_level: "interactive",
      context_policy: { mode: "adaptive", project_packs: [] },
      ...config,
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(processDir, ".skill-version"),
    `version=test\nskill_dir=${SKILL}\n`,
  );
  if (modules) {
    fs.writeFileSync(path.join(processDir, "modules.config.json"), `${JSON.stringify(modules, null, 2)}\n`);
  }
  if (progress) {
    fs.writeFileSync(
      path.join(root, "orchestrator", "progress.json"),
      `${JSON.stringify(progress, null, 2)}\n`,
    );
  }
  if (threats) {
    fs.writeFileSync(
      path.join(root, "orchestrator", "THREAT_MODEL.json"),
      `${JSON.stringify({ schema: "threat-model/v1", threats }, null, 2)}\n`,
    );
  }
  if (knowledge) fs.writeFileSync(path.join(processDir, "knowledge.config.json"), "{}\n");
  if (boundary) fs.writeFileSync(path.join(processDir, "boundaries.config.json"), "{}\n");
  return root;
}

function plan(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function words(relative) {
  return fs.readFileSync(path.join(SKILL, relative), "utf8").trim().split(/\s+/).filter(Boolean).length;
}

test("DESIGN/BUILD/SHIP workflow 保持精简且不常驻供应商、事故与复盘仪式", () => {
  const files = [
    "workflows/v3-3-design.md",
    "workflows/v3-4-build.md",
    "workflows/v3-5-ship.md",
  ];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SKILL, file), "utf8");
    assert.equal(words(file) <= 220, true, `${file}=${words(file)} words`);
    assert.doesNotMatch(raw, /gpt-image|Stitch|HOUSE_STYLE|field-lessons|\bT-\d{3}\b|v3\.\d+\.\d+|#\d+\b/i);
  }

  const build = fs.readFileSync(path.join(SKILL, "workflows", "v3-4-build.md"), "utf8");
  assert.match(build, /context-plan\.mjs[\s\S]*Task Packet|Task Packet[\s\S]*context-plan\.mjs/i);
  assert.match(build, /唯一[^\n]*prose read-set|prose read-set[^\n]*唯一/i);
  assert.doesNotMatch(build, /每\s*~?\s*10\s*片|每十片/);

  const ship = fs.readFileSync(path.join(SKILL, "workflows", "v3-5-ship.md"), "utf8");
  assert.match(ship, /prelaunch-engineering-audit\.md[^\n]*(?:风险|pack)[^\n]*触发/i);
  assert.match(ship, /engineering-retro\.md[^\n]*(?:风险|pack)[^\n]*触发/i);
  assert.match(ship, /asset-distill\.md[^\n]*(?:风险|pack)[^\n]*触发/i);
  assert.match(ship, /program_completion_required\s*=\s*true/i);
});

test("S/PLAN 只加载最小内核、当前 workflow/gate/template，实际引用语料不超过 20KiB", () => {
  const root = fixture({ stage: "1-plan", triage: "S" });
  const result = json(plan(root));
  assert.equal(result.schema, "product-to-code-orchestrator/context-plan@2");
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "plan"]);
  assert.deepEqual(result.required_reads, [
    "rules/global-rules.md",
    "workflows/_COMMON.md",
    "gates/_GATE_EVIDENCE.md",
    "workflows/v3-1-plan.md",
    "gates/01-product-gate.md",
    "templates/PRODUCT_SPEC_TEMPLATE.md",
  ]);
  assert.equal(result.total_inline_bytes, 0, "planner returns pointers and never duplicates prose inline");
  assert.equal(result.referenced_bytes <= 20 * 1024, true, `startup read-set is ${result.referenced_bytes} bytes`);
  assert.equal(result.required_reads.some((item) => /skill_registry|field-lessons|program|autonomy|knowledge|frontend/i.test(item)), false);
});

test("DESIGN read-set 只指向 UI workflow、05/06 gate 和 UI/PAGE 模板，architecture 保持独立", () => {
  const root = fixture({ stage: "3-design", triage: "S" });
  const result = json(plan(root));
  assert.equal(result.read_root, SKILL);
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "design"]);
  assert.deepEqual(result.required_reads, [
    "rules/global-rules.md",
    "workflows/_COMMON.md",
    "gates/_GATE_EVIDENCE.md",
    "workflows/v3-3-design.md",
    "gates/05-ui-gate.md",
    "gates/06-page-spec-gate.md",
    "templates/UI_RULES_TEMPLATE.md",
    "templates/PAGE_SPEC_TEMPLATE.md",
  ]);
  assert.equal(result.required_reads.some((item) => /architecture|SYSTEM_ARCHITECTURE|02-architecture/i.test(item)), false);
});

test("SHIP 的 prelaunch 由风险或 pack 激活，retro/asset mining 只由 pack，program 只由配置", () => {
  const explicit = fixture({
    stage: "5-ship",
    config: {
      context_policy: {
        mode: "adaptive",
        project_packs: ["prelaunch", "retro", "asset-mining"],
      },
    },
  });
  const result = json(plan(explicit));
  assert.deepEqual(result.packs.map((pack) => pack.id), [
    "core",
    "ship",
    "prelaunch",
    "retro",
    "asset-mining",
  ]);
  assert.equal(result.packs.some((pack) => pack.id === "program"), false);
  for (const ref of [
    "prompts/prelaunch-engineering-audit.md",
    "prompts/engineering-retro.md",
    "prompts/asset-distill.md",
  ]) assert.equal(result.required_reads.includes(ref), true);

  const program = fixture({
    stage: "5-ship",
    config: { program_completion_required: true },
  });
  assert.deepEqual(json(plan(program)).packs.map((pack) => pack.id), ["core", "ship", "program"]);

  const risk = fixture({
    stage: "5-ship",
    config: {
      context_policy: { mode: "adaptive", project_packs: ["security"] },
    },
  });
  assert.deepEqual(json(plan(risk)).packs.map((pack) => pack.id), [
    "core",
    "ship",
    "security",
    "prelaunch",
  ]);
});

test("BUILD 任务只按显式 context pack 增量加载 UI，不把所有便宜 guard 常驻", () => {
  const root = fixture({
    modules: {
      modules: {
        profile: {
          task_id: "T-001",
          tasks: ["implementation"],
          context_packs: ["ui"],
          write_set: ["src/profile/**"],
        },
      },
    },
  });
  const result = json(plan(root, "--task", "T-001"));
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "build", "ui"]);
  assert.equal(result.required_reads.includes("rules/product-integrity-rules.md"), true);
  assert.equal(result.required_reads.includes("gates/10-frontend-validation-gate.md"), true);
  assert.equal(result.packs.every((pack) => typeof pack.reason === "string" && pack.reason.length > 0), true);
  assert.equal(result.required_reads.some((item) => /program|harness|knowledge|field-lessons|threat/i.test(item)), false);
});

test("core/contract/build read-set 是无条件 prose 依赖闭包，product-integrity 只随 UI", () => {
  const contract = json(plan(fixture({ stage: "2-contract" })));
  assert.deepEqual(contract.required_reads, [
    "rules/global-rules.md",
    "workflows/_COMMON.md",
    "gates/_GATE_EVIDENCE.md",
    "workflows/v3-2-contract.md",
    "gates/03-scope-budget-gate.md",
    "gates/12-service-contract-gate.md",
    "gates/15b-contract-completeness-gate.md",
    "templates/SERVICE_CONTRACT_TEMPLATE.md",
  ]);

  const build = json(plan(fixture()));
  assert.deepEqual(build.required_reads, [
    "rules/global-rules.md",
    "workflows/_COMMON.md",
    "gates/_GATE_EVIDENCE.md",
    "workflows/v3-4-build.md",
    "gates/13-tdd-gate.md",
  ]);
  assert.equal(build.required_reads.includes("rules/product-integrity-rules.md"), false);
});

test("常见 UI task 名和客户端目录不用手填也自动增加 UI pack", () => {
  const byStep = fixture({
    modules: {
      modules: {
        profile: {
          task_id: "T-UI-STEP",
          tasks: ["repo", "frontend", "e2e"],
          write_set: ["src/profile/**"],
        },
      },
    },
  });
  assert.deepEqual(json(plan(byStep, "--task", "T-UI-STEP", "--step", "repo")).packs.map((pack) => pack.id), [
    "core", "build",
  ]);
  assert.deepEqual(json(plan(byStep, "--task", "T-UI-STEP", "--step", "frontend")).packs.map((pack) => pack.id), [
    "core", "build", "ui",
  ]);

  const byPath = fixture({
    modules: {
      modules: {
        profile: {
          task_id: "T-UI-PATH",
          tasks: ["implementation"],
          write_set: ["src/web/profile/**"],
        },
      },
    },
  });
  assert.deepEqual(json(plan(byPath, "--task", "T-UI-PATH")).packs.map((pack) => pack.id), [
    "core", "build", "ui",
  ]);

  const taskSurfaces = [
    "client",
    "pages",
    "screens",
    "views",
    "components",
    "mobile",
    "iOS",
    "Android",
  ];
  for (const [index, surface] of taskSurfaces.entries()) {
    const taskId = `T-SURFACE-${index}`;
    const root = fixture({
      modules: {
        modules: {
          delivery: {
            task_id: taskId,
            tasks: [surface],
            write_set: ["src/domain/**"],
          },
        },
      },
    });
    assert.deepEqual(
      json(plan(root, "--task", taskId)).packs.map((pack) => pack.id),
      ["core", "build", "ui"],
      `task surface ${surface}`,
    );
  }

  const uiPaths = [
    "src/client/Profile.tsx",
    "src/pages/profile.tsx",
    "src/screens/Profile.tsx",
    "src/views/profile.vue",
    "src/components/ProfileCard.svelte",
    "src/mobile/profile/**",
    "src/ios/ProfileView.swift",
    "src/android/ProfileScreen.kt",
  ];
  for (const [index, writePath] of uiPaths.entries()) {
    const taskId = `T-PATH-${index}`;
    const root = fixture({
      modules: {
        modules: {
          delivery: {
            task_id: taskId,
            tasks: ["implementation"],
            write_set: [writePath],
          },
        },
      },
    });
    assert.deepEqual(
      json(plan(root, "--task", taskId)).packs.map((pack) => pack.id),
      ["core", "build", "ui"],
      `write_set ${writePath}`,
    );
  }

  const nonUiClientFile = fixture({
    modules: {
      modules: {
        delivery: {
          task_id: "T-HTTP-CLIENT",
          tasks: ["implementation"],
          write_set: ["src/services/http-client.ts"],
        },
      },
    },
  });
  assert.deepEqual(json(plan(nonUiClientFile, "--task", "T-HTTP-CLIENT")).packs.map((pack) => pack.id), [
    "core", "build",
  ]);
});

test("未显式给 step 时只从 progress 的当前 pending/claimed step 推导，歧义时 fail-closed", () => {
  const modules = {
    modules: {
      profile: {
        task_id: "T-MIXED",
        tasks: ["repo", "frontend"],
        write_set: ["src/profile/**"],
      },
    },
  };
  const progress = {
    verticals: [{
      id: "profile",
      task_id: "T-MIXED",
      tasks: [
        { step: "repo", status: "pending" },
        { step: "frontend", status: "pending" },
      ],
    }],
    leases: {},
  };
  const root = fixture({ modules, progress });
  let result = json(plan(root, "--task", "T-MIXED"));
  assert.equal(result.step, "repo");
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "build"]);

  const progressFile = path.join(root, "orchestrator", "progress.json");
  progress.verticals[0].tasks[0].status = "done";
  progress.leases["profile:frontend"] = { agent: "worker-1" };
  fs.writeFileSync(progressFile, `${JSON.stringify(progress, null, 2)}\n`);
  result = json(plan(root, "--task", "T-MIXED"));
  assert.equal(result.step, "frontend");
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "build", "ui"]);

  const ambiguous = fixture({ modules });
  const failed = plan(ambiguous, "--task", "T-MIXED");
  assert.equal(failed.status, 2);
  assert.match(failed.stderr + failed.stdout, /step.*progress|progress.*step|无法.*step|cannot.*step/i);

  const completedOnly = fixture({
    modules: {
      modules: {
        report: { task_id: "T-DONE", tasks: ["implementation"], write_set: ["src/report/**"] },
      },
    },
    progress: {
      verticals: [{
        id: "report",
        task_id: "T-DONE",
        tasks: [{ step: "implementation", status: "done" }],
      }],
      leases: {},
    },
  });
  const completed = plan(completedOnly, "--task", "T-DONE");
  assert.equal(completed.status, 2);
  assert.match(completed.stderr + completed.stdout, /progress.*当前|current.*progress|pending.*step/i);
});

test("条件 pack 返回项目当前权威文件，而不只返回通用规则或空模板", () => {
  const root = fixture({
    triage: "L",
    boundary: true,
    modules: {
      modules: {
        profile: {
          task_id: "T-AUTHORITY",
          tasks: ["frontend"],
          write_set: ["src/profile/**"],
        },
      },
    },
    threats: [{
      id: "THREAT-001",
      task_id: "T-AUTHORITY",
      status: "approved",
      owner: "user",
      actor: "external attacker",
      assets: ["account data"],
      capabilities: ["read exported data"],
      acceptance_ids: ["AC-001"],
    }],
  });
  for (const [relative, body] of [
    ["PRODUCT_VOCABULARY.md", "# Vocabulary\n"],
    ["UI_RULES.md", "# UI Rules\n"],
    ["PAGE_SPEC.md", "# Page Spec\n"],
    ["orchestrator/SYSTEM_ARCHITECTURE.md", "# Current Architecture\n"],
  ]) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }

  const result = json(plan(root, "--task", "T-AUTHORITY"));
  assert.equal(result.step, "frontend");
  assert.deepEqual(result.required_project_reads, [
    "PRODUCT_VOCABULARY.md",
    "UI_RULES.md",
    "PAGE_SPEC.md",
    "orchestrator/SYSTEM_ARCHITECTURE.md",
    "orchestrator/process/boundaries.config.json",
    "orchestrator/THREAT_MODEL.json",
  ]);
  assert.equal(result.required_reads.includes("templates/THREAT_MODEL_TEMPLATE.json"), true);
});

test("同一 task_id 的 module 绑定合并 context packs，冲突 task definitions fail-closed", () => {
  const merged = fixture({
    modules: {
      modules: {
        "ingest-a": {
          task_id: "T-MERGED",
          tasks: ["implementation"],
          context_packs: ["research"],
          write_set: ["src/ingest-a/**"],
        },
        "ingest-b": {
          task_id: "T-MERGED",
          tasks: ["implementation"],
          context_packs: ["mock"],
          write_set: ["src/ingest-b/**"],
        },
      },
    },
  });
  assert.deepEqual(json(plan(merged, "--task", "T-MERGED")).packs.map((pack) => pack.id), [
    "core", "build", "research", "mock",
  ]);

  const conflict = fixture({
    modules: {
      modules: {
        "ingest-a": { task_id: "T-CONFLICT", tasks: ["implementation"] },
        "ingest-b": { task_id: "T-CONFLICT", tasks: ["cutover"] },
      },
    },
  });
  const result = plan(conflict, "--task", "T-CONFLICT");
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /重复 module 绑定.*冲突|duplicate.*conflict/i);
});

test("security pack 与reviewctl threat contract 一致：精确绑定或完整未绑定才激活", () => {
  const modules = {
    modules: {
      ingest: {
        task_id: "T-SEC",
        tasks: ["implementation"],
        context_packs: [],
        write_set: ["src/ingest/**"],
      },
    },
  };
  const completeThreat = {
    status: "approved",
    owner: "user",
    actor: "外部攻击者",
    assets: ["用户数据"],
    capabilities: ["读取导出文件"],
    acceptance_ids: ["AC-101"],
  };
  const approved = fixture({
    modules,
    threats: [{ id: "THREAT-001", task_id: "T-SEC", ...completeThreat }],
  });
  assert.deepEqual(json(plan(approved, "--task", "T-SEC")).packs.map((pack) => pack.id), [
    "core", "build", "security",
  ]);

  const unbound = fixture({
    modules,
    threats: [{ id: "THREAT-GLOBAL", ...completeThreat }],
  });
  assert.deepEqual(json(plan(unbound, "--task", "T-SEC")).packs.map((pack) => pack.id), [
    "core", "build", "security",
  ]);

  const unrelated = fixture({
    modules,
    threats: [{ id: "THREAT-002", task_id: "T-OTHER", ...completeThreat }],
  });
  assert.deepEqual(json(plan(unrelated, "--task", "T-SEC")).packs.map((pack) => pack.id), [
    "core", "build",
  ]);

  const incomplete = fixture({
    modules,
    threats: [{
      id: "THREAT-INCOMPLETE",
      task_id: "T-SEC",
      ...completeThreat,
      capabilities: [],
    }],
  });
  assert.deepEqual(json(plan(incomplete, "--task", "T-SEC")).packs.map((pack) => pack.id), [
    "core", "build",
  ]);
});

test("research/mock 是显式增量 pack，不关闭自动推导的 UI", () => {
  const root = fixture({
    modules: {
      modules: {
        profile: {
          task_id: "T-PACKS",
          tasks: ["browser"],
          context_packs: ["research", "mock"],
          write_set: ["src/profile/**"],
        },
      },
    },
  });
  const result = json(plan(root, "--task", "T-PACKS"));
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "build", "ui", "research", "mock"]);
  for (const ref of [
    "rules/product-integrity-rules.md",
    "gates/09-frontend-implementation-gate.md",
    "gates/04-research-first-gate.md",
    "templates/TECHNICAL_RESEARCH_CARD_TEMPLATE.md",
    "rules/mock-data-rules.md",
    "gates/08-mock-data-gate.md",
  ]) assert.equal(result.required_reads.includes(ref), true, ref);
});

test("视觉候选模板只在 visual-mock pack 显式激活", () => {
  const root = fixture({
    stage: "3-design",
    config: {
      context_policy: { mode: "adaptive", project_packs: ["visual-mock"] },
    },
  });
  const result = json(plan(root));
  assert.deepEqual(result.packs.map((pack) => pack.id), ["core", "design", "visual-mock"]);
  assert.equal(result.required_reads.includes("templates/UI_MOCK_PROMPT_TEMPLATE.md"), true);
});

test("结构化事实只单向增加相关 pack：multi/autonomy/knowledge/architecture/security/observability", () => {
  const root = fixture({
    triage: "L",
    knowledge: true,
    boundary: true,
    config: {
      program_completion_required: true,
      execution_mode: "autonomous",
      autonomy_level: "L2",
      context_policy: { mode: "adaptive", project_packs: ["security"] },
    },
    modules: {
      modules: {
        ingest: {
          task_id: "T-009",
          tasks: ["implementation"],
          context_packs: ["observability"],
          write_set: ["src/ingest/**"],
        },
      },
    },
  });
  const result = json(plan(root, "--task", "T-009"));
  assert.deepEqual(result.packs.map((pack) => pack.id), [
    "core",
    "build",
    "architecture",
    "knowledge",
    "program",
    "autonomy",
    "security",
    "observability",
  ]);
  assert.equal(result.packs.some((pack) => pack.id === "ui"), false);
});

test("未知 context pack fail-closed，项目名或临时事故不能变成全局能力", () => {
  const root = fixture({
    config: {
      context_policy: { mode: "adaptive", project_packs: ["moonlit-special-case"] },
    },
  });
  const result = plan(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /unknown context pack|未知 context pack/i);
});

test("adaptive context_policy 拒绝 disable 或任何未知字段", () => {
  const root = fixture({
    config: {
      context_policy: {
        mode: "adaptive",
        project_packs: [],
        disable_guards: true,
      },
    },
  });
  const result = plan(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /context_policy.*未知字段|unknown.*context_policy/i);

  const missingPacks = fixture({
    config: { context_policy: { mode: "adaptive" } },
  });
  const missingResult = plan(missingPacks);
  assert.equal(missingResult.status, 2);
  assert.match(missingResult.stderr + missingResult.stdout, /context_policy\.project_packs.*string 数组/i);
});

test("legacy 项目缺 context_policy 时显式 compat-full，不静默按 lean 运行", () => {
  const root = fixture();
  const configPath = path.join(root, "orchestrator", "process", "reconcile.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  delete config.context_policy;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = json(plan(root));
  assert.equal(result.compatibility_mode, true);
  assert.match(result.diagnostic, /legacy|context_policy|compat-full/i);
  assert.deepEqual(result.packs.map((pack) => pack.id), [
    "core",
    "plan",
    "contract",
    "design",
    "build",
    "ship",
    "architecture",
    "knowledge",
    "program",
    "autonomy",
      "security",
      "observability",
      "ui",
      "research",
      "mock",
      "visual-mock",
      "prelaunch",
      "retro",
      "asset-mining",
    ]);

  config.context_policy = { mode: "compat-full", project_packs: [] };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const invalid = plan(root);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr + invalid.stdout, /未知 context_policy\.mode|unknown context_policy\.mode/i);
});

test("Task Packet 内嵌同一确定性读取计划，只给路径不灌整篇规则", () => {
  const root = fixture({
    modules: {
      modules: {
        profile: {
          task_id: "T-001",
          tasks: ["implementation"],
          context_packs: ["ui"],
          write_set: ["src/profile/**"],
          verify_commands: { implementation: "node --test" },
        },
      },
    },
  });
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    "| ID | 任务 | 状态 | 文档 | 一句话 |\n| --- | --- | --- | --- | --- |\n| T-001 | Profile | 🔨 | [Spec](PROFILE_SPEC.md) | 修正资料页 |\n",
  );
  fs.writeFileSync(path.join(root, "PROFILE_SPEC.md"), "# Profile\n");
  fs.copyFileSync(path.join(HERE, "context-compile.mjs"), path.join(root, "orchestrator", "process", "context-compile.mjs"));
  fs.copyFileSync(SCRIPT, path.join(root, "orchestrator", "process", "context-plan.mjs"));
  const run = spawnSync(process.execPath, [path.join(root, "orchestrator", "process", "context-compile.mjs"), "T-001"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const packet = fs.readFileSync(path.join(root, "orchestrator", "context", "T-001.md"), "utf8");
  assert.match(packet, /上下文读取计划/);
  assert.match(packet, new RegExp(`读取根：.*${SKILL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(packet, /读取模式：adaptive/);
  assert.match(packet, /rules\/product-integrity-rules\.md/);
  assert.equal(packet.length < 8 * 1024, true, `task packet is ${packet.length} bytes`);
  assert.doesNotMatch(packet, /## Product-Integrity Guard[\s\S]{1000}/);
});
