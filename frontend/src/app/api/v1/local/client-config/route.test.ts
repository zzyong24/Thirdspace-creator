import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  refreshClientConfig,
  PullError,
  putManagedCredential,
  readSessionCookie,
  readRequestAccountId,
  resolveRequestContext,
} = vi.hoisted(() => ({
  refreshClientConfig: vi.fn(),
  putManagedCredential: vi.fn(),
  readSessionCookie: vi.fn(() => "session" as string | null),
  readRequestAccountId: vi.fn(() => "acct-1" as string | null),
  resolveRequestContext: vi.fn(async () => ({
    userId: "u-1",
    accountId: "acct-1",
    requestId: "req-1",
  })),
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
vi.mock("@/lib/request-context.server", () => ({
  readRequestAccountId,
  resolveRequestContext,
}));
vi.mock("@/server/persistence-client", () => ({
  getSettingsService: vi.fn(async () => ({ setChannelModelCredential: putManagedCredential })),
}));
vi.mock("../../auth/_session", () => ({ readSessionCookie }));

import { POST } from "./route";

function localRequest(origin = "http://127.0.0.1") {
  return new Request(`${origin}/api/v1/local/client-config`, {
    method: "POST",
  });
}

describe("POST /api/v1/local/client-config（API-575-002）", () => {
  beforeEach(() => {
    refreshClientConfig.mockReset();
    putManagedCredential.mockReset();
    readSessionCookie.mockReset();
    readSessionCookie.mockReturnValue("session");
    readRequestAccountId.mockReset();
    readRequestAccountId.mockReturnValue("acct-1");
    resolveRequestContext.mockReset();
    resolveRequestContext.mockResolvedValue({
      userId: "u-1",
      accountId: "acct-1",
      requestId: "req-1",
    });
  });

  it("只返回脱敏 authority，不返回渠道 JSON/ticket/identity/digest/signature", async () => {
    refreshClientConfig.mockResolvedValue({
      authority: "channel",
      outcome: "configured",
      action: "渠道模型正在使用",
      retryable: false,
    });
    const response = await POST(localRequest());
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(text)).toEqual({
      authority: "channel",
      outcome: "configured",
      action: "渠道模型正在使用",
      retryable: false,
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
      authority: "local",
      outcome: "unreachable",
      action: "渠道配置同步尚未启用",
      retryable: false,
    });
  });

  it("T-701 缺签名渠道身份映射稳定脱敏状态且不泄露 identity", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    refreshClientConfig.mockRejectedValueOnce(
      new PullError(
        "CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING",
        "授权缺少渠道信息，无法同步受管模型",
        false,
      ),
    );
    const response = await POST(localRequest());
    const text = await response.text();

    expect(response.status).toBe(409);
    expect(JSON.parse(text)).toEqual({
      authority: "local",
      outcome: "activation_scope_missing",
      action: "授权缺少渠道信息，无法同步受管模型",
      retryable: false,
    });
    expect(text).not.toMatch(
      /channelRef|projectKey|machineId|licenseCode|ticket|signature|secret/i,
    );
    expect(log).toHaveBeenCalledWith(
      '[client-config] {"phase":"activation_scope","reason":"signed_channel_ref_missing","trigger":"unknown","status":"blocked"}',
    );
    log.mockRestore();
  });

  it.each([
    ["无 session", null, "acct-1"],
    ["无 account", "session", null],
    ["两者都无", null, null],
  ] as const)("桌面本地请求%s仍使用安全本地上下文", async (_label, session, account) => {
    readSessionCookie.mockReturnValue(session);
    readRequestAccountId.mockReturnValue(account);
    refreshClientConfig.mockResolvedValue({
      authority: "channel",
      outcome: "configured",
      action: "渠道模型正在使用",
      retryable: false,
    });

    const response = await POST(localRequest());

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith(session, account, {
      rejectInvalidToken: true,
    });
    expect(refreshClientConfig).toHaveBeenCalledTimes(1);
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
