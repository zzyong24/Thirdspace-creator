import { describe, expect, it } from "vitest";

import {
  channelMultimodalSpecFromRoute,
  channelRouteToken,
  resolveChannelCapabilityRoute,
} from "./channel-model-config";

function graph(overrides: Record<string, unknown> = {}) {
  return {
    services: [
      {
        id: "text-account",
        name: "文本账户",
        credential: {
          type: "api_key",
          source: "user_input",
          links: { portalUrl: "https://text.example.com" },
        },
      },
      {
        id: "asr-account",
        name: "ASR 账户",
        credential: { type: "api_key", source: "user_input" },
      },
      {
        id: "video-account",
        name: "视频账户",
        credential: { type: "api_key", source: "user_input" },
      },
    ],
    connections: [
      {
        id: "text-connection",
        serviceId: "text-account",
        provider: "minimax",
        baseURL: "https://api.minimaxi.com/anthropic",
        apiFormat: "anthropic_messages",
      },
      {
        id: "asr-connection",
        serviceId: "asr-account",
        provider: "xiaomi-mimo",
        baseURL: "https://api.xiaomimimo.com/v1",
        apiFormat: "openai_chat",
      },
      {
        id: "video-connection",
        serviceId: "video-account",
        provider: "omnihi",
        baseURL: "https://api.omnihi.ai/media/v1",
        apiFormat: "omnihi_video_jobs",
      },
    ],
    models: {
      default: [
        {
          id: "text-model",
          name: "MiniMax M3",
          connectionId: "text-connection",
          model: "MiniMax-M3",
          isDefault: true,
          settings: {},
        },
      ],
      "transcribe.audio": [
        {
          id: "asr-model",
          name: "MiMo ASR",
          connectionId: "asr-connection",
          model: "mimo-v2.5-asr",
          isDefault: true,
          settings: { language: "auto" },
        },
      ],
      "video.generate": [
        {
          id: "video-model",
          name: "OmniHi Video",
          connectionId: "video-connection",
          model: "seedance/2-fast",
          isDefault: true,
          settings: {},
        },
      ],
    },
    ...overrides,
  };
}

