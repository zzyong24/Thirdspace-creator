// @vitest-environment node
// [T-1409] Windows 句柄占用:目录 rename 报 EPERM/EBUSY 时的重试与复制回退。
// 只替换 rename 注入错误码,cp/rm/stat 走真文件系统。
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameFailures: string[] = [];

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      const code = renameFailures.shift();
      if (code) throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
      return actual.rename(from, to);
    },
  };
});

vi.mock("node:timers/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:timers/promises")>()),
  setTimeout: async () => undefined,
}));

const {
  adoptDouyinStagingDir,
  createDouyinStagingToken,
  douyinStagingDirFor,
  prepareDouyinStagingAdoption,
} = await import("./douyin-auth-staging");

let base: string;
beforeEach(async () => {
  renameFailures.length = 0;
  base = await mkdtemp(nodePath.join(tmpdir(), "douyin-auth-lock-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const exists = async (p: string) => (await stat(p).catch(() => null)) !== null;

async function makeStaging(content: string) {
  const staging = douyinStagingDirFor(base, createDouyinStagingToken());
  await mkdir(nodePath.join(staging, "Default"), { recursive: true });
  await writeFile(nodePath.join(staging, "Default", "Cookies"), content);
  return staging;
}

describe("Windows 目录占用", () => {
  it("短暂 EPERM/EBUSY 后重试 rename 成功", async () => {
    const staging = await makeStaging("session");
    const target = nodePath.join(base, "acct-1");
    renameFailures.push("EPERM", "EBUSY");

    await adoptDouyinStagingDir(staging, target);

    expect(renameFailures).toHaveLength(0);
    expect(await readFile(nodePath.join(target, "Default", "Cookies"), "utf8")).toBe("session");
    expect(await exists(staging)).toBe(false);
  });

  it("rename 持续 EPERM → 复制到正式目录并删除临时目录", async () => {
    const staging = await makeStaging("session");
    const target = nodePath.join(base, "acct-2");
    await writeFile(nodePath.join(staging, "lockfile"), "");
    renameFailures.push(...Array.from({ length: 20 }, () => "EPERM"));

    await adoptDouyinStagingDir(staging, target);

    expect(await readFile(nodePath.join(target, "Default", "Cookies"), "utf8")).toBe("session");
    expect(await exists(nodePath.join(target, "lockfile"))).toBe(false);
    expect(await exists(staging)).toBe(false);
  });

  it("非占用类错误不重试,原样抛出", async () => {
    const staging = await makeStaging("session");
    renameFailures.push("ENOSPC", "EPERM");

    await expect(adoptDouyinStagingDir(staging, nodePath.join(base, "acct-3"))).rejects.toThrow(/ENOSPC/);
    expect(renameFailures).toEqual(["EPERM"]);
    expect(await exists(staging)).toBe(true);
  });

  it("同号重扫时旧目录备份也受占用影响 → 仍可完成并在回滚时恢复原登录态", async () => {
    const staging = await makeStaging("new-login");
    const target = nodePath.join(base, "acct-4");
    await mkdir(target);
    await writeFile(nodePath.join(target, "Cookies"), "old-login");
    renameFailures.push(...Array.from({ length: 6 }, () => "EACCES"), "EBUSY");

    const receipt = await prepareDouyinStagingAdoption(staging, target);
    expect(await readFile(nodePath.join(target, "Default", "Cookies"), "utf8")).toBe("new-login");

    await receipt.rollbackProfile();
    expect(await readFile(nodePath.join(target, "Cookies"), "utf8")).toBe("old-login");
    expect(await readFile(nodePath.join(staging, "Default", "Cookies"), "utf8")).toBe("new-login");
  });
});
