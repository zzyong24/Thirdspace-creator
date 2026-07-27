import { describe, it, expect } from "vitest";
import { modelFor, normalizeAnthropicBaseUrl } from "./provider-factory";

// 不走网络(假 key),但必须断言 provider identity:这能锁住真实 wire protocol,
// 防止 @ai-sdk/openai 的默认 callable 行为升级后把 openai_chat 悄悄切到 Responses。
function providerOf(model: ReturnType<typeof modelFor>): string {
  if (typeof model === "string") {
    throw new Error(`预期 provider 模型对象,实际得到 model id: ${model}`);
  }
  return model.provider;
}

describe("modelFor", () => {
  it("anthropic(官方)", () => {
    const m = modelFor({
      apiFormat: "anthropic",
      baseUrl: null,
      model: "claude-opus-4-8",
      token: "sk-test",
    });
    expect(typeof m).toBe("object"); // 真模型实例,非裸字符串
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

  it("anthropic 协议 → 诚实抛错(不静默把聊天模型当 embedding 用)", () => {
    expect(() =>
      embeddingModelFor({
        apiFormat: "anthropic",
        baseUrl: null,
        model: "claude-opus-4-8",
        token: "sk-test",
      }),
    ).toThrow(/embedding/);
  });
});
