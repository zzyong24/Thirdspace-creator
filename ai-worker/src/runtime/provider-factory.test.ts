import { describe, it, expect } from "vitest";
import {
  ChannelManagedProviderError,
  ManagedAiCreditExhaustedError,
  ModelConfigurationError,
  modelFor,
  normalizeAnthropicBaseUrl,
  protectChannelEmbeddingModel,
  protectChannelModel,
  toChannelManagedError,
} from "./provider-factory";

// 不走网络(假 key),但必须断言 provider identity:这能锁住真实 wire protocol,
// 防止 @ai-sdk/openai 的默认 callable 行为升级后把 openai_chat 悄悄切到 Responses。
function providerOf(model: ReturnType<typeof modelFor>): string {
  if (typeof model === "string") {
    throw new Error(`预期 provider 模型对象,实际得到 model id: ${model}`);
  }
  return model.provider;
}

describe("modelFor", () => {
  it("[T-735] 渠道错误保留可行动分类、阶段、HTTP 与脱敏参考号", () => {
    const error = toChannelManagedError(
      Object.assign(new Error("private upstream body SECRET"), {
        reason: "response_contract",
        stage: "poll",
        status: 200,
        reference: "media-12ab34cd56",
        retryable: false,
      }),
    );

    expect(error).toBeInstanceOf(ChannelManagedProviderError);
    expect(error).toMatchObject({
      code: "CHANNEL_MODEL_RESPONSE_CONTRACT",
      reason: "response_contract",
      stage: "poll",
      status: 200,
      reference: "media-12ab34cd56",
      retryable: false,
    });
    expect(error.message).toContain("当前版本无法识别");
    expect(error.message).not.toContain("SECRET");
  });

  it("[T-735] 鉴权、限流和网络提交未知不再全部压成 unknown", () => {
    expect(toChannelManagedError({ status: 401 })).toMatchObject({
      code: "CHANNEL_MODEL_AUTHENTICATION",
      reason: "authentication",
    });
    expect(toChannelManagedError({ statusCode: 429 })).toMatchObject({
      code: "CHANNEL_MODEL_RATE_LIMITED",
      reason: "rate_limited",
    });
    expect(
      toChannelManagedError({
        reason: "network",
        stage: "submit",
        retryable: false,
      }),
    ).toMatchObject({
      code: "CHANNEL_MODEL_NETWORK",
      stage: "submit",
      retryable: false,
    });
  });

  it("anthropic(官方)", () => {
    const m = modelFor({
      apiFormat: "anthropic",
      baseUrl: null,
      model: "claude-opus-4-8",
      token: "sk-test",
    });
    expect(typeof m).toBe("object"); // 真模型实例,非裸字符串

    for (const invalidApiFormat of [undefined, "unknown", 42]) {
      expect(() =>
        modelFor({
          apiFormat: invalidApiFormat,
          baseUrl: "https://must-not-call.example/v1",
          model: "must-not-leak",
          token: "must-not-leak",
        } as never),
      ).toThrow(ModelConfigurationError);
    }
  });

  it("openai_chat + 自定义 baseURL(DeepSeek/MiniMax/relay)", () => {
    const m = modelFor({
      apiFormat: "openai_chat",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      token: "sk-test",
    });
    expect(typeof m).toBe("object");
    expect(providerOf(m)).toBe("creatoros-custom.chat");
  });

  it("渠道托管模型对外只暴露统一 provider/model identity", () => {
    const m = modelFor({
      apiFormat: "openai_chat",
      baseUrl: "https://channel-model.internal/v1",
      model: "private-model",
      token: "SECRET_CHANNEL_KEY",
      displayModelKey: "channel-managed",
    });
    if (typeof m === "string") throw new Error("预期包装后的模型对象");
    expect(m.provider).toBe("channel-managed");
    expect(m.modelId).toBe("channel-managed");
  });

  it("渠道托管模型统一脱敏 generate、stream throw 与 error chunk", async () => {
    const secret = new Error(
      "https://channel-model.internal model=private-model apiKey=SECRET_CHANNEL_KEY",
    );
    const generateModel = protectChannelModel({
      specificationVersion: "v4",
      provider: "private-provider",
      modelId: "private-model",
      supportedUrls: {},
      doGenerate: async () => {
        throw secret;
      },
      doStream: async () => {
        throw secret;
      },
    } as never);
    if (typeof generateModel === "string") throw new Error("预期模型对象");

    await expect(generateModel.doGenerate({} as never)).rejects.toThrow(
      "模型调用失败",
    );
    await expect(generateModel.doStream({} as never)).rejects.toThrow(
      "模型调用失败",
    );

    const chunkModel = protectChannelModel({
      specificationVersion: "v4",
      provider: "private-provider",
      modelId: "private-model",
      supportedUrls: {},
      doGenerate: async () => {
        throw secret;
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "error", error: secret });
            controller.close();
          },
        }),
      }),
    } as never);
    if (typeof chunkModel === "string") throw new Error("预期模型对象");
    const streamed = await chunkModel.doStream({} as never);
    const chunk = (await streamed.stream.getReader().read()).value as {
      error: Error;
    };
    expect(chunk.error.message).toContain("模型调用失败");
    expect(chunk.error.message).not.toContain("SECRET_CHANNEL_KEY");
    expect(chunk.error.message).not.toContain("private-model");
    expect(chunk.error.message).not.toContain("channel-model.internal");
  });

  it("渠道托管额度耗尽保留为安全产品状态，且不泄露上游正文", async () => {
    const quotaError = Object.assign(new Error("request failed"), {
      status: 402,
      responseBody:
        '{"error":"insufficient balance","provider":"private","secret":"DO_NOT_LEAK"}',
    });
    const model = protectChannelModel({
      specificationVersion: "v4",
      provider: "private-provider",
      modelId: "private-model",
      supportedUrls: {},
      doGenerate: async () => {
        throw quotaError;
      },
      doStream: async () => {
        throw quotaError;
      },
    } as never);
    if (typeof model === "string") throw new Error("预期模型对象");

    let error: unknown;
    try {
      await model.doGenerate({} as never);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(ManagedAiCreditExhaustedError);
    expect(error).toMatchObject({
      code: "AI_CREDIT_EXHAUSTED",
      message: "AI 额度不足，请充值后再试。",
    });
    expect(JSON.stringify(error)).not.toContain("DO_NOT_LEAK");
    expect(JSON.stringify(error)).not.toContain("private-provider");
  });

  it("openai_chat(官方 OpenAI)", () => {
    const m = modelFor({
      apiFormat: "openai_chat",
      baseUrl: null,
      model: "gpt-4o",
      token: "sk-test",
    });
    expect(typeof m).toBe("object");
    expect(providerOf(m)).toBe("openai.chat");
  });

  it("openai_responses + 自定义 baseURL(New API/relay)", () => {
    const m = modelFor({
      apiFormat: "openai_responses",
      baseUrl: "https://new-api.example.com/v1",
      model: "gpt-5",
      token: "sk-test",
    });
    expect(providerOf(m)).toBe("creatoros-custom.responses");
  });

  it("openai_responses(官方 OpenAI)", () => {
    const m = modelFor({
      apiFormat: "openai_responses",
      baseUrl: null,
      model: "gpt-5",
      token: "sk-test",
    });
    expect(providerOf(m)).toBe("openai.responses");
  });
});

