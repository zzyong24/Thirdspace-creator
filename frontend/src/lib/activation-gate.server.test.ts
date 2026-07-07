import { describe, it, expect, vi, beforeEach } from "vitest";

// T-147 P5 —— 激活门判据(桌面拦 / web 跳)单测。
// getActivationService 注桩(不启真 persistence);验:
//   - web/dev(CREATOROS_DESKTOP 未设)→ 永远放行,且**不触碰** service(不启激活校验/不联网)。
//   - 桌面态(CREATOROS_DESKTOP=1)→ 走 service.check(),据 allowed 放行/拦。

const check = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getActivationService: async () => ({ check }),
}));

async function importGate() {
  return (await import("./activation-gate.server")).isActivationAllowed;
}

beforeEach(() => {
  check.mockReset();
  vi.resetModules();
});

describe("isActivationAllowed", () => {
  it("web/dev(无 CREATOROS_DESKTOP)→ 放行,且不调 service.check()", async () => {
    const isActivationAllowed = await importGate();
    const allowed = await isActivationAllowed({});
    expect(allowed).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it("CREATOROS_DESKTOP=0 也算 web → 放行不校验", async () => {
    const isActivationAllowed = await importGate();
    expect(await isActivationAllowed({ CREATOROS_DESKTOP: "0" })).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it("桌面态已激活(check.allowed=true)→ 放行", async () => {
    check.mockResolvedValue({ status: "active", allowed: true });
    const isActivationAllowed = await importGate();
    expect(await isActivationAllowed({ CREATOROS_DESKTOP: "1" })).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("桌面态未激活(check.allowed=false)→ 拦(gate 会 redirect /activate)", async () => {
    check.mockResolvedValue({ status: "inactive", allowed: false });
    const isActivationAllowed = await importGate();
    expect(await isActivationAllowed({ CREATOROS_DESKTOP: "1" })).toBe(false);
  });

  it("桌面态离线宽限(check.allowed=true, status=grace)→ 放行", async () => {
    check.mockResolvedValue({ status: "grace", allowed: true });
    const isActivationAllowed = await importGate();
    expect(await isActivationAllowed({ CREATOROS_DESKTOP: "1" })).toBe(true);
  });
});
