import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  ProductFeedbackSubmissionError,
  submitProductFeedback,
  verifyAmLicenseResponse,
} from "./product-feedback.server";

function jsonResponse(
  status: number,
  body: unknown,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function signedResponse(
  privateKey: KeyObject,
  publicKey: KeyObject,
  nonce: string,
): { response: Response; publicKeyB64: string } {
  const body = JSON.stringify({
    schemaVersion: "feedback-context-v1",
    feedbackContextToken: "header.payload.signature",
    expiresAt: "2026-07-26T18:05:00.000Z",
    nonce,
  });
  const bytes = Buffer.from(body);
  const digest = `SHA-256=${createHash("sha256").update(bytes).digest("base64")}`;
  const date = "Sun, 26 Jul 2026 18:00:00 GMT";
  const host = "license.example.com";
  const signing = `post /api/license/feedback-context\n${host}\n${date}\n${digest}`;
  const signature = sign(null, Buffer.from(signing), privateKey).toString(
    "base64",
  );
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    response: new Response(bytes, {
      status: 200,
      headers: {
        "x-license-signature": signature,
        "x-license-date": date,
        "x-license-digest": digest,
      },
    }),
    publicKeyB64: raw.toString("base64"),
  };
}

const request = {
  summary: "导出按钮没有反应",
  description: "点击导出后没有文件，也没有错误提示。",
  reproductionSteps: "打开项目\r\n进入发布\r点击导出",
  appVersion: "1.8.0",
  osName: "macOS 15",
  locale: "zh-CN",
};

function dependenciesWithGrowthResponse(response: Response) {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse(200, {
        schemaVersion: "feedback-context-v1",
        feedbackContextToken: "header.payload.signature",
        expiresAt: "2026-07-26T18:05:00.000Z",
        nonce: "fixed-nonce",
      }),
    )
    .mockResolvedValueOnce(response);
  return {
    fetchImpl,
    readVerdict: async () => ({
      state: "ready" as const,
      verdict: {
        v: 1,
        allowed: true,
        status: "active",
        code: "ACTIVATION-SECRET",
        machineId: "machine-secret",
        projectKey: "creatoros",
        channelRuntime: {
          bugFeedbackUrl: "https://growth.example.com/feedback",
        },
      },
    }),
    env: {
      CREATOROS_LICENSE_BASE_URL: "https://license.example.com",
      CREATOROS_FEEDBACK_OFFICIAL_ORIGINS: "https://growth.example.com",
      CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED: "1",
    },
    nonce: () => "fixed-nonce",
    verifyAmResponse: async (amResponse: Response) =>
      amResponse.json() as never,
  };
}

