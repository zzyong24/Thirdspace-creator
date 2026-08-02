import { describe, expect, it } from "vitest";

import {
  buildMacRuntimeSigningPlan,
  macRuntimeCodesignArgs,
  requiresJitEntitlements,
} from "./macos-runtime-signing.mjs";

describe("macOS sidecar runtime 公证签名计划", () => {
  it("所有 Mach-O 先签，嵌套 bundle 再按由内到外签", () => {
    expect(
      buildMacRuntimeSigningPlan({
        machOFiles: [
          "/runtime/bin/node",
          "/runtime/Browser.app/Contents/Helpers/Helper.app/Contents/MacOS/Helper",
        ],
        bundles: [
          "/runtime/Browser.app",
          "/runtime/Browser.app/Contents/Helpers/Helper.app",
        ],
      }),
    ).toEqual([
      { kind: "macho", path: "/runtime/Browser.app/Contents/Helpers/Helper.app/Contents/MacOS/Helper" },
      { kind: "macho", path: "/runtime/bin/node" },
      { kind: "bundle", path: "/runtime/Browser.app/Contents/Helpers/Helper.app" },
      { kind: "bundle", path: "/runtime/Browser.app" },
    ]);
  });

  it("使用 Developer ID、secure timestamp、hardened runtime，并只保留安全元数据", () => {
    expect(macRuntimeCodesignArgs("Developer ID Application: Example (TEAM123)", "/runtime/node"))
      .toEqual([
        "--force",
        "--options", "runtime",
        "--timestamp",
        "--preserve-metadata=identifier,entitlements",
        "--sign", "Developer ID Application: Example (TEAM123)",
        "/runtime/node",
      ]);
  });

  it("仅给 app 主进程补 JIT entitlement，并传给 codesign", () => {
    const executable = "/runtime/server.app/Contents/MacOS/creatoros-server";
    expect(requiresJitEntitlements(executable)).toBe(true);
    expect(requiresJitEntitlements("/runtime/lib/libnode.dylib")).toBe(false);
    expect(macRuntimeCodesignArgs("Developer ID Application: Example", executable, "/runtime-jit.plist"))
      .toEqual([
        "--force",
        "--options", "runtime",
        "--timestamp",
        "--preserve-metadata=identifier,entitlements",
        "--entitlements", "/runtime-jit.plist",
        "--sign", "Developer ID Application: Example",
        executable,
      ]);
  });
});
