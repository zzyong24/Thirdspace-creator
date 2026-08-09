import { describe, expect, it, vi } from "vitest";
import {
  buildLocalPackageEnv,
  canonicalLocalArtifactName,
  installAndLaunchLocalMacApp,
  publishCanonicalLocalArtifact,
} from "./package-local.mjs";

const signingPath = "/test-home/.creatoros/verdict-signing.key";
const publicPath = "/test-home/.creatoros/verdict-public.key";

function fakeReadFile(path) {
  if (path === signingPath) return " local-signing-key\n";
  if (path === publicPath) return "local-public-key\n";
  throw new Error(`missing ${path}`);
}

describe("buildLocalPackageEnv", () => {
  it("一次补齐 CreatorOS 本地包所需的固定配置和安全密钥", () => {
    const env = buildLocalPackageEnv({
      baseEnv: {},
      homeDir: "/test-home",
      readFile: fakeReadFile,
    });

    expect(env).toMatchObject({
      CREATOROS_LICENSE_PROJECT_KEY: "creatoros",
      CREATOROS_CLIENT_CONFIG_PULL_ENABLED: "1",
      CREATOROS_LOCAL_ADHOC_SIGN: "1",
      CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: "https://growth.aitongban.cloud",
      CREATOROS_GROWTH_CONFIG_KEY_ID: "growth-client-config-20260805-01",
      CREATOROS_VERDICT_SIGNING_KEY_B64: "local-signing-key",
      CREATOROS_VERDICT_PUBKEY_B64: "local-public-key",
    });
  });

  it("尊重显式传入的环境，不读取或覆盖现有密钥", () => {
    const env = buildLocalPackageEnv({
      baseEnv: {
        CREATOROS_LICENSE_PROJECT_KEY: "creatoros",
        CREATOROS_VERDICT_SIGNING_KEY_B64: "explicit-signing",
        CREATOROS_VERDICT_PUBKEY_B64: "explicit-public",
      },
      homeDir: "/missing-home",
      readFile: () => {
        throw new Error("must not read");
      },
    });

    expect(env.CREATOROS_VERDICT_SIGNING_KEY_B64).toBe("explicit-signing");
    expect(env.CREATOROS_VERDICT_PUBKEY_B64).toBe("explicit-public");
  });

  it("缺少本机安全密钥时在重型构建前给出明确错误", () => {
    expect(() =>
      buildLocalPackageEnv({
        baseEnv: {},
        homeDir: "/missing-home",
        readFile: () => {
          throw new Error("ENOENT");
        },
      }),
    ).toThrow(/缺少本机安全密钥/);
  });
});

describe("本地验收包交付名", () => {
  it("只暴露产品名和版本号，不把架构、任务号或时间戳塞给用户", () => {
    expect(
      canonicalLocalArtifactName({
        displayName: "CreatorOS",
        version: "0.3.0",
        extension: ".dmg",
      }),
    ).toBe("CreatorOS-0.3.0.dmg");
  });

  it("把最新构建产物复制到 Downloads 下的唯一固定名称", () => {
    const copyFile = vi.fn();
    const target = publishCanonicalLocalArtifact({
      frontendDir: "/workspace/frontend",
      homeDir: "/Users/tester",
      platformName: "darwin",
      readFile: () => JSON.stringify({ version: "0.3.0" }),
      readDir: () => ["CreatorOS_0.3.0_aarch64.dmg"],
      stat: () => ({ mtimeMs: 100 }),
      exists: () => true,
      ensureDir: vi.fn(),
      copyFile,
    });

    expect(target).toBe("/Users/tester/Downloads/CreatorOS-0.3.0.dmg");
    expect(copyFile).toHaveBeenCalledWith(
      "/workspace/frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.3.0_aarch64.dmg",
      target,
    );
  });

  it("渠道包使用渠道展示名生成独立验收包名", () => {
    const copyFile = vi.fn();
    const target = publishCanonicalLocalArtifact({
      frontendDir: "/workspace/frontend",
      homeDir: "/Users/tester",
      displayName: "智溯AI",
      platformName: "darwin",
      readFile: () => JSON.stringify({ version: "0.3.0" }),
      readDir: () => ["智溯AI_0.3.0_aarch64.dmg"],
      stat: () => ({ mtimeMs: 100 }),
      exists: () => true,
      ensureDir: vi.fn(),
      copyFile,
    });

    expect(target).toBe("/Users/tester/Downloads/智溯AI-0.3.0.dmg");
    expect(copyFile).toHaveBeenCalledWith(
      "/workspace/frontend/src-tauri/target/release-fast/bundle/dmg/智溯AI_0.3.0_aarch64.dmg",
      target,
    );
  });
});

