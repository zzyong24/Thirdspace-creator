import { describe, expect, it } from "vitest";

import { notarizeConfig, notarytoolSubmitArgs } from "./notarize.mjs";

describe("T-640 macOS 公证凭据", () => {
  it("优先使用 macOS 钥匙串 profile，命令行不携带明文密码", () => {
    const cfg = notarizeConfig(
      {
        APPLE_NOTARY_KEYCHAIN_PROFILE: "CreatorOS-Notary",
        APPLE_NOTARY_KEYCHAIN_PATH: "/tmp/creatoros-ci.keychain-db",
        APPLE_ID: "legacy@example.com",
        APPLE_TEAM_ID: "TEAM123",
        APPLE_APP_PASSWORD: "must-not-leak",
      },
      "darwin",
    );

    expect(cfg).toMatchObject({
      configured: true,
      method: "keychain-profile",
      keychainProfile: "CreatorOS-Notary",
      keychainPath: "/tmp/creatoros-ci.keychain-db",
    });
    const args = notarytoolSubmitArgs("CreatorOS.dmg", cfg);
    expect(args).toEqual([
      "notarytool",
      "submit",
      "CreatorOS.dmg",
      "--keychain-profile",
      "CreatorOS-Notary",
      "--keychain",
      "/tmp/creatoros-ci.keychain-db",
      "--wait",
    ]);
    expect(args.join(" ")).not.toContain("must-not-leak");
  });

  it("本机登录钥匙串 profile 未指定路径时保持原有调用", () => {
    const cfg = notarizeConfig(
      { APPLE_NOTARY_KEYCHAIN_PROFILE: "CreatorOS-Notary" },
      "darwin",
    );
    expect(notarytoolSubmitArgs("CreatorOS.dmg", cfg)).toEqual([
      "notarytool",
      "submit",
      "CreatorOS.dmg",
      "--keychain-profile",
      "CreatorOS-Notary",
      "--wait",
    ]);
  });

  it("继续兼容 Apple ID + app-specific password", () => {
    const cfg = notarizeConfig(
      {
        APPLE_ID: "owner@example.com",
        APPLE_TEAM_ID: "TEAM123",
        APPLE_APP_PASSWORD: "app-password",
      },
      "darwin",
    );

    expect(cfg).toMatchObject({ configured: true, method: "apple-id" });
    expect(notarytoolSubmitArgs("CreatorOS.dmg", cfg)).toEqual([
      "notarytool",
      "submit",
      "CreatorOS.dmg",
      "--apple-id",
      "owner@example.com",
      "--team-id",
      "TEAM123",
      "--password",
      "app-password",
      "--wait",
    ]);
  });

  it("凭据不完整时如实标记未配置", () => {
    expect(notarizeConfig({}, "darwin")).toMatchObject({
      applicable: true,
      configured: false,
    });
    expect(notarizeConfig({}, "win32")).toEqual({
      platform: "win32",
      applicable: false,
      configured: false,
    });
  });
});
