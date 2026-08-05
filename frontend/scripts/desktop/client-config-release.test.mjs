import { describe, expect, it } from "vitest";

import { assertClientConfigBuildEnv } from "./client-config-release.mjs";

const key = Buffer.alloc(32, 7).toString("base64");

describe("T-679 渠道配置构建材料", () => {
  it("关闭拉取时允许本地普通测试包不配置 Growth 验签材料", () => {
    expect(assertClientConfigBuildEnv({})).toEqual({ enabled: false });
  });

  it("开启拉取时只接受正式 Growth origin、32B Ed25519 公钥和安全 keyId", () => {
    expect(assertClientConfigBuildEnv({
      CREATOROS_CLIENT_CONFIG_PULL_ENABLED: "1",
      CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://growth.aitongban.cloud",
      CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: key,
      CREATOROS_GROWTH_CONFIG_KEY_ID: "growth-config-prod-01",
    })).toEqual({
      enabled: true,
      origin: "https://growth.aitongban.cloud",
      keyId: "growth-config-prod-01",
    });
  });

  it.each([
    ["缺 origin", { CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: key, CREATOROS_GROWTH_CONFIG_KEY_ID: "key-1" }],
    ["错 origin", { CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://example.com", CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: key, CREATOROS_GROWTH_CONFIG_KEY_ID: "key-1" }],
    ["错公钥", { CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://growth.aitongban.cloud", CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: "bad", CREATOROS_GROWTH_CONFIG_KEY_ID: "key-1" }],
    ["错 keyId", { CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://growth.aitongban.cloud", CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: key, CREATOROS_GROWTH_CONFIG_KEY_ID: "bad key" }],
  ])("%s 时正式构建立即失败", (_name, values) => {
    expect(() => assertClientConfigBuildEnv({
      CREATOROS_CLIENT_CONFIG_PULL_ENABLED: "1",
      ...values,
    })).toThrow(/T-679/);
  });
});
