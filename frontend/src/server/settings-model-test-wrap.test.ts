/**
 * [T-377] settings.models.test「测试连接」通道单测(fake 解析器 / fetch / adapter,零网络):
 *   - 文本(default):最小流式探测,正文或思考流 → ✓;401 → ✗ 密钥提示(不泄 HTTP 码/响应体);
 *     正文与思考均为空 → ✗;未配 → 「未配置」。
 *   - chat.fallback:专配行 null → 「未配置」(不回退主模型)。
 *   - image.generate:真实最小生图 fake 成功 → ✓(额度提示语);调用抛错 → ✗ 人话提示(不泄原始报错)。
 *   - video.generate:鉴权探测 —— 401 → ✗ 密钥无效或无权限;参数级 400 → ✓(不真生成);MiniMax base_resp 1004 → ✗。
 *   - transcribe.audio:未配置 → 明确失败；云端 ASR → 三态鉴权探测。
 *   - web.search:browser 免 key → ✓;付费 provider 最小检索成功 → ✓。
 *   - wrap 透传:非 test op 原样进 settings transport。
 */

import { describe, it, expect, vi } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";

import {
  consumeTextProbeStream,
  createSettingsWithModelTest,
  runModelConnectionTest,
  type SettingsModelTestDeps,
} from "./settings-model-test-wrap";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

async function* probeParts(
  parts: Array<{ type: string; text?: string; error?: unknown }>,
) {
  yield* parts;
}

const llmSpec = {
  apiFormat: "openai_chat" as const,
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  authStyle: "bearer" as const,
  token: "k",
};

const mmSpec = {
  provider: "minimax",
  baseUrl: null,
  model: "image-x",
  token: "k",
};

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeDeps(
  overrides: Partial<Omit<SettingsModelTestDeps, "settings">> = {},
): Omit<SettingsModelTestDeps, "settings"> {
  return {
    resolveLlm: vi.fn(async () => llmSpec),
    resolveDedicatedLlm: vi.fn(async () => llmSpec),
    resolveMultimodal: vi.fn(async () => mmSpec),
    resolveTranscribe: vi.fn(async () => ({
      provider: "xiaomi-mimo",
      baseUrl: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5-asr",
      token: "k",
    })),
    resolveEmbed: vi.fn(async () => llmSpec),
    resolveSearch: vi.fn(async () => ({
      provider: "bocha",
      baseUrl: null,
      model: null,
      token: "k",
    })),
    generateImageMinimal: vi.fn(async () => ({ byteLength: 12 })),
    searchMinimal: vi.fn(async () => 1),
    probeTextModel: vi.fn(async () => ({ text: "OK" })),
    fetchImpl: vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    ...overrides,
  };
}

describe("consumeTextProbeStream", () => {
  it("读取首个 reasoning delta 作为真实连通证据", async () => {
    await expect(
      consumeTextProbeStream(
        probeParts([
          { type: "reasoning-start" },
          { type: "reasoning-delta", text: "正在检查" },
        ]),
      ),
    ).resolves.toEqual({ text: "", reasoningText: "正在检查" });
  });

  it("显式抛出 fullStream 的 error part，不得静默变成空流", async () => {
    const error = new Error("401 Authentication Fails");
    await expect(
      consumeTextProbeStream(probeParts([{ type: "error", error }])),
    ).rejects.toBe(error);
  });
});

