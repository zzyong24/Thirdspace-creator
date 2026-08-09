import "server-only";

import { primeMasterKeyFromInheritedFd } from "@creatoros/backend";
import { installBlobTrustRoot } from "@creatoros/backend/modules/assets";

const PREFIX = "BLOBV2:";
const STARTUP_TIMEOUT_MS = 3_000;
const MAX_STARTUP_BYTES = 1_024;

interface StartupStdin {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "end", listener: () => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
  pause(): unknown;
  unshift(chunk: Buffer): unknown;
}

async function readStartupLines(
  stdin: StartupStdin,
  count: number,
  timeoutMs: number,
): Promise<string[]> {
  return await new Promise<string[]>((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
      clearTimeout(timer);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onEnd = () => fail(new Error("sidecar stdin 在启动密钥读取完成前关闭"));
    const onError = (error: Error) =>
      fail(new Error(`sidecar stdin 启动密钥读取失败:${error.message}`));
    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      buffered = Buffer.concat([
        buffered,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      ]);
      if (buffered.length > MAX_STARTUP_BYTES) {
        fail(new Error("sidecar stdin 启动密钥帧超过安全上限"));
        return;
      }

      const lines: string[] = [];
      let cursor = 0;
      while (lines.length < count) {
        const newline = buffered.indexOf(0x0a, cursor);
        if (newline < 0) return;
        lines.push(buffered.subarray(cursor, newline).toString("utf8").replace(/\r$/, ""));
        cursor = newline + 1;
      }

      settled = true;
      stdin.pause();
      cleanup();
      const remainder = buffered.subarray(cursor);
      if (remainder.length > 0) stdin.unshift(remainder);
      resolve(lines);
    };

    const timer = setTimeout(
      () => fail(new Error("sidecar stdin 启动密钥读取超时")),
      timeoutMs,
    );
    (timer as { unref?: () => void }).unref?.();
    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.on("error", onError);
  });
}

/**
 * 正式 sidecar 的 blob trust 与可选 master key 只从 Rust 壳继承的同一 stdin 读取。
 * 本函数是启动帧的唯一消费者；读完后暂停并归还管道，Windows 生命周期守护再接收后续
 * 停机哨兵。secret/bootId/key 不进 argv、env、日志或文件，任一缺失/坏帧都失败关闭。
 */
export async function installBlobTrustRootFromInheritedFd(
  env: Record<string, string | undefined> = process.env,
  options: {
    stdin?: StartupStdin;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  const blobFd = Number(env.CREATOROS_BLOB_SECRET_FD);
  if (!Number.isInteger(blobFd) || blobFd < 0) {
    throw new Error("CREATOROS_BLOB_SECRET_FD is required");
  }
  const masterFdRaw = env.CREATOROS_MASTER_KEY_FD?.trim();
  const masterFd = masterFdRaw ? Number(masterFdRaw) : null;
  if (masterFd !== null && (!Number.isInteger(masterFd) || masterFd < 0)) {
    throw new Error("CREATOROS_MASTER_KEY_FD must be a non-negative integer");
  }
  if (masterFd !== null && masterFd !== blobFd) {
    throw new Error("blob trust 与 master key 必须使用同一继承 stdin");
  }

  const lines = await readStartupLines(
    options.stdin ?? (process.stdin as StartupStdin),
    masterFd === null ? 1 : 2,
    options.timeoutMs ?? STARTUP_TIMEOUT_MS,
  );
  const blobLine = lines[0] ?? "";
  if (!blobLine.startsWith(PREFIX)) throw new Error("invalid blob trust fd payload");
  const [secret, bootId, extra] = blobLine.slice(PREFIX.length).split(":");
  if (extra !== undefined || !secret || !bootId) {
    throw new Error("invalid blob trust fd payload");
  }
  if (masterFd !== null) {
    primeMasterKeyFromInheritedFd(masterFd, lines[1] ?? "");
  }
  installBlobTrustRoot({ secret, bootId });
}
