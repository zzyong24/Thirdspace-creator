// resolveFfmpegPath 解析链单测(T-326 RT-H09)—— 全 fake fs/env/cwd/platform,确定性覆盖:
// ① env 最高优先(且配错路径报错不降级)② 随包 sidecar 命中 ③ PATH 兜底 + 常见目录兜底
// ④ 全 miss 诚实报错(信息含安装引导 + env 配置提示)⑤ win32 语义(.exe + ";" 切 PATH)。
import { describe, expect, it } from "vitest";

import { FfmpegNotFoundError, resolveFfmpegPath } from "./ffmpeg-path";

/** fake existsSync:只认 hits 集合里的路径。 */
const existsIn =
  (...hits: string[]) =>
  (p: string) =>
    hits.includes(p);

const BASE = {
  cwd: () => "/app/sidecar/frontend",
  platform: "darwin" as NodeJS.Platform,
};

describe("resolveFfmpegPath —— 四级解析链(fake fs,不碰真文件系统)", () => {
  it("① env CREATOROS_FFMPEG_PATH 最高优先(存在即用,盖过随包与 PATH)", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: { CREATOROS_FFMPEG_PATH: "/custom/ffmpeg", PATH: "/usr/bin" },
      // 随包路径与 PATH 候选也都"存在"——仍必须选 env 指定的那把。
      existsSync: existsIn(
        "/custom/ffmpeg",
        "/app/sidecar/frontend/bin/ffmpeg",
        "/usr/bin/ffmpeg",
      ),
    });
    expect(p).toBe("/custom/ffmpeg");
  });

  it("① env 指了但文件不存在 → FfmpegNotFoundError(不静默降级去找别的 ffmpeg)", () => {
    expect(() =>
      resolveFfmpegPath({
        ...BASE,
        env: { CREATOROS_FFMPEG_PATH: "/typo/ffmpeg", PATH: "/usr/bin" },
        // PATH 上明明有 —— 但 env 配错必须暴露,不许偷偷用 PATH 的。
        existsSync: existsIn("/usr/bin/ffmpeg"),
      }),
    ).toThrowError(FfmpegNotFoundError);
    expect(() =>
      resolveFfmpegPath({
        ...BASE,
        env: { CREATOROS_FFMPEG_PATH: "/typo/ffmpeg" },
        existsSync: () => false,
      }),
    ).toThrowError(/CREATOROS_FFMPEG_PATH.*\/typo\/ffmpeg/);
  });

  it("① env 为空白串 → 视为未配,走后续解析链", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: { CREATOROS_FFMPEG_PATH: "   ", PATH: "/usr/bin" },
      existsSync: existsIn("/usr/bin/ffmpeg"),
    });
    expect(p).toBe("/usr/bin/ffmpeg");
  });

  it("② 随包 sidecar 命中 <cwd>/bin/ffmpeg(优先于 PATH)", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: { PATH: "/usr/bin" },
      existsSync: existsIn(
        "/app/sidecar/frontend/bin/ffmpeg",
        "/usr/bin/ffmpeg",
      ),
    });
    expect(p).toBe("/app/sidecar/frontend/bin/ffmpeg");
  });

  it("③ PATH 兜底:按 PATH 目录顺序取第一个命中", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: { PATH: "/a:/b:/c" },
      existsSync: existsIn("/b/ffmpeg", "/c/ffmpeg"),
    });
    expect(p).toBe("/b/ffmpeg");
  });

  it("③ PATH miss 后兜常见安装目录(macOS GUI app 的 PATH 不含 Homebrew → 兜住 /opt/homebrew/bin)", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" }, // launchd 式 PATH,无 Homebrew
      existsSync: existsIn("/opt/homebrew/bin/ffmpeg"),
    });
    expect(p).toBe("/opt/homebrew/bin/ffmpeg");
  });

  it("④ 全 miss → FfmpegNotFoundError,信息含安装引导与 CREATOROS_FFMPEG_PATH 提示(诚实报错)", () => {
    let caught: unknown;
    try {
      resolveFfmpegPath({ ...BASE, env: { PATH: "/usr/bin" }, existsSync: () => false });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FfmpegNotFoundError);
    const msg = (caught as Error).message;
    expect(msg).toContain("未找到 ffmpeg");
    expect(msg).toContain("brew install ffmpeg"); // darwin 安装引导
    expect(msg).toContain("CREATOROS_FFMPEG_PATH"); // 配置逃生门
  });

  it("⑤ win32:找 ffmpeg.exe、PATH 按 ';' 切", () => {
    const p = resolveFfmpegPath({
      cwd: () => "C:\\app\\frontend",
      platform: "win32",
      env: { PATH: "C:\\tools;D:\\ffmpeg\\bin" },
      existsSync: existsIn("D:\\ffmpeg\\bin\\ffmpeg.exe"),
    });
    expect(p).toBe("D:\\ffmpeg\\bin\\ffmpeg.exe");
  });

  it("⑤ win32:随包命中 <cwd>\\bin\\ffmpeg.exe;全 miss 的报错给 ffmpeg.org 引导", () => {
    const hit = resolveFfmpegPath({
      cwd: () => "C:\\app\\frontend",
      platform: "win32",
      env: {},
      existsSync: existsIn("C:\\app\\frontend\\bin\\ffmpeg.exe"),
    });
    expect(hit).toBe("C:\\app\\frontend\\bin\\ffmpeg.exe");
    expect(() =>
      resolveFfmpegPath({
        cwd: () => "C:\\app\\frontend",
        platform: "win32",
        env: { PATH: "C:\\tools" },
        existsSync: () => false,
      }),
    ).toThrowError(/ffmpeg\.org/);
  });

  it("PATH 未设/空目录段不炸(过滤空段后继续常见目录兜底)", () => {
    const p = resolveFfmpegPath({
      ...BASE,
      env: {}, // 无 PATH
      existsSync: existsIn("/usr/local/bin/ffmpeg"),
    });
    expect(p).toBe("/usr/local/bin/ffmpeg");
  });
});
