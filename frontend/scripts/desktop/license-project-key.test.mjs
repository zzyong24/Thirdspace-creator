import { describe, expect, it } from "vitest";

import { assertLicenseProjectKey } from "./license-project-key.mjs";

describe("T-635 桌面产品级 projectKey 构建门", () => {
  it("所有可分发包只接受 Growth CreatorOS 商品的 exact key", () => {
    expect(
      assertLicenseProjectKey({ CREATOROS_LICENSE_PROJECT_KEY: " creatoros " }),
    ).toBe("creatoros");
  });

  it.each([
    {},
    { CREATOROS_LICENSE_PROJECT_KEY: "" },
    { CREATOROS_LICENSE_PROJECT_KEY: "test" },
    { CREATOROS_LICENSE_PROJECT_KEY: "other-valid-product" },
    { CREATOROS_LICENSE_PROJECT_KEY: "agent-42/channel" },
    { CREATOROS_LICENSE_PROJECT_KEY: "CreatorOS" },
  ])("缺失、test、其它合法产品或格式非法 key 均在打包重活前失败", (env) => {
    expect(() => assertLicenseProjectKey(env)).toThrow(
      /CREATOROS_LICENSE_PROJECT_KEY.*creatoros/,
    );
  });
});
