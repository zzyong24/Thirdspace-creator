import { describe, expect, it, vi } from "vitest";
import { modelProbeRequestSchema } from "@creatoros/contract/model-probe-io";
import { createModelProbeIoService } from "./model-probe-io.service";

const ctx = { userId: "probe-user", requestId: "probe-request", source: "user" as const };
const spec = { apiFormat: "anthropic" as const, baseUrl: "http://127.0.0.1:1/v1", model: "probe-model", token: "synthetic-probe-token" };
const request = { type: "text", requestId: "probe-request", deadlineAt: 123, spec };

describe("T1411 文本探针严格 IPC 鉴权契约", () => {
  it.each([128, 8192])("T1417 文本IPC只允许已授权的输出上限 %s", textOutputLimit => {
    expect(modelProbeRequestSchema.parse({ ...request, textOutputLimit })).toEqual({ ...request, textOutputLimit });
  });

  it.each([-1, 0, 129, 32768, "8192", null])("T1417 非法输出上限 %s 在启动worker前拒绝", async textOutputLimit => {
    const entryPath = vi.fn(() => { throw new Error("不应启动 worker"); });
    const io = createModelProbeIoService({ entryPath });
    try {
      await expect(io.probeText(ctx, spec, undefined, { textOutputLimit } as never)).rejects.toThrow(/textOutputLimit/);
      expect(entryPath).not.toHaveBeenCalled();
    } finally { await io.stop(); }
  });

  it.each(["bearer", "x-api-key"] as const)("保留显式 %s，不转成默认鉴权", authStyle => {
    expect(modelProbeRequestSchema.parse({ ...request, spec: { ...spec, authStyle } })).toEqual({ ...request, spec: { ...spec, authStyle } });
  });

  it("兼容缺省鉴权的旧文本请求", () => {
    expect(modelProbeRequestSchema.parse(request)).toEqual(request);
  });

  it.each(["basic", "Bearer", "", null, 1])("非法 authStyle=%s 在启动 worker 前拒绝", async authStyle => {
    const entryPath = vi.fn(() => { throw new Error("不应启动 worker"); });
    const io = createModelProbeIoService({ entryPath });
    try {
      const invalid = { ...spec, authStyle } as unknown as Parameters<typeof io.probeText>[1];
      await expect(io.probeText(ctx, invalid)).rejects.toThrow(/authStyle/);
      expect(entryPath).not.toHaveBeenCalled();
    } finally { await io.stop(); }
  });

  it("图片请求保持原严格契约，不接受文本 authStyle 或任意 headers", () => {
    const image = { ...request, type: "image", spec: { provider: "openai", baseUrl: spec.baseUrl, model: spec.model, token: spec.token } };
    expect(modelProbeRequestSchema.parse(image)).toEqual(image);
    expect(modelProbeRequestSchema.safeParse({ ...image, textOutputLimit: 8192 }).success).toBe(false);
    expect(modelProbeRequestSchema.safeParse({ ...image, spec: { ...image.spec, authStyle: "bearer" } }).success).toBe(false);
    expect(modelProbeRequestSchema.safeParse({ ...request, spec: { ...spec, headers: { authorization: "Bearer injected" } } }).success).toBe(false);
  });
});
