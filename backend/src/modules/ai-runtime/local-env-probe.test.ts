import { describe, it, expect } from "vitest";
import {
  TOOL_PROBE_ALLOWLIST,
  isShellSafeToolName,
  resolveToolsToProbe,
  parseToolVersion,
} from "./local-env-probe";

describe("[T-256a] 工具探测白名单 —— 覆盖 SPEC §5 要求", () => {
  it("至少含 ffmpeg/node/python/git(SPEC 明示)", () => {
    const names = TOOL_PROBE_ALLOWLIST.map((t) => t.name);
    for (const need of ["ffmpeg", "node", "python3", "git"]) {
      expect(names).toContain(need);
    }
  });

  it("每条白名单:名字 shell 安全 + 有版本参数 + 有安装引导(缺失引导不空)", () => {
    for (const t of TOOL_PROBE_ALLOWLIST) {
      expect(isShellSafeToolName(t.name)).toBe(true);
      expect(t.versionArgs.length).toBeGreaterThan(0);
      expect(t.purpose.trim().length).toBeGreaterThan(0);
      expect(t.installHint.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("[T-256a] isShellSafeToolName —— 防注入形态门", () => {
  it("正常工具名放行", () => {
    for (const ok of ["ffmpeg", "node", "python3", "git", "yt-dlp", "ffprobe"]) {
      expect(isShellSafeToolName(ok)).toBe(true);
    }
  });

  it("含 shell 元字符/空白/路径分隔一律拒(注入锚点)", () => {
    for (const bad of [
      "git; rm -rf /",
      "ffmpeg && curl evil",
      "node | sh",
      "$(whoami)",
      "`id`",
      "../../bin/sh",
      "/usr/bin/ffmpeg",
      "ff mpeg",
      "git\nrm",
      "a'b",
      "",
      "-rf",
    ]) {
      expect(isShellSafeToolName(bad)).toBe(false);
    }
    // 非字符串输入
    expect(isShellSafeToolName(undefined)).toBe(false);
    expect(isShellSafeToolName(42 as unknown)).toBe(false);
  });
});

describe("[T-256a] resolveToolsToProbe —— 请求过滤 + 防注入", () => {
  it("空/未给 → 探全部白名单,无 rejected", () => {
    const all = resolveToolsToProbe();
    expect(all.probe.map((t) => t.name)).toEqual(
      TOOL_PROBE_ALLOWLIST.map((t) => t.name),
    );
    expect(all.rejected).toEqual([]);
    expect(resolveToolsToProbe([]).probe.length).toBe(TOOL_PROBE_ALLOWLIST.length);
  });

  it("请求子集 → 只探命中的白名单项(保白名单声明顺序,大小写/空白归一)", () => {
    const res = resolveToolsToProbe(["GIT", " ffmpeg "]);
    // 白名单里 ffmpeg 在 git 前 → 输出稳定按声明序,不按请求序
    expect(res.probe.map((t) => t.name)).toEqual(["ffmpeg", "git"]);
    expect(res.rejected).toEqual([]);
  });

  it("危险/非白名单请求全落 rejected,绝不进 probe(注入永远到不了 spawn)", () => {
    const res = resolveToolsToProbe([
      "git; rm -rf /",
      "ffmpeg && curl evil",
      "$(whoami)",
      "../../bin/sh",
      "rustc", // 合法形态但不在白名单
      "ffmpeg", // 唯一合法
    ]);
    expect(res.probe.map((t) => t.name)).toEqual(["ffmpeg"]);
    expect(res.rejected).toEqual([
      "git; rm -rf /",
      "ffmpeg && curl evil",
      "$(whoami)",
      "../../bin/sh",
      "rustc",
    ]);
  });

  it("probe 的每个元素都是白名单常量引用(不含对话拼接字符串)", () => {
    const res = resolveToolsToProbe(["ffmpeg", "node"]);
    for (const spec of res.probe) {
      expect(TOOL_PROBE_ALLOWLIST).toContain(spec);
    }
  });
});

describe("[T-256a] parseToolVersion —— 版本串解析(能拿则拿)", () => {
  it("从各家 --version 输出抓 x.y(.z)", () => {
    expect(parseToolVersion("git version 2.39.5 (Apple Git-154)")).toBe("2.39.5");
    expect(parseToolVersion("ffmpeg version 6.1.1 Copyright (c) 2000-2023")).toBe(
      "6.1.1",
    );
    expect(parseToolVersion("v20.11.0")).toBe("20.11.0");
    expect(parseToolVersion("Python 3.11.6")).toBe("3.11.6");
    expect(parseToolVersion("ffmpeg version 7.0 built with clang")).toBe("7.0");
  });

  it("拿不到版本 → null(诚实降级,不编)", () => {
    expect(parseToolVersion("")).toBeNull();
    expect(parseToolVersion("no version here")).toBeNull();
    expect(parseToolVersion(undefined)).toBeNull();
    expect(parseToolVersion(null)).toBeNull();
  });
});
