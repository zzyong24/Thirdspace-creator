import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

/**
 * 把浏览器上传体直接流式落盘。先写同目录临时文件，完整结束后再替换目标；
 * 因此文件大小不受 JS whole-body buffer 限制，中途断流也不会留下可被 complete 的残片。
 */
export async function streamBlobToFile(
  body: ReadableStream<Uint8Array>,
  targetPath: string,
): Promise<number> {
  const temporaryPath = `${targetPath}.uploading-${randomUUID()}`;
  await mkdir(dirname(targetPath), { recursive: true });

  try {
    await pipeline(
      Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    const written = (await stat(temporaryPath)).size;
    try {
      await rename(temporaryPath, targetPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      // Windows 不允许 rename 覆盖既有文件；只在完整临时文件已经写完后替换。
      await rm(targetPath, { force: true });
      await rename(temporaryPath, targetPath);
    }
    return written;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
