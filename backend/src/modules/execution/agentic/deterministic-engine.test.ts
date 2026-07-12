import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createDeterministicAgenticEngine } from "./deterministic-engine";
import { createLoopController } from "./loop-control";
import type {
  AgenticTool,
  EngineLlm,
  AgenticEngineRunInput,
} from "./engine";

// [T-256b] 确定性引擎(AgenticEngine 默认实现)—— 逐条走 SPEC §4 控制模型:
// llm 回接被真调 / 步数·预算硬顶诚实停 / 发布类强制干跑 / abort 贯通 / 只调传入的工具。

function fakeLlm(tokensPerCall = 10): EngineLlm & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (prompt: string) => {
    calls.push(prompt);
    return { text: "决策:调用它。", tokensUsed: tokensPerCall };
  }) as EngineLlm & { calls: string[] };
  fn.calls = calls;
  return fn;
}

interface ToolSpy {
  tool: AgenticTool;
  execCalls: Array<{ dryRun: boolean }>;
  mutated: number;
}

function makeTool(
  name: string,
  effect: AgenticTool["effect"],
): ToolSpy {
  const execCalls: Array<{ dryRun: boolean }> = [];
  const spy: ToolSpy = { execCalls, mutated: 0, tool: undefined as never };
  spy.tool = {
    name,
    label: name,
    description: name,
    effect,
    parameters: z.object({}).passthrough(),
    planInput: () => ({}),
    async execute(_input, { dryRun }) {
      execCalls.push({ dryRun });
      if (!dryRun && effect !== "none") spy.mutated += 1;
      return { summary: `${name} 完成`, data: { name } };
    },
  };
  return spy;
}

function runInput(
  over: Partial<AgenticEngineRunInput> & {
    tools: readonly AgenticTool[];
    controller: AgenticEngineRunInput["controller"];
  },
): AgenticEngineRunInput {
  return {
    goal: "测试目标",
    systemPrompt: "sys",
    llm: fakeLlm(),
    decideDryRun: () => false,
    onStep: async () => {},
    signal: new AbortController().signal,
    ...over,
  };
}

describe("deterministic engine —— 控制模型", () => {
  it("完整跑通:先只读后副作用,llm 每步被调(§6.1 回接被真触发),stopReason completed", async () => {
    const read = makeTool("read", "none");
    const write = makeTool("write", "writeback");
    const llm = fakeLlm();
    const controller = createLoopController({ maxSteps: 8, maxTokens: 10000 });
    const engine = createDeterministicAgenticEngine();
    const final = await engine.run(
      runInput({ tools: [write.tool, read.tool], llm, controller }),
    );
    expect(final.stopReason).toBe("completed");
    // 决策序列:只读工具先(read),副作用后(write)。
    expect(read.execCalls.length).toBe(1);
    expect(write.execCalls.length).toBe(1);
    // 每步一次 llm 调用(回接被真走)。
    expect(llm.calls.length).toBe(2);
    expect(final.steps).toBe(2);
    expect((final.output.toolLog as unknown[]).length).toBe(2);
  });

  it("步数硬顶:maxSteps=1 → 只走 1 步,stopReason max_steps(诚实截断)", async () => {
    const read = makeTool("read", "none");
    const write = makeTool("write", "writeback");
    const controller = createLoopController({ maxSteps: 1, maxTokens: 10000 });
    const final = await createDeterministicAgenticEngine().run(
      runInput({ tools: [read.tool, write.tool], controller }),
    );
    expect(final.stopReason).toBe("max_steps");
    expect(final.steps).toBe(1);
    expect(read.execCalls.length + write.execCalls.length).toBe(1);
  });

  it("token 预算硬顶:大 token → budget_exhausted", async () => {
    const read = makeTool("read", "none");
    const controller = createLoopController({ maxSteps: 8, maxTokens: 50 });
    const final = await createDeterministicAgenticEngine().run(
      runInput({ tools: [read.tool], controller, llm: fakeLlm(999) }),
    );
    expect(final.stopReason).toBe("budget_exhausted");
    // 该步 llm 调了(计费后才发现超预算),但工具未执行(超预算即停)。
    expect(read.execCalls.length).toBe(0);
  });

  it("发布类强制干跑:decideDryRun 令 publish 干跑 → 工具收 dryRun=true 且不落真副作用", async () => {
    const publish = makeTool("publish.x", "publish");
    const controller = createLoopController({ maxSteps: 8, maxTokens: 10000 });
    const final = await createDeterministicAgenticEngine().run(
      runInput({
        tools: [publish.tool],
        controller,
        decideDryRun: (t) => t.effect === "publish" || t.effect === "delete",
      }),
    );
    expect(final.stopReason).toBe("completed");
    expect(publish.execCalls).toEqual([{ dryRun: true }]);
    expect(publish.mutated).toBe(0); // 干跑不落真副作用
  });

  it("abort 贯通:signal 已中止 → 首步即停,stopReason aborted", async () => {
    const read = makeTool("read", "none");
    const ac = new AbortController();
    ac.abort();
    const controller = createLoopController({ maxSteps: 8, maxTokens: 10000 });
    const final = await createDeterministicAgenticEngine().run(
      runInput({ tools: [read.tool], controller, signal: ac.signal }),
    );
    expect(final.stopReason).toBe("aborted");
    expect(read.execCalls.length).toBe(0);
  });

  it("推理 LLM 失败(未配模型/凭据)→ 诚实停止 stopReason llm_error(不吞不崩不编)", async () => {
    const read = makeTool("read", "none");
    const boomLlm: EngineLlm = async () => {
      throw new Error("capability 无可用 LLM 凭据");
    };
    const controller = createLoopController({ maxSteps: 8, maxTokens: 10000 });
    const final = await createDeterministicAgenticEngine().run(
      runInput({ tools: [read.tool], controller, llm: boomLlm }),
    );
    expect(final.stopReason).toBe("llm_error");
    expect(read.execCalls.length).toBe(0); // 想不动就不动手
  });

  it("只调传入的工具(白名单物理隔离)——引擎拿不到册外工具", async () => {
    const read = makeTool("read", "none");
    // 只传 read;若引擎能凭空调别的工具,execCalls 会有别的记录。
    const final = await createDeterministicAgenticEngine().run(
      runInput({
        tools: [read.tool],
        controller: createLoopController({ maxSteps: 8, maxTokens: 10000 }),
      }),
    );
    const log = final.output.toolLog as Array<{ tool: string }>;
    expect(log.every((l) => l.tool === "read")).toBe(true);
  });
});