describe("macOS 本地验收包安装交付", () => {
  it("默认原子替换唯一 CreatorOS.app，启动后确认真实应用进程", () => {
    const remove = vi.fn();
    const rename = vi.fn();
    const commands = [];
    const sourceApp =
      "/workspace/frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app";
    const stagingApp = "/Applications/.CreatorOS.app.installing-4242";
    const targetApp = "/Applications/CreatorOS.app";
    const spawn = vi.fn((command, args) => {
      commands.push([command, args]);
      if (command === "pgrep") return { status: 0, stdout: "12345\n" };
      return { status: 0, stdout: "" };
    });

    const result = installAndLaunchLocalMacApp({
      frontendDir: "/workspace/frontend",
      platformName: "darwin",
      processId: 4242,
      exists: (path) => path === sourceApp || path === stagingApp,
      remove,
      rename,
      spawn,
    });

    expect(result).toEqual({
      skipped: false,
      appPath: targetApp,
      processId: "12345",
    });
    expect(commands).toContainEqual(["ditto", [sourceApp, stagingApp]]);
    expect(commands).toContainEqual(["open", [targetApp]]);
    expect(commands).toContainEqual([
      "pgrep",
      ["-f", "/Applications/CreatorOS.app/Contents/MacOS/CreatorOS"],
    ]);
    expect(remove).toHaveBeenCalledWith(stagingApp, {
      recursive: true,
      force: true,
    });
    expect(remove).toHaveBeenCalledWith(targetApp, {
      recursive: true,
      force: true,
    });
    expect(rename).toHaveBeenCalledWith(stagingApp, targetApp);
    expect(remove.mock.calls.flat().join(" ")).not.toMatch(/pre-|before-|backup-/);
  });

  it("找不到本轮构建的 App 时禁止碰 /Applications", () => {
    const remove = vi.fn();
    expect(() =>
      installAndLaunchLocalMacApp({
        frontendDir: "/workspace/frontend",
        platformName: "darwin",
        exists: () => false,
        remove,
        spawn: vi.fn(),
      }),
    ).toThrow(/没有找到本轮构建的 CreatorOS\.app/);
    expect(remove).not.toHaveBeenCalled();
  });

  it("非 macOS 只交付安装包，不擅自运行平台安装器", () => {
    const spawn = vi.fn();
    expect(
      installAndLaunchLocalMacApp({
        frontendDir: "/workspace/frontend",
        platformName: "win32",
        spawn,
      }),
    ).toEqual({ skipped: true, reason: "unsupported-platform" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("渠道包安装到独立应用名并按渠道二进制确认真实进程", () => {
    const commands = [];
    const sourceApp =
      "/workspace/frontend/src-tauri/target/release-fast/bundle/macos/智溯AI.app";
    const stagingApp = "/Applications/.智溯AI.app.installing-717";
    const spawn = vi.fn((command, args) => {
      commands.push([command, args]);
      if (command === "pgrep") return { status: 0, stdout: "71717\n" };
      return { status: 0, stdout: "" };
    });

    const result = installAndLaunchLocalMacApp({
      frontendDir: "/workspace/frontend",
      displayName: "智溯AI",
      binaryName: "ZhisuAI",
      platformName: "darwin",
      processId: 717,
      exists: (path) => path === sourceApp || path === stagingApp,
      remove: vi.fn(),
      rename: vi.fn(),
      spawn,
    });

    expect(result).toEqual({
      skipped: false,
      appPath: "/Applications/智溯AI.app",
      processId: "71717",
    });
    expect(commands).toContainEqual([
      "pgrep",
      ["-f", "/Applications/智溯AI.app/Contents/MacOS/ZhisuAI"],
    ]);
  });
});
