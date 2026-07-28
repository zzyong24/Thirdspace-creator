import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MACOS_NODE_RUNTIME_POLICY,
  parseMacosMinimumFromOtool,
  validateMacosRuntimeContract,
} from "./macos-runtime-compat.mjs";

describe("T-586 macOS 随包 Node runtime 兼容契约", () => {
  it("安装包、仓库 Node 版本与已验证兼容基线一致", () => {
    const tauriConfig = JSON.parse(
      readFileSync(
        join(process.cwd(), "src-tauri", "tauri.conf.json"),
        "utf8",
      ),
    );
    const rootPackage = JSON.parse(
      readFileSync(join(process.cwd(), "..", "package.json"), "utf8"),
    );

    expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe(
      MACOS_NODE_RUNTIME_POLICY.minimumSystemVersion,
    );
    expect(rootPackage.engines.node).toBe(
      `>=${MACOS_NODE_RUNTIME_POLICY.nodeMajor} <${MACOS_NODE_RUNTIME_POLICY.nodeMajor + 1}`,
    );
  });

  it("从现代和旧式 Mach-O load command 读取最严格的最低系统版本", () => {
    expect(
      parseMacosMinimumFromOtool(`
Load command 10
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform 1
    minos 13.5
Load command 11
          cmd LC_VERSION_MIN_MACOSX
      cmdsize 16
      version 12.0
    `),
    ).toBe("13.5");
  });

  it("声明仍是 10.15 时给出可行动的人话错误", () => {
    expect(() =>
      validateMacosRuntimeContract({
        platform: "darwin",
        nodeVersion: "v25.9.0",
        nodeEngine: ">=25 <26",
        declaredMinimumSystemVersion: "10.15",
        runtimeMinimumSystemVersion: "13.5",
      }),
    ).toThrow(/旧系统必须由 macOS 在启动应用前明确拦截/);
  });

  it("随包 Node 主版本或 Mach-O minos 漂移时拒绝出包", () => {
    expect(() =>
      validateMacosRuntimeContract({
        platform: "darwin",
        nodeVersion: "v26.0.0",
        nodeEngine: ">=25 <26",
        declaredMinimumSystemVersion: "13.5",
        runtimeMinimumSystemVersion: "13.5",
      }),
    ).toThrow(/当前会复制 Node v26\.0\.0/);

    expect(() =>
      validateMacosRuntimeContract({
        platform: "darwin",
        nodeVersion: "v25.9.0",
        nodeEngine: ">=25 <26",
        declaredMinimumSystemVersion: "13.5",
        runtimeMinimumSystemVersion: "14.0",
      }),
    ).toThrow(/Mach-O minos=14\.0/);
  });

  it("build-sidecar 在任何缓存短路前执行兼容门", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "desktop", "build-sidecar.mjs"),
      "utf8",
    );
    const mainSource = source.slice(source.indexOf("function main()"));
    expect(mainSource).toContain("assertMacosRuntimeCompatibility();");
    expect(
      mainSource.indexOf("assertMacosRuntimeCompatibility();"),
    ).toBeLessThan(
      mainSource.indexOf("CREATOROS_SKIP_SIDECAR_REBUILD"),
    );
  });
});
