import { describe, expect, it } from "vitest";

import { assertLicenseProjectKey } from "./license-project-key.mjs";

describe("T-545 桌面产品级 projectKey 构建门", () => {
  it("接受统一产品 key，不把渠道编码进安装包", () => {
    expect(
      assertLicenseProjectKey({ CREATOROS_LICENSE_PROJECT_KEY: " test " }),
    ).toBe("test");
  });

  it.each([
    {},
    { CREATOROS_LICENSE_PROJECT_KEY: "" },
    { CREATOROS_LICENSE_PROJECT_KEY: "agent-42/channel" },
    { CREATOROS_LICENSE_PROJECT_KEY: "CreatorOS" },
  ])("缺失或非法 key 时在打包重活前失败", (env) => {
    expect(() => assertLicenseProjectKey(env)).toThrow(
      /CREATOROS_LICENSE_PROJECT_KEY/,
    );
  });
});
