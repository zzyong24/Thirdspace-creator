import { describe, it, expect, vi } from "vitest";
import { createLicenseClient } from "./license-client";

// T-147 P5 —— license 客户端(activation-manager 契约映射)单测。全 fetch 注桩,零网络。
// 覆盖:请求形状 / snake+camel 双份归一 / success+valid 权威布尔 / 过期/被他机用错误态 /
//   网络失败标 networkError(走宽限)/ 超时 / 非 JSON 坏响应。

function fakeJsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("createLicenseClient", () => {
  it("发出正确的请求形状(POST /api/license/activate + code/machineId/projectKey)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(200, { success: true, valid: true }),
    );
    const client = createLicenseClient({
      baseUrl: "https://license.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.activate({ code: "CODE1", machineId: "M1", projectKey: "test" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://license.example.com/api/license/activate");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      code: "CODE1",
      machineId: "M1",
      projectKey: "test",
    });
  });

  it("status 打到 /api/license/status", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(200, { success: true, valid: true }),
    );
    const client = createLicenseClient({
      baseUrl: "https://license.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.status({ code: "C", machineId: "M", projectKey: "test" });
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://license.example.com/api/license/status");
  });

  it("成功激活 TIME:success+valid+expiresAt 归一(camelCase)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(200, {
        success: true,
        valid: true,
        licenseMode: "TIME",
        expiresAt: "2027-07-06T00:00:00.000Z",
        isActivated: true,
        message: "激活码激活成功",
      }),
    );
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.activate({ code: "C", machineId: "M", projectKey: "test" });
    expect(r).toMatchObject({
      success: true,
      valid: true,
      licenseMode: "TIME",
      expiresAt: "2027-07-06T00:00:00.000Z",
      isActivated: true,
      networkError: false,
    });
  });

  it("读 snake_case 冗余份(expires_at / license_mode / is_activated)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(200, {
        success: true,
        valid: true,
        license_mode: "TIME",
        expires_at: "2027-01-01T00:00:00.000Z",
        is_activated: true,
      }),
    );
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect(r.licenseMode).toBe("TIME");
    expect(r.isActivated).toBe(true);
  });

  it("过期(400 success:false)→ success=false valid=false + 保留 message", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(400, { success: false, message: "激活码已过期" }),
    );
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.activate({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.success).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.message).toBe("激活码已过期");
    expect(r.httpStatus).toBe(400);
    expect(r.networkError).toBe(false);
  });

  it("被其他设备使用(400)→ 非网络错,判无效", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(400, { success: false, message: "激活码已被其他设备使用" }),
    );
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.activate({ code: "C", machineId: "M2", projectKey: "test" });
    expect(r.valid).toBe(false);
    expect(r.networkError).toBe(false);
    expect(r.message).toBe("激活码已被其他设备使用");
  });

  it("HTTP 2xx 但 body.success 缺失 → 判失败(不当成功)", async () => {
    const fetchImpl = vi.fn(async () => fakeJsonResponse(200, { valid: true }));
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.success).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("success:true 但 valid:false(服务端判无效)→ valid=false", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeJsonResponse(200, { success: true, valid: false, isActivated: true }),
    );
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.success).toBe(true);
    expect(r.valid).toBe(false);
  });

  it("fetch throw(网络不可达)→ networkError=true(状态机据此走宽限)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.networkError).toBe(true);
    expect(r.success).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("超时(AbortError)→ networkError=true + 超时消息", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.networkError).toBe(true);
    expect(r.message).toContain("超时");
  });

  it("非 JSON 坏响应(假服务端返 HTML)→ 判失败但非网络错", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    }));
    const client = createLicenseClient({
      baseUrl: "https://x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await client.status({ code: "C", machineId: "M", projectKey: "test" });
    expect(r.success).toBe(false);
    expect(r.networkError).toBe(false);
  });
});
