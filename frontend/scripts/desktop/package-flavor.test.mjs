import { describe, expect, it } from "vitest";

import {
  compilePackageBrandBuildEnv,
  compilePackagePlan,
  validatePackageManifest,
} from "./package-flavor.mjs";

const fixture = {
  schema: "creatoros-desktop-package/v1",
  packageRef: "test-channel",
  productRef: "creatoros",
  projectKey: "creatoros",
  expectedChannelRef: "channel_test_001",
  displayName: "测试品牌",
  binaryName: "TestBrand",
  appIdentifier: "com.example.testbrand",
  keychainService: "com.example.testbrand.desktop",
  windowsUpgradeCode: "F736C0FD-AB31-4D5A-BC0B-2BF24BB8B950",
  icons: {
    macos: { path: "assets/icon.icns", sha256: "a".repeat(64) },
    windows: { path: "assets/icon.ico", sha256: "b".repeat(64) },
  },
  growthExpectations: {
    brandName: "测试品牌",
    purchaseUrl: "https://example.com/buy/",
    renewalUrl: "https://example.com/renew/",
    downloadUrl: "https://example.com/download/",
    bugFeedbackUrl: "https://example.com/feedback/",
    channelSupportUrl: "https://example.com/support/",
  },
  updates: {
    channel: "stable",
    packageUpdateOrigin: "https://updates.example.com",
    sharedRuntimeOrigin: "https://runtime.example.com",
  },
};

describe("渠道包清单", () => {
  it("拒绝未知字段和秘密字段", () => {
    expect(() => validatePackageManifest({ ...fixture, apiKey: "secret" })).toThrow();
    expect(() => validatePackageManifest({ ...fixture, surprise: true })).toThrow();
  });

  it("生成隔离的包身份和更新命名空间", () => {
    const plan = compilePackagePlan(fixture, { target: "macos-aarch64" });
    expect(plan.packageIdentity.appIdentifier).toBe("com.example.testbrand");
    expect(plan.packageIdentity.expectedChannelRef).toBe("channel_test_001");
    expect(plan.latestUrl).toBe(
      "https://updates.example.com/updates/v2/packages/test-channel/stable/latest.json",
    );
  });

  it("把包级品牌名和受校验图标编译进 WebView，供激活前的标题与侧边栏使用", () => {
    const env = compilePackageBrandBuildEnv({
      manifest: fixture,
      iconBytes: Buffer.from([0, 1, 2, 3]),
      iconMimeType: "image/x-icon",
    });

    expect(env).toEqual({
      NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: "测试品牌",
      NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL:
        "data:image/x-icon;base64,AAECAw==",
    });
  });
});
