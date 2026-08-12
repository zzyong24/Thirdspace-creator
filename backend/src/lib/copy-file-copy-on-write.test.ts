import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileCopyOnWrite } from "./copy-file-copy-on-write";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("copyFileCopyOnWrite", () => {
  it("优先请求强制写时复制，文件副本仍可独立修改", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "creatoros-cow-"));
    roots.push(root);
    const source = path.join(root, "source.bin");
    const destination = path.join(root, "destination.bin");
    await fs.writeFile(source, Buffer.alloc(1024 * 1024, 7));

    const strategy = await copyFileCopyOnWrite(source, destination);
    await fs.writeFile(destination, Buffer.from("changed"));

    expect(strategy).toMatch(/^(copy-on-write|copy-fallback)$/);
    expect((await fs.stat(source)).size).toBe(1024 * 1024);
    expect(await fs.readFile(source)).toEqual(Buffer.alloc(1024 * 1024, 7));
  });

  it("文件系统不支持写时复制时，只对明确的不支持错误回退普通复制", async () => {
    const calls: Array<number | undefined> = [];
    const copier = vi.fn(async (_source: string, _destination: string, mode?: number) => {
      calls.push(mode);
      if (mode === fsConstants.COPYFILE_FICLONE_FORCE) {
        const error = new Error("clone unsupported") as NodeJS.ErrnoException;
        error.code = "ENOTSUP";
        throw error;
      }
    });

    await expect(
      copyFileCopyOnWrite("source", "destination", {
        platform: "linux",
        copyFile: copier,
      }),
    ).resolves.toBe("copy-fallback");
    expect(calls).toEqual([fsConstants.COPYFILE_FICLONE_FORCE, undefined]);
  });

  it("磁盘满等真实错误不得伪装成兼容回退", async () => {
    const copier = vi.fn(async () => {
      const error = new Error("disk full") as NodeJS.ErrnoException;
      error.code = "ENOSPC";
      throw error;
    });

    await expect(
      copyFileCopyOnWrite("source", "destination", {
        platform: "linux",
        copyFile: copier,
      }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(copier).toHaveBeenCalledTimes(1);
  });

  it("macOS 原生 clone 不可用时回退普通复制", async () => {
    const copyFile = vi.fn(async () => undefined);
    await expect(
      copyFileCopyOnWrite("source", "destination", {
        platform: "darwin",
        cloneFileDarwin: async () => {
          throw new Error("not APFS");
        },
        copyFile,
      }),
    ).resolves.toBe("copy-fallback");
    expect(copyFile).toHaveBeenCalledWith("source", "destination");
  });
});