describe("normalizeAnthropicBaseUrl", () => {
  it("缺版本段 → 补 /v1(与旧 @anthropic-ai/sdk 约定统一,用户只配 …/anthropic)", () => {
    expect(normalizeAnthropicBaseUrl("https://api.minimaxi.com/anthropic")).toBe(
      "https://api.minimaxi.com/anthropic/v1",
    );
  });

  it("已含 /v1 → 不重复补(幂等,避免 …/v1/v1)", () => {
    expect(
      normalizeAnthropicBaseUrl("https://api.minimaxi.com/anthropic/v1"),
    ).toBe("https://api.minimaxi.com/anthropic/v1");
  });

  it("末尾斜杠 + 其它版本段 → 去斜杠、保留 vN", () => {
    expect(normalizeAnthropicBaseUrl("https://relay.example.com/v2/")).toBe(
      "https://relay.example.com/v2",
    );
  });
});

// ---------------------------------------------------------------------------
// [T-093] embeddingModelFor —— 语义检索 embedding 工厂(可配,不写死 provider)
// ---------------------------------------------------------------------------

import { embeddingModelFor } from "./provider-factory";

describe("embeddingModelFor", () => {
  it("openai_chat + baseUrl → openai-compatible textEmbeddingModel(SiliconFlow 等)", () => {
    const m = embeddingModelFor({
      apiFormat: "openai_chat",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "BAAI/bge-m3",
      token: "sk-test",
    });
    expect(typeof m).toBe("object");
  });

  it("openai_chat 官方 → OpenAI textEmbeddingModel", () => {
    const m = embeddingModelFor({
      apiFormat: "openai_chat",
      baseUrl: null,
      model: "text-embedding-3-small",
      token: "sk-test",
    });
    expect(typeof m).toBe("object");
  });

  it("渠道托管 embedding 统一模型身份并脱敏 doEmbed 错误", async () => {
    const protectedModel = protectChannelEmbeddingModel({
      specificationVersion: "v4",
      provider: "private-embedding-provider",
      modelId: "private-embedding-model",
      maxEmbeddingsPerCall: 16,
      supportsParallelCalls: true,
      doEmbed: async () => {
        throw new Error(
          "https://embedding.internal model=private-embedding-model apiKey=SECRET_EMBED_KEY",
        );
      },
    } as never);
    expect(protectedModel.provider).toBe("channel-managed");
    expect(protectedModel.modelId).toBe("channel-managed");
    await expect(
      protectedModel.doEmbed({ values: ["hello"] } as never),
    ).rejects.toThrow("模型调用失败");
  });

  it("embeddingModelFor 对渠道托管配置只暴露统一身份", () => {
    const model = embeddingModelFor({
      apiFormat: "openai_chat",
      baseUrl: "https://embedding.internal/v1",
      model: "private-embedding-model",
      token: "SECRET_EMBED_KEY",
      displayModelKey: "channel-managed",
    });
    if (typeof model === "string") throw new Error("预期 embedding 模型对象");
    expect(model.provider).toBe("channel-managed");
    expect(model.modelId).toBe("channel-managed");
  });

  it("anthropic 协议 → 诚实抛错(不静默把聊天模型当 embedding 用)", () => {
    expect(() =>
      embeddingModelFor({
        apiFormat: "anthropic",
        baseUrl: null,
        model: "claude-opus-4-8",
        token: "sk-test",
      }),
    ).toThrow(/embedding/);
    for (const invalidApiFormat of [undefined, "unknown", { wrong: true }]) {
      expect(() =>
        embeddingModelFor({
          apiFormat: invalidApiFormat,
          baseUrl: "https://must-not-call.example/v1",
          model: "must-not-leak",
          token: "must-not-leak",
        } as never),
      ).toThrow(ModelConfigurationError);
    }
  });
});
