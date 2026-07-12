import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import type { RequestContext } from "@creatoros/contract";
import { runExecutionTask, type ExecutionAiPort } from "../run-execution-task";
import { createExecutorRegistry } from "../executor-registry";
import { createAgenticExecutor } from "./agentic-executor";
import { createDeterministicAgenticEngine } from "./deterministic-engine";
import { createResearchTools, type ResearchPorts } from "./adapters/research-adapter";
import type { AgenticTool, EngineLlm } from "./engine";

// [T-256b/c] agentic executor 端到端(经 runExecutionTask,复用 T-255a 编排/沙箱/确认门):
// stub(确定性)引擎跑通框架 —— 工具白名单 / 步数预算硬顶 / 干跑 / 检查点 / manifest 过确认门。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
} as unknown as RequestContext;

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

interface FakeAi extends ExecutionAiPort {
  statuses: string[];
  steps: { kind: string; text: string }[];
  candidates: { resultType: string; resultData: Record<string, unknown> }[];
  failures: string[];
}
function makeFakeAi(): FakeAi {
  const fake: FakeAi = {
    statuses: [],
    steps: [],
    candidates: [],
    failures: [],
    async markRunning() {
      fake.statuses.push("running");
    },
    async recordStep(_c, _t, input) {
      fake.steps.push({ kind: input.kind, text: input.text });
    },
    async recordCandidate(_c, _t, input) {
      fake.statuses.push("awaiting_confirmation");
      fake.candidates.push(input);
      return {};
    },
    async markFailed(_c, _t, msg) {
      fake.statuses.push("failed");
      fake.failures.push(msg ?? "");
    },
  };
  return fake;
}

const assets = {
  async getAssetBytes() {
    return null;
  },
};

function fakeLlm(): EngineLlm & { calls: number } {
  const state = { calls: 0 };
  const fn: EngineLlm = async () => {
    state.calls += 1;
    return { text: "决策", tokensUsed: 20 };
  };
  Object.defineProperty(fn, "calls", { get: () => state.calls });
  return fn as EngineLlm & { calls: number };
}

// fake 调研端口(带写入 spy;grounding=web)。
function makeResearchPorts(): {
  ports: ResearchPorts;
  writes: Array<{ title: string }>;
} {
  const writes: Array<{ title: string }> = [];
  const ports: ResearchPorts = {
    async webSearch({ query }) {
      return {
        grounding: "web",
        results: [
          { title: `《关于 ${query}》`, url: "https://ex.com/a", snippet: "s" },
        ],
      };
    },
    async webRead({ url }) {
      return {
        needLogin: false,
        title: "正文标题",
        fullText: "正文全文".repeat(10),
        sourceUrl: url,
      };
    },
    async knowledgeWrite({ title }) {
      writes.push({ title });
      return { pendingId: "pk-1" };
    },
  };
  return { ports, writes };
}

function makeExecutor(
  resolveTools: (c: RequestContext) => readonly AgenticTool[],
  budget = { maxSteps: 8, maxTokens: 100000 },
  llm = fakeLlm(),
) {
  return createAgenticExecutor({
    taskType: "agentic.research",
    engine: createDeterministicAgenticEngine(),
    resolveLlm: () => llm,
    resolveTools,
    defaultBudget: budget,
  });
}

function agenticSpec(params: Record<string, unknown> = {}) {
  return {
    spec: {
      taskType: "agentic.research",
      goal: "研究 A 选题",
      inputs: [],
      params,
    },
  };
}

