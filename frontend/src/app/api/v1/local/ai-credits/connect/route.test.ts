import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAiCreditPortalLink, isTrustedLocalRequest } = vi.hoisted(() => ({
  createAiCreditPortalLink: vi.fn(),
  isTrustedLocalRequest: vi.fn(() => true),
}));

vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest,
  loopbackForbidden: vi.fn(() => new Response(null, { status: 403 })),
}));
vi.mock("@/server/activation/ai-credit-link.server", () => ({
  createAiCreditPortalLink,
  asAiCreditLinkError: (error: unknown) =>
    error instanceof Error
      ? Object.assign(error, { code: "AI_CREDIT_LINK_UNAVAILABLE", retryable: true })
      : Object.assign(new Error("暂时不可用"), {
          code: "AI_CREDIT_LINK_UNAVAILABLE",
          retryable: true,
        }),
}));

import { POST } from "./route";

function request(body?: string): Request {
  return new Request("http://127.0.0.1/api/v1/local/ai-credits/connect", {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });
}

describe("POST /api/v1/local/ai-credits/connect", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    isTrustedLocalRequest.mockReturnValue(true);
    createAiCreditPortalLink.mockReset();
    createAiCreditPortalLink.mockResolvedValue({
      openUrl: "https://growth.example/credits/connect#ONE_TIME_123",
      expiresAt: "2026-08-06T12:10:00.000Z",
      expiresIn: 600,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("只向可信本地页面返回 no-store 的短时 fragment 地址", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      openUrl: "https://growth.example/credits/connect#ONE_TIME_123",
      expiresAt: "2026-08-06T12:10:00.000Z",
      expiresIn: 600,
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[ai-credits] link_session=created flow=connect",
    );
    const audit = infoSpy.mock.calls.flat().join(" ");
    expect(audit).not.toContain("ONE_TIME_123");
    expect(audit).not.toContain("ticket");
    expect(audit).not.toContain("growth.example");
  });

  it("已绑定入口只审计 launch 类型，不记录一次性地址", async () => {
    createAiCreditPortalLink.mockResolvedValue({
      openUrl: "https://growth.example/credits/launch#PORTAL_CODE_123",
      expiresAt: "2026-08-06T12:10:00.000Z",
      expiresIn: 60,
    });

    expect((await POST(request())).status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      "[ai-credits] link_session=created flow=launch",
    );
    expect(infoSpy.mock.calls.flat().join(" ")).not.toContain("PORTAL_CODE_123");
  });

  it("拒绝非本地请求和任何请求体，调用方不能选择用户端之外的入口", async () => {
    isTrustedLocalRequest.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    isTrustedLocalRequest.mockReturnValue(true);
    expect((await POST(request("{}"))).status).toBe(422);
    expect((await POST(request('{"portal":"admin"}'))).status).toBe(422);
    expect(createAiCreditPortalLink).not.toHaveBeenCalled();
  });

  it("错误响应不回显 ticket、一次性 code 或跳转地址", async () => {
    createAiCreditPortalLink.mockRejectedValue(new Error("稍后重试"));
    const response = await POST(request());
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain("稍后重试");
    expect(text).not.toContain("ONE_TIME_123");
    expect(text).not.toContain("ticket");
    expect(text).not.toContain("growth.example");
  });
});
