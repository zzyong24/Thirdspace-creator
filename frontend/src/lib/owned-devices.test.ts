import { describe, expect, it } from "vitest";
import { parseOwnedDeviceView, safeVerificationUrl } from "./owned-devices";

describe("本人设备连接的原生边界", () => {
  it("只接收可展示状态，拒绝原生秘密与设备标识", () => {
    const value = { state: "waiting", intent: "register_device", userCode: "ABCD-EFGH", verificationUrl: "https://growth.aitongban.cloud/products/connect#code=ABCD-EFGH", expiresAt: "2026-10-08T00:10:00.000Z", retryAfterSeconds: 5, message: "请在浏览器确认" };
    expect(parseOwnedDeviceView(value).state).toBe("waiting");
    expect(() => parseOwnedDeviceView({ ...value, deviceSecret: "secret" })).toThrow();
    expect(() => parseOwnedDeviceView({ ...value, machineId: "machine" })).toThrow();
  });
  it("官方确认链接只携带短码，不接受其他页面或来源", () => {
    expect(safeVerificationUrl("https://growth.aitongban.cloud/products/connect#code=ABCD-EFGH")).toContain("#code=");
    for (const url of ["https://attacker.test/products/connect#code=ABCD-EFGH", "https://growth.aitongban.cloud/products/connect?secret=hidden", "https://growth.aitongban.cloud/other#code=ABCD-EFGH"]) expect(() => safeVerificationUrl(url)).toThrow();
  });
});
