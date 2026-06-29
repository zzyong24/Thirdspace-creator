import { describe, it, expect } from "vitest";
import { modelFor, normalizeAnthropicBaseUrl } from "./provider-factory";

// 只验「按 apiFormat/baseUrl 能构造出一个 LanguageModel」—— 不走网络(假 key)。
// 证明模型中立层把三种协议族 + 自定义端点都接住了。

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
  });

  it("openai_chat(官方 OpenAI)", () => {
    const m = modelFor({
      apiFormat: "openai_chat",
      baseUrl: null,
      model: "gpt-4o",
      token: "sk-test",
    });
    expect(typeof m).toBe("object");
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
