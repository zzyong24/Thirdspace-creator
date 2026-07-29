import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  getLlmProvider,
  createLlmCompleter,
  LlmNotImplementedError,
  type ResolvedLlmConfig,
} from "./provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const anthropicCfg: ResolvedLlmConfig = {
  apiFormat: "anthropic",
  baseUrl: "https://api.minimaxi.com/anthropic",
  model: "MiniMax-M3",
  authStyle: "bearer",
  token: "tok",
  settings: {},
};

describe("getLlmProvider", () => {
  it("builds an anthropic provider exposing complete()", () => {
    const p = getLlmProvider(anthropicCfg);
    expect(typeof p.complete).toBe("function");
  });
  it("throws LlmNotImplementedError for openai_chat (stub)", () => {
    expect(() =>
      getLlmProvider({ ...anthropicCfg, apiFormat: "openai_chat" }),
    ).toThrow(LlmNotImplementedError);
  });
  it("throws LlmNotImplementedError for openai_responses (legacy seam stub)", () => {
    expect(() =>
      getLlmProvider({ ...anthropicCfg, apiFormat: "openai_responses" }),
    ).toThrow(LlmNotImplementedError);
  });
});

describe("createLlmCompleter", () => {
  it("resolves config then delegates to the provider's complete", async () => {
    const fakeProviderResult = { text: "hi", json: undefined };
    // Inject a resolver that returns a config whose apiFormat routes to a fake.
    const completer = createLlmCompleter(async () => anthropicCfg, {
      anthropic: () => ({ complete: async () => fakeProviderResult }),
    });
    const out = await completer(ctx, "planning.thesis", "prompt");
    expect(out).toEqual(fakeProviderResult);
  });

  it("渠道托管 legacy completer 不泄露 provider/model/base URL/key", async () => {
    const completer = createLlmCompleter(
      async () => ({
        ...anthropicCfg,
        baseUrl: "https://channel-model.internal",
        model: "private-model",
        token: "SECRET_CHANNEL_KEY",
        displayModelKey: "channel-managed",
      }),
      {
        anthropic: () => ({
          complete: async () => {
            throw new Error(
              "https://channel-model.internal model=private-model apiKey=SECRET_CHANNEL_KEY",
            );
          },
        }),
      },
    );

    const error = await completer(
      ctx,
      "copilot.assist",
      "prompt",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("渠道模型调用失败");
    expect(message).not.toContain("SECRET_CHANNEL_KEY");
    expect(message).not.toContain("private-model");
    expect(message).not.toContain("channel-model.internal");
  });
});
