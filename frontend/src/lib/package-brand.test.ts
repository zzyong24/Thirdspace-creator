import { describe, expect, it } from "vitest";

import { resolvePackagePublicLinks } from "./package-brand";

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