describe("runModelConnectionTest — 文本模型(default)", () => {
  it("复用正式模型工厂的流式探针并收到非空文本 → ✓ 连通", async () => {
    const deps = makeDeps();
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.model).toBe("test-model");
    expect(r.detail).toContain("流式");
    expect(deps.probeTextModel).toHaveBeenCalledWith(llmSpec);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("openai_responses 同样交给正式模型工厂，不在测试层手拼 /responses", async () => {
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => ({
        ...llmSpec,
        apiFormat: "openai_responses" as const,
      })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openai_responses");
    expect(deps.probeTextModel).toHaveBeenCalledWith(
      expect.objectContaining({ apiFormat: "openai_responses" }),
    );
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("正式流式调用发生非鉴权异常 → ✗ 通用人话提示(不泄原始错误,也不说「未配置」)", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const opaque = {
      ...llmSpec,
      baseUrl: "https://opaque-channel.example/v1",
      model: "opaque-channel-model",
      token: "opaque-channel-secret",
      displayModelKey: "channel-managed" as const,
    };
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => opaque),
      probeTextModel: vi.fn(async () => {
        throw new Error(
          "raw-error opaque-channel-secret opaque-channel-model opaque-channel.example response-body",
        );
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("channel-managed");
    expect(r.model).toBe("channel-managed");
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("raw-error");
    expect(r.detail).not.toContain("opaque-channel");
    expect(r.detail).not.toContain("未配置");
    const logSnapshot = JSON.stringify(consoleSpy.mock.calls);
    expect(logSnapshot).toContain("provider_error");
    expect(logSnapshot).not.toMatch(
      /opaque-channel|response-body|raw-error/,
    );
    consoleSpy.mockRestore();
  });

  it("正式流式调用返回 2xx 空流 → ✗，不能把空内容误判成连通", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => ({ text: "   " })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("没有返回有效文本");
  });

  it("DeepSeek V4 只返回思考流 → ✓，不能因最终正文为空误报连接失败", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => ({
        text: "",
        reasoningText: "正在验证连接",
      })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("思考流");
  });

  it("正式流式调用在流内返回 401 → ✗ 密钥错误，不得误报为空响应", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => {
        throw new Error("AI_APICallError: 401 Authentication Fails, api key is invalid");
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("401");
    expect(r.detail).not.toContain("api key");
  });

  it("解析抛 LlmCredentialError → 「未配置」", async () => {
    const err = new Error("无可用 LLM 凭据");
    err.name = "LlmCredentialError";
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => {
        throw err;
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
  });
});

describe("runModelConnectionTest — chat.fallback(只认专配行)", () => {
  it("专配行 null → 「未配置」,不回退主模型", async () => {
    const deps = makeDeps({ resolveDedicatedLlm: vi.fn(async () => null) });
    const r = await runModelConnectionTest(ctx, "chat.fallback", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
    expect(r.detail).toContain("专配");
  });
});

describe("runModelConnectionTest — image.generate(真实最小生图)", () => {
  it("fake 生图返回字节 → ✓ + 额度消耗提示", async () => {
    const deps = makeDeps();
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("minimax");
    expect(r.detail).toContain("额度");
    expect(deps.generateImageMinimal).toHaveBeenCalledTimes(1);
  });

  // [T-379] openai 兼容 provider(gpt-image 系/中转站)与 minimax 同一分支:走真实最小生图,
  // spec(provider/baseUrl/model/token)原样进 generateImageMinimal(host 侧 registry 按
  // provider="openai" 路由到 createOpenaiImagesAdapter)。
  it("openai 兼容 provider → 同走真实最小生图,spec 原样透传", async () => {
    const openaiSpec = {
      provider: "openai",
      baseUrl: "https://dudu.mom",
      model: "gpt-image-2-4K",
      token: "k",
    };
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => openaiSpec),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-image-2-4K");
    expect(r.detail).toContain("额度");
    expect(deps.generateImageMinimal).toHaveBeenCalledWith(openaiSpec);
  });

  it("生图调用抛错 → ✗ 人话提示(不泄原始报错)", async () => {
    const deps = makeDeps({
      generateImageMinimal: vi.fn(async () => {
        throw new Error("minimax 401 invalid key");
      }),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("invalid key");
  });

  it("未配(resolve 抛 MultimodalConfigError)→ 「未配置」", async () => {
    const err = new Error('capability "image.generate" 未配置生图模型');
    err.name = "MultimodalConfigError";
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => {
        throw err;
      }),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
  });
});

describe("runModelConnectionTest — video.generate(鉴权探测,不真生成)", () => {
  it("HTTP 401 → ✗ 密钥无效或无权限(不泄 HTTP 码)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () => jsonResponse(401)) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("401");
  });

  it("参数级 400(缺 prompt)→ ✓ 鉴权/端点可达,且明示未真生成", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        jsonResponse(400, { error: "prompt required" }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("未实际生成");
  });

  it("MiniMax 惯例 HTTP 200 + base_resp 1004 → ✗ 密钥无效或无权限(不泄原始 status_msg)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, {
          base_resp: { status_code: 1004, status_msg: "invalid api key" },
        }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("invalid api key");
  });

  it("OmniHi / Seedance 使用 media/v1/videos/generations 做零计费鉴权探测", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "prompt required" }),
    ) as unknown as typeof fetch;
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => ({
        provider: "seeddance",
        baseUrl: "https://api.omnihi.ai/media/v1",
        model: "seedance/seedance-2.0-fast",
        token: "key",
      })),
      fetchImpl,
    });

    const r = await runModelConnectionTest(ctx, "video.generate", deps);

    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.omnihi.ai/media/v1/videos/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("MiniMax-H3 使用 v2 端点做缺内容的零计费鉴权探测", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "content required" }),
    ) as unknown as typeof fetch;
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => ({
        provider: "minimax",
        baseUrl: null,
        model: "MiniMax-H3",
        token: "key",
      })),
      fetchImpl,
    });

    const r = await runModelConnectionTest(ctx, "video.generate", deps);

    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.minimax.io/v2/video_generation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "MiniMax-H3" }),
      }),
    );
  });
});

