import { describe, expect, it } from "vitest";

import {
  resolvePackagePublicLinks,
  resolvePackageSidebarThemeStyle,
} from "./package-brand";

describe("T-729 包级公开入口", () => {
  it("渠道包缺字段或字段非法时诚实为空，不回退 CreatorOS 官方入口", () => {
    expect(
      resolvePackagePublicLinks({
        NEXT_PUBLIC_CREATOROS_PACKAGE_REF: "test-channel",
        NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL:
          "https://creatoros.aitongban.cloud/",
        NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL: "javascript:alert(1)",
      }),
    ).toEqual({
      websiteUrl: null,
      downloadUrl: null,
      humanFeedbackUrl: null,
      updateManifestUrl: null,
    });
  });

  it("官方包才使用官方缺省入口", () => {
    const links = resolvePackagePublicLinks({});
    expect(links.websiteUrl).toBe("https://creatoros.aitongban.cloud/");
    expect(links.downloadUrl).toBe("https://creatoros.aitongban.cloud/");
    expect(links.humanFeedbackUrl).toContain("my.feishu.cn");
    expect(links.updateManifestUrl).toContain("/updates/latest.json");
  });
});

describe("渠道包侧栏主题", () => {
  it("未配置或配置非法时不注入任何样式，保留官方默认配色", () => {
    expect(resolvePackageSidebarThemeStyle(undefined)).toEqual({});
    expect(resolvePackageSidebarThemeStyle("not-json")).toEqual({});
    expect(
      resolvePackageSidebarThemeStyle(
        JSON.stringify({
          background: "red;display:none",
          surfaceSubtle: "#0a4248",
          foreground: "#e4f2f2",
          mutedForeground: "#a9c2c4",
          border: "#174c52",
          brand: "#20b7a5",
          brandHover: "#1aa493",
          brandSoft: "#0d5b56",
          brandForeground: "#ffffff",
        }),
      ),
    ).toEqual({});
  });

  it("把任意渠道清单中的受校验颜色映射为侧栏局部变量", () => {
    const style = resolvePackageSidebarThemeStyle(
      JSON.stringify({
        background: "#062f35",
        surfaceSubtle: "#0a4248",
        foreground: "#e4f2f2",
        mutedForeground: "#a9c2c4",
        border: "#174c52",
        brand: "#20b7a5",
        brandHover: "#1aa493",
        brandSoft: "#0d5b56",
        brandForeground: "#ffffff",
      }),
    );
    expect(style.backgroundColor).toBe("#062f35");
    expect(style["--creatoros-brand"]).toBe("#20b7a5");
    expect(style["--sidebar-foreground"]).toBe("#e4f2f2");
  });
});
