// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

// [T-253] local.read 授权表单测:一次授权(读一次即耗)/ 目录授权(前缀匹配 + 持久化)/
// 未授权 → null(弹确认卡)。mock server-only(纯 node 环境跑)。
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  grantOnce,
  grantAlwaysDir,
  checkGrant,
  consumeOnce,
  grantsFilePath,
  listAlwaysDirs,
  resetLocalReadGrantsForTest,
} from "./local-read-grants";

const U = "user-1";
let tmpFile: string;

beforeEach(() => {
  tmpFile = nodePath.join(
    fs.mkdtempSync(nodePath.join(os.tmpdir(), "lrg-")),
    "grants.json",
  );
  process.env.CREATOROS_LOCAL_READ_GRANTS_FILE = tmpFile;
  resetLocalReadGrantsForTest();
});

afterEach(() => {
  delete process.env.CREATOROS_LOCAL_READ_GRANTS_FILE;
  resetLocalReadGrantsForTest();
});

describe("[T-253] local-read-grants — 运行时授权表", () => {
  it("未授权 → null(弹确认卡)", () => {
    expect(checkGrant(U, "/Users/u/Desktop/a.md")).toBeNull();
  });

  it("一次授权:精确路径命中;consumeOnce 后再查回 null(读一次即耗)", () => {
    grantOnce(U, "/Users/u/Desktop/a.md");
    expect(checkGrant(U, "/Users/u/Desktop/a.md")).toBe("once");
    expect(checkGrant(U, "/Users/u/Desktop/b.md")).toBeNull(); // 不扩散到别的文件
    consumeOnce(U, "/Users/u/Desktop/a.md");
    expect(checkGrant(U, "/Users/u/Desktop/a.md")).toBeNull();
  });

  it("目录授权:目录自身 + 子路径命中;同名前缀目录不误命中", () => {
    grantAlwaysDir(U, "/Users/u/notes");
    expect(checkGrant(U, "/Users/u/notes")).toBe("dir");
    expect(checkGrant(U, "/Users/u/notes/deep/a.md")).toBe("dir");
    // 前缀相似但不是子路径(/Users/u/notes-2)不命中(拼 `${dir}/` 防误配)。
    expect(checkGrant(U, "/Users/u/notes-2/a.md")).toBeNull();
  });

  it("Windows 目录授权:盘符大小写与分隔符兼容，且同名前缀目录不误命中", () => {
    grantAlwaysDir(U, "E:\\资料\\项目");
    expect(checkGrant(U, "e:\\资料\\项目\\图片\\封面.png")).toBe("dir");
    expect(checkGrant(U, "E:/资料/项目/文稿.md")).toBe("dir");
    expect(checkGrant(U, "E:\\资料\\项目备份\\文稿.md")).toBeNull();
  });

  it("Windows UNC 目录授权:共享目录及其子路径命中", () => {
    grantAlwaysDir(U, "\\\\server\\share\\项目");
    expect(checkGrant(U, "\\\\SERVER\\SHARE\\项目\\资料.md")).toBe("dir");
    expect(checkGrant(U, "\\\\server\\share\\项目2\\资料.md")).toBeNull();
  });

  it("授权按 user 隔离:A 的授权对 B 不可见", () => {
    grantAlwaysDir(U, "/Users/u/notes");
    expect(checkGrant("user-2", "/Users/u/notes/a.md")).toBeNull();
  });

  it("目录授权持久化到 grants 文件;reset 后从磁盘恢复(「总是允许」跨进程生效)", () => {
    grantAlwaysDir(U, "/Users/u/notes");
    expect(grantsFilePath()).toBe(tmpFile);
    const onDisk = JSON.parse(fs.readFileSync(tmpFile, "utf8")) as Record<
      string,
      string[]
    >;
    expect(onDisk[U]).toContain("/Users/u/notes");
    // 模拟进程重启:清内存 → 懒加载从磁盘恢复。
    resetLocalReadGrantsForTest();
    expect(checkGrant(U, "/Users/u/notes/a.md")).toBe("dir");
  });

  it("grants 文件损坏 → 空表诚实降级(不崩,重新授权即可)", () => {
    fs.writeFileSync(tmpFile, "not-json{{{", "utf8");
    resetLocalReadGrantsForTest();
    expect(checkGrant(U, "/Users/u/notes/a.md")).toBeNull();
  });

  // [T-256a] local.workspace 端口复用本表:列「总是允许该目录」授权过的目录根。
  it("listAlwaysDirs:列已授权目录根(排序稳定)、按 user 隔离、未授权 → 空", () => {
    expect(listAlwaysDirs(U)).toEqual([]); // 还没授权过
    grantAlwaysDir(U, "/Users/u/素材");
    grantAlwaysDir(U, "/Users/u/Desktop");
    grantOnce(U, "/Users/u/once.md"); // 一次授权不算工作区目录
    expect(listAlwaysDirs(U)).toEqual(["/Users/u/Desktop", "/Users/u/素材"]);
    // user 隔离:B 看不到 A 的授权目录。
    expect(listAlwaysDirs("user-2")).toEqual([]);
  });
});
