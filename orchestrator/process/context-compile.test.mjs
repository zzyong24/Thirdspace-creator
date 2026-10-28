import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, "rule-bundle");

function fixture(t, {
  modules,
  progress,
  executionMode = "autonomous",
  taskIds = ["T-A", "T-B"],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "context-compile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const processDir = path.join(root, "orchestrator", "process");
  fs.mkdirSync(processDir, { recursive: true });
  fs.copyFileSync(path.join(HERE, "context-compile.mjs"), path.join(processDir, "context-compile.mjs"));
  fs.copyFileSync(path.join(HERE, "context-plan.mjs"), path.join(processDir, "context-plan.mjs"));
  fs.copyFileSync(path.join(HERE, "rule-bundle.mjs"), path.join(processDir, "rule-bundle.mjs"));
  fs.copyFileSync(path.join(HERE, "backlog-task-metadata.mjs"), path.join(processDir, "backlog-task-metadata.mjs"));
  fs.writeFileSync(
    path.join(root, "orchestrator", "ARTIFACT_MANIFEST.yaml"),
    'project:\n  current_stage: "4-build"\nscale_class: "S"\n',
  );
  fs.writeFileSync(
    path.join(processDir, "reconcile.config.json"),
    `${JSON.stringify({
      execution_mode: executionMode,
      autonomy_level: executionMode === "autonomous" ? "L2" : "interactive",
      context_policy: { mode: "adaptive", project_packs: [] },
    }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(processDir, ".skill-version"), `version=test\nskill_dir=${SKILL}\n`);
  fs.writeFileSync(path.join(processDir, "modules.config.json"), `${JSON.stringify(modules, null, 2)}\n`);
  if (progress !== undefined) {
    fs.writeFileSync(
      path.join(root, "orchestrator", "progress.json"),
      `${JSON.stringify(progress, null, 2)}\n`,
    );
  }

  const rows = taskIds.map((id) => {
    fs.writeFileSync(path.join(root, `${id}.md`), `# ${id}\n`);
    return `| ${id} | ${id} task | 🔨 | [Spec](${id}.md) | deliver ${id} |`;
  });
  fs.writeFileSync(
    path.join(root, "BACKLOG.md"),
    `| ID | 任务 | 状态 | 文档 | 一句话 |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
  return root;
}

function run(root, taskId) {
  return spawnSync(
    process.execPath,
    [path.join(root, "orchestrator", "process", "context-compile.mjs"), taskId],
    { cwd: root, encoding: "utf8" },
  );
}

function packetAt(root, taskId) {
  return fs.readFileSync(path.join(root, "orchestrator", "context", `${taskId}.md`), "utf8");
}

function strictModules() {
  return {
    verify_commands: {
      review: "node verify-global-review.mjs",
      implementation: "node verify-global-implementation.mjs",
    },
    modules: {
      alpha: {
        task_id: "T-A",
        tasks: ["review", "implementation"],
        write_set: ["src/a/**"],
        read_set: ["contracts/a.json"],
        verify_commands: { implementation: "node verify-a-implementation.mjs" },
      },
      beta: {
        task_id: "T-B",
        tasks: ["implementation"],
        write_set: ["src/b/**"],
        read_set: ["contracts/b.json"],
        verify_commands: { implementation: "node verify-b-implementation.mjs" },
      },
    },
  };
}

function strictProgress() {
  return {
    summary: {},
    leases: {},
    verticals: [
      {
        id: "alpha",
        task_id: "T-A",
        tasks: [
          { step: "review", status: "done" },
          { step: "implementation", status: "pending" },
        ],
        write_set: ["src/a/**"],
      },
      {
        id: "beta",
        task_id: "T-B",
        tasks: [{ step: "implementation", status: "pending" }],
        write_set: ["src/b/**"],
      },
    ],
  };
}

function parallelLease(overrides = {}) {
  return {
    agent: "agent-alpha",
    since: "2026-08-24T00:00:00.000Z",
    isolation_kind: "worktree",
    workspace_root: "/tmp/ptco-worktrees/wave-17/alpha-implementation",
    branch: "auto/wave-17/alpha-implementation",
    base_sha: "a".repeat(40),
    wave_id: "wave-17",
    merge_index: 2,
    ...overrides,
  };
}

function progressWithCurrentLease(lease) {
  const progress = strictProgress();
  progress.leases["alpha:implementation"] = lease;
  return progress;
}

function assertPacketField(packet, field, value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(packet, new RegExp(`${field}[^\\n]*${escaped}`, "i"));
}

test("Task Packet is scoped to the selected task and its current progress step", (t) => {
  const root = fixture(t, { modules: strictModules(), progress: strictProgress() });
  const result = run(root, "T-A");
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const packet = packetAt(root, "T-A");
  assert.match(packet, /current step|current-step|当前步骤/i);
  assert.match(packet, /implementation/);
  assert.match(packet, /src\/a\/\*\*/);
  assert.match(packet, /contracts\/a\.json/);
  assert.match(packet, /node verify-a-implementation\.mjs/);
  assert.doesNotMatch(packet, /src\/b\/\*\*/);
  assert.doesNotMatch(packet, /contracts\/b\.json/);
  assert.doesNotMatch(packet, /node verify-b-implementation\.mjs/);
  assert.doesNotMatch(packet, /node verify-global-review\.mjs/);
});

test("read-only Task Packet allows no writes but binds its exact read_set", (t) => {
  const modules = {
    modules: {
      audit: {
        task_id: "T-AUDIT",
        tasks: ["inspect"],
        write_set: [],
        read_set: ["docs/reference/**"],
        verify_commands: { inspect: "node verify-audit.mjs" },
      },
    },
  };
  const progress = {
    leases: {},
    verticals: [{
      id: "audit",
      task_id: "T-AUDIT",
      tasks: [{ step: "inspect", status: "pending" }],
      write_set: [],
      read_set: ["docs/reference/**"],
    }],
  };
  const root = fixture(t, { modules, progress, taskIds: ["T-AUDIT"] });
  const result = run(root, "T-AUDIT");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = packetAt(root, "T-AUDIT");
  assert.match(packet, /docs\/reference\/\*\*/);
  assert.match(packet, /read.only|read-only|只读|no writes/i);
});

test("parallel Task Packet is bound to the main control-plane worktree lease", (t) => {
  const lease = parallelLease();
  const root = fixture(t, {
    modules: strictModules(),
    progress: progressWithCurrentLease(lease),
  });

  const result = run(root, "T-A");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = packetAt(root, "T-A");

  for (const field of [
    "isolation_kind",
    "workspace_root",
    "branch",
    "base_sha",
    "wave_id",
    "merge_index",
  ]) {
    assertPacketField(packet, field, lease[field]);
  }
  assert.match(packet, /candidate commit|候选提交/i);
  assert.match(packet, /(?:do not|must not|禁止).*(?:push|推送)|(?:push|推送).*(?:do not|must not|禁止)/i);
  assert.match(packet, /(?:control plane|控制面).*(?:do not|must not|禁止)|(?:do not|must not|禁止).*(?:control plane|控制面)/i);
});

test("Task Packet resolves read/write/resource boundaries from the current step", (t) => {
  const modules = strictModules();
  modules.modules.alpha.exclusive_resources = ["database:future"];
  modules.modules.alpha.step_write_set = {
    review: [],
    implementation: ["src/a/current/**"],
  };
  modules.modules.alpha.step_read_set = {
    review: ["docs/review.md"],
    implementation: ["contracts/current.json"],
  };
  modules.modules.alpha.step_exclusive_resources = {
    review: [],
    implementation: ["database:current"],
  };
  const root = fixture(t, { modules, progress: strictProgress() });
  const result = run(root, "T-A");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = packetAt(root, "T-A");
  assert.match(packet, /src\/a\/current\/\*\*/);
  assert.match(packet, /contracts\/current\.json/);
  assert.match(packet, /database:current/);
  assert.doesNotMatch(packet, /src\/a\/\*\*/);
  assert.doesNotMatch(packet, /contracts\/a\.json/);
  assert.doesNotMatch(packet, /database:future/);
});

test("parallel Task Packet requires every current binding to share the same lease", (t) => {
  const modules = {
    verify_commands: { implementation: "node verify-all.mjs" },
    modules: {
      alpha: {
        task_id: "T-A",
        tasks: ["implementation"],
        write_set: ["src/a/**"],
      },
      alpha_docs: {
        task_id: "T-A",
        tasks: ["implementation"],
        write_set: ["docs/a/**"],
      },
    },
  };
  const progress = {
    leases: { "alpha:implementation": parallelLease() },
    verticals: [
      { id: "alpha", task_id: "T-A", tasks: [{ step: "implementation", status: "pending" }] },
      { id: "alpha_docs", task_id: "T-A", tasks: [{ step: "implementation", status: "pending" }] },
    ],
  };
  const root = fixture(t, { modules, progress, taskIds: ["T-A"] });
  const result = run(root, "T-A");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr + result.stdout, /all.*lease|lease.*all|全部.*lease|绑定.*lease/i);
});

test("parallel Task Packet fails closed when its worktree lease metadata is incomplete", async (t) => {
  for (const field of [
    "isolation_kind",
    "workspace_root",
    "branch",
    "base_sha",
    "wave_id",
    "merge_index",
  ]) {
    await t.test(`missing ${field}`, (tt) => {
      const lease = parallelLease();
      delete lease[field];
      const root = fixture(tt, {
        modules: strictModules(),
        progress: progressWithCurrentLease(lease),
      });

      const result = run(root, "T-A");
      assert.notEqual(result.status, 0, result.stderr || result.stdout);
      assert.match(
        result.stderr + result.stdout,
        new RegExp(
          `${field}.*(?:missing|required|invalid|缺失|无效)|(?:parallel|worktree|并行).*${field}`,
          "i",
        ),
      );
    });
  }
});

test("Task Packet carries only current-step project authorities from the planner", (t) => {
  const modules = {
    modules: {
      profile: {
        task_id: "T-A",
        tasks: ["repo", "frontend"],
        write_set: ["src/profile/**"],
        verify_commands: {
          repo: "node verify-repo.mjs",
          frontend: "node verify-frontend.mjs",
        },
      },
    },
  };
  const progress = {
    leases: {},
    verticals: [{
      id: "profile",
      task_id: "T-A",
      tasks: [
        { step: "repo", status: "done" },
        { step: "frontend", status: "pending" },
      ],
    }],
  };
  const root = fixture(t, { modules, progress, taskIds: ["T-A"] });
  for (const relative of ["PRODUCT_VOCABULARY.md", "UI_RULES.md", "PAGE_SPEC.md"]) {
    fs.writeFileSync(path.join(root, relative), `# ${relative}\n`);
  }

  const result = run(root, "T-A");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = packetAt(root, "T-A");
  assert.match(packet, /项目权威/);
  assert.match(packet, /PRODUCT_VOCABULARY\.md/);
  assert.match(packet, /UI_RULES\.md/);
  assert.match(packet, /PAGE_SPEC\.md/);
  assert.match(packet, /node verify-frontend\.mjs/);
  assert.doesNotMatch(packet, /node verify-repo\.mjs/);
});

