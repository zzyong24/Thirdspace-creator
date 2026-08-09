import { describe, expect, it } from "vitest";

import { createMachineSupportRef } from "./machine-support-ref.server";

describe("createMachineSupportRef", () => {
  it("只返回不可逆、截断的支持引用，不包含完整设备标识", () => {
    const machineId = "MACHINE-abcdef0123456789-XYZ";
    const supportRef = createMachineSupportRef(machineId);
    expect(supportRef).toMatch(/^SUP-[A-Za-z0-9_-]{16}$/);
    expect(supportRef).not.toContain(machineId);
    expect(supportRef).not.toContain("abcdef0123456789");
  });

  it("同一启动内确定，跨设备不同，空值不伪造", () => {
    expect(createMachineSupportRef("machine-a")).toBe(
      createMachineSupportRef("machine-a"),
    );
    expect(createMachineSupportRef("machine-a")).not.toBe(
      createMachineSupportRef("machine-b"),
    );
    expect(createMachineSupportRef(null)).toBeNull();
    expect(createMachineSupportRef("   ")).toBeNull();
  });
});
