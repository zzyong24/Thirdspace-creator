import { describe, expect, it, vi } from "vitest";
import { ENDPOINTS, type RequestContext, type Transport } from "@creatoros/contract";

import { createSettingsWithChannelModelCredentials } from "./settings-channel-model-credentials-wrap";

const ctx: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };

const payload = {
  services: [
    {
      id: "text-service",
      name: "文本账户",
      credential: { type: "api_key", source: "user_input" },
    },
  ],
  connections: [
    {
      id: "text-connection",
      serviceId: "text-service",
      provider: "minimax",
      baseURL: "https://api.minimaxi.com/anthropic",
      apiFormat: "anthropic_messages",
    },
    {
      id: "image-connection",
      serviceId: "text-service",
      provider: "openai-compatible",
      baseURL: "https://image.example/v1",
      apiFormat: "openai_images",
    },
  ],
  models: {
    default: [
      {
        id: "text-model",
        name: "M3",
        connectionId: "text-connection",
        model: "MiniMax-M3",
        isDefault: true,
        settings: {},
      },
    ],
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
};

describe("T-645 渠道 service Key composition API", () => {
  it("列表只投影当前已验签且完整 managed 的 service，多能力共用时去重并补齐未填写状态", async () => {
    const transport = createSettingsWithChannelModelCredentials({
      settings: { request: vi.fn() } as unknown as Transport,
      readAuthority: async () => ({
        authority: "channel",
        outcome: "configured",
        scopeId: "scope-a",
        payload,
      }),
      listCredentials: async () => [],
      putCredential: vi.fn(),
    });
    const result = (await transport.request(
      ENDPOINTS.listChannelModelCredentials,
      { params: undefined, query: undefined, body: undefined },
      ctx,
    )) as { data: unknown };
    expect(result.data).toEqual([
      { serviceId: "text-service", hasSecret: false, updatedAt: null },
    ]);
  });

  it("保存时 scope 只取 server authority，不能写未被完整能力引用的 service", async () => {
    const putCredential = vi.fn(async () => ({
      serviceId: "text-service",
      hasSecret: true,
      updatedAt: "2026-08-02T00:00:00.000Z",
    }));
    const transport = createSettingsWithChannelModelCredentials({
      settings: { request: vi.fn() } as unknown as Transport,
      readAuthority: async () => ({
        authority: "channel",
        outcome: "configured",
        scopeId: "scope-a",
        payload,
      }),
      listCredentials: async () => [],
      putCredential,
    });
    await transport.request(
      ENDPOINTS.putChannelModelCredential,
      { params: { serviceId: "text-service" }, query: undefined, body: { secret: "sk" } },
      ctx,
    );
    expect(putCredential).toHaveBeenCalledWith(ctx, "scope-a", "text-service", "sk");

    await expect(
      transport.request(
        ENDPOINTS.putChannelModelCredential,
        { params: { serviceId: "unknown" }, query: undefined, body: { secret: "sk" } },
        ctx,
      ),
    ).rejects.toThrow(/当前渠道未提供/);
  });

  it("无模型 extension 时透传本地设置且渠道凭据列表为空", async () => {
    const baseRequest = vi.fn(async () => ({ data: { ok: true }, meta: { requestId: "r" } }));
    const transport = createSettingsWithChannelModelCredentials({
      settings: { request: baseRequest } as unknown as Transport,
      readAuthority: async () => ({
        authority: "local",
        outcome: "not_configured",
        payload: null,
      }),
      listCredentials: async () => [],
      putCredential: vi.fn(),
    });
    const result = (await transport.request(
      ENDPOINTS.listChannelModelCredentials,
      { params: undefined, query: undefined, body: undefined },
      ctx,
    )) as { data: unknown };
    expect(result.data).toEqual([]);
    expect(baseRequest).not.toHaveBeenCalled();
  });
});