test("Task Packet points to project policy instead of injecting framework-owned project policy", (t) => {
  const root = fixture(t, { modules: strictModules(), progress: strictProgress() });
  const result = run(root, "T-A");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = packetAt(root, "T-A");

  assert.match(packet, /AGENTS\.md/);
  assert.match(packet, /框架不注入项目专属/);
  assert.doesNotMatch(packet, /模型可配|P0\/P1|一次从\s*0\s*到\s*1/);
});

test("strict queue Packet fails closed on missing task binding, write_set, or current-step verify", async (t) => {
  await t.test("missing task binding", (tt) => {
    const modules = strictModules();
    delete modules.modules.alpha.task_id;
    const root = fixture(tt, { modules, progress: strictProgress() });
    const result = run(root, "T-A");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /task binding|task_id|任务绑定/i);
  });

  await t.test("missing read/write boundary", (tt) => {
    const modules = strictModules();
    modules.modules.alpha.write_set = [];
    modules.modules.alpha.read_set = [];
    const root = fixture(tt, { modules, progress: strictProgress() });
    const result = run(root, "T-A");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /write_set|read_set|boundary|边界/i);
  });

  await t.test("missing current-step verify", (tt) => {
    const modules = strictModules();
    delete modules.modules.alpha.verify_commands.implementation;
    delete modules.verify_commands.implementation;
    const root = fixture(tt, { modules, progress: strictProgress() });
    const result = run(root, "T-A");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /verify_commands\.implementation|current-step verify|当前步骤.*验证/i);
  });
});

