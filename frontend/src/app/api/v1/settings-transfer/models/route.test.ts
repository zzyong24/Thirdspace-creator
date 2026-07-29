import { describe, it, expect, beforeEach, vi } from "vitest";

// [T-363] 模型配置导出/导入 route 单测 —— mock 组合根(settingsService)+ ctx 解析,
// 断言路由层:loopback 防护、导出下载头、导入报告透传、结构错 400、非 JSON 400。
// service 层的 round-trip / 敏感值处理在 backend model-config-transfer.test.ts 另测。

const exportModelConfigs = vi.fn();
const importModelConfigs = vi.fn();
const resolveRequestContext = vi.fn();

vi.mock("@/server/persistence-client", () => ({
  getSettingsService: async () => ({
    exportModelConfigs,
    importModelConfigs,
  }),
}));

vi.mock("@/lib/request-context.server", () => ({
  resolveRequestContext: (...args: unknown[]) => resolveRequestContext(...args),
  isAuthError: (err: unknown) =>
    (err as { name?: string } | null)?.name === "AuthenticationError",
}));

import { GET, POST } from "./route";
import { ModelConfigImportError } from "@creatoros/backend/modules/settings";

const EXPORT_FILE = {
  kind: "creatoros.model-config-export",
  version: 1,
  exportedAt: "2026-07-17T00:00:00.000Z",
  secretForm: "encrypted",
  models: [
    {
      capability: "default",
      provider: "minimax",
      modelName: "MiniMax-M2",
      secretReference: "",
      secretValue: "enc:v1:abc",
      settings: {},
      baseUrl: null,
      apiFormat: "anthropic",
      isDefault: true,
    },
  ],
};

function makeReq(init?: { method?: string; host?: string; body?: string }): Request {
  return new Request("http://127.0.0.1:41730/api/v1/settings-transfer/models", {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      host: init?.host ?? "127.0.0.1:41730",
    },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
}

beforeEach(() => {
  exportModelConfigs.mockReset();
  importModelConfigs.mockReset();
  resolveRequestContext.mockReset();
  resolveRequestContext.mockResolvedValue({
    userId: "user-zyongzhu",
    requestId: "req-1",
    source: "user",
  });
  exportModelConfigs.mockResolvedValue(EXPORT_FILE);
  importModelConfigs.mockResolvedValue({
    total: 1,
    imported: 1,
    failed: 0,
    rows: [{ capability: "default", ok: true, secret: "imported" }],
  });
});

describe("GET /api/v1/settings-transfer/models(导出)", () => {
  it("非本机 Host → 403(与 dispatch 同款防护)", async () => {
    const res = await GET(makeReq({ host: "evil.example.com" }));
    expect(res.status).toBe(403);
    expect(exportModelConfigs).not.toHaveBeenCalled();
  });

  it("导出 → 200 + 完整文件 + attachment 下载头", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(
      "creatoros-model-config-2026-07-17.json",
    );
    const data = (await res.json()) as typeof EXPORT_FILE;
    expect(data.kind).toBe("creatoros.model-config-export");
    expect(data.models[0]!.secretValue).toBe("enc:v1:abc"); // 密文原样(不解密)
  });
});

describe("POST /api/v1/settings-transfer/models(导入)", () => {
  it("非本机 Host → 403,不触发导入", async () => {
    const res = await POST(
      makeReq({ method: "POST", host: "evil.example.com", body: "{}" }),
    );
    expect(res.status).toBe(403);
    expect(importModelConfigs).not.toHaveBeenCalled();
  });

  it("body 非 JSON → 400", async () => {
    const res = await POST(makeReq({ method: "POST", body: "not-json{" }));
    expect(res.status).toBe(400);
    expect(importModelConfigs).not.toHaveBeenCalled();
  });

  it("合法文件 → 200 + 逐行报告透传(走 service 既有写路径)", async () => {
    const res = await POST(
      makeReq({ method: "POST", body: JSON.stringify(EXPORT_FILE) }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      report: { imported: number };
    };
    expect(data.ok).toBe(true);
    expect(data.report.imported).toBe(1);
    expect(importModelConfigs).toHaveBeenCalledTimes(1);
  });

  it("结构校验失败(ModelConfigImportError)→ 400 + 可读文案", async () => {
    importModelConfigs.mockRejectedValue(
      new ModelConfigImportError("不是 CreatorOS 模型配置导出文件(kind 不匹配)"),
    );
    const res = await POST(makeReq({ method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("kind");
  });

  it("渠道托管时导入返回 409 稳定错误码", async () => {
    importModelConfigs.mockRejectedValue(
      Object.assign(new Error("managed"), {
        code: "MODEL_CONFIGURATION_MANAGED",
      }),
    );
    const res = await POST(
      makeReq({
        method: "POST",
        body: JSON.stringify({
          kind: "creatoros.model-config-export",
          version: 1,
          models: [],
        }),
      }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "MODEL_CONFIGURATION_MANAGED",
    });
  });

  it("导入是写路径:present-but-invalid cookie(鉴权错)→ 401", async () => {
    const authErr = new Error("bad token");
    authErr.name = "AuthenticationError";
    resolveRequestContext.mockRejectedValue(authErr);
    const res = await POST(makeReq({ method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(importModelConfigs).not.toHaveBeenCalled();
  });
});
