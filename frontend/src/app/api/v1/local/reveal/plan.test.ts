import { describe, expect, it } from "vitest";

import { planRevealTarget } from "./plan";

describe("planRevealTarget", () => {
  const windowsFile =
    "C:\\Users\\Alice Example\\CreatorOS\\media\\中文 素材.webp";

  it("win32 文件 → Explorer 选中文件，路径保持在单一 shell-free argv 中", () => {
    expect(planRevealTarget(windowsFile, "asset", "win32")).toEqual({
      cmd: "explorer.exe",
      args: [`/select,${windowsFile}`],
      completion: "spawn",
    });
  });

  it("win32 目录 → Explorer 打开目录，只等成功 spawn", () => {
    expect(
      planRevealTarget(
        "C:\\Users\\Alice Example\\CreatorOS\\projects\\项目一",
        "project",
        "win32",
      ),
    ).toEqual({
      cmd: "explorer.exe",
      args: ["C:\\Users\\Alice Example\\CreatorOS\\projects\\项目一"],
      completion: "spawn",
    });
  });

  it("darwin 文件/目录分别使用 open -R 与 open", () => {
    expect(planRevealTarget("/Users/alice/中文 素材.webp", "asset", "darwin"))
      .toEqual({
        cmd: "open",
        args: ["-R", "/Users/alice/中文 素材.webp"],
        completion: "exit",
      });
    expect(planRevealTarget("/Users/alice/项目一", "project", "darwin"))
      .toEqual({
        cmd: "open",
        args: ["/Users/alice/项目一"],
        completion: "exit",
      });
  });

  it("linux 文件打开父目录，目录本身交给 xdg-open", () => {
    expect(planRevealTarget("/home/alice/素材/片段.mp4", "asset", "linux"))
      .toEqual({
        cmd: "xdg-open",
        args: ["/home/alice/素材"],
        completion: "exit",
      });
    expect(planRevealTarget("/home/alice/项目一", "project", "linux"))
      .toEqual({
        cmd: "xdg-open",
        args: ["/home/alice/项目一"],
        completion: "exit",
      });
  });

  it("未知平台诚实拒绝，不再默认执行 macOS open", () => {
    expect(() => planRevealTarget("/tmp/file", "asset", "freebsd")).toThrow(
      "unsupported reveal platform: freebsd",
    );
  });
});
