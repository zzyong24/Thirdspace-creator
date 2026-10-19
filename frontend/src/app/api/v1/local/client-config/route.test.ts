import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  refreshClientConfig,
  fulfillActivationIncludedCredit,
  PullError,
  putManagedCredential,
  readSessionCookie,
  readRequestAccountId,
  resolveRequestContext,
} = vi.hoisted(() => ({
  refreshClientConfig: vi.fn(),
  fulfillActivationIncludedCredit: vi.fn(),
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
  fulfillActivationIncludedCredit,
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
    fulfillActivationIncludedCredit.mockReset();
    fulfillActivationIncludedCredit.mockResolvedValue({status:"ready",action:"产品已含额度已启用",retryable:false});
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

  it("T-829 同步安全失败投影记为 blocked，不再把失败日志写成 completed", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    refreshClientConfig.mockResolvedValue({
      authority: "local",
      outcome: "security_error",
      action: "本地模型正在使用 · 渠道配置安全校验未通过",
      retryable: false,
    });

    const response = await POST(localRequest());

    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      '[client-config] {"phase":"config_sync","reason":"security_error","trigger":"unknown","status":"blocked"}',
    );
    log.mockRestore();
  });

  it("真实 Node/Next 代理把零字节 POST 表示为 body stream 时仍进入配置同步", async () => {
    refreshClientConfig.mockResolvedValue({
      authority: "channel",
      outcome: "configured",
      action: "渠道模型正在使用",
      retryable: false,
    });
    const response = await POST(
      new Request("http://127.0.0.1/api/v1/local/client-config", {
        method: "POST",
        headers: { "content-length": "0" },
        body: new Uint8Array(),
      }),
    );

    expect(response.status).toBe(200);
    expect(refreshClientConfig).toHaveBeenCalledTimes(1);
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
      '[client-config] {"phase":"activation_scope","reason":"signed_channel_ref_missing","trigger":"unknown","status":"blocked","errorCode":"CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING"}',
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

  it("即使伪报 Content-Length=0，也拒绝真实非空 body 且零出网", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/v1/local/client-config", {
        method: "POST",
        headers: { "content-length": "0" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(422);
    expect(refreshClientConfig).not.toHaveBeenCalled();
  });

it('T238 只有明确activation在原可信空POST中先履约后目录同步',async()=>{
 refreshClientConfig.mockResolvedValue({authority:'channel',outcome:'configured',retryable:false});
 const response=await POST(new Request('http://127.0.0.1/api/v1/local/client-config',{method:'POST',headers:{'x-creatoros-config-trigger':'activation'}}));
 expect(fulfillActivationIncludedCredit).toHaveBeenCalledTimes(1);expect(refreshClientConfig).toHaveBeenCalledTimes(1);
 expect(fulfillActivationIncludedCredit.mock.invocationCallOrder[0]).toBeLessThan(refreshClientConfig.mock.invocationCallOrder[0]!);
 expect(await response.json()).toMatchObject({activationFulfillment:{status:'ready'}});
},180_000);

it('T238 履约观察被取消后不能晚发目录同步或写旧scope凭据',async()=>{
 const controller=new AbortController();let finish!:(value:unknown)=>void;
 fulfillActivationIncludedCredit.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=POST(new Request('http://127.0.0.1/api/v1/local/client-config',{method:'POST',signal:controller.signal,headers:{'x-creatoros-config-trigger':'activation'}}));
 await vi.waitFor(()=>expect(fulfillActivationIncludedCredit).toHaveBeenCalledOnce());controller.abort();finish({status:'ready',action:'已启用',retryable:false});await pending;
 expect(refreshClientConfig).not.toHaveBeenCalled();expect(putManagedCredential).not.toHaveBeenCalled();
},180_000);
it.each(['startup','scheduled','bootstrap','manual_revalidate'])('T238 普通%s同步不触发额度履约',async(trigger)=>{
 refreshClientConfig.mockResolvedValue({authority:'channel',outcome:'configured',retryable:false});
 await POST(new Request('http://127.0.0.1/api/v1/local/client-config',{method:'POST',headers:{'x-creatoros-config-trigger':trigger}}));
 expect(fulfillActivationIncludedCredit).not.toHaveBeenCalled();expect(refreshClientConfig).toHaveBeenCalledOnce();
},180_000);
});