describe("agentic executor 端到端(agentic.research via runExecutionTask)", () => {
  it("跑通框架:running→awaiting_confirmation,产物写 out/ 过确认门,llm 回接被调,写入端口非干跑落 pending", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts();
    const llm = fakeLlm();
    registry.register(makeExecutor(() => createResearchTools(ports), undefined, llm));
    const ai = makeFakeAi();

    await runExecutionTask(ctx, { id: "t1", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });

    expect(ai.statuses).toEqual(["running", "awaiting_confirmation"]);
    expect(ai.failures).toEqual([]);
    // manifest 收割到 agentic-result.json(经既有 harvest→manifest→确认门)。
    const manifest = ai.candidates[0]!.resultData.manifest as {
      taskType: string;
      artifacts: { path: string }[];
      summary: string;
    };
    expect(ai.candidates[0]!.resultType).toBe("execution_manifest");
    expect(manifest.artifacts.map((a) => a.path)).toEqual(["agentic-result.json"]);
    // 产物真落沙箱 out/,含三工具产出 + 停因。
    const written = JSON.parse(
      await fs.readFile(path.join(root, "t1", "out", "agentic-result.json"), "utf8"),
    ) as { engine: string; stopReason: string; output: { outputs: Record<string, unknown> } };
    expect(written.engine).toBe("deterministic");
    expect(written.stopReason).toBe("completed");
    expect(Object.keys(written.output.outputs).sort()).toEqual([
      "knowledge.write",
      "web.read",
      "web.search",
    ]);
    // §6.1 回接被真触发(每步一次)。
    expect(llm.calls).toBeGreaterThanOrEqual(3);
    // 非干跑 → 知识写入端口真落 pending(铁律②:pending,不是 active)。
    expect(writes.length).toBe(1);
  });

  it("工具白名单物理隔离:册外工具被 filterToolsToScope 挡,永不执行", async () => {
    const registry = createExecutorRegistry();
    const { ports } = makeResearchPorts();
    let evilRan = false;
    const evil: AgenticTool = {
      name: "evil.exec",
      label: "evil",
      description: "raw shell(不该被 agentic.research 拿到)",
      effect: "writeback",
      parameters: z.object({}).passthrough(),
      planInput: () => ({}),
      async execute() {
        evilRan = true;
        return { summary: "evil" };
      },
    };
    registry.register(
      makeExecutor(() => [...createResearchTools(ports), evil]),
    );
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "t2", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });
    expect(ai.failures).toEqual([]);
    expect(evilRan).toBe(false);
    const written = JSON.parse(
      await fs.readFile(path.join(root, "t2", "out", "agentic-result.json"), "utf8"),
    ) as { output: { outputs: Record<string, unknown> } };
    expect(Object.keys(written.output.outputs)).not.toContain("evil.exec");
  });

  it("步数硬顶:maxSteps=1 → stopReason max_steps(meta 诚实)", async () => {
    const registry = createExecutorRegistry();
    const { ports } = makeResearchPorts();
    registry.register(makeExecutor(() => createResearchTools(ports), { maxSteps: 1, maxTokens: 100000 }));
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "t3", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });
    const written = JSON.parse(
      await fs.readFile(path.join(root, "t3", "out", "agentic-result.json"), "utf8"),
    ) as { stopReason: string; steps: number };
    expect(written.stopReason).toBe("max_steps");
    expect(written.steps).toBe(1);
  });

  it("任务级干跑 dryRun=true:writeback 工具干跑,知识写入端口不落 pending(SPEC §4.4)", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts();
    registry.register(makeExecutor(() => createResearchTools(ports)));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      { id: "t4", inputData: agenticSpec({ dryRun: true }) },
      { ai, assets, registry, workspacesRoot: root },
    );
    expect(ai.failures).toEqual([]);
    expect(writes.length).toBe(0); // 干跑不落 pending
  });

  it("参数预算只能调低不能调高缺省上限", async () => {
    const registry = createExecutorRegistry();
    const { ports } = makeResearchPorts();
    // 缺省 maxSteps=2;任务请求 maxSteps=999 应被夹到 2。
    registry.register(makeExecutor(() => createResearchTools(ports), { maxSteps: 2, maxTokens: 100000 }));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      { id: "t5", inputData: agenticSpec({ maxSteps: 999 }) },
      { ai, assets, registry, workspacesRoot: root },
    );
    const written = JSON.parse(
      await fs.readFile(path.join(root, "t5", "out", "agentic-result.json"), "utf8"),
    ) as { budget: { maxSteps: number }; steps: number };
    expect(written.budget.maxSteps).toBe(2);
    expect(written.steps).toBeLessThanOrEqual(2);
  });

  it("检查点续跑不重置预算:checkpoint 已近顶 → 续跑步数受限", async () => {
    const registry = createExecutorRegistry();
    const { ports } = makeResearchPorts();
    registry.register(makeExecutor(() => createResearchTools(ports), { maxSteps: 3, maxTokens: 100000 }));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      {
        id: "t6",
        inputData: agenticSpec({ checkpoint: { stepsUsed: 2, tokensUsed: 0 } }),
      },
      { ai, assets, registry, workspacesRoot: root },
    );
    const written = JSON.parse(
      await fs.readFile(path.join(root, "t6", "out", "agentic-result.json"), "utf8"),
    ) as { stopReason: string; steps: number };
    // 已用 2 步,预算 3 步 → 续跑只剩 1 步就到顶。
    expect(written.steps).toBe(3);
    expect(written.stopReason).toBe("max_steps");
  });

  it("缺 ctx / 无可用工具 → 诚实失败(不静默降级)", async () => {
    const registry = createExecutorRegistry();
    // 缺 ctx:直接 runExecutionTask 会带 ctx,故构造 registry 无关;测无工具场景。
    const { ports } = makeResearchPorts();
    void ports;
    registry.register(makeExecutor(() => [])); // resolveTools 返空 → 白名单为空
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "t7", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });
    expect(ai.failures[0]).toContain("无可用领域工具");
  });
});