describe("T-645 渠道模型逐 capability parser", () => {
  it("T-679 接受单一 activation_managed OmniHi service，并按真实模型 ID 选择", () => {
    const textModels = [
      "minimax-m3",
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "claude-haiku-4.5",
      "claude-sonnet-4.6",
      "claude-opus-4.8",
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "kimi-k2.6",
      "glm-5.2",
    ];
    const optionId = (model: string) => {
      if (model === "gemini-3.1-pro-preview") return "gemini-3-1-pro";
      if (model === "kimi-k2.6") return "kimi-k2-6";
      if (model === "glm-5.2") return "glm-5-2";
      return model.replaceAll(".", "-");
    };
    const payload = {
      services: [
        {
          id: "omnihi-main",
          name: "OmniHi 模型服务",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            allowMultiple: false,
          },
        },
      ],
      connections: [
        {
          id: "relay-text",
          serviceId: "omnihi-main",
          provider: "openai-compatible",
          baseURL: "https://api.omnihi.ai/openai",
          apiFormat: "openai_chat",
        },
        {
          id: "relay-image",
          serviceId: "omnihi-main",
          provider: "openai-compatible",
          baseURL: "https://api.omnihi.ai/openai",
          apiFormat: "openai_images",
        },
        {
          id: "relay-video",
          serviceId: "omnihi-main",
          provider: "omnihi",
          baseURL: "https://api.omnihi.ai/media/v1",
          apiFormat: "omnihi_media",
        },
      ],
      models: {
        // CreatorOS 不维护模型白名单，只按 Growth 下发顺序展示；这里用完整生产清单
        // 锁住动态渲染、默认项和后续增删兼容。
        default: textModels.map((model, index) => ({
          id: optionId(model),
          name: `显示名 ${model}`,
          connectionId: "relay-text",
          model,
          isDefault: index === 0,
          settings: {},
        })),
        "image.generate": [
          {
            id: "gpt-image-2",
            name: "GPT Image 2",
            connectionId: "relay-image",
            model: "openai/gpt-image-2-text-to-image",
            isDefault: true,
            settings: {},
          },
        ],
        "video.generate": [
          {
            id: "seedance-fast",
            name: "Seedance 2.0 Fast",
            connectionId: "relay-video",
            model: "seedance/seedance-2.0-fast",
            isDefault: true,
            settings: { resolution: "480p", durationSeconds: 4, audio: false },
          },
        ],
      },
    };

    const selected = resolveChannelCapabilityRoute(payload, "default", {
      selectedOptionId: "claude-sonnet-4-6",
    });
    expect(selected).toMatchObject({
      credentialSource: "activation_managed",
      serviceId: "omnihi-main",
      optionId: "claude-sonnet-4-6",
      model: "claude-sonnet-4.6",
    });
    expect(selected?.modelOptions.map((option) => option.model)).toEqual([
      ...textModels,
    ]);
    expect(selected?.modelName).toBe("显示名 claude-sonnet-4.6");
    const removedSelection = resolveChannelCapabilityRoute(payload, "default", {
      selectedOptionId: "growth-removed-this-model",
    });
    expect(removedSelection).toMatchObject({
      optionId: "minimax-m3",
      model: "minimax-m3",
      modelName: "显示名 minimax-m3",
    });
    expect(resolveChannelCapabilityRoute(payload, "image.generate")).toMatchObject({
      serviceId: "omnihi-main",
      model: "openai/gpt-image-2-text-to-image",
    });
    expect(resolveChannelCapabilityRoute(payload, "video.generate")).toMatchObject({
      serviceId: "omnihi-main",
      model: "seedance/seedance-2.0-fast",
      settings: { resolution: "480p", durationSeconds: 4, audio: false },
    });
    expect(
      channelMultimodalSpecFromRoute(
        resolveChannelCapabilityRoute(payload, "video.generate")!,
        "managed-child-key",
      ),
    ).toMatchObject({
      model: "seedance/seedance-2.0-fast",
      token: "managed-child-key",
      settings: { resolution: "480p", durationSeconds: 4, audio: false },
    });
    expect(resolveChannelCapabilityRoute(payload, "transcribe.audio")).toBeNull();
    expect(() => channelRouteToken(selected!, null)).toThrow(
      "渠道托管的 omnihi-main 凭据尚未同步，请确认激活权益后重试",
    );
  });

  it("T-679 拒绝签名配置把 activation_managed 扩成非 omnihi-main 服务", () => {
    const payload = graph({
      services: [
        {
          id: "unexpected-managed-service",
          name: "未登记受管服务",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            allowMultiple: false,
          },
        },
      ],
      connections: [
        {
          id: "text-connection",
          serviceId: "unexpected-managed-service",
          provider: "openai-compatible",
          baseURL: "https://api.omnihi.ai/openai",
          apiFormat: "openai_chat",
        },
      ],
      models: {
        default: [
          {
            id: "minimax-m3",
            name: "MiniMax M3",
            connectionId: "text-connection",
            model: "minimax-m3",
            isDefault: true,
            settings: {},
          },
        ],
      },
    });

    expect(resolveChannelCapabilityRoute(payload, "default")).toBeNull();
  });

  it("T-679 接受 Growth 下发的按次语音转文字能力，且解析阶段不要求用户 Key", () => {
    const payload = {
      services: [
        {
          id: "omnihi-main",
          name: "AI 能力",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            lifecycle: "persistent",
            allowMultiple: false,
          },
        },
        {
          id: "qwen-asr-main",
          name: "语音转文字",
          provider: "qwen",
          credential: {
            type: "api_key",
            source: "activation_managed",
            lifecycle: "per_request",
            allowMultiple: false,
          },
        },
      ],
      connections: [
        {
          id: "qwen-asr",
          serviceId: "qwen-asr-main",
          provider: "qwen",
          baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          apiFormat: "qwen_chat_audio",
        },
      ],
      models: {
        "transcribe.audio": [
          {
            id: "qwen3-asr-flash",
            name: "语音转文字",
            connectionId: "qwen-asr",
            model: "qwen3-asr-flash",
            isDefault: true,
            settings: {
              maxDurationSeconds: 300,
              maxBytes: 10_485_760,
              chargeUnits: 25_000,
            },
          },
        ],
      },
    };

    const route = resolveChannelCapabilityRoute(payload, "transcribe.audio");
    expect(route).toMatchObject({
      kind: "audio",
      serviceId: "qwen-asr-main",
      credentialSource: "activation_managed",
      credentialLifecycle: "per_request",
      provider: "qwen",
      apiFormat: "qwen_chat_audio",
      model: "qwen3-asr-flash",
      modelName: "语音转文字",
    });
    expect(channelMultimodalSpecFromRoute(route!, null)).toMatchObject({
      token: "",
      credentialLifecycle: "per_request",
      serviceId: "qwen-asr-main",
      apiFormat: "qwen_chat_audio",
    });
  });

  it("T-679 对旧受管 bundle 缺 lifecycle 继续按 persistent 兼容", () => {
    const payload = {
      services: [{
        id: "omnihi-main",
        name: "AI 能力",
        provider: "omnihi",
        credential: {
          type: "api_key",
          source: "activation_managed",
          allowMultiple: false,
        },
      }],
      connections: [{
        id: "relay-image",
        serviceId: "omnihi-main",
        provider: "openai-compatible",
        baseURL: "https://api.example.com/openai",
        apiFormat: "openai_images",
      }],
      models: { "image.generate": [{
        id: "image",
        name: "生成图片",
        connectionId: "relay-image",
        model: "image-model",
        isDefault: true,
        settings: {},
      }] },
    };
    expect(resolveChannelCapabilityRoute(payload, "image.generate")).toMatchObject({
      credentialLifecycle: "persistent",
    });
  });

  it("允许渠道为 transcribe.audio 下发 Qwen ASR 适配器", () => {
    const base = graph();
    const payload = graph({
      connections: [
        ...(base.connections as unknown[]).filter(
          (row) => (row as { id?: string }).id !== "asr-connection",
        ),
        {
          id: "asr-connection",
          serviceId: "asr-account",
          provider: "qwen-asr",
          baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          apiFormat: "openai_chat",
        },
      ],
      models: {
        ...(base.models as Record<string, unknown>),
        "transcribe.audio": [
          {
            id: "qwen-asr-model",
            name: "Qwen3 ASR Flash",
            connectionId: "asr-connection",
            model: "qwen3-asr-flash",
            isDefault: true,
            settings: { language: "zh" },
          },
        ],
      },
    });

    expect(resolveChannelCapabilityRoute(payload, "transcribe.audio")).toMatchObject({
      kind: "audio",
      provider: "qwen-asr",
      model: "qwen3-asr-flash",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  });

  it("只完整返回且客户端已支持的能力才 managed，OmniHi 视频走渠道配置", () => {
    const payload = graph();
    expect(resolveChannelCapabilityRoute(payload, "default")).toMatchObject({
      serviceId: "text-account",
      apiFormat: "anthropic",
      model: "MiniMax-M3",
    });
    expect(resolveChannelCapabilityRoute(payload, "transcribe.audio")).toMatchObject({
      serviceId: "asr-account",
      provider: "xiaomi-mimo",
      kind: "audio",
    });
    expect(resolveChannelCapabilityRoute(payload, "image.generate")).toBeNull();
    expect(resolveChannelCapabilityRoute(payload, "video.generate")).toMatchObject({
      serviceId: "video-account",
      provider: "omnihi",
      kind: "video",
      model: "seedance/2-fast",
    });
  });

  it("文本内部能力只有显式允许时才复用完整 default，专配能力不会被全局锁定", () => {
    const payload = graph();
    expect(
      resolveChannelCapabilityRoute(payload, "planning.thesis", {
        allowDefaultFallback: true,
      }),
    ).toMatchObject({ capability: "planning.thesis", serviceId: "text-account" });
    expect(resolveChannelCapabilityRoute(payload, "chat.fallback")).toBeNull();
  });

  it("引用断裂、缺 settings、非 HTTPS 都只让该能力 local", () => {
    const base = graph();
    const models = base.models as Record<string, unknown>;
    const badRef = graph({
      models: {
        ...models,
        "transcribe.audio": [
          {
            id: "bad-asr",
            name: "Bad ASR",
            connectionId: "missing",
            model: "m",
            isDefault: true,
            settings: {},
          },
        ],
      },
    });
    expect(resolveChannelCapabilityRoute(badRef, "transcribe.audio")).toBeNull();
    expect(resolveChannelCapabilityRoute(badRef, "default")).not.toBeNull();

    const unsafe = graph({
      connections: [
        ...(base.connections as unknown[]).filter(
          (row) => (row as { id?: string }).id !== "asr-connection",
        ),
        {
          id: "asr-connection",
          serviceId: "asr-account",
          provider: "xiaomi-mimo",
          baseURL: "http://api.example.com/v1",
          apiFormat: "openai_chat",
        },
      ],
    });
    expect(resolveChannelCapabilityRoute(unsafe, "transcribe.audio")).toBeNull();
  });

  it("同一 service 可供多个能力复用一把本地 Key，parser 本身不接收明文 Key", () => {
    const base = graph();
    const payload = graph({
      models: {
        ...(base.models as Record<string, unknown>),
        "image.generate": [
          {
            id: "image-model",
            name: "Image",
            connectionId: "image-connection",
            model: "gpt-image-1",
            isDefault: true,
            settings: {},
          },
        ],
      },
      connections: [
        ...(base.connections as unknown[]),
        {
          id: "image-connection",
          serviceId: "text-account",
          provider: "openai-compatible",
          baseURL: "https://image.example.com/v1",
          apiFormat: "openai_images",
        },
      ],
    });
    const text = resolveChannelCapabilityRoute(payload, "default")!;
    const image = resolveChannelCapabilityRoute(payload, "image.generate")!;
    expect(image.provider).toBe("openai");
    expect(image.serviceId).toBe(text.serviceId);
    expect(() => channelRouteToken(image, null)).toThrowError(
      /请先在设置中填写 text-account 的 API Key/,
    );
    expect(channelRouteToken(text, " service-key ")).toBe("service-key");
  });
});
