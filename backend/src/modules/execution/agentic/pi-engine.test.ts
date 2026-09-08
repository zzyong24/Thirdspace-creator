import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { createLoopController } from "./loop-control";
import {
  createPiAgenticEngine,
  buildPiProviderRegistration,
  buildIsolatedResourceLoader,
  piApiForFormat,
  zodToPiParameters,
  EXCLUDED_BUILTIN_TOOLS,
  PiModelConfigurationError,
  __setPiSdkForTest,
  type PiSdkHandle,
} from "./pi-engine";
const unavailableFallback = () => ({name:"unavailable", async run():Promise<never>{throw new Error("PI_TEST_UNEXPECTED_FALLBACK");}});
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
const OPENAI_RESPONSES: RawLlmConfig = {
  apiFormat: "openai_responses",
  baseUrl: "https://new-api.example.com/v1",
  model: "gpt-5",
  authStyle: "bearer",
  token: "relay-key",
};

describe("pi-engine §6.1 provider 映射(纯)", () => {
  it("apiFormat → pi api 名", () => {
    expect(piApiForFormat("anthropic")).toBe("anthropic-messages");
    expect(piApiForFormat("openai_chat")).toBe("openai-completions");
    expect(piApiForFormat("openai_responses")).toBe("openai-responses");
    for (const invalid of [undefined, "unknown", 42]) {
      expect(() => piApiForFormat(invalid as never)).toThrow(
        PiModelConfigurationError,
      );
      expect(() =>
        buildPiProviderRegistration(
          { ...OPENAI_CHAT, apiFormat: invalid } as never,
          { apiName: "creatoros-faux", streamSimple: () => undefined },
        ),
      ).toThrow(PiModelConfigurationError);
    }
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

  it("openai_responses(New API)→ api openai-responses + baseUrl/key/model 原样透传", () => {
    const reg = buildPiProviderRegistration(OPENAI_RESPONSES);
    expect(reg.config.api).toBe("openai-responses");
    expect(reg.config.baseUrl).toBe("https://new-api.example.com/v1");
    expect(reg.config.apiKey).toBe("relay-key");
    const models = reg.config.models as Array<{ id: string; api: string }>;
    expect(models[0]).toMatchObject({
      id: "gpt-5",
      api: "openai-responses",
    });
  });

  it("[可配] maxTokens/contextWindow/reasoning 读用户 model-config settings(缺则兜底,不硬编)", () => {
    // 用户在 settings 配了 → 用用户的(不再硬编 8192/200000)。
    const cfgd = buildPiProviderRegistration({
      ...ANTHROPIC_BEARER,
      settings: { maxTokens: 4096, contextWindow: 245760, reasoning: true },
    });
    const m = (cfgd.config.models as Array<Record<string, unknown>>)[0]!;
    expect(m.maxTokens).toBe(4096);
    expect(m.contextWindow).toBe(245760);
    expect(m.reasoning).toBe(true);
    // 没配 settings → 兜底(不崩、不硬塞用户没配的值)。
    const fb = (
      buildPiProviderRegistration(ANTHROPIC_BEARER).config.models as Array<
        Record<string, unknown>
      >
    )[0]!;
    expect(fb.maxTokens).toBe(8192);
    expect(fb.contextWindow).toBe(200000);
    expect(fb.reasoning).toBe(false);
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
    let fallbackCalls = 0;
    const fallback: AgenticEngine = {
      name: "deterministic",
      async run() {
        fallbackCalls += 1;
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
    expect(fallbackCalls).toBe(1);
    expect(final.summary).toBe("det");

    __setPiSdkForTest(null);
    for (const invalid of [undefined, "unknown", { wrong: true }]) {
      let streamBuilderCalls = 0;
      const invalidEngine = createPiAgenticEngine({
        fallback,
        buildStreamSimple: () => {
          streamBuilderCalls += 1;
          return () => undefined;
        },
      });
      await expect(
        invalidEngine.run(
          runInput({
            tools: [],
            controller: createLoopController({
              maxSteps: 8,
              maxTokens: 20000,
            }),
            llmConfig: {
              ...ANTHROPIC_OFFICIAL,
              apiFormat: invalid,
            } as never,
          }),
        ),
      ).rejects.toBeInstanceOf(PiModelConfigurationError);
      expect(streamBuilderCalls).toBe(0);
      expect(fallbackCalls).toBe(1);
    }
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
    const [sdk, mr, as, sm, rl] = await Promise.all([
      imp("sdk.js"),
      imp("model-registry.js"),
      imp("auth-storage.js"),
      imp("session-manager.js"),
      imp("resource-loader.js"),
    ]);
    return {
      createAgentSession: sdk.createAgentSession,
      ModelRegistry: mr.ModelRegistry,
      AuthStorage: as.AuthStorage,
      SessionManager: sm.SessionManager,
      DefaultResourceLoader: rl.DefaultResourceLoader,
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
      fallback: unavailableFallback(),
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
      fallback: unavailableFallback(),
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

  it("T-915 真实 SDK 下一轮 provider 请求包含工具来源正文", async () => {
    expect(sdk).not.toBeNull(); expect(faux).not.toBeNull();
    const core = faux!.createFauxCore({api: "creatoros-faux", provider: "creatoros-user", models: [{id: "MiniMax-M2"}]});
    let nextContext = "";
    core.setResponses([
      faux!.fauxAssistantMessage(faux!.fauxToolCall("web.search", {query: "来源"}), {stopReason: "tool_use"}),
      (context: unknown) => { nextContext = JSON.stringify(context); return faux!.fauxAssistantMessage("已有来源", {stopReason: "end_turn"}); },
    ]);
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search");
    search.tool.execute = async () => ({summary: "找到来源", data: {url: "https://example.com/evidence", body: "模型应看到的正文证据"}});
    const final = await createPiAgenticEngine({fallback: unavailableFallback(), buildStreamSimple: () => core.streamSimple}).run(runInput({tools: [search.tool], controller: createLoopController({maxSteps: 10, maxTokens: 100000}), llmConfig: ANTHROPIC_BEARER}));
    expect(final.stopReason).toBe("completed");
    expect(nextContext).toContain("https://example.com/evidence");
    expect(nextContext).toContain("模型应看到的正文证据");
  });

  it("T-915 同轮多个工具逐次扣步，达到预算后不发下一次模型请求", async () => {
    expect(sdk).not.toBeNull(); expect(faux).not.toBeNull();
    const core = faux!.createFauxCore({api: "creatoros-faux", provider: "creatoros-user", models: [{id: "MiniMax-M2"}]});
    let modelCalls = 0;
    core.setResponses(Array.from({length: 5}, () => () => {
      modelCalls++;
      return faux!.fauxAssistantMessage([
        faux!.fauxToolCall("web.search", {query: "一"}, {id: "one"}),
        faux!.fauxToolCall("web.search", {query: "二"}, {id: "two"}),
      ], {stopReason: "tool_use"});
    }));
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search");
    const final = await createPiAgenticEngine({fallback: unavailableFallback(), buildStreamSimple: () => core.streamSimple}).run(runInput({tools: [search.tool], controller: createLoopController({maxSteps: 2, maxTokens: 100000}), llmConfig: ANTHROPIC_BEARER}));
    expect(modelCalls).toBe(1);
    expect(search.calls).toHaveLength(1);
    expect(final.stopReason).toBe("max_steps");
    expect(final.steps).toBe(2);
  });

  it("T-915 同名工具后续空结果不能覆盖先前已取得的证据", async () => {
    expect(sdk).not.toBeNull(); expect(faux).not.toBeNull();
    const core = faux!.createFauxCore({api: "creatoros-faux", provider: "creatoros-user", models: [{id: "MiniMax-M2"}]});
    core.setResponses([
      faux!.fauxAssistantMessage(faux!.fauxToolCall("web.search", {query: "一"}), {stopReason: "tool_use"}),
      faux!.fauxAssistantMessage(faux!.fauxToolCall("web.search", {query: "二"}), {stopReason: "tool_use"}),
      faux!.fauxAssistantMessage("provider failed", {stopReason: "error"}),
    ]);
    __setPiSdkForTest(sdk);
    let calls = 0;
    const search = makeTool("web.search");
    search.tool.execute = async () => ++calls === 1
      ? {summary: "找到来源", hasEvidence: true, data: {url: "https://example.com/kept", body: "需要保留的证据"}}
      : {summary: "无结果", hasEvidence: false, data: {results: []}};
    const final = await createPiAgenticEngine({fallback: unavailableFallback(), buildStreamSimple: () => core.streamSimple}).run(runInput({tools: [search.tool], controller: createLoopController({maxSteps: 10, maxTokens: 100000}), llmConfig: ANTHROPIC_BEARER}));
    expect(final.stopReason).toBe("llm_error");
    expect(final.hasUsableOutput).toBe(true);
    expect(JSON.stringify(final.output.evidence)).toContain("https://example.com/kept");
    expect(JSON.stringify(final.output.evidence)).toContain("需要保留的证据");
  });

  it("§6.1 生产 api 路径 + 诚实:custom anthropic-messages provider(dead baseUrl,无 faux)→ 真连网络失败 → stopReason llm_error(不假成功)", async () => {
    if (!sdk) return;
    __setPiSdkForTest(sdk);
    const search = makeTool("web.search", "none");
    const controller = createLoopController({ maxSteps: 8, maxTokens: 100000 });
    // 不传 buildStreamSimple → 走 pi 内建 anthropic-messages api(真烧「用户 provider」);
    // baseUrl 指死端口 → 连接失败,验「api 真被 wire 到 custom provider」+「报错诚实标记」。
    const engine = createPiAgenticEngine({
      fallback: unavailableFallback(),
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

// ── [RT-H02/H03] 受控 ResourceLoader 隔离(真 SDK)——————————————————————————————————————
// 证:①我方 systemPrompt 真进会话(替换 pi 默认,非被 ResourceLoader 吞掉);②零 extension /
// 零 skill / 零外部 custom tool / 零 AGENTS.md context 进会话(默认 loader 会扫 cwd + ~/.pi 吞入)。
describe("pi-engine RT-H02/H03 受控 ResourceLoader 隔离(真 SDK)", () => {
  let sdk: PiSdkHandle | null = null;
  beforeAll(async () => {
    sdk = await loadRealSdk();
  });

  it("no* 隔离:AGENTS.md 存在也不进 context + override 强注我方 prompt(对照:默认 loader 会吞入 AGENTS.md)", async () => {
    if (!sdk) return;
    const decoy = await fs.mkdtemp(path.join(os.tmpdir(), "pi-decoy-"));
    try {
      await fs.writeFile(
        path.join(decoy, "AGENTS.md"),
        "POISON-CONTEXT-MARKER 项目投毒指令(不该进受控会话)",
        "utf8",
      );
      // 对照组:默认(未关 noContextFiles)loader 会把 AGENTS.md 读进 context 文件 → 证明泄漏是真的。
      const plain = new sdk.DefaultResourceLoader({
        cwd: decoy,
        agentDir: decoy,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await plain.reload();
      const plainCtx = plain.getAgentsFiles().agentsFiles as Array<{
        content: string;
      }>;
      expect(plainCtx.length).toBeGreaterThanOrEqual(1);
      expect(plainCtx.some((f) => f.content.includes("POISON-CONTEXT-MARKER"))).toBe(
        true,
      );

      // 受控组:同目录,我方 buildIsolatedResourceLoader → 零 context/skill/prompt/extension + 我方 prompt。
      const MARKER = "CREATOROS-CONTROLLED-SYSPROMPT";
      const iso = await buildIsolatedResourceLoader(sdk, MARKER, decoy);
      expect(iso.getAgentsFiles().agentsFiles.length).toBe(0);
      expect(iso.getSkills().skills.length).toBe(0);
      expect(iso.getPrompts().prompts.length).toBe(0);
      expect(iso.getExtensions().extensions.length).toBe(0);
      expect(iso.getSystemPrompt()).toBe(MARKER);
    } finally {
      await fs.rm(decoy, { recursive: true, force: true });
    }
  });

  it("集成:受控 loader → 我方 systemPrompt 进 agent.state.systemPrompt(替换 pi 默认「expert coding assistant」)+ 零外部工具泄漏", async () => {
    if (!sdk) return;
    const MARKER = `CREATOROS-ROLE-e2e-${Math.random().toString(36).slice(2)}`;
    const iso = await fs.mkdtemp(path.join(os.tmpdir(), "pi-iso-e2e-"));
    try {
      const loader = await buildIsolatedResourceLoader(sdk, MARKER, iso);
      const { session } = await sdk.createAgentSession({
        model: undefined,
        noTools: "builtin",
        excludeTools: [...EXCLUDED_BUILTIN_TOOLS],
        customTools: [
          {
            name: "web.search",
            label: "web.search",
            description: "d",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
            },
            async execute() {
              return { content: [{ type: "text", text: "ok" }], details: {} };
            },
          },
        ],
        sessionManager: (
          sdk.SessionManager as { inMemory: () => unknown }
        ).inMemory(),
        resourceLoader: loader,
        cwd: iso,
        agentDir: iso,
      });
      const s = session as unknown as {
        systemPrompt: string;
        getAllTools: () => Array<{ name: string }>;
        dispose?: () => void;
      };
      // RT-H02:我方 systemPrompt 真进 agent.state,且**替换**了 pi 默认提示(非被吞)。
      expect(s.systemPrompt).toContain(MARKER);
      expect(s.systemPrompt).not.toContain(
        "expert coding assistant operating inside pi",
      );
      // RT-H03:零 extension → 工具集只剩我方 customTools + L3 排除后的 builtin(读/写/bash 全禁)。
      const all = s.getAllTools().map((t) => t.name);
      for (const forbidden of EXCLUDED_BUILTIN_TOOLS) {
        expect(all).not.toContain(forbidden);
      }
      expect(all).toContain("web.search");
      s.dispose?.();
    } finally {
      await fs.rm(iso, { recursive: true, force: true });
    }
  });
});

// ── [RT-M01] 副作用感知回退(fake SDK,不打网络,确定性)———————————————————————————————
// 造一个「模型真调了工具 → 随后会话抛错」的 fake SDK,验:有真实副作用则**不**整体重放(否则重复
// 付费/落库);零副作用才回退确定性兜底(保命路径)。
function makeFakeSdkThatErrors(cfg: { commitSideEffect: boolean; autoCompaction?: (enabled:boolean)=>void; beforeIdleError?:()=>void }): PiSdkHandle {
  return {
    AuthStorage: { inMemory: () => ({}) },
    ModelRegistry: {
      inMemory: () => ({
        registerProvider: () => {},
        find: () => ({ provider: "p", id: "m" }),
      }),
    },
    SessionManager: { inMemory: () => ({}) },
    DefaultResourceLoader: class {
      async reload() {}
      getSystemPrompt() {
        return "sys";
      }
      getExtensions() {
        return { extensions: [] };
      }
      getSkills() {
        return { skills: [] };
      }
      getPrompts() {
        return { prompts: [] };
      }
      getAgentsFiles() {
        return { agentsFiles: [] };
      }
    },
    async createAgentSession(opts: unknown) {
      const customTools = (opts as { customTools: Array<{ execute: (id: string, p: unknown) => Promise<unknown> }> }).customTools;
      return {
        session: {
          setAutoRetryEnabled() {},
          setAutoCompactionEnabled(enabled:boolean) {cfg.autoCompaction?.(enabled);},
          subscribe() {
            return () => {};
          },
          async prompt() {
            if (!cfg.commitSideEffect) {
              throw new Error("boom before any tool"); // 零副作用路径
            }
            // 模拟模型真调一次工具(dryRun=false → 提交真实副作用)。
            await customTools[0]!.execute("call-1", { query: "x" });
          },
          async waitForIdle() {
            if (cfg.commitSideEffect) {
              cfg.beforeIdleError?.();
              throw new Error("boom after side effect"); // 副作用已提交后才抛
            }
          },
          async abort() {},
          dispose() {},
        },
      };
    },
  } as unknown as PiSdkHandle;
}

describe("pi-engine RT-M01 副作用感知回退(fake SDK)", () => {
  it("零真实副作用异常 → 整体回退确定性兜底(保命路径不破坏)", async () => {
    let fallbackCalled = false;
    const fallback: AgenticEngine = {
      name: "deterministic",
      async run() {
        fallbackCalled = true;
        return { summary: "det", output: {}, steps: 0, stopReason: "completed" };
      },
    };
    __setPiSdkForTest(makeFakeSdkThatErrors({ commitSideEffect: false }));
    const search = makeTool("web.search", "none");
    const engine = createPiAgenticEngine({ fallback });
    const final = await engine.run(
      runInput({
        tools: [search.tool],
        controller: createLoopController({ maxSteps: 8, maxTokens: 100000 }),
        llmConfig: ANTHROPIC_BEARER,
      }),
    );
    expect(fallbackCalled).toBe(true);
    expect(final.summary).toBe("det");
    expect(search.calls.length).toBe(0); // 工具从未执行
    __setPiSdkForTest(undefined);
  });

  it("已提交真实副作用后异常 → 不整体重放,诚实返回部分产物 + checkpoint(stopReason llm_error)", async () => {
    let fallbackCalled = false;
    const fallback: AgenticEngine = {
      name: "deterministic",
      async run() {
        fallbackCalled = true;
        return { summary: "det", output: {}, steps: 0, stopReason: "completed" };
      },
    };
    __setPiSdkForTest(makeFakeSdkThatErrors({ commitSideEffect: true }));
    const search = makeTool("web.search", "none");
    const engine = createPiAgenticEngine({ fallback });
    const final = await engine.run(
      runInput({
        tools: [search.tool],
        controller: createLoopController({ maxSteps: 8, maxTokens: 100000 }),
        llmConfig: ANTHROPIC_BEARER,
      }),
    );
    expect(fallbackCalled).toBe(false); // 关键:不回退 = 不重放
    expect(search.calls.length).toBe(1); // 真实工具只跑了这一次,没被 fallback 重放第二次
    expect(final.stopReason).toBe("llm_error");
    expect((final.output as { error?: unknown }).error).toBe(
      "provider_runtime_error",
    );
    expect(JSON.stringify(final.output)).not.toContain(
      "boom after side effect",
    );
    expect((final.output as { checkpoint?: unknown }).checkpoint).toBeTruthy();
    __setPiSdkForTest(undefined);
  });
});


it("预算终止catch仍保留Pi来源与已执行工具，且关闭自动压缩",async()=>{
  const controller=createLoopController({maxSteps:1,maxTokens:10000});
  const compaction:boolean[]=[];let fallbackCalled=false;
  __setPiSdkForTest(makeFakeSdkThatErrors({commitSideEffect:true,autoCompaction:enabled=>compaction.push(enabled),beforeIdleError:()=>{expect(controller.canContinue()).toBe(false);}}));
  try{
    const search=makeTool("web.search","none");
    const engine=createPiAgenticEngine({fallback:{name:"deterministic",async run(){fallbackCalled=true;throw new Error("不得重放");}}});
    const result=await engine.run(runInput({tools:[search.tool],controller,llmConfig:ANTHROPIC_BEARER}));
    expect(compaction).toEqual([false]);expect(fallbackCalled).toBe(false);expect(search.calls).toHaveLength(1);
    expect(result).toMatchObject({actualEngine:"pi",stopReason:"max_steps"});
    expect((result.output as {toolLog:unknown[]}).toolLog).toHaveLength(1);
  }finally{__setPiSdkForTest(undefined);}
});
