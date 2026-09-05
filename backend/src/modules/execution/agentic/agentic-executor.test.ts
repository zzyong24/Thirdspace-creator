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
  plans: unknown[];
}
function makeFakeAi(): FakeAi {
  const fake: FakeAi = {
    statuses: [],
    steps: [],
    candidates: [],
    failures: [],
    plans: [],
    async recordExecutionPlan(_ctx, _taskId, plan) {
      fake.plans.push(plan);
      fake.statuses.push("succeeded");
    },
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
  async materializeAsset() {
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
function makeResearchPorts(taskId = "unused"): {
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
    async knowledgeWrite({ title, note, sourceNote, toolCallId }) {
      writes.push({ title });
      return { pendingId: "pk-1", proposal: {
        schemaVersion: 1, kind: "knowledge.create", proposalId: "pk-1",
        source: {taskId, toolCallId: toolCallId ?? "call-1", evidenceRefs:["https://ex.com/a"]},
        target: {knowledgeId:"knowledge-1",expectedVersion:null}, content:{title,note,sourceNote},
      } };
    },
  };
  return { ports, writes };
}

// 测试明确提供候选决策，仅验证执行/预算边界；生产工具不承担语义默认。
function researchToolsWithTestDecision(ports: ResearchPorts): AgenticTool[] {
  return createResearchTools(ports).map(tool => tool.name === "knowledge.write"
    ? {...tool, planInput: () => ({title:"测试已选择的知识标题",note:"测试明确提供的知识正文",sourceNote:"https://ex.com/a"})}
    : tool);
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
  it("真实工具候选经公开编排进入确认门，不产生诊断文件", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts("t1");
    const llm = fakeLlm();
    registry.register(makeExecutor(() => researchToolsWithTestDecision(ports), undefined, llm));
    const ai = makeFakeAi();

    await runExecutionTask(ctx, { id: "t1", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });

    expect(ai.statuses).toEqual(["running", "awaiting_confirmation"]);
    expect(ai.failures).toEqual([]);
    expect(ai.candidates[0]!.resultType).toBe("agentic_proposals");
    expect(ai.candidates[0]!.resultData.proposals).toMatchObject([{kind:"knowledge.create",proposalId:"pk-1",source:{taskId:"t1"}}]);
    expect(ai.candidates[0]!.resultData.meta).toMatchObject({engine:"deterministic",completeness:"completed",stopReason:"completed",steps:3});
    expect(ai.candidates[0]!.resultData).not.toHaveProperty("manifest");
    // §6.1 回接被真触发(每步一次)。
    expect(llm.calls).toBeGreaterThanOrEqual(3);
    // 非干跑只取得端口返回的类型化候选，尚未采纳业务数据。
    expect(writes.length).toBe(1);
  });

  it("工具白名单物理隔离:册外工具被 filterToolsToScope 挡,永不执行", async () => {
    const registry = createExecutorRegistry();
    const { ports } = makeResearchPorts("t2");
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
      makeExecutor(() => [...researchToolsWithTestDecision(ports), evil]),
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
    expect(ai.candidates[0]!.resultType).toBe("agentic_proposals");
    expect(ai.steps.some(step=>step.text.includes("evil.exec"))).toBe(false);
  });

  it("步数硬顶:maxSteps=1 → stopReason max_steps(meta 诚实)", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts("t3");
    const llm = fakeLlm();
    registry.register(makeExecutor(() => researchToolsWithTestDecision(ports), { maxSteps: 1, maxTokens: 100000 }, llm));
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "t3", inputData: agenticSpec() }, {
      ai,
      assets,
      registry,
      workspacesRoot: root,
    });
    expect(llm.calls).toBe(1);
    expect(writes).toHaveLength(0);
    expect(ai.candidates).toHaveLength(0);
    expect(ai.statuses).toContain("failed");
    expect(ai.failures[0]).toContain("可采纳的业务候选");
  });

  it("任务级干跑 dryRun=true:writeback 工具干跑,知识写入端口不落 pending(SPEC §4.4)", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts();
    registry.register(makeExecutor(() => researchToolsWithTestDecision(ports)));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      { id: "t4", inputData: agenticSpec({ dryRun: true }) },
      { ai, assets, registry, workspacesRoot: root },
    );
    expect(ai.failures).toEqual([]);
    expect(writes.length).toBe(0); // 干跑不落 pending
    expect(ai.candidates).toHaveLength(0);
    expect(ai.plans).toHaveLength(1);
    expect(ai.statuses).toEqual(["running","succeeded"]);
    const files=await fs.readdir(root,{recursive:true});
    expect(files.some(file=>file.endsWith(".json"))).toBe(false);
  });

  it("参数预算只能调低不能调高缺省上限", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts("t5");
    const llm = fakeLlm();
    // 缺省 maxSteps=2;任务请求 maxSteps=999 应被夹到 2。
    registry.register(makeExecutor(() => researchToolsWithTestDecision(ports), { maxSteps: 2, maxTokens: 100000 }, llm));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      { id: "t5", inputData: agenticSpec({ maxSteps: 999 }) },
      { ai, assets, registry, workspacesRoot: root },
    );
    expect(llm.calls).toBe(2);
    expect(writes).toHaveLength(0);
    expect(ai.candidates).toHaveLength(0);
    expect(ai.statuses).toContain("failed");
    expect(ai.failures[0]).toContain("可采纳的业务候选");
  });

  it("检查点续跑不重置预算:checkpoint 已近顶 → 续跑步数受限", async () => {
    const registry = createExecutorRegistry();
    const { ports, writes } = makeResearchPorts("t6");
    const llm = fakeLlm();
    registry.register(makeExecutor(() => researchToolsWithTestDecision(ports), { maxSteps: 3, maxTokens: 100000 }, llm));
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      {
        id: "t6",
        inputData: agenticSpec({ checkpoint: { stepsUsed: 2, tokensUsed: 0 } }),
      },
      { ai, assets, registry, workspacesRoot: root },
    );
    expect(llm.calls).toBe(1);
    expect(writes).toHaveLength(0);
    expect(ai.candidates).toHaveLength(0);
    expect(ai.statuses).toContain("failed");
    expect(ai.failures[0]).toContain("可采纳的业务候选");
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

describe("T-915 失败与部分结果的公开编排", () => {
  for (const partial of [false, true]) {
    it(partial ? "中途失败仅保留工具实际产生的业务候选并标记 partial" : "只有故障诊断时不产生完成候选", async () => {
      const registry = createExecutorRegistry();
      const { ports } = makeResearchPorts("failed-run");
      registry.register(createAgenticExecutor({
        taskType: "agentic.research",
        engine: {name: "pi", run: async ({tools,signal}) => {
          if(partial) await tools.find(t=>t.name==="knowledge.write")!.execute({title:"可审阅知识",note:"已取得的知识正文",sourceNote:"https://ex.com/a"},{signal,dryRun:false,toolCallId:"call-partial"});
          return {hasUsableOutput:partial,summary:"模型连接失败",steps:1,stopReason:"llm_error",output:{error:"provider_error"}};
        }},
        resolveLlm: () => fakeLlm(), resolveTools: () => researchToolsWithTestDecision(ports), defaultBudget: {maxSteps: 8, maxTokens: 10000},
      }));
      const ai = makeFakeAi();
      await runExecutionTask(ctx, {id: "failed-run", inputData: agenticSpec()}, {ai, assets, registry, workspacesRoot: root});
      if (partial) {
        expect(ai.candidates).toHaveLength(1);
        expect(ai.candidates[0]!.resultType).toBe("agentic_proposals");
        expect(ai.candidates[0]!.resultData.meta).toMatchObject({completeness:"partial",stopReason:"llm_error"});
        expect(ai.candidates[0]!.resultData.proposals).toMatchObject([{kind:"knowledge.create",source:{taskId:"failed-run"}}]);
      } else {
        expect(ai.candidates).toHaveLength(0);
        expect(ai.statuses).toContain("failed");
      }
    });
  }
});

for (const mode of ["login", "empty"] as const) {
  it(`T-915 ${mode} 诊断经真实工具与引擎也不产生候选`, async () => {
    const {ports} = makeResearchPorts();
    ports.webSearch = async () => ({grounding: "web", results: []});
    ports.webRead = async () => ({needLogin: true, domain: "example.com"});
    const tools = researchToolsWithTestDecision(ports).filter(tool => tool.name === (mode === "login" ? "web.read" : "web.search"));
    if (mode === "login") tools[0]!.planInput = () => ({url: "https://example.com"});
    const registry = createExecutorRegistry();
    registry.register(makeExecutor(() => tools));
    const ai = makeFakeAi();
    await runExecutionTask(ctx, {id: `no-evidence-${mode}`, inputData: agenticSpec()}, {ai, assets, registry, workspacesRoot: root});
    expect(ai.candidates).toHaveLength(0);
    expect(ai.statuses).toContain("failed");
  });
}

it("只有真实搜读来源仍不冒充可采纳候选",async()=>{
  const {ports,writes}=makeResearchPorts("read-only");
  const registry=createExecutorRegistry();
  registry.register(makeExecutor(()=>researchToolsWithTestDecision(ports).filter(t=>t.effect==="none")));
  const ai=makeFakeAi();
  await runExecutionTask(ctx,{id:"read-only",inputData:agenticSpec()},{ai,assets,registry,workspacesRoot:root});
  expect(ai.candidates).toHaveLength(0);
  expect(writes).toHaveLength(0);
  expect(ai.failures[0]).toContain("可采纳的业务候选");
});

it("真实工具返回其他父任务候选时拒绝采纳",async()=>{
  const {ports}=makeResearchPorts("foreign-parent");
  const registry=createExecutorRegistry();registry.register(makeExecutor(()=>researchToolsWithTestDecision(ports)));
  const ai=makeFakeAi();
  await runExecutionTask(ctx,{id:"actual-parent",inputData:agenticSpec()},{ai,assets,registry,workspacesRoot:root});
  expect(ai.candidates).toHaveLength(0);
  expect(ai.failures[0]).toContain("候选来源不属于当前任务");
});

it("恢复到预算顶后不再调用模型或候选工具",async()=>{
  const {ports,writes}=makeResearchPorts("exhausted");const llm=fakeLlm();
  const registry=createExecutorRegistry();registry.register(makeExecutor(()=>researchToolsWithTestDecision(ports),{maxSteps:3,maxTokens:100000},llm));
  const ai=makeFakeAi();
  await runExecutionTask(ctx,{id:"exhausted",inputData:agenticSpec({checkpoint:{stepsUsed:3,tokensUsed:0}})},{ai,assets,registry,workspacesRoot:root});
  expect(llm.calls).toBe(0);
  expect(writes).toHaveLength(0);
  expect(ai.candidates).toHaveLength(0);
  expect(ai.statuses).toContain("failed");
});

it("模型输出自称有proposal不等于工具真实候选回执",async()=>{
  const {ports,writes}=makeResearchPorts("model-claim");
  const registry=createExecutorRegistry();
  registry.register(createAgenticExecutor({taskType:"agentic.research",engine:{name:"pi",run:async()=>({hasUsableOutput:true,summary:"模型声称完成",steps:1,stopReason:"completed",output:{proposal:{proposalId:"invented"}}})},resolveLlm:()=>fakeLlm(),resolveTools:()=>researchToolsWithTestDecision(ports),defaultBudget:{maxSteps:8,maxTokens:10000}}));
  const ai=makeFakeAi();
  await runExecutionTask(ctx,{id:"model-claim",inputData:agenticSpec()},{ai,assets,registry,workspacesRoot:root});
  expect(writes).toHaveLength(0);
  expect(ai.candidates).toHaveLength(0);
  expect(ai.failures[0]).toContain("可采纳的业务候选");
});


it("生产知识工具无默认创作决策时，确定性回退不编造候选",async()=>{
  const {ports,writes}=makeResearchPorts("no-default");
  const tools=createResearchTools(ports);
  expect(tools.find(tool=>tool.name==="knowledge.write")!.planInput).toBeUndefined();
  const registry=createExecutorRegistry();registry.register(makeExecutor(()=>tools));
  const ai=makeFakeAi();
  await runExecutionTask(ctx,{id:"no-default",inputData:agenticSpec()},{ai,assets,registry,workspacesRoot:root});
  expect(writes).toHaveLength(0);
  expect(ai.candidates).toHaveLength(0);
  expect(ai.failures[0]).toContain("可采纳的业务候选");
});
