import { describe, expect, it } from "vitest";

import {
  ExecutablePathConfigurationError,
  resolveExecutablePath,
} from "./executable-path";

const existsIn =
  (...hits: string[]) =>
  (candidate: string) =>
    hits.includes(candidate);

describe("resolveExecutablePath", () => {
  it("ESM 调用未注入文件检查器时可读取真实可执行文件", () => {
    expect(
      resolveExecutablePath("node", {
        env: { PATH: "" },
        preferredPaths: [process.execPath],
      }),
    ).toBe(process.execPath);
  });

  it("显式工具路径最高优先，配置错误时不静默回落", () => {
    expect(
      resolveExecutablePath("ffprobe", {
        platform: "darwin",
        cwd: () => "/runtime/frontend",
        env: {
          CREATOROS_FFPROBE_PATH: "/custom/ffprobe",
          CREATOROS_BIN_DIR: "/runtime/frontend/bin",
          PATH: "/usr/bin",
        },
        explicitEnvVar: "CREATOROS_FFPROBE_PATH",
        bundled: true,
        existsSync: existsIn(
          "/custom/ffprobe",
          "/runtime/frontend/bin/ffprobe",
          "/usr/bin/ffprobe",
        ),
      }),
    ).toBe("/custom/ffprobe");

    expect(() =>
      resolveExecutablePath("ffprobe", {
        platform: "darwin",
        cwd: () => "/runtime/frontend",
        env: {
          CREATOROS_FFPROBE_PATH: "/typo/ffprobe",
          PATH: "/usr/bin",
        },
        explicitEnvVar: "CREATOROS_FFPROBE_PATH",
        bundled: true,
        existsSync: existsIn("/usr/bin/ffprobe"),
      }),
    ).toThrowError(ExecutablePathConfigurationError);
  });

  it("随包目录使用壳层注入的 CREATOROS_BIN_DIR，不依赖 process.cwd()", () => {
    expect(
      resolveExecutablePath("ffmpeg", {
        platform: "darwin",
        cwd: () => "/wrong/cwd",
        env: {
          CREATOROS_BIN_DIR: "/app-data/runtime/0.1.0/sidecar/frontend/bin",
          PATH: "/usr/bin",
        },
        bundled: true,
        existsSync: existsIn(
          "/app-data/runtime/0.1.0/sidecar/frontend/bin/ffmpeg",
        ),
      }),
    ).toBe("/app-data/runtime/0.1.0/sidecar/frontend/bin/ffmpeg");
  });

  it("开发态无壳层注入时回落 cwd/bin，再回落 PATH 与 macOS GUI 常见目录", () => {
    expect(
      resolveExecutablePath("ffmpeg", {
        platform: "darwin",
        cwd: () => "/repo/frontend",
        env: { PATH: "/usr/bin" },
        bundled: true,
        existsSync: existsIn("/repo/frontend/bin/ffmpeg"),
      }),
    ).toBe("/repo/frontend/bin/ffmpeg");

    expect(
      resolveExecutablePath("git", {
        platform: "darwin",
        cwd: () => "/repo/frontend",
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        existsSync: existsIn("/opt/homebrew/bin/git"),
      }),
    ).toBe("/opt/homebrew/bin/git");
  });

  it("Windows 使用 .exe、分号 PATH，并支持带空格的随包绝对目录", () => {
    expect(
      resolveExecutablePath("ffprobe", {
        platform: "win32",
        cwd: () => "D:\\wrong",
        env: {
          CREATOROS_BIN_DIR:
            "C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\runtime\\sidecar\\frontend\\bin",
          PATH: "C:\\Windows\\System32;D:\\tools",
        },
        bundled: true,
        existsSync: existsIn(
          "C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\runtime\\sidecar\\frontend\\bin\\ffprobe.exe",
        ),
      }),
    ).toContain("\\ffprobe.exe");
  });

  it("未命中返回 null，供可选依赖诚实显示未安装", () => {
    expect(
      resolveExecutablePath("python3", {
        platform: "linux",
        cwd: () => "/app",
        env: {},
        existsSync: () => false,
      }),
    ).toBeNull();
  });
});
