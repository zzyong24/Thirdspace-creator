import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LocalPathViolation,
  realpathInsideRoot,
  resolveInsideRoot,
} from "./local-reveal-security";

// [T-055d gate-F1] 路径穿越 payload 测试 —— SPEC 验收 §12.3:`../../etc`、绝对路径、
// symlink 三类注入必须全部被拒。Finder route 对解析结果执行 `open`,这里是硬门。

describe("resolveInsideRoot(纯函数:.. 与绝对路径注入)", () => {
  const ROOT = "/Users/tester/CreatorOS";

  it("正常相对 key → root 下绝对路径", () => {
    expect(resolveInsideRoot(ROOT, "projects/demo-abc123/素材/a.png")).toBe(
      path.join(ROOT, "projects/demo-abc123/素材/a.png"),
    );
  });

  it("payload ①:../../etc 逃逸 → LocalPathViolation", () => {
    expect(() => resolveInsideRoot(ROOT, "../../etc/passwd")).toThrow(
      LocalPathViolation,
    );
    expect(() =>
      resolveInsideRoot(ROOT, "projects/../../../etc/passwd"),
    ).toThrow(LocalPathViolation);
  });

  it("payload ②:绝对路径 key → LocalPathViolation", () => {
    expect(() => resolveInsideRoot(ROOT, "/etc/passwd")).toThrow(
      LocalPathViolation,
    );
  });

  it("含 NUL / 空 key → LocalPathViolation", () => {
    expect(() => resolveInsideRoot(ROOT, "a\0b")).toThrow(LocalPathViolation);
    expect(() => resolveInsideRoot(ROOT, "")).toThrow(LocalPathViolation);
  });
});

describe("realpathInsideRoot(fs:symlink 逃逸)", () => {
  let tmp: string | null = null;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it("payload ③:root 内 symlink 指向 root 外 → LocalPathViolation", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reveal-sec-"));
    const root = path.join(tmp, "root");
    const outside = path.join(tmp, "outside");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    const link = path.join(root, "sneaky");
    await fs.symlink(outside, link);

    await expect(realpathInsideRoot(root, link)).rejects.toThrow(
      LocalPathViolation,
    );
  });

  it("root 内真实文件 → 返回 realpath;不存在 → null", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reveal-sec-"));
    const root = path.join(tmp, "root");
    await fs.mkdir(path.join(root, "素材"), { recursive: true });
    const file = path.join(root, "素材", "a.txt");
    await fs.writeFile(file, "x");

    const real = await realpathInsideRoot(root, file);
    expect(real).toBeTruthy();
    expect(
      await realpathInsideRoot(root, path.join(root, "素材", "missing.txt")),
    ).toBeNull();
  });
});
