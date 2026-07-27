import { beforeEach, describe, expect, it, vi } from "vitest";

const submitProductFeedback = vi.hoisted(() => vi.fn());
vi.mock("@/server/feedback/product-feedback.server", () => ({
  submitProductFeedback,
  ProductFeedbackSubmissionError: class extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      readonly retryable: boolean,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { POST } from "./route";

const body = {
  summary: "导出按钮没有反应",
  description: "点击导出后没有文件，也没有错误提示。",
  reproductionSteps: "",
  appVersion: "1.8.0",
  osName: "macOS 15",
  locale: "zh-CN",
};

function localRequest(value: unknown = body, key = "11111111-1111-4111-8111-111111111111") {
  return new Request("http://127.0.0.1/api/v1/local/product-feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(value),
  });
}

describe("POST /api/v1/local/product-feedback（TC-CBF-11）", () => {
  beforeEach(() => submitProductFeedback.mockReset());

  it("只在真实 202 上游回执后返回 publicRef，且 no-store", async () => {
    submitProductFeedback.mockResolvedValue({
      ok: true,
      publicRef: "FDB-01J7K0T2AB",
      status: "new",
      channelBinding: "verified",
    });
    const response = await POST(localRequest());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      ok: true,
      publicRef: "FDB-01J7K0T2AB",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("拒绝敏感额外字段、坏幂等键和非 loopback 请求，不调用 service", async () => {
    expect(
      (
        await POST(
          localRequest({ ...body, channelRef: "agent-42", priority: "high" }),
        )
      ).status,
    ).toBe(422);
    expect((await POST(localRequest(body, "bad"))).status).toBe(422);
    expect(
      (
        await POST(
          new Request("https://evil.example/api/v1/local/product-feedback", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key":
                "11111111-1111-4111-8111-111111111111",
            },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(403);
    expect(submitProductFeedback).not.toHaveBeenCalled();
  });
});
