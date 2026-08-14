import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readChannelModelAuthority,
  setChannelModelCredential,
  resolveRequestContext,
} = vi.hoisted(() => ({
  readChannelModelAuthority: vi.fn(),
  setChannelModelCredential: vi.fn(),
  resolveRequestContext: vi.fn(async () => ({
    userId: "u-1",
    accountId: "acct-1",
    requestId: "req-1",
  })),
}));

vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest: vi.fn(() => true),
  loopbackForbidden: vi.fn(() => new Response(null, { status: 403 })),
}));
vi.mock("@/lib/request-context.server", () => ({
  readRequestAccountId: vi.fn(() => "acct-1"),
  resolveRequestContext,
}));
vi.mock("@/server/activation/client-config.server", () => ({
  readChannelModelAuthority,
}));
vi.mock("@/server/persistence-client", () => ({
  getSettingsService: vi.fn(async () => ({ setChannelModelCredential })),
}));
vi.mock("../../auth/_session", () => ({ readSessionCookie: vi.fn(() => "session") }));

import { POST } from "./route";

const textModels = [
  "claude-haiku-4.5",
  "kimi-k2.6",
  "gemini-3.5-flash",
  "claude-sonnet-4.6",
  "gpt-5.6-sol",
  "minimax-m3",
  "deepseek-v4-pro",
] as const;

function optionId(model: (typeof textModels)[number]): string {
  if (model === "kimi-k2.6") return "kimi-k2-6";
  return model.replaceAll(".", "-");
}

function payload() {
  return {
    services: [
      {
        id: "omnihi-main",
        name: "OmniHi",
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
    ],
    models: {
      default: textModels.map((model, index) => ({
        id: optionId(model),
        name: `模型 ${model}`,
        connectionId: "relay-text",
        model,
        isDefault: index === 0,
        settings: {},
      })),
    },
  };
}

function request(optionId: string): Request {
  return new Request("http://127.0.0.1/api/v1/local/channel-model-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capability: "default", optionId }),
  });
}

describe("POST /api/v1/local/channel-model-selection", () => {
  beforeEach(() => {
    setChannelModelCredential.mockReset();
    readChannelModelAuthority.mockReset();
    readChannelModelAuthority.mockResolvedValue({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-1",
      payload: payload(),
    });
  });

  it("只保存 Growth 签名清单里的真实 id/model，不保存显示名或用户自由输入", async () => {
    const response = await POST(request("kimi-k2-6"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      capability: "default",
      optionId: "kimi-k2-6",
      model: "kimi-k2.6",
    });
    expect(setChannelModelCredential).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", accountId: "acct-1" }),
      "scope-1",
      "__model_selection__:default",
      JSON.stringify({ id: "kimi-k2-6", model: "kimi-k2.6" }),
    );
  });

  it("拒绝 Growth 未下发的 optionId，不能借默认回退把任意字符串写进密钥库", async () => {
    const response = await POST(request("fake-model-from-client"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "该模型不在当前渠道白名单内" });
    expect(setChannelModelCredential).not.toHaveBeenCalled();
  });
});
