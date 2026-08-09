import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveLlmConfig } from "./resolve";
import { LlmCredentialError } from "./provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const noRow = async () => null;

describe("resolveLlmConfig — tier 1 DB row", () => {
  it("T-679 内部文本能力沿用 default 模型池的用户选择", async () => {
    const selectionReads: string[] = [];
    const cfg = await resolveLlmConfig(ctx, "script.draft", {
      getChannelModelConfig: async () => ({
        services: [{
          id: "omnihi-main",
          name: "OmniHi 模型服务",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            allowMultiple: false,
          },
        }],
        connections: [{
          id: "relay-text",
          serviceId: "omnihi-main",
          provider: "openai-compatible",
          baseURL: "https://api.omnihi.ai/openai",
          apiFormat: "openai_chat",
        }],
        models: {
          default: [
            {
              id: "minimax-m3",
              name: "MiniMax M3",
              connectionId: "relay-text",
              model: "minimax-m3",
              isDefault: true,
              settings: {},
            },
            {
              id: "claude-sonnet-4-6",
              name: "Claude Sonnet 4.6",
              connectionId: "relay-text",
              model: "claude-sonnet-4.6",
              isDefault: false,
              settings: {},
            },
          ],
        },
      }),
      getChannelModelSelection: async (capability) => {
        selectionReads.push(capability);
        return capability === "default" ? "claude-sonnet-4-6" : null;
      },
      getChannelModelCredential: async () => "omnihi-child-key",
      getModelConfig: noRow,
      env: {},
    });

    expect(selectionReads).toEqual(["default"]);
    expect(cfg).toMatchObject({
      model: "claude-sonnet-4.6",
      token: "omnihi-child-key",
      // 运行日志保持中性标签，真实展示名由设置页的 modelOptions 呈现。
      displayModelKey: "channel-managed",
    });
  });

  it("T-645 渠道只配置 ASR 时，文本模型继续读取用户本地配置", async () => {
    let localReads = 0;
    const cfg = await resolveLlmConfig(ctx, "default", {
      getChannelModelConfig: async () => ({
        services: [{
          id: "asr-service",
          name: "ASR",
          credential: { type: "api_key", source: "user_input" },
        }],
        connections: [{
          id: "asr-connection",
          serviceId: "asr-service",
          provider: "xiaomi-mimo",
          baseURL: "https://api.xiaomimimo.com/v1",
          apiFormat: "openai_chat",
        }],
        models: {
          "transcribe.audio": [{
            id: "asr-model",
            name: "MiMo ASR",
            connectionId: "asr-connection",
            model: "mimo-v2.5-asr",
            isDefault: true,
            settings: {},
          }],
        },
      }),
      getModelConfig: async () => {
        localReads += 1;
        return {
          provider: "deepseek",
          modelName: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
          apiFormat: "openai_chat",
          secretReference: "",
          secretValue: "local-key",
          settings: {},
        };
      },
      env: {},
    });
    expect(localReads).toBe(1);
    expect(cfg).toMatchObject({ model: "deepseek-chat", token: "local-key" });
  });

  it("T-645 完整渠道文本能力只读取对应 service Key，不读取本地配置", async () => {
    let localReads = 0;
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getChannelModelConfig: async () => ({
        services: [{
          id: "text-service",
          name: "MiniMax",
          credential: { type: "api_key", source: "user_input" },
        }],
        connections: [{
          id: "text-connection",
          serviceId: "text-service",
          provider: "minimax",
          baseURL: "https://api.minimaxi.com/anthropic",
          apiFormat: "anthropic_messages",
        }],
        models: { default: [{
          id: "text-model",
          name: "M3",
          connectionId: "text-connection",
          model: "MiniMax-M3",
          isDefault: true,
          settings: {},
        }] },
      }),
      getChannelModelCredential: async (serviceId) =>
        serviceId === "text-service" ? "channel-key" : null,
      getModelConfig: async () => {
        localReads += 1;
        return null;
      },
      env: {},
    });
    expect(localReads).toBe(0);
    expect(cfg).toMatchObject({
      model: "MiniMax-M3",
      token: "channel-key",
      displayModelKey: "channel-managed",
    });
  });

  it("按能力从 Growth 多模型数组选择默认项，不读取本地配置", async () => {
    let localReads = 0;
    const cfg = await resolveLlmConfig(ctx, "script.review", {
      getChannelModelConfig: async () => ({
        models: {
          default: [{
            id: "text-default",
            name: "日常模型",
            isDefault: true,
            provider: "openai-compatible",
            apiFormat: "openai_chat",
            baseURL: "https://default.example/v1",
            apiKey: "default-key",
            model: "default-model",
          }],
          "script.review": [
            {
              id: "review-fast",
              name: "快速审核",
              isDefault: false,
              provider: "openai-compatible",
              apiFormat: "openai_chat",
              baseURL: "https://review-fast.example/v1",
              apiKey: "fast-key",
              model: "fast-review",
            },
            {
              id: "review-quality",
              name: "高质量审核",
              isDefault: true,
              provider: "openai-compatible",
              apiFormat: "openai_chat",
              baseURL: "https://review-quality.example/v1",
              apiKey: "quality-key",
              model: "quality-review",
            },
          ],
        },
      }),
      getModelConfig: async () => {
        localReads += 1;
        return null;
      },
      env: {},
    });
    expect(localReads).toBe(0);
    expect(cfg).toMatchObject({
      model: "quality-review",
      token: "quality-key",
      baseUrl: "https://review-quality.example/v1",
      displayModelKey: "channel-managed",
    });
  });

  it("configured 渠道 JSON 直接采用且不读取本地 DB/env", async () => {
    let localReads = 0;
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getChannelModelConfig: async () => ({
        provider: "openai-compatible",
        apiFormat: "openai_chat",
        baseURL: "https://channel-model.example/v1",
        apiKey: ["channel", "test"].join("-"),
        model: "channel-model",
        settings: { temperature: 0.2 },
        unknownField: "kept-in-encrypted-payload",
      }),
      getModelConfig: async () => {
        localReads += 1;
        return null;
      },
      env: { ANTHROPIC_API_KEY: "must-not-be-read" },
    });
    expect(localReads).toBe(0);
    expect(cfg).toMatchObject({
      apiFormat: "openai_chat",
      baseUrl: "https://channel-model.example/v1",
      model: "channel-model",
      token: "channel-test",
      settings: { temperature: 0.2 },
      displayModelKey: "channel-managed",
    });

    for (const invalidApiFormat of [undefined, "unknown", 42]) {
      let invalidLocalReads = 0;
      await expect(
        resolveLlmConfig(ctx, "planning.thesis", {
          getChannelModelConfig: async () => ({
            provider: "openai-compatible",
            ...(invalidApiFormat === undefined
              ? {}
              : { apiFormat: invalidApiFormat }),
            baseURL: "https://must-not-leak.example/v1",
            apiKey: "must-not-leak",
            model: "must-not-leak",
          }),
          getModelConfig: async () => {
            invalidLocalReads += 1;
            return null;
          },
          env: { ANTHROPIC_API_KEY: "must-not-be-read" },
        }),
      ).rejects.toMatchObject({
        name: "ChannelModelConfigurationError",
        message: "渠道模型配置不完整，请联系官方处理",
      });
      expect(invalidLocalReads).toBe(0);
    }
  });

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

  it("文案审核优先专用审核模型，未配置时回退普通默认模型", async () => {
    const rows = {
      "script.review": {
        provider: "doubao",
        modelName: "doubao-review",
        baseUrl: "https://ark.example.com/v1",
        apiFormat: "openai_chat" as const,
        secretReference: "",
        secretValue: "sk-review",
        settings: {},
      },
      default: {
        provider: "deepseek",
        modelName: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        apiFormat: "openai_chat" as const,
        secretReference: "",
        secretValue: "sk-default",
        settings: {},
      },
    };
    const dedicated = await resolveLlmConfig(ctx, "script.review", {
      getModelConfig: async (_c, capability) =>
        rows[capability as keyof typeof rows] ?? null,
      env: {},
    });
    expect(dedicated.model).toBe("doubao-review");

    const fallback = await resolveLlmConfig(ctx, "script.review", {
      getModelConfig: async (_c, capability) =>
        capability === "default" ? rows.default : null,
      env: {},
    });
    expect(fallback.model).toBe("deepseek-chat");
    expect(fallback.token).toBe("sk-default");
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
