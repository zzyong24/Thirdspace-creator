import { describe, expect, it } from "vitest";

import { tauriMacSigningOverride } from "./tauri-signing-config.mjs";

describe("Tauri macOS 构建期签名配置", () => {
  it("把 Developer ID identity 注入 Tauri bundle，确保 DMG 内 app 在封盘前已签名", () => {
    expect(
      tauriMacSigningOverride(
        { APPLE_SIGNING_IDENTITY: " Developer ID Application: Example (TEAM123) " },
        "darwin",
      ),
    ).toEqual({
      bundle: {
        macOS: {
          signingIdentity: "Developer ID Application: Example (TEAM123)",
        },
      },
    });
  });

  it("非 macOS 或未配置证书时不注入", () => {
    expect(tauriMacSigningOverride({}, "darwin")).toBeNull();
    expect(
      tauriMacSigningOverride(
        { APPLE_SIGNING_IDENTITY: "Developer ID Application: Example" },
        "win32",
      ),
    ).toBeNull();
  });

  it("本地支持包在 DMG 封盘前使用 ad-hoc 签名，但不冒充 Developer ID", () => {
    expect(
      tauriMacSigningOverride(
        { CREATOROS_LOCAL_ADHOC_SIGN: "1" },
        "darwin",
      ),
    ).toEqual({
      bundle: {
        macOS: {
          signingIdentity: "-",
        },
      },
    });
  });
});
