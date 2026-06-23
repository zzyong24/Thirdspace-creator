import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveLlmConfig } from "./resolve";
import { LlmCredentialError } from "./provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const noRow = async () => null;

describe("resolveLlmConfig — tier 1 DB row", () => {
  it("uses the DB row when its secretReference resolves non-empty", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: async () => ({
        id: "m1",
        userId: "u1",
        capability: "planning.thesis",
        provider: "minimax",
        modelName: "MiniMax-M3",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiFormat: "anthropic",
        secretReference: "env:MINIMAX_AUTH_TOKEN",
        settings: { effort: "high" },
        isDefault: false,
      }),
      env: { MINIMAX_AUTH_TOKEN: "tok-db" },
    });
    expect(cfg).toEqual({
      apiFormat: "anthropic",
      baseUrl: "https://api.minimaxi.com/anthropic",
      model: "MiniMax-M3",
      authStyle: "bearer",
      token: "tok-db",
      settings: { effort: "high" },
    });
  });
});

describe("resolveLlmConfig — tier 2 env default", () => {
  it("falls back to CREATOROS_LLM_* when no usable DB row", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: noRow,
      env: {
        CREATOROS_LLM_BASE_URL: "https://api.minimaxi.com/anthropic",
        CREATOROS_LLM_API_FORMAT: "anthropic",
        CREATOROS_LLM_MODEL: "MiniMax-M3",
        CREATOROS_LLM_AUTH_STYLE: "bearer",
        CREATOROS_LLM_SECRET_REF: "env:MINIMAX_AUTH_TOKEN",
        MINIMAX_AUTH_TOKEN: "tok-env",
      },
    });
    expect(cfg.token).toBe("tok-env");
    expect(cfg.model).toBe("MiniMax-M3");
    expect(cfg.authStyle).toBe("bearer");
  });
  it("skips an empty-string token (first_non_empty) and goes to built-in", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: noRow,
      env: {
        CREATOROS_LLM_SECRET_REF: "env:MINIMAX_AUTH_TOKEN",
        MINIMAX_AUTH_TOKEN: "",
        ANTHROPIC_API_KEY: "tok-builtin",
      },
    });
    expect(cfg.token).toBe("tok-builtin");
    expect(cfg.baseUrl).toBeNull();
    expect(cfg.model).toBe("claude-opus-4-8");
    expect(cfg.authStyle).toBe("x-api-key");
  });
});

describe("resolveLlmConfig — tier 3 + error", () => {
  it("uses built-in default when only ANTHROPIC_API_KEY is set", async () => {
    const cfg = await resolveLlmConfig(ctx, "copy.generate", {
      getModelConfig: noRow,
      env: { ANTHROPIC_API_KEY: "k" },
    });
    expect(cfg.apiFormat).toBe("anthropic");
    expect(cfg.authStyle).toBe("x-api-key");
  });
  it("throws LlmCredentialError when no tier yields a token", async () => {
    await expect(
      resolveLlmConfig(ctx, "copy.generate", { getModelConfig: noRow, env: {} }),
    ).rejects.toBeInstanceOf(LlmCredentialError);
  });
});
