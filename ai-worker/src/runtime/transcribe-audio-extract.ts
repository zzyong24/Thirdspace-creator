import { resolveFfmpegPath } from "./ffmpeg-path";

/** 保留旧抽音诊断文字；宿主可映射为自己的业务错误，取消仍是 AbortError。 */
export class TranscribeAudioExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscribeAudioExtractError";
  }
}

export interface SpawnedAudioProcess {
  stdout: { on(event: "data", cb: (chunk: Uint8Array) => void): void };
  stderr: { on(event: "data", cb: (chunk: Uint8Array) => void): void };
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface StreamAudioDeps {
  spawn: (command: string, args: string[]) => SpawnedAudioProcess;
  ffmpegPath?: string;
  resolveFfmpeg?: () => string;
}

const REAL_SPAWN_DEPS: StreamAudioDeps = {
  spawn: (command, args) => {
    // 惰性加载，不在宿主装配时探测 ffmpeg 或启动子进程。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    return spawn(command, args, { windowsHide: true });
  },
};

function abortError(): Error {
  const error = new Error("转写已取消");
  error.name = "AbortError";
  return error;
}

/**
 * 直链流式抽音，stdout 返回 16kHz / 单声道 / 64k MP3 字节，不落盘。
 * 每个实例只记录清理未确认的进程，不引入队列或改变正常抽音并发。
 * 调用方应复用实例；取消等待 close，kill 失败则阻止本实例继续创建进程。
 */
export function createTranscribeAudioExtractor(deps: StreamAudioDeps = REAL_SPAWN_DEPS) {
  const unconfirmed = new Set<SpawnedAudioProcess>();
  return async (playUrl: string, signal?: AbortSignal): Promise<Uint8Array> => {
    if (signal?.aborted) throw abortError();
    if (unconfirmed.size > 0) {
      throw new TranscribeAudioExtractError("streamAudioFromVideo: 上次 ffmpeg 尚未确认退出，暂时无法开始新的抽音");
    }
    let ffmpegPath: string;
    try {
      ffmpegPath = deps.ffmpegPath ?? (deps.resolveFfmpeg ?? resolveFfmpegPath)();
    } catch (err) {
      throw new TranscribeAudioExtractError(`streamAudioFromVideo: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (signal?.aborted) throw abortError();
    // 保留原始 Referer 和 argv；URL 作为独立参数，不经过 shell。
    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-headers", "Referer: https://www.douyin.com/\r\n",
      "-i", playUrl, "-vn", "-ar", "16000", "-ac", "1",
      "-b:a", "64k", "-f", "mp3", "pipe:1",
    ];
    return new Promise<Uint8Array>((resolve, reject) => {
      let child: SpawnedAudioProcess;
      try {
        child = deps.spawn(ffmpegPath, args);
      } catch (err) {
        reject(new TranscribeAudioExtractError(
          `streamAudioFromVideo: 无法启动 ffmpeg(${ffmpegPath}): ${err instanceof Error ? err.message : String(err)}`,
        ));
        return;
      }
      const chunks: Uint8Array[] = [];
      let stderrTail = "";
      let failure: Error | undefined;
      let cancelled = false;
      let released = false;
      let closed = false;
      const cleanup = () => signal?.removeEventListener("abort", cancel);
      const cancel = () => {
        if (cancelled || closed) return;
        cancelled = true;
        chunks.length = 0;
        try {
          if (!child.kill("SIGKILL")) throw new Error("ffmpeg 未确认收到终止信号");
        } catch {
          // kill 失败不可冒充退出；结算当前取消，但旧 close 前拒绝本实例的新抽音。
          if (!closed) unconfirmed.add(child);
          released = true;
          cleanup();
          reject(abortError());
        }
      };
      child.stdout.on("data", chunk => {
        if (!cancelled && !released) chunks.push(chunk);
      });
      child.stderr.on("data", chunk => {
        if (!cancelled && !released) stderrTail = (stderrTail + Buffer.from(chunk).toString("utf8")).slice(-500);
      });
      child.on("error", err => {
        failure = new TranscribeAudioExtractError(`streamAudioFromVideo: ffmpeg 进程错误: ${err.message}`);
        // spawn error 后 Node 也会发 close；等管道关闭再结算，取消不能被错误提前释放。
      });
      child.on("close", code => {
        closed = true;
        unconfirmed.delete(child);
        cleanup();
        if (released) return;
        if (cancelled) { reject(abortError()); return; }
        if (failure) { reject(failure); return; }
        if (code !== 0) {
          reject(new TranscribeAudioExtractError(
            `streamAudioFromVideo: ffmpeg 非 0 退出 (code=${code}): ${stderrTail || "<no stderr>"}`,
          ));
          return;
        }
        const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
        if (total === 0) {
          reject(new TranscribeAudioExtractError("streamAudioFromVideo: ffmpeg 退出 0 但未产出音频字节(直链失效/去水印无效?)"));
          return;
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
        resolve(out);
      });
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  };
}

// 保留独立函数调用方式，同时让默认装配及同一 deps 共享清理状态，避免每次调用重置屏障。
const extractors = new WeakMap<StreamAudioDeps, ReturnType<typeof createTranscribeAudioExtractor>>();
export function streamAudioFromVideo(
  playUrl: string,
  deps: StreamAudioDeps = REAL_SPAWN_DEPS,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let extract = extractors.get(deps);
  if (!extract) {
    extract = createTranscribeAudioExtractor(deps);
    extractors.set(deps, extract);
  }
  return extract(playUrl, signal);
}
