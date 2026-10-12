import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { resolveLocalDmgLayoutEnv } from "./local-dmg-layout-env.mjs";

const flags = [
  "CREATOROS_LOCAL_DMG_HEADLESS",
  "CREATOROS_LOCAL_ADHOC_SIGN",
  "CREATOROS_LOCAL_SKIP_INSTALL",
  "CREATOROS_PACKAGE_BUILD_ONLY",
];
const optedInEnv = () => Object.fromEntries(flags.map((name) => [name, "1"]));
const localInput = (env = optedInEnv()) => ({
  platform: "darwin",
  buildOnly: true,
  isFullRelease: false,
  env,
});
const headlessEnv = { CI: "true", TAURI_BUNDLER_DMG_IGNORE_CI: "false" };

function actualTauriStepEnv(env) {
  const source = readFileSync(new URL("./package.mjs", import.meta.url), "utf8");
  expect(source).toContain(
    'import { resolveLocalDmgLayoutEnv } from "./local-dmg-layout-env.mjs";',
  );
  const start = source.indexOf('step("tauri build(含 updater 签名/占位)"');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n});", start);
  expect(end).toBeGreaterThan(start);
  let captured;
  // 执行生产中的真实 step 调用及对象展开，替换 spawn 边界以免运行构建或 App。
  runInNewContext(source.slice(start, end + 4), {
    process: { execPath: "/fixed/node", env },
    platform: "darwin",
    buildOnly: env.CREATOROS_PACKAGE_BUILD_ONLY === "1",
    pathEnv: { PATH: "/fixed/build-path" },
    tauriBuildArgs: ["actual-build-args"],
    resolveLocalDmgLayoutEnv,
    step(name, executable, args, extraEnv) {
      captured = { name, executable, args, childEnv: { ...env, ...extraEnv } };
    },
  });
  return captured;
}

describe("T-1258 显式本地无界面 DMG 配置", () => {
  it("显式本地开发包返回 Tauri 专用配置", () => {
    expect(resolveLocalDmgLayoutEnv(localInput())).toEqual(headlessEnv);
  });

  it("只返回两项配置，不修改父环境或入参", () => {
    const env = Object.freeze({
      ...optedInEnv(),
      CI: "false",
      TAURI_BUNDLER_DMG_IGNORE_CI: "true",
      UNRELATED: "preserve",
    });
    const input = Object.freeze(localInput(env));
    expect(resolveLocalDmgLayoutEnv(input)).toEqual(headlessEnv);
    expect(env.CI).toBe("false");
    expect(env.TAURI_BUNDLER_DMG_IGNORE_CI).toBe("true");
    expect(env.UNRELATED).toBe("preserve");
    expect(input.env).toBe(env);
  });

  for (const flag of flags) {
    it(`缺少 ${flag} 时保留默认布局`, () => {
      const env = optedInEnv();
      delete env[flag];
      expect(resolveLocalDmgLayoutEnv(localInput(env))).toEqual({});
    });

    for (const value of ["", "true", "0", "01", " 1", "1 ", 1, true, null]) {
      it(`${flag} 不接受字面 ${JSON.stringify(value)}`, () => {
        expect(
          resolveLocalDmgLayoutEnv(localInput({ ...optedInEnv(), [flag]: value })),
        ).toEqual({});
      });
    }
  }

  for (const platform of ["win32", "linux", undefined]) {
    it(`平台 ${String(platform)} 不启用本地无界面布局`, () => {
      expect(resolveLocalDmgLayoutEnv({ ...localInput(), platform })).toEqual({});
    });
  }
  for (const buildOnly of [false, undefined, 1, "true"]) {
    it(`buildOnly ${String(buildOnly)} 不启用本地无界面布局`, () => {
      expect(resolveLocalDmgLayoutEnv({ ...localInput(), buildOnly })).toEqual({});
    });
  }
  for (const isFullRelease of [true, undefined, 1, "false"]) {
    it(`isFullRelease ${String(isFullRelease)} 不启用本地无界面布局`, () => {
      expect(resolveLocalDmgLayoutEnv({ ...localInput(), isFullRelease })).toEqual({});
    });
  }

  it("默认正式 CI 保留原有 Finder 安装引导", () => {
    expect(resolveLocalDmgLayoutEnv(localInput({ CI: "true" }))).toEqual({});
  });
  it("缺少配置时返回空对象", () => {
    expect(resolveLocalDmgLayoutEnv()).toEqual({});
  });
  it("空环境时返回空对象", () => {
    expect(resolveLocalDmgLayoutEnv(localInput(null))).toEqual({});
  });

  it("真实 Tauri 步骤在原 T975 之后覆盖两项环境，父环境不变", () => {
    const env = Object.freeze({ ...optedInEnv(), CI: "false" });
    const actual = actualTauriStepEnv(env);
    expect(actual.name).toBe("tauri build(含 updater 签名/占位)");
    expect(actual.executable).toBe("/fixed/node");
    expect(actual.args).toEqual(["actual-build-args"]);
    expect(actual.childEnv.CI).toBe("true");
    expect(actual.childEnv.TAURI_BUNDLER_DMG_IGNORE_CI).toBe("false");
    expect(actual.childEnv.CREATOROS_SKIP_SIDECAR_REBUILD).toBe("1");
    expect(actual.childEnv.CREATOROS_ALLOW_VERDICT_SIGNING_KEY).toBe("1");
    expect(actual.childEnv.PATH).toBe("/fixed/build-path");
    expect(env.CI).toBe("false");
    expect(env.TAURI_BUNDLER_DMG_IGNORE_CI).toBeUndefined();
  });

  it("真实正式发布步骤即使四标志齐全也保留 T975 引导", () => {
    const actual = actualTauriStepEnv({
      ...optedInEnv(),
      CREATOROS_RELEASE: "1",
      CI: "true",
    });
    expect(actual.childEnv.CI).toBe("true");
    expect(actual.childEnv.TAURI_BUNDLER_DMG_IGNORE_CI).toBe("true");
  });
});