test("legacy interactive one-step module remains task-scoped without progress.json", (t) => {
  const root = fixture(t, {
    executionMode: "interactive",
    taskIds: ["T-LEGACY"],
    modules: {
      modules: {
        "T-LEGACY": {
          tasks: ["work"],
          write_set: ["legacy/**"],
          verify: "npm run verify:legacy",
        },
      },
    },
  });
  const result = run(root, "T-LEGACY");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packet = fs.readFileSync(path.join(root, "orchestrator", "context", "T-LEGACY.md"), "utf8");
  assert.match(packet, /legacy\/\*\*/);
  assert.match(packet, /npm run verify:legacy/);
});

test("legacy interactive compatibility never turns a missing verify into a Packet placeholder", (t) => {
  const root = fixture(t, {
    executionMode: "interactive",
    taskIds: ["T-LEGACY"],
    modules: {
      modules: {
        "T-LEGACY": {
          tasks: ["work"],
          write_set: ["legacy/**"],
        },
      },
    },
  });
  const result = run(root, "T-LEGACY");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /verify|\u9a8c\u8bc1/i);
});


test("五列索引 Task Packet 读取本任务完整元数据，不把状态与详情链接充作标题和SPEC",async t=>{
  const root=fixture(t,{modules:strictModules(),progress:strictProgress()});
  const {createHash}=await import("node:crypto");
  const hash=value=>createHash("sha256").update(value).digest("hex");
  const source_line="| T-A | 完整索引标题 | 📋 | 待审 | 待验 | [Spec](T-A.md) | 本任务完整叙事 |";
  const metadata={schema:"backlog-task-metadata/v1",id:"T-A",title:"完整索引标题",narrative:"本任务完整叙事",documents:"[Spec](T-A.md)",source_line,source_sha256:hash(source_line),source_columns:["ID","任务","状态","审核","验收","文档","一句话"]};
  const anchor=`m-${hash(JSON.stringify(metadata)).slice(0,8)}`;
  fs.writeFileSync(path.join(root,"BACKLOG-details.md"),`<a id="${anchor}"></a>\n\`\`\`backlog-task-metadata\n${JSON.stringify(metadata)}\n\`\`\`\n`);
  fs.writeFileSync(path.join(root,"BACKLOG.md"),`|ID|状态|审核|验收|文档|\n|---|---|---|---|---|\n|T-A|🔨|—|待验|[D](BACKLOG-details.md#${anchor})|\n`);
  const result=run(root,"T-A");assert.equal(result.status,0,result.stderr||result.stdout);
  const packet=packetAt(root,"T-A");assert.match(packet,/任务\*\*:完整索引标题/);assert.match(packet,/本任务完整叙事/);
  const references=packet.split("## 3.")[1].split("## 4.")[0];
  assert.match(references,/T-A\.md/);assert.doesNotMatch(references,/BACKLOG-details\.md/);
});
