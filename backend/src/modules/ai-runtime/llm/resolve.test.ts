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
        provider: "minimax",
        modelName: "MiniMax-M3",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiFormat: "anthropic",
        secretReference: "env:MINIMAX_AUTH_TOKEN",
        secretValue: null,
        settings: { effort: "high" },
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

  it("prefers a stored secretValue over the env-ref (local-db key)", async () => {
    const cfg = await resolveLlmConfig(ctx, "default", {
      getModelConfig: async () => ({
        provider: "minimax",
        modelName: "MiniMax-M3",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiFormat: "anthropic",
        secretReference: "",
        secretValue: "sk-stored",
        settings: {},
      }),
      env: {},
    });
    expect(cfg.token).toBe("sk-stored");
    expect(cfg.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(cfg.authStyle).toBe("bearer");
  });

  it("preserves openai_responses from the saved New API model row", async () => {
    const cfg = await resolveLlmConfig(ctx, "default", {
      getModelConfig: async () => ({
        provider: "new-api",
        modelName: "gpt-5",
        baseUrl: "https://new-api.example.com/v1",
        apiFormat: "openai_responses",
        secretReference: "",
        secretValue: "sk-relay",
        settings: {},
      }),
      env: {},
    });
    expect(cfg).toMatchObject({
      apiFormat: "openai_responses",
      baseUrl: "https://new-api.example.com/v1",
      model: "gpt-5",
      authStyle: "bearer",
    });
  });

  it("falls back to the 'default' capability row when the exact one is missing", async () => {
    const cfg = await resolveLlmConfig(ctx, "script.draft", {
      getModelConfig: async (_c, cap) =>
        cap === "default"
          ? {
              provider: "anthropic",
              modelName: "claude-opus-4-8",
              baseUrl: null,
              apiFormat: "anthropic",
              secretReference: "",
              secretValue: "sk-default",
              settings: {},
            }
          : null,
      env: {},
    });
    expect(cfg.token).toBe("sk-default");
    expect(cfg.model).toBe("claude-opus-4-8");
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
  it("[T-432] 有配置行但 key 不可用(解密失败)→ 诚实提示重填密钥,非误导改 .env.local", async () => {
    // decRow 在 master key 不符时把 secretValue 静默置 null → 有配置行但无可用 token。
    const rowNoKey = async () => ({
      provider: "deepseek",
      modelName: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com/anthropic",
      apiFormat: "anthropic" as const,
      secretReference: "",
      secretValue: null,
      settings: {},
    });
    await expect(
      resolveLlmConfig(ctx, "default", { getModelConfig: rowNoKey, env: {} }),
    ).rejects.toThrow(/重新填写 API 密钥/);
    // 无配置行时仍是配置/env 提示,不误报「重填」。
    await expect(
      resolveLlmConfig(ctx, "default", { getModelConfig: noRow, env: {} }),
    ).rejects.toThrow(/无可用 LLM 凭据/);
  });
});
