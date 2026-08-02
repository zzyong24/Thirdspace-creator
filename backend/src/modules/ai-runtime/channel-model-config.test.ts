import { describe, expect, it } from "vitest";

import {
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
