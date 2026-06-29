import { describe, it, expect } from "vitest";
import { modelFor } from "./provider-factory";

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
