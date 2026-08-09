import { describe, expect, it, vi } from "vitest";

import {
  AiCreditLinkError,
  createAiCreditPortalLink,
} from "./ai-credit-link.server";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function access() {
  return Promise.resolve({
    configAccessTicket: "ticket-secret-never-log",
    expiresAt: "2026-08-06T12:00:30.000Z",
    growthOrigin: "https://growth.example/",
  });
}

function success(
  overrides: Record<string, unknown> = {},
  status = 201,
): Response {
  return new Response(
    JSON.stringify({
      linkRef: "link_123",
      verificationUrl: "https://growth.example/credits/connect#ONE_TIME_123",
      userCode: "ONE_TIME_123",
      expiresAt: "2026-08-06T12:10:00.000Z",
      expiresIn: 600,
      ...overrides,
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    },
  );
}

describe("createAiCreditPortalLink", () => {
  it("用短时 ticket 创建一次性会话，code 只进入同源 fragment", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => success());
    const result = await createAiCreditPortalLink({
      requestAccess: access,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      idempotencyKey: () => "credit-link-attempt-0001",
    });

    expect(result).toEqual({
      openUrl: "https://growth.example/credits/connect#ONE_TIME_123",
      expiresAt: "2026-08-06T12:10:00.000Z",
      expiresIn: 600,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://growth.example/api/ai-credit-link-sessions",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer ticket-secret-never-log",
          "Idempotency-Key": "credit-link-attempt-0001",
        },
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(result.openUrl).not.toContain("?");
  });

  it("已绑定权益只接受 Growth 用户端 launch，一键进入额度页", async () => {
    const fetchImpl = vi.fn(async () =>
      success({
        flow: "portal",
        verificationUrl:
          "https://growth.example/credits/launch#PORTAL_CODE_123",
        expiresIn: 60,
        expiresAt: "2026-08-06T12:01:00.000Z",
        userCode: undefined,
      }),
    ) as typeof fetch;
    const result = await createAiCreditPortalLink({
      requestAccess: access,
      fetchImpl,
      now: () => NOW,
      idempotencyKey: () => "credit-portal-attempt-0001",
    });
    expect(result.openUrl).toBe(
      "https://growth.example/credits/launch#PORTAL_CODE_123",
    );
  });

  it.each([
    ["跨域地址", { verificationUrl: "https://evil.example/credits/connect" }],
    ["query 携码", { verificationUrl: "https://growth.example/credits/connect?code=x" }],
    ["fragment 与 userCode 不一致", { verificationUrl: "https://growth.example/credits/connect#x" }],
    ["错误页面", { verificationUrl: "https://growth.example/app/ai-credits" }],
    ["管理员端", { verificationUrl: "https://growth.example/admin/credits" }],
    ["渠道端", { verificationUrl: "https://growth.example/channel/credits" }],
    ["合作方端", { verificationUrl: "https://growth.example/partner/credits" }],
    ["伪造角色选择", { verificationUrl: "https://growth.example/credits/connect?role=admin" }],
    [
      "管理员 launch",
      {
        flow: "portal",
        verificationUrl: "https://growth.example/admin/credits#PORTAL_CODE_123",
        expiresIn: 60,
        expiresAt: "2026-08-06T12:01:00.000Z",
        userCode: undefined,
      },
    ],
    [
      "渠道 launch",
      {
        flow: "portal",
        verificationUrl: "https://growth.example/channel/credits#PORTAL_CODE_123",
        expiresIn: 60,
        expiresAt: "2026-08-06T12:01:00.000Z",
        userCode: undefined,
      },
    ],
  ])("拒绝%s", async (_label, overrides) => {
    await expect(
      createAiCreditPortalLink({
        requestAccess: access,
        fetchImpl: vi.fn(async () => success(overrides)) as typeof fetch,
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AiCreditLinkError);
  });

  it("拒绝可缓存响应，避免一次性 code 落入普通缓存", async () => {
    await expect(
      createAiCreditPortalLink({
        requestAccess: access,
        fetchImpl: vi.fn(async () =>
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as typeof fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "AI_CREDIT_LINK_INVALID" });
  });
});
