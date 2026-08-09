import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const body = {
  contractVersion: "creatoros-client-diagnostic-v1",
  kind: "root_error",
  traceId: "123e4567-e89b-12d3-a456-426614174000",
  errorHash: "a".repeat(64),
  digest: "next-digest-1",
  occurredAt: "2026-08-08T12:00:00.000Z",
};

function request(value: unknown, origin = "http://127.0.0.1:3210"): Request {
  return new Request("http://127.0.0.1:3210/api/v1/local/diagnostics", {
    method: "POST",
    headers: { host: "127.0.0.1:3210", origin, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("本地客户端诊断入口", () => {
  afterEach(() => vi.restoreAllMocks());

  it("只落结构化 hash，不接收原始 message/stack/secret", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(body))).status).toBe(204);
    const output = JSON.parse(String(spy.mock.calls[0]?.[1])) as Record<string, unknown>;
    expect(output.errorHash).toBe(body.errorHash);
    expect(output.appVersion).toBe("1.0.0");
    expect(JSON.stringify(output)).not.toContain("sk-secret");
    expect((await POST(request({ ...body, message: "sk-secret" }))).status).toBe(400);
  });

  it("跨站 Origin 在解析 body 前拒绝", async () => {
    expect((await POST(request(body, "https://evil.example"))).status).toBe(403);
  });
});
