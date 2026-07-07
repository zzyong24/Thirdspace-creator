import { describe, it, expect } from "vitest";
import {
  resolveActivationConfig,
  DEFAULT_LICENSE_BASE_URL,
  DEFAULT_PROJECT_KEY,
  DEFAULT_GRACE_DAYS,
} from "./activation-config";
import { isDesktopRuntime } from "./is-desktop";

// T-147 P5 —— 集中配置 + 桌面判别单测。

describe("resolveActivationConfig", () => {
  it("空 env → 全默认(线上 activation-manager + test + 7 天宽限)", () => {
    const c = resolveActivationConfig({});
    expect(c.baseUrl).toBe(DEFAULT_LICENSE_BASE_URL);
    expect(c.projectKey).toBe(DEFAULT_PROJECT_KEY);
    expect(c.graceDays).toBe(DEFAULT_GRACE_DAYS);
    expect(c.injectedMachineId).toBeUndefined();
  });

  it("env 覆盖 baseUrl / projectKey / graceDays / machineId", () => {
    const c = resolveActivationConfig({
      CREATOROS_LICENSE_BASE_URL: "https://lic.internal",
      CREATOROS_LICENSE_PROJECT_KEY: "creatoros-prod",
      CREATOROS_ACTIVATION_GRACE_DAYS: "3",
      CREATOROS_MACHINE_ID: "rust-fp",
    });
    expect(c.baseUrl).toBe("https://lic.internal");
    expect(c.projectKey).toBe("creatoros-prod");
    expect(c.graceDays).toBe(3);
    expect(c.injectedMachineId).toBe("rust-fp");
  });

  it("graceDays 脏值 → 回退默认", () => {
    expect(resolveActivationConfig({ CREATOROS_ACTIVATION_GRACE_DAYS: "abc" }).graceDays).toBe(
      DEFAULT_GRACE_DAYS,
    );
    expect(resolveActivationConfig({ CREATOROS_ACTIVATION_GRACE_DAYS: "-5" }).graceDays).toBe(
      DEFAULT_GRACE_DAYS,
    );
  });

  it("graceDays=0 合法(不宽限)", () => {
    expect(resolveActivationConfig({ CREATOROS_ACTIVATION_GRACE_DAYS: "0" }).graceDays).toBe(0);
  });
});

describe("isDesktopRuntime", () => {
  it("CREATOROS_DESKTOP=1 → true(桌面壳)", () => {
    expect(isDesktopRuntime({ CREATOROS_DESKTOP: "1" })).toBe(true);
  });

  it("未设 / 其他值 → false(web/dev 跳过激活门)", () => {
    expect(isDesktopRuntime({})).toBe(false);
    expect(isDesktopRuntime({ CREATOROS_DESKTOP: "0" })).toBe(false);
    expect(isDesktopRuntime({ NODE_ENV: "production" })).toBe(false);
  });
});
