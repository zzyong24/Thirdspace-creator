import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { createLoopController } from "./loop-control";
import {
  createPiAgenticEngine,
  buildPiProviderRegistration,
  piApiForFormat,
  zodToPiParameters,
  EXCLUDED_BUILTIN_TOOLS,
  __setPiSdkForTest,
  type PiSdkHandle,
} from "./pi-engine";
import { createDeterministicAgenticEngine } from "./deterministic-engine";
import type {
  AgenticTool,
  AgenticEngine,
  AgenticEngineRunInput,
  EngineLlm,
  RawLlmConfig,
} from "./engine";

// [T-313] Pi 引擎:§6.1 provider 映射(纯)+ L3 物理排除自带编码工具(真 SDK)+ LoopController
// 桥接步数/预算硬顶(faux 驱动,不打网络)+ 依赖缺席/无 config 退确定性兜底。

const fakeLlm: EngineLlm = async () => ({ text: "x", tokensUsed: 1 });

function runInput(
  over: Partial<AgenticEngineRunInput> & {
    tools: readonly AgenticTool[];
    controller: AgenticEngineRunInput["controller"];
  },
): AgenticEngineRunInput {
  return {
    goal: "给我一个 AIGC 选题",
    systemPrompt: "sys",
    llm: fakeLlm,
    decideDryRun: () => false,
    onStep: async () => {},
    signal: new AbortController().signal,
    ...over,
  };
}

const ANTHROPIC_BEARER: RawLlmConfig = {
  apiFormat: "anthropic",
  baseUrl: "https://api.minimaxi.com/anthropic",
  model: "MiniMax-M2",
  authStyle: "bearer",
  token: "tok-123",
};
const ANTHROPIC_OFFICIAL: RawLlmConfig = {
  apiFormat: "anthropic",
  baseUrl: null,
  model: "claude-opus-4-8",
  authStyle: "x-api-key",
  token: "sk-ant-x",
};
const OPENAI_CHAT: RawLlmConfig = {
  apiFormat: "openai_chat",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  authStyle: "bearer",
  token: "ds-key",
};

