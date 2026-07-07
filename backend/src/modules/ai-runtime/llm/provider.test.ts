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
});
