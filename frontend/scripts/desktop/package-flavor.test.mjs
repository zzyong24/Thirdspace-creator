import { describe, expect, it } from "vitest";

import {
  compilePackageBrandBuildEnv,
  compilePackageBrandBuildInput,
  compilePackagePlan,
  readPackageBrandBuildEnv,
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

  it("允许新渠道只提供品牌名，不再要求渠道专属业务链接", () => {
    expect(() =>
      validatePackageManifest({
        ...fixture,
        growthExpectations: { brandName: "TC流量中心" },
      }),
    ).not.toThrow();
  });

  it("允许渠道在清单中自定义侧栏配色，并拒绝未知字段或 CSS 注入", () => {
    const sidebar = {
      background: "#062f35",
      surfaceSubtle: "#0a4248",
      foreground: "#e4f2f2",
      mutedForeground: "#a9c2c4",
      border: "#174c52",
      brand: "#20b7a5",
      brandHover: "#1aa493",
      brandSoft: "#0d5b56",
      brandForeground: "#ffffff",
    };
    expect(() =>
      validatePackageManifest({ ...fixture, theme: { sidebar } }),
    ).not.toThrow();
    expect(() =>
      validatePackageManifest({
        ...fixture,
        theme: { sidebar: { ...sidebar, surprise: "#ffffff" } },
      }),
    ).toThrow(/未知字段/);
    expect(() =>
      validatePackageManifest({
        ...fixture,
        theme: { sidebar: { ...sidebar, background: "red;display:none" } },
      }),
    ).toThrow(/颜色/);
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

  it("生成可供 Windows closure 复用且可验真的品牌编译输入", () => {
    const input = compilePackageBrandBuildInput({
      manifest: fixture,
      iconBytes: Buffer.from([0, 1, 2, 3]),
      iconMimeType: "image/x-icon",
    });
    expect(input.schema).toBe("creatoros-package-brand-build-input/v1");
    expect(input.packageRef).toBe("test-channel");
    expect(input.iconSha256).toHaveLength(64);
    expect(readPackageBrandBuildEnv(input)).toEqual({
      NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: "测试品牌",
      NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL:
        "data:image/x-icon;base64,AAECAw==",
    });
    expect(() =>
      readPackageBrandBuildEnv({ ...input, iconSha256: "0".repeat(64) }),
    ).toThrow(/图标摘要/);
  });

  it("只在渠道显式配置时把侧栏主题编译进 WebView", () => {
    const themed = {
      ...fixture,
      theme: {
        sidebar: {
          background: "#062f35",
          surfaceSubtle: "#0a4248",
          foreground: "#e4f2f2",
          mutedForeground: "#a9c2c4",
          border: "#174c52",
          brand: "#20b7a5",
          brandHover: "#1aa493",
          brandSoft: "#0d5b56",
          brandForeground: "#ffffff",
        },
      },
    };
    const env = compilePackageBrandBuildEnv({
      manifest: themed,
      iconBytes: Buffer.from([0, 1, 2, 3]),
      iconMimeType: "image/x-icon",
    });
    expect(JSON.parse(env.NEXT_PUBLIC_CREATOROS_PACKAGE_SIDEBAR_THEME)).toEqual(
      themed.theme.sidebar,
    );
  });
});