describe("pi-engine §6.1 provider 映射(纯)", () => {
  it("apiFormat → pi api 名", () => {
    expect(piApiForFormat("anthropic")).toBe("anthropic-messages");
    expect(piApiForFormat("openai_chat")).toBe("openai-completions");
  });

  it("anthropic bearer(relay/MiniMax)→ authHeader:true(Authorization Bearer)+ baseUrl 透传", () => {
    const reg = buildPiProviderRegistration(ANTHROPIC_BEARER);
    expect(reg.config.api).toBe("anthropic-messages");
    expect(reg.config.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(reg.config.authHeader).toBe(true);
    expect(reg.config.apiKey).toBe("tok-123");
    const models = reg.config.models as Array<{ id: string; api: string }>;
    expect(models[0]?.id).toBe("MiniMax-M2");
    expect(models[0]?.api).toBe("anthropic-messages");
  });

  it("anthropic 官方 x-api-key(baseUrl null)→ 不置 authHeader + 补官方默认 baseUrl", () => {
    const reg = buildPiProviderRegistration(ANTHROPIC_OFFICIAL);
    expect(reg.config.authHeader).toBeUndefined();
    expect(reg.config.baseUrl).toBe("https://api.anthropic.com");
  });

  it("openai_chat(默认 Bearer)→ api openai-completions + 不置 authHeader(避免双 Authorization)", () => {
    const reg = buildPiProviderRegistration(OPENAI_CHAT);
    expect(reg.config.api).toBe("openai-completions");
    expect(reg.config.authHeader).toBeUndefined();
    expect(reg.config.baseUrl).toBe("https://api.deepseek.com/v1");
  });
});

describe("pi-engine zodToPiParameters(zod→JSON Schema)", () => {
  it("带 default 的字段不进 required(io:input);去掉 $schema", () => {
    const schema = z.object({
      title: z.string().min(1),
      sourceNote: z.string().default(""),
    });
    const json = zodToPiParameters(schema);
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("object");
    expect((json.required as string[]) ?? []).toContain("title");
    expect((json.required as string[]) ?? []).not.toContain("sourceNote");
  });
});

describe("pi-engine 退兜底(不破坏现有全绿默认路径)", () => {
  it("无 §6.1 llmConfig → 退确定性兜底(fallback 被调,产出确定性结果)", async () => {
    let fallbackCalled = false;
    const fallback: AgenticEngine = {
      name: "deterministic",
      async run() {
        fallbackCalled = true;
        return { summary: "det", output: {}, steps: 0, stopReason: "completed" };
      },
    };
    __setPiSdkForTest(undefined); // 真加载(但因无 llmConfig 早退,不会触发)
    const engine = createPiAgenticEngine({ fallback });
    const final = await engine.run(
      runInput({
        tools: [],
        controller: createLoopController({ maxSteps: 8, maxTokens: 20000 }),
        // 无 llmConfig
      }),
    );
    expect(fallbackCalled).toBe(true);
    expect(final.summary).toBe("det");
    __setPiSdkForTest(undefined);
  });

  it("SDK 未就绪(依赖缺席/打包实拷缺失)→ 退确定性兜底", async () => {
    __setPiSdkForTest(null); // 强制 loadPiSdk 返回 null
    let fallbackCalled = false;
    const fallback: AgenticEngine = {
      name: "deterministic",
      async run() {
        fallbackCalled = true;
        return { summary: "det", output: {}, steps: 0, stopReason: "completed" };
      },
    };
    const engine = createPiAgenticEngine({ fallback });
    const final = await engine.run(
      runInput({
        tools: [],
        controller: createLoopController({ maxSteps: 8, maxTokens: 20000 }),
        llmConfig: ANTHROPIC_OFFICIAL,
      }),
    );
    expect(fallbackCalled).toBe(true);
    expect(final.stopReason).toBe("completed");
    __setPiSdkForTest(undefined);
  });
});

// ── 真 SDK 驱动(faux provider,不打网络)——————————————————————————————————————————
// 深导入 dist/core/*.js(绕 barrel TUI)+ pi-ai faux。若装包缺失则 skip(不硬失败)。
async function loadRealSdk(): Promise<PiSdkHandle | null> {
  try {
    const base = path.join(
      process.cwd(),
      "node_modules/@earendil-works/pi-coding-agent/dist/core",
    );
    const imp = (f: string): Promise<Record<string, unknown>> =>
      import(pathToFileURL(path.join(base, f)).href) as Promise<
        Record<string, unknown>
      >;
    const [sdk, mr, as, sm] = await Promise.all([
      imp("sdk.js"),
      imp("model-registry.js"),
      imp("auth-storage.js"),
      imp("session-manager.js"),
    ]);
    return {
      createAgentSession: sdk.createAgentSession,
      ModelRegistry: mr.ModelRegistry,
      AuthStorage: as.AuthStorage,
      SessionManager: sm.SessionManager,
    } as unknown as PiSdkHandle;
  } catch {
    return null;
  }
}

interface FauxMod {
  createFauxCore: (opts: unknown) => {
    streamSimple: unknown;
    setResponses: (r: unknown[]) => void;
  };
  fauxAssistantMessage: (content: unknown, opts?: unknown) => unknown;
  fauxToolCall: (name: string, args: unknown, opts?: unknown) => unknown;
}
async function loadFaux(): Promise<FauxMod | null> {
  try {
    const p = path.join(
      process.cwd(),
      "node_modules/@earendil-works/pi-ai/dist/providers/faux.js",
    );
    return (await import(pathToFileURL(p).href)) as unknown as FauxMod;
  } catch {
    return null;
  }
}

/** 造一个带执行计数的领域工具(effect 决定干跑)。 */
function makeTool(
  name: string,
  effect: AgenticTool["effect"] = "none",
): { tool: AgenticTool; calls: Array<{ dryRun: boolean }> } {
  const calls: Array<{ dryRun: boolean }> = [];
  const tool: AgenticTool = {
    name,
    label: name,
    description: `${name} tool`,
    effect,
    parameters: z.object({ query: z.string().min(1) }),
    async execute(_input, { dryRun }) {
      calls.push({ dryRun });
      return { summary: `${name} ok`, data: { name } };
    },
  };
  return { tool, calls };
}

describe("pi-engine 真 SDK 集成(faux,不打网络)", () => {
  let sdk: PiSdkHandle | null = null;
  let faux: FauxMod | null = null;

  beforeAll(async () => {
    sdk = await loadRealSdk();
    faux = await loadFaux();
  });

  it("L3 物理排除:noTools:'builtin'+excludeTools → 自带 read/bash/edit/write 不在工具集,只剩 customTools", async () => {
    if (!sdk) return; // 装包缺失 → skip(打包版另在分发环境验)
    const { session } = await sdk.createAgentSession({
      model: undefined,
      noTools: "builtin",
      excludeTools: [...EXCLUDED_BUILTIN_TOOLS],
      customTools: [
        {
          name: "web.search",
          label: "web.search",
          description: "d",
          parameters: { type: "object", properties: { query: { type: "string" } } },
          async execute() {
            return { content: [{ type: "text", text: "ok" }], details: {} };
          },
        },
      ],
      sessionManager: (sdk.SessionManager as { inMemory: () => unknown }).inMemory(),
    });
    const s = session as unknown as {
      getAllTools: () => Array<{ name: string }>;
      getActiveToolNames: () => string[];
      dispose?: () => void;
    };
    const all = s.getAllTools().map((t) => t.name);
    for (const forbidden of EXCLUDED_BUILTIN_TOOLS) {
      expect(all).not.toContain(forbidden);
    }
    expect(all).toContain("web.search");
    s.dispose?.();
  });

  it("循环机制:faux 调 web.search 一次 → 我方 execute 被调、final 收集、token 计入预算、stopReason completed", async () => {
    if (!sdk || !faux) return;
    const core = faux.createFauxCore({
      api: "creatoros-faux",
      provider: "creatoros-user",
      models: [{ id: "MiniMax-M2" }],
    });
    core.setResponses([
      faux.fauxAssistantMessage(faux.fauxToolCall("web.search", { query: "AIGC" }), {
        stopReason: "tool_use",
      }),
      faux.fauxAssistantMessage("调研完成:1 条候选。", { stopReason: "end_turn" }),
    ]);
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search", "none");
    const controller = createLoopController({ maxSteps: 8, maxTokens: 100000 });
    const engine = createPiAgenticEngine({
      fallback: createDeterministicAgenticEngine(),
      buildStreamSimple: () => core.streamSimple,
    });
    const final = await engine.run(
      runInput({ tools: [search.tool], controller, llmConfig: ANTHROPIC_BEARER }),
    );
    expect(search.calls.length).toBe(1);
    expect(final.stopReason).toBe("completed");
    expect(final.summary).toContain("调研完成");
    expect((final.output.toolLog as unknown[]).length).toBe(1);
    expect(controller.tokensUsed()).toBeGreaterThan(0);
    expect(final.steps).toBeGreaterThanOrEqual(2);
    __setPiSdkForTest(undefined);
  });

  it("步数硬顶:faux 无限调工具 + maxSteps=2 → 诚实停(不无限绕),stopReason max_steps", async () => {
    if (!sdk || !faux) return;
    const core = faux.createFauxCore({
      api: "creatoros-faux",
      provider: "creatoros-user",
      models: [{ id: "MiniMax-M2" }],
    });
    const factory = (_ctx: unknown, _opts: unknown, state: { callCount: number }) =>
      faux!.fauxAssistantMessage(
        faux!.fauxToolCall("web.search", { query: `q${state.callCount}` }),
        { stopReason: "tool_use" },
      );
    core.setResponses(Array.from({ length: 50 }, () => factory));
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search", "none");
    const controller = createLoopController({ maxSteps: 2, maxTokens: 1000000 });
    const engine = createPiAgenticEngine({
      fallback: createDeterministicAgenticEngine(),
      buildStreamSimple: () => core.streamSimple,
    });
    const final = await engine.run(
      runInput({ tools: [search.tool], controller, llmConfig: ANTHROPIC_BEARER }),
    );
    expect(final.stopReason).toBe("max_steps");
    // abort 异步 → ≤1 turn 余量;绝不无限绕。
    expect(final.steps).toBeLessThanOrEqual(3);
    expect(search.calls.length).toBeLessThanOrEqual(3);
    __setPiSdkForTest(undefined);
  });

  it("§6.1 生产 api 路径 + 诚实:custom anthropic-messages provider(dead baseUrl,无 faux)→ 真连网络失败 → stopReason llm_error(不假成功)", async () => {
    if (!sdk) return;
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search", "none");
    const controller = createLoopController({ maxSteps: 8, maxTokens: 100000 });
    // 不传 buildStreamSimple → 走 pi 内建 anthropic-messages api(真烧「用户 provider」);
    // baseUrl 指死端口 → 连接失败,验「api 真被 wire 到 custom provider」+「报错诚实标记」。
    const engine = createPiAgenticEngine({
      fallback: createDeterministicAgenticEngine(),
    });
    const final = await engine.run(
      runInput({
        tools: [search.tool],
        controller,
        llmConfig: {
          apiFormat: "anthropic",
          baseUrl: "http://127.0.0.1:59999",
          model: "m1",
          authStyle: "bearer",
          token: "k",
        },
      }),
    );
    expect(final.stopReason).toBe("llm_error");
    expect(search.calls.length).toBe(0); // 想都没想成,不动手
    __setPiSdkForTest(undefined);
  });
});