describe("runModelConnectionTest — transcribe.audio / web.search", () => {
  it("ASR 未配置 → 中性说明当前使用本地 Whisper，不伪装云端已连通", async () => {
    const r = await runModelConnectionTest(
      ctx,
      "transcribe.audio",
      makeDeps({
        resolveTranscribe: vi.fn(async () => ({
          provider: "whisper-local",
          baseUrl: null,
          model: "small",
          token: "",
        })),
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("未配置云端 ASR");
    expect(r.detail).toContain("本地 Whisper");
  });

  // [T-384] 云端 ASR 三态探测:200 → ✓;404/405(厂商无 /v1/models 端点)→ ⚠ 诚实中间态
  // (不误报失败 —— SiliconFlow 等无此端点,配置本可能正常);401 → ✗ 真失败。
  const cloudAsrDeps = (fetchImpl: typeof fetch) =>
    makeDeps({
      resolveTranscribe: vi.fn(async () => ({
        provider: "openai-asr",
        baseUrl: "https://api.siliconflow.cn",
        model: "FunAudioLLM/SenseVoiceSmall",
        token: "k",
      })),
      fetchImpl,
    });

  it("云端 ASR GET /v1/models 200 → ✓ status ok", async () => {
    const deps = cloudAsrDeps(vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch);
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ok");
    const url = (deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe("https://api.siliconflow.cn/v1/models");
  });

  it("baseUrl 已含 /v1 时不重复拼接", async () => {
    const deps = makeDeps({
      resolveTranscribe: vi.fn(async () => ({
        provider: "xiaomi-mimo",
        baseUrl: "https://api.xiaomimimo.com/v1",
        model: "mimo-v2.5-asr",
        token: "k",
      })),
      fetchImpl: vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    });
    await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect((deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      "https://api.xiaomimimo.com/v1/models",
    );
  });

  it("云端 ASR /v1/models 404 → ⚠ warn(无法探测≠失败,不误报)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("not found", { status: 404 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("无法探测");
    expect(r.detail).toContain("真实转写");
    expect(r.detail).not.toContain("失败");
  });

  it("云端 ASR /v1/models 405 → ⚠ warn(同 404,端点不存在类)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("", { status: 405 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.status).toBe("warn");
  });

  it("云端 ASR /v1/models 401 → ✗ fail(人话提示,不泄 HTTP 码)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("invalid key", { status: 401 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(false);
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("401");
  });

  it("web.search browser → ✓ 免 key;bocha 最小检索成功 → ✓ 带额度提示", async () => {
    const browserDeps = makeDeps({
      resolveSearch: vi.fn(async () => ({
        provider: "browser",
        baseUrl: null,
        model: null,
        token: "",
      })),
    });
    const r1 = await runModelConnectionTest(ctx, "web.search", browserDeps);
    expect(r1.ok).toBe(true);
    expect(r1.detail).toContain("免 key");

    const bochaDeps = makeDeps();
    const r2 = await runModelConnectionTest(ctx, "web.search", bochaDeps);
    expect(r2.ok).toBe(true);
    expect(bochaDeps.searchMinimal).toHaveBeenCalledTimes(1);
  });
});

describe("createSettingsWithModelTest — wrap 拦截与透传", () => {
  it("settings.models.test → 拦截返回探测结果 envelope;其余 op 透传", async () => {
    const passthrough = vi.fn(async () => ({ data: [], meta: { requestId: "r1" } }));
    const wrapped = createSettingsWithModelTest({
      settings: { request: passthrough },
      ...makeDeps({
        resolveLlm: vi.fn(async () => ({
          ...llmSpec,
          baseUrl: "https://opaque.example/v1",
          model: "opaque-model",
          token: "opaque-secret",
          displayModelKey: "channel-managed" as const,
        })),
      }),
    });
    const res = (await wrapped.request(
      ENDPOINTS.testModelConnection,
      { params: { capability: "default" }, query: undefined, body: undefined },
      ctx,
    )) as {
      data: {
        ok: boolean;
        detail: string;
        provider: string;
        model: string;
      };
    };
    expect(res.data.ok).toBe(true);
    expect(res.data.provider).toBe("channel-managed");
    expect(res.data.model).toBe("channel-managed");
    expect(JSON.stringify(res)).not.toMatch(
      /opaque\.example|opaque-model|opaque-secret/,
    );
    expect(passthrough).not.toHaveBeenCalled();

    await wrapped.request(
      ENDPOINTS.listModels,
      { params: undefined, query: undefined, body: undefined },
      ctx,
    );
    expect(passthrough).toHaveBeenCalledTimes(1);
  });
});
