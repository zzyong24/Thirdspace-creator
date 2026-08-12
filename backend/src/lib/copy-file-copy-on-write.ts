import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type CopyFileStrategy = "copy-on-write" | "copy-fallback";
export type CopyFileLike = (
  source: string,
  destination: string,
  mode?: number,
) => Promise<void>;
export interface CopyFileCopyOnWriteDeps {
  platform?: NodeJS.Platform;
  copyFile?: CopyFileLike;
  cloneFileDarwin?: (source: string, destination: string) => Promise<void>;
}

const execFileAsync = promisify(execFile);

async function cloneFileDarwin(
  source: string,
  destination: string,
): Promise<void> {
  // macOS 的 Node COPYFILE_FICLONE_FORCE 在部分版本不会调用 APFS clonefile；
  // `/bin/cp -c` 是系统原生 clone 接口。execFile 不经 shell，路径作为独立参数传入。
  await execFileAsync("/bin/cp", ["-c", source, destination]);
}

// 仅这些错误表示当前文件系统/跨卷不支持 reflink。权限、磁盘满、源文件丢失等
// 真实故障必须原样抛出，不能借“兼容回退”掩盖。
const COPY_ON_WRITE_UNSUPPORTED_CODES = new Set([
  "EINVAL",
  "ENOSYS",
  "ENOTSUP",
  "EOPNOTSUPP",
  "ENOTTY",
  "EXDEV",
]);

/**
 * 优先建立独立可写的 CoW/reflink 副本；不支持时才普通复制。
 *
 * `COPYFILE_FICLONE_FORCE` 在 APFS/Linux reflink 文件系统上共享未修改的数据块，
 * 但目标仍是独立 inode，后续改写不会污染源文件。禁止用 hardlink/symlink 替代。
 */
export async function copyFileCopyOnWrite(
  source: string,
  destination: string,
  deps: CopyFileCopyOnWriteDeps = {},
): Promise<CopyFileStrategy> {
  const platform = deps.platform ?? process.platform;
  const copyFile = deps.copyFile ?? fs.copyFile;
  if (platform === "darwin") {
    try {
      await (deps.cloneFileDarwin ?? cloneFileDarwin)(source, destination);
      return "copy-on-write";
    } catch {
      // 非 APFS/跨卷等场景由普通复制兜底；若源丢失、权限或磁盘满，普通复制会
      // 再次抛出真实错误，不把失败伪装成成功。
      await copyFile(source, destination);
      return "copy-fallback";
    }
  }

  try {
    await copyFile(
      source,
      destination,
      fsConstants.COPYFILE_FICLONE_FORCE,
    );
    return "copy-on-write";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (!code || !COPY_ON_WRITE_UNSUPPORTED_CODES.has(code)) {
      throw error;
    }
  }

  await copyFile(source, destination);
  return "copy-fallback";
}
