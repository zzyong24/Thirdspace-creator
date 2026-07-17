/**
 * [T-377] settings.models.test「测试连接」通道单测(fake 解析器 / fetch / adapter,零网络):
 *   - 文本(default):1 token 补全探测,200 → ✓;401 → ✗ 带真实原因;未配 → 「未配置」。
 *   - chat.fallback:专配行 null → 「未配置」(不回退主模型)。
 *   - image.generate:真实最小生图 fake 成功 → ✓(额度提示语);调用抛错 → 「已配置,但调用失败」。
 *   - video.generate:鉴权探测 —— 401 → ✗;参数级 400 → ✓(不真生成);MiniMax base_resp 1004 → ✗。
 *   - transcribe.audio:whisper-local 回退 → ✓ 免测试。
 *   - web.search:browser 免 key → ✓;付费 provider 最小检索成功 → ✓。
 *   - wrap 透传:非 test op 原样进 settings transport。
 */

import { describe, it, expect, vi } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";

import {
  createSettingsWithModelTest,
  runModelConnectionTest,
  type SettingsModelTestDeps,
} from "./settings-model-test-wrap";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

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
    resolveTranscribe: vi.fn(async () => ({ ...mmSpec, provider: "whisper-local", model: "small" })),
    resolveEmbed: vi.fn(async () => llmSpec),
    resolveSearch: vi.fn(async () => ({
      provider: "bocha",
      baseUrl: null,
      model: null,
      token: "k",
    })),
    generateImageMinimal: vi.fn(async () => ({ byteLength: 12 })),
    searchMinimal: vi.fn(async () => 1),
    fetchImpl: vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    ...overrides,
  };
}

describe("runModelConnectionTest — 文本模型(default)", () => {
  it("1 token 补全 200 → ✓ 连通", async () => {
    const deps = makeDeps();
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.model).toBe("test-model");
    expect(r.detail).toContain("1 token");
    // 探测打的是 chat/completions(openai_chat 形状)。
    const url = (deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("HTTP 401 → ✗ 带真实原因(不说「未配置」)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        new Response("invalid api key", { status: 401 }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("401");
    expect(r.detail).toContain("invalid api key");
    expect(r.detail).not.toContain("未配置");
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

  it("生图调用抛错 → 「已配置,但调用失败:<原因>」", async () => {
    const deps = makeDeps({
      generateImageMinimal: vi.fn(async () => {
        throw new Error("minimax 401 invalid key");
      }),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("已配置,但调用失败");
    expect(r.detail).toContain("invalid key");
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
  it("HTTP 401 → ✗ 鉴权失败", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () => jsonResponse(401)) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("鉴权失败");
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

  it("MiniMax 惯例 HTTP 200 + base_resp 1004 → ✗ 鉴权失败", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, {
          base_resp: { status_code: 1004, status_msg: "invalid api key" },
        }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("invalid api key");
  });
});

describe("runModelConnectionTest — transcribe.audio / web.search 免 key 路径", () => {
  it("whisper-local 回退 → ✓ 免网络测试", async () => {
    const r = await runModelConnectionTest(ctx, "transcribe.audio", makeDeps());
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("本地 Whisper");
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
      ...makeDeps(),
    });
    const res = (await wrapped.request(
      ENDPOINTS.testModelConnection,
      { params: { capability: "default" }, query: undefined, body: undefined },
      ctx,
    )) as { data: { ok: boolean; detail: string } };
    expect(res.data.ok).toBe(true);
    expect(passthrough).not.toHaveBeenCalled();

    await wrapped.request(
      ENDPOINTS.listModels,
      { params: undefined, query: undefined, body: undefined },
      ctx,
    );
    expect(passthrough).toHaveBeenCalledTimes(1);
  });
});
