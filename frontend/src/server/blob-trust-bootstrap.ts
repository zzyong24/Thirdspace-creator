import "server-only";

import { readSync } from "node:fs";
import { installBlobTrustRoot } from "@creatoros/backend/modules/assets";

const PREFIX = "BLOBV2:";

function readLineFromFd(fd: number): string {
  if (process.platform === "win32") {
    throw new Error("blob trust fd is unavailable on this platform");
  }
  const bytes: number[] = [];
  const one = Buffer.alloc(1);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && bytes.length <= 512) {
    let count: number;
    try {
      count = readSync(fd, one, 0, 1, null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EAGAIN") continue;
      throw error;
    }
    if (count === 0) continue;
    const byte = one[0];
    if (byte === 0x0a) break;
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString("utf8").trim();
}
/**
 * 正式 sidecar 只从 Rust 壳继承的 fd 读取启动级随机信任根。环境变量只携带 fd 编号；
 * secret/bootId 不进 argv、env、日志或文件。任一格式/读取错误都抛出，让启动失败关闭。
 */
export function installBlobTrustRootFromInheritedFd(
  env: Record<string, string | undefined> = process.env,
  readLine: (fd: number) => string = readLineFromFd,
): void {
  const fd = Number(env.CREATOROS_BLOB_SECRET_FD);
  if (!Number.isInteger(fd) || fd < 0) {
    throw new Error("CREATOROS_BLOB_SECRET_FD is required");
  }
  const line = readLine(fd);
  if (!line.startsWith(PREFIX)) throw new Error("invalid blob trust fd payload");
  const [secret, bootId, extra] = line.slice(PREFIX.length).split(":");
  if (extra !== undefined || !secret || !bootId) {
    throw new Error("invalid blob trust fd payload");
  }
  installBlobTrustRoot({ secret, bootId });
}
