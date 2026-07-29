import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshClientConfig, PullError } = vi.hoisted(() => ({
  refreshClientConfig: vi.fn(),
  PullError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly retryable: boolean,
    ) {
      super(message);
      this.name = "ClientConfigPullError";
    }
  },
}));
vi.mock("@/server/activation/client-config.server", () => ({
  refreshClientConfig,
  ClientConfigPullError: PullError,
}));

import { POST } from "./route";

function localRequest(origin = "http://127.0.0.1") {
  return new Request(`${origin}/api/v1/local/client-config`, {
    method: "POST",
  });
}

describe("POST /api/v1/local/client-config（API-575-002）", () => {
  beforeEach(() => refreshClientConfig.mockReset());

  it("只返回产品协议安全投影，不返回 ticket/identity/digest/signature", async () => {
    refreshClientConfig.mockResolvedValue({
      state: "ready",
      modelPolicy: {
        serviceMode: "managed_default_user_override_allowed",
        profileKey: "balanced",
        capabilityRoutes: { "script.draft": "text-quality" },
      },
      action: "配置已更新",
    });
    const response = await POST(localRequest());
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(text)).toEqual({
      state: "ready",
      modelPolicy: {
        serviceMode: "managed_default_user_override_allowed",
        profileKey: "balanced",
        capabilityRoutes: { "script.draft": "text-quality" },
      },
      action: "配置已更新",
    });
    expect(text).not.toMatch(
      /channelRef|projectKey|configAccessTicket|bundleDigest|signature|keyId/,
    );
  });

  it("pending/撤权/过期使用人话可恢复状态，绝不假成功", async () => {
    refreshClientConfig.mockImplementationOnce(async () => {
      throw new PullError(
        "CLIENT_CONFIG_PENDING",
        "渠道配置同步尚未启用",
        false,
      );
    });
    const response = await POST(localRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      state: "pending",
      modelPolicy: null,
      action: "渠道配置同步尚未启用",
      retryable: false,
    });
  });

  it("拒绝非 loopback 请求且不触发任何出网", async () => {
    const response = await POST(localRequest("https://evil.example"));
    expect(response.status).toBe(403);
    expect(refreshClientConfig).not.toHaveBeenCalled();
  });

  it("即使没有 Content-Length，也拒绝任何请求 body 且零出网", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/v1/local/client-config", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(422);
    expect(refreshClientConfig).not.toHaveBeenCalled();
  });
});
