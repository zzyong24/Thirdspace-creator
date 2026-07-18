import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LicenseVerdict } from "@/server/activation/license-file.server";

// T-147 P5 → [T-372 L2] 激活门判据单测。
//
// 新语义(SPEC §9):桌面态放行权威 = Rust 侧 `.license` 放行快照(readVerdict 注桩),
// 门只认 verdict.allowed,不再调 sidecar 状态机;`.license` 缺失时:
//   · 强验签(默认)→ 拦(= 未激活);
//   · gate-F2 弱验签(CREATOROS_LICENSE_STRICT_VERIFY=0)→ 回退 P5 legacy check()。
// P5 不变式锚死:web/dev(isDesktopRuntime=false)永远放行,且不触碰 verdict/service。

const check = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getActivationService: async () => ({ check }),
}));

async function importGate() {
  return (await import("./activation-gate.server")).isActivationAllowed;
}

function verdict(over: Partial<LicenseVerdict> = {}): LicenseVerdict {
  return {
    v: 1,
    allowed: true,
    status: "active",
    signatureVerified: true,
    ...over,
  };
}

beforeEach(() => {
  check.mockReset();
  vi.resetModules();
});

describe("isActivationAllowed", () => {
  it("web/dev(无 CREATOROS_DESKTOP)→ 放行,不读 .license、不调 service.check()", async () => {
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn();
    const allowed = await isActivationAllowed({}, { readVerdict });
    expect(allowed).toBe(true);
    expect(readVerdict).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it("CREATOROS_DESKTOP=0 也算 web → 放行不校验", async () => {
    const isActivationAllowed = await importGate();
    expect(await isActivationAllowed({ CREATOROS_DESKTOP: "0" })).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it("桌面态 .license allowed=true → 放行(不再调 sidecar check)", async () => {
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn(async () => verdict({ allowed: true }));
    expect(
      await isActivationAllowed({ CREATOROS_DESKTOP: "1" }, { readVerdict }),
    ).toBe(true);
    expect(readVerdict).toHaveBeenCalledTimes(1);
    expect(check).not.toHaveBeenCalled();
  });

  it("桌面态 .license allowed=false(过期/回拨/不可信)→ 拦(redirect /activate)", async () => {
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn(async () => verdict({ allowed: false, status: "expired" }));
    expect(
      await isActivationAllowed({ CREATOROS_DESKTOP: "1" }, { readVerdict }),
    ).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("桌面态无 .license + 强验签(默认)→ 拦,且不回退 legacy check", async () => {
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn(async () => null);
    expect(
      await isActivationAllowed({ CREATOROS_DESKTOP: "1" }, { readVerdict }),
    ).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("桌面态无 .license + 弱验签(gate-F2 flag=0)→ 回退 P5 legacy check()", async () => {
    check.mockResolvedValue({ status: "active", allowed: true });
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn(async () => null);
    expect(
      await isActivationAllowed(
        { CREATOROS_DESKTOP: "1", CREATOROS_LICENSE_STRICT_VERIFY: "0" },
        { readVerdict },
      ),
    ).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    // legacy 也拦得住。
    check.mockResolvedValue({ status: "inactive", allowed: false });
    expect(
      await isActivationAllowed(
        { CREATOROS_DESKTOP: "1", CREATOROS_LICENSE_STRICT_VERIFY: "0" },
        { readVerdict },
      ),
    ).toBe(false);
  });

  it("桌面态离线宽限(verdict status=grace, allowed=true)→ 放行", async () => {
    const isActivationAllowed = await importGate();
    const readVerdict = vi.fn(async () => verdict({ status: "grace", allowed: true }));
    expect(
      await isActivationAllowed({ CREATOROS_DESKTOP: "1" }, { readVerdict }),
    ).toBe(true);
  });
});
