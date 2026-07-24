import { describe, it, expect, vi, beforeEach } from "vitest";

// T-451 gate-F1/F2：打包态只认 sidecar instrumentation 验证 verdict token 后写入的
// CREATOROS_VERDICT_MODE。旧 `.license` 读取与 legacy service.check() 回退均已移除；
// 本地开发必须同时满足非 production + 显式 CREATOROS_DEV_MODE=1。

async function importGate() {
  return (await import("./activation-gate.server")).isActivationAllowed;
}

beforeEach(() => {
  vi.resetModules();
});

describe("isActivationAllowed", () => {
  it("本地开发显式开启 DEV_MODE → 放行", async () => {
    const isActivationAllowed = await importGate();
    expect(
      await isActivationAllowed({
        NODE_ENV: "development",
        CREATOROS_DEV_MODE: "1",
      }),
    ).toBe(true);
  });

  it("production 即使伪造 DEV_MODE 也不能绕过 verdict 门", async () => {
    const isActivationAllowed = await importGate();
    expect(
      await isActivationAllowed({
        NODE_ENV: "production",
        CREATOROS_DEV_MODE: "1",
      }),
    ).toBe(false);
  });

  it("打包态 licensed → 放行", async () => {
    const isActivationAllowed = await importGate();
    expect(
      await isActivationAllowed({
        NODE_ENV: "production",
        CREATOROS_VERDICT_MODE: "licensed",
      }),
    ).toBe(true);
  });

  it("activation-only 与缺失 verdict → 拒绝", async () => {
    const isActivationAllowed = await importGate();
    expect(
      await isActivationAllowed({
        NODE_ENV: "production",
        CREATOROS_VERDICT_MODE: "activation-only",
      }),
    ).toBe(false);
    expect(await isActivationAllowed({ NODE_ENV: "production" })).toBe(false);
  });
});