describe("CreatorOS 渠道绑定反馈 sidecar（TC-CBF-11）", () => {
  it("feature flag 默认关闭，关闭时不读取授权也不出网", async () => {
    const fetchImpl = vi.fn();
    const readVerdict = vi.fn();
    await expect(
      submitProductFeedback(
        request,
        "11111111-1111-4111-8111-111111111111",
        { fetchImpl, readVerdict, env: {} },
      ),
    ).rejects.toMatchObject({
      code: "FEEDBACK_SUBMISSION_DISABLED",
      status: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readVerdict).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "http://growth.example.com/feedback",
    "https://user:pass@growth.example.com/feedback",
    "https://growth.example.com:8443/feedback",
  ])("签名 bugFeedbackUrl 缺失或不安全时在 AM/Growth 出网前关闭（%s）", async (bugFeedbackUrl) => {
    const fetchImpl = vi.fn();
    await expect(
      submitProductFeedback(
        request,
        "11111111-1111-4111-8111-111111111111",
        {
          fetchImpl,
          readVerdict: async () => ({
            state: "ready",
            verdict: {
              v: 1,
              allowed: true,
              status: "active",
              code: "ACTIVATION-SECRET",
              machineId: "machine-secret",
              projectKey: "creatoros",
              channelRuntime: { bugFeedbackUrl },
            },
          }),
          env: {
            CREATOROS_LICENSE_BASE_URL: "https://license.example.com",
            CREATOROS_FEEDBACK_OFFICIAL_ORIGINS:
              "https://growth.example.com",
            CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED: "1",
          },
        },
      ),
    ).rejects.toMatchObject({
      code:
        bugFeedbackUrl === null
          ? "FEEDBACK_CHANNEL_UNAVAILABLE"
          : "FEEDBACK_ORIGIN_NOT_ALLOWED",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("逐字验证 AM body digest/Ed25519/nonce，篡改即拒绝", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signed = signedResponse(privateKey, publicKey, "nonce-1");
    await expect(
      verifyAmLicenseResponse(
        signed.response,
        "https://license.example.com/api/license/feedback-context",
        "nonce-1",
        signed.publicKeyB64,
        new Date("2026-07-26T18:00:05.000Z"),
      ),
    ).resolves.toMatchObject({
      feedbackContextToken: "header.payload.signature",
    });

    const tampered = signedResponse(privateKey, publicKey, "nonce-1");
    const bytes = await tampered.response.text();
    await expect(
      verifyAmLicenseResponse(
        new Response(bytes.replace("nonce-1", "nonce-2"), {
          status: 200,
          headers: tampered.response.headers,
        }),
        "https://license.example.com/api/license/feedback-context",
        "nonce-1",
        signed.publicKeyB64,
        new Date("2026-07-26T18:00:05.000Z"),
      ),
    ).rejects.toThrow();
  });

  it("从加密 license 取秘密，先 AM 再固定 Growth path；返回值不泄漏秘密", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          schemaVersion: "feedback-context-v1",
          feedbackContextToken: "header.payload.signature",
          expiresAt: "2026-07-26T18:05:00.000Z",
          nonce: "fixed-nonce",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(202, {
          publicRef: "FDB-01J7K0T2AB",
          status: "new",
          channelBinding: "verified",
        }),
      );

    const result = await submitProductFeedback(request, "11111111-1111-4111-8111-111111111111", {
      fetchImpl,
      readVerdict: async () => ({
        state: "ready",
        verdict: {
          v: 1,
          allowed: true,
          status: "active",
          code: "ACTIVATION-SECRET",
          machineId: "machine-secret",
          projectKey: "creatoros",
          channelRuntime: {
            bugFeedbackUrl:
              "https://growth.example.com/creatoros/feedback?source=desktop#form",
          },
        },
      }),
      env: {
        CREATOROS_LICENSE_BASE_URL: "https://license.example.com",
        CREATOROS_FEEDBACK_OFFICIAL_ORIGINS: "https://growth.example.com",
        CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED: "1",
      },
      nonce: () => "fixed-nonce",
      verifyAmResponse: async (response) => response.json() as never,
    });

    expect(result).toEqual({
      ok: true,
      publicRef: "FDB-01J7K0T2AB",
      status: "new",
      channelBinding: "verified",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://license.example.com/api/license/feedback-context",
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://growth.example.com/api/v2/product-feedback",
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "manual",
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      redirect: "manual",
    });
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toEqual({
      projectKey: "creatoros",
      code: "ACTIVATION-SECRET",
      machineId: "machine-secret",
      nonce: "fixed-nonce",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /ACTIVATION-SECRET|machine-secret|header\.payload|channelRef|priority/,
    );
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      contractVersion: "channel-bound-feedback-v1",
      feedbackContextToken: "header.payload.signature",
      productRef: "creatoros",
      reproductionSteps: "打开项目\n进入发布\n点击导出",
    });
  });

  it("origin 不在 allowlist、redirect 或上游失败时 fail-closed", async () => {
    const baseDeps = {
      readVerdict: async () => ({
        state: "ready" as const,
        verdict: {
          v: 1,
          allowed: true,
          status: "active",
          code: "SECRET",
          machineId: "machine",
          projectKey: "creatoros",
          channelRuntime: {
            bugFeedbackUrl: "https://evil.example/feedback",
          },
        },
      }),
      env: {
        CREATOROS_LICENSE_BASE_URL: "https://license.example.com",
        CREATOROS_FEEDBACK_OFFICIAL_ORIGINS: "https://growth.example.com",
        CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED: "1",
      },
      nonce: () => "fixed-nonce",
    };
    await expect(
      submitProductFeedback(request, "11111111-1111-4111-8111-111111111111", baseDeps),
    ).rejects.toMatchObject({ code: "FEEDBACK_ORIGIN_NOT_ALLOWED" });

    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(302, { error: "redirect" }, { location: "https://evil.example" }),
    );
    await expect(
      submitProductFeedback(request, "11111111-1111-4111-8111-111111111111", {
        ...baseDeps,
        fetchImpl,
        readVerdict: async () => ({
          ...(await baseDeps.readVerdict()),
          verdict: {
            ...(await baseDeps.readVerdict()).verdict,
            channelRuntime: {
              bugFeedbackUrl: "https://growth.example.com/feedback",
            },
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "FEEDBACK_AUTHORITY_UNAVAILABLE" });
  });

  it.each([
    {
      status: 409,
      code: "IDEMPOTENCY_MISMATCH",
      retryable: false,
      message: "反馈内容与本次重试记录不一致，请重新打开反馈窗口后提交",
    },
    {
      status: 409,
      code: "FEEDBACK_CONTEXT_STALE",
      retryable: true,
      message: "授权状态刚刚发生变化，请重试",
    },
    {
      status: 410,
      code: "FEEDBACK_CONTEXT_EXPIRED",
      retryable: true,
      message: "本次反馈授权已过期，请重试",
    },
    {
      status: 410,
      code: "CHANNEL_TERMINATED",
      retryable: false,
      message: "当前渠道已终止，请联系官方完成渠道改绑",
    },
    {
      status: 422,
      code: "FEEDBACK_INVALID",
      retryable: false,
      message: "反馈内容格式不符合要求，请检查后重试",
    },
    {
      status: 422,
      code: "FEEDBACK_PRODUCT_PROJECT_MISMATCH",
      retryable: false,
      message: "产品与授权渠道不匹配，请联系官方处理",
    },
    {
      status: 503,
      code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
      retryable: true,
      message: "反馈服务暂时不可用，请稍后重试",
    },
  ])(
    "严格映射 Growth $status $code，且不透传上游 message",
    async ({ status, code, retryable, message }) => {
      const maliciousMessage =
        "ACTIVATION-SECRET machine-secret channelRef=agent-42 priority=high";
      const promise = submitProductFeedback(
        request,
        "11111111-1111-4111-8111-111111111111",
        dependenciesWithGrowthResponse(
          jsonResponse(status, {
            error: { code, message: maliciousMessage },
          }),
        ),
      );

      await expect(promise).rejects.toMatchObject({
        name: "ProductFeedbackSubmissionError",
        code,
        status,
        retryable,
        message,
      });
      await expect(promise).rejects.not.toThrow(maliciousMessage);
    },
  );

  it.each([
    { error: { code: "FEEDBACK_CONTEXT_STALE" } },
    {
      error: {
        code: "FEEDBACK_CONTEXT_STALE",
        message: "FEEDBACK_CONTEXT_STALE",
        channelRef: "agent-42",
      },
    },
    {
      error: {
        code: "UNKNOWN_GROWTH_ERROR",
        message: "ACTIVATION-SECRET machine-secret",
      },
    },
    {
      code: "FEEDBACK_CONTEXT_STALE",
      message: "FEEDBACK_CONTEXT_STALE",
    },
  ])("拒绝非 closed Growth error wire：%o", async (body) => {
    const promise = submitProductFeedback(
      request,
      "11111111-1111-4111-8111-111111111111",
      dependenciesWithGrowthResponse(jsonResponse(409, body)),
    );

    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        name: "ProductFeedbackSubmissionError",
        code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
        status: 503,
        retryable: true,
        message: "反馈服务响应无法验证，请稍后重试",
      }),
    );
  });

  it("拒绝 code 与 HTTP 状态不一致，不能由任意响应决定本地语义", async () => {
    await expect(
      submitProductFeedback(
        request,
        "11111111-1111-4111-8111-111111111111",
        dependenciesWithGrowthResponse(
          jsonResponse(503, {
            error: {
              code: "CHANNEL_TERMINATED",
              message: "CHANNEL_TERMINATED",
            },
          }),
        ),
      ),
    ).rejects.toEqual(
      expect.objectContaining<ProductFeedbackSubmissionError>({
        name: "ProductFeedbackSubmissionError",
        code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
        status: 503,
        retryable: true,
        message: "反馈服务响应无法验证，请稍后重试",
      }),
    );
  });
});
