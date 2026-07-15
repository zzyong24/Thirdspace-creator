// 本地 Whisper 适配器(T-160,SPEC 2026-07-06 §3.1/§3.2 方案 A)—— 实现
// MultimodalProviderAdapter 的 `transcribeAudio`,用 Transformers.js(`@xenova/transformers`)
// 在 Node 里跑 Whisper 推理,**零 key、零外部 API**。ASR 从「必配 key」变「选配」的兜底后端:
// 用户没配 transcribe.audio provider 时,resolveTranscribeSpec 回退到本 provider(whisper-local)。
//
// ── 与 openai-asr 适配器的对照 ─────────────────────────────────────────────────
// openai-asr:一次 HTTP 请求(multipart)→ 云端 ASR 返 text。快、准、要 key。
// whisper-local:首次调用惰性下载模型(Xenova/whisper-<level>,HF 缓存)→ 本地 CPU 推理。
//   慢些,但免 key、免外部依赖(桌面化 T-147 零 Python)。同样实现 transcribeAudio 契约,
//   上层(transcribe-runner)对两者写同一段 `const { text } = await transcribeAudio(...)`。
//
// ── 音频解码坑(关键,SPEC §3.2 已标)────────────────────────────────────────────
// douyin 采集给的 audioBytes 是 **16kHz / 单声道 / 64k MP3**(见 douyin-cdp.ts streamAudioFromVideo:
//   `ffmpeg ... -vn -ar 16000 -ac 1 -b:a 64k -f mp3 pipe:1`)。采样率/声道已对(whisper 要 16kHz
//   mono),但**是 MP3 编码,不是原始 PCM**。Transformers.js 的 ASR pipeline 要 Float32Array
//   (归一化 [-1,1] 的 16kHz mono PCM),自身不带 mp3/m4a 解码器。
// 解码路径选型(SPEC §3.2 权衡,如实标注):
//   - 用 **ffmpeg** 把 MP3 → raw f32le PCM(`ffmpeg -i pipe:0 -f f32le -ar 16000 -ac 1 pipe:1`),
//     Buffer 直接 view 成 Float32Array。ffmpeg **已是项目硬依赖**(douyin-cdp 抽音在用,
//     路径统一走 ffmpeg-path.ts 的 resolveFfmpegPath 解析链,RT-H09),故解码**不新增重依赖**
//     ——复用同一把 ffmpeg,只是 decode 一步。
//     纯 JS mp3 解码库(如需 wavefile 只吃 wav;mp3 需额外库且解码质量/维护存疑)不选。
//   - decode 与 getPipeline 都做成**可注入 deps**:适配器逻辑单测零成本(注 fake,不下 500MB
//     模型、不 spawn 真 ffmpeg);真跑时走默认(真 ffmpeg spawn + 真 transformers pipeline)。

import {
  MultimodalGenerationError,
  type GeneratedTranscript,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
  type TranscribeAudioOptions,
} from "./multimodal-factory";
import { resolveFfmpegPath } from "./ffmpeg-path";

/** Whisper 级别(体积/速度/精度权衡)。默认 small(中文效果/体积平衡,SPEC §3.3)。
 *  spec.model 传 "tiny"/"base"/"small"/"medium" 之一;其它值 → 回退 small。 */
export type WhisperLevel = "tiny" | "base" | "small" | "medium";
const VALID_LEVELS: ReadonlySet<string> = new Set([
  "tiny",
  "base",
  "small",
  "medium",
]);
const DEFAULT_LEVEL: WhisperLevel = "small";

/** 从 spec.model 归一出级别(默认 small)。接受裸级别("small")或全名("Xenova/whisper-small")。 */
export function whisperLevelFromSpec(spec: MultimodalSpec): WhisperLevel {
  const raw = (spec.model ?? "").trim().toLowerCase();
  // 允许直接给 HF 全名 Xenova/whisper-<level> —— 取末段。
  const tail = raw.includes("/") ? raw.split("/").pop()! : raw;
  const level = tail.replace(/^whisper[-_]?/, "");
  return (VALID_LEVELS.has(level) ? level : DEFAULT_LEVEL) as WhisperLevel;
}

/** Transformers.js 的 whisper 模型 id(Xenova 转好的 ONNX 权重,HF 上公开)。 */
export function whisperModelId(level: WhisperLevel): string {
  return `Xenova/whisper-${level}`;
}

/** ASR pipeline 的最小调用形状(只用到我们需要的:传 Float32Array PCM → { text })。
 *  真实现是 @xenova/transformers 的 `pipeline('automatic-speech-recognition', modelId)` 返回值。 */
export type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

/** 可注入副作用(测试零成本:注 fake pipeline/fake decode;真跑走默认 transformers + ffmpeg)。 */
export interface WhisperLocalAdapterDeps {
  /** 惰性拿到某级别的 ASR pipeline。**必须自身幂等**:同一级别第二次调用复用首次实例
   *  (不重下模型)。真实现见 createDefaultPipelineProvider(内部 memo by level)。 */
  getPipeline: (modelId: string) => Promise<AsrPipeline>;
  /** 把音频字节(MP3/m4a 等容器)解成 16kHz mono Float32 PCM([-1,1] 归一)。
   *  默认 ffmpeg spawn(见 createFfmpegPcmDecoder);测试注 fake(返固定 Float32Array)。 */
  decodeAudioToFloat32: (audioBytes: Uint8Array) => Promise<Float32Array>;
}

/**
 * 本地 whisper 转写:级别 ← spec.model(默认 small)→ decode 音频为 PCM → pipeline 推理 → text。
 * 空/异常统一 MultimodalGenerationError(与 openai-asr 同款:上层按类型接住)。
 */
async function transcribeAudio(
  spec: MultimodalSpec,
  opts: TranscribeAudioOptions,
  deps: WhisperLocalAdapterDeps,
): Promise<GeneratedTranscript> {
  const level = whisperLevelFromSpec(spec);
  const modelId = whisperModelId(level);

  let pcm: Float32Array;
  try {
    pcm = await deps.decodeAudioToFloat32(opts.audioBytes);
  } catch (err) {
    throw new MultimodalGenerationError(
      `whisper-local 音频解码失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!pcm || pcm.length === 0) {
    throw new MultimodalGenerationError(
      "whisper-local 解码得到空音频 PCM(直链失效/抽音无效?)",
    );
  }

  let pipeline: AsrPipeline;
  try {
    // getPipeline 幂等:首次下模型(~几百 MB)+ 建 pipeline,后续复用(不重下)。
    pipeline = await deps.getPipeline(modelId);
  } catch (err) {
    throw new MultimodalGenerationError(
      `whisper-local 模型加载失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  let result: { text: string } | { text: string }[];
  try {
    // language:whisper 支持 language 提示(默认自动检测)。传 language 时映射到 whisper 的
    // language 选项(如 "zh"→中文)。
    // [T-225c] chunk_length_s/stride_length_s **必须显式给**:transformers.js 的 whisper 默认
    //   只吃前 30 秒(>30s 打 "audio longer than 30 seconds" 警告后截断)——真机实测 1-3 分钟
    //   口播逐字稿全被砍成 ~30s(avg 165 字)。30s 分块 + 5s 滑窗重叠是官方 long-form 推荐,
    //   分块间用重叠区对齐去重,拼出全长转写。
    const pipelineOptions: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(opts.language ? { language: opts.language, task: "transcribe" } : {}),
    };
    result = await pipeline(pcm, pipelineOptions);
  } catch (err) {
    throw new MultimodalGenerationError(
      `whisper-local 推理失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const text = Array.isArray(result)
    ? result.map((r) => r.text).join("")
    : result.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new MultimodalGenerationError(
      "whisper-local 推理返回空逐字稿(音频无语音内容?)",
    );
  }
  return { text };
}

/** 构造本地 whisper 适配器。deps 可注入(测试零成本);默认走真 transformers pipeline + ffmpeg 解码。
 *  仅实现 transcribeAudio —— 不出图/视频。 */
export function createWhisperLocalAdapter(
  deps: WhisperLocalAdapterDeps,
): MultimodalProviderAdapter {
  return {
    transcribeAudio: (spec, opts) => transcribeAudio(spec, opts, deps),
  };
}

// ── 真实现:默认 pipeline provider(Transformers.js)+ ffmpeg PCM 解码 ──────────────
// 这两个是 host(persistence-client)装配时注入的默认 deps。**惰性 import**:
//   - @xenova/transformers 体积大(带 onnxruntime),只在真跑转写时才加载(避免拖累启动/单测)。
//   - node:child_process 是 server-only(避免打进任何客户端 bundle)。
// 单测**不碰**这两个真实现(注 fake deps),故它们不入 CI 的联网/spawn 路径。

/** 模型缓存根目录(SPEC §3.3):默认 ~/CreatorOS/models/whisper。Transformers.js 首次下载
 *  Xenova/whisper-<level> 权重到此,后续命中缓存不重下(幂等由库的缓存机制 + 我们的 memo 双保)。 */
function defaultCacheDir(): string {
  // 惰性 import,避免顶层拉 node:os/path。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return (
    process.env.CREATOROS_WHISPER_CACHE_DIR?.trim() ||
    path.join(os.homedir(), "CreatorOS", "models", "whisper")
  );
}

/**
 * 默认 pipeline provider —— 用 @xenova/transformers 建 ASR pipeline,并**按 modelId memo**
 * (幂等:同级别第二次调用复用首次 pipeline 实例,不重建/不重下)。首次某级别会惰性下载权重
 * (small ~几百 MB)到缓存目录,后续命中缓存。
 *
 * 幂等的两层保证:
 *   ① 本 memo(Map by modelId):进程内同级别只建一次 pipeline。
 *   ② Transformers.js 自身的磁盘缓存(env.cacheDir):跨进程/重启命中已下权重,不重下。
 */
export function createDefaultPipelineProvider(): (
  modelId: string,
) => Promise<AsrPipeline> {
  const memo = new Map<string, Promise<AsrPipeline>>();
  return (modelId: string) => {
    const existing = memo.get(modelId);
    if (existing) return existing; // ← 幂等:同 modelId 复用同一个(pending 或已完成的)Promise
    const p = (async () => {
      // 惰性 import transformers(体积大;只在真转写时加载)。
      const { pipeline, env } = (await import("@xenova/transformers")) as {
        pipeline: (
          task: string,
          model: string,
        ) => Promise<AsrPipeline>;
        env: { cacheDir?: string; allowLocalModels?: boolean };
      };
      // 缓存目录 → ~/CreatorOS/models/whisper(SPEC §3.3);允许本地缓存命中不重下。
      env.cacheDir = defaultCacheDir();
      env.allowLocalModels = true;
      return pipeline("automatic-speech-recognition", modelId);
    })();
    memo.set(modelId, p);
    // 若加载失败,清掉 memo 让下次可重试(不把一次失败永久钉死)。
    p.catch(() => memo.delete(modelId));
    return p;
  };
}

/** ffmpeg PCM 解码器可注入依赖(默认 child_process.spawn;测试注 fake)。 */
export interface FfmpegDecoderDeps {
  spawn: (
    command: string,
    args: string[],
  ) => {
    stdout: { on(event: "data", cb: (chunk: Uint8Array) => void): void };
    stderr: { on(event: "data", cb: (chunk: Uint8Array) => void): void };
    on(event: "error", cb: (err: Error) => void): void;
    on(event: "close", cb: (code: number | null) => void): void;
  };
  /** ffmpeg 可执行路径(显式注入则短路解析链;默认走 resolveFfmpegPath 四级解析,
   *  与 douyin-cdp streamAudioFromVideo 同一把解析器 —— RT-H09 根治硬编码)。 */
  ffmpegPath?: string;
  /** 解析器可注入(单测 fake 解析链结果/抛错;默认真 resolveFfmpegPath)。 */
  resolveFfmpeg?: () => string;
}

function realFfmpegDeps(): FfmpegDecoderDeps {
  return {
    spawn: (command, args) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { spawn } = require("node:child_process") as typeof import("node:child_process");
      return spawn(command, args) as unknown as ReturnType<
        FfmpegDecoderDeps["spawn"]
      >;
    },
    // ffmpegPath 不在装配期定死 —— 每次 decode 时惰性走 resolveFfmpegPath 解析链
    // (env → 随包 sidecar → PATH/常见目录 → 诚实报错),见 createFfmpegPcmDecoder。
  };
}

/**
 * ffmpeg 解码器:把任意容器(MP3/m4a/…)音频字节 → **16kHz mono Float32 PCM([-1,1] 归一)**,
 * 喂 Transformers.js ASR pipeline。命令(stdin 收字节 → stdout 出 raw f32le):
 *   ffmpeg -i pipe:0 -f f32le -acodec pcm_f32le -ar 16000 -ac 1 pipe:1
 * f32le 的字节流直接 view 成 Float32Array(小端;Node/主流平台都是小端,直接零拷贝 view)。
 * 复用 ffmpeg(douyin-cdp 抽音同一把)—— 解码**不新增重依赖**。
 *
 * ffmpeg 路径解析(RT-H09):**每次 decode 惰性解析**(不在装配期)——
 * createDefaultWhisperLocalAdapter 在 host 装配时就会构造本 decoder,若装配期解析并抛错,
 * 会把「机器没装 ffmpeg」升级成「整个 server 起不来」;惰性解析让缺 ffmpeg 只在真转录时
 * 以 MultimodalGenerationError 诚实浮出(错误信息含安装/配置引导)。
 */
export function createFfmpegPcmDecoder(
  deps: FfmpegDecoderDeps = realFfmpegDeps(),
): (audioBytes: Uint8Array) => Promise<Float32Array> {
  return (audioBytes: Uint8Array) =>
    new Promise<Float32Array>((resolve, reject) => {
      // 解析链:显式注入 ffmpegPath > 注入的解析器 > 真 resolveFfmpegPath(env → 随包 → PATH → 报错)。
      let ffmpegPath: string;
      try {
        ffmpegPath = deps.ffmpegPath ?? (deps.resolveFfmpeg ?? resolveFfmpegPath)();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0", // 从 stdin 读音频字节
        "-f",
        "f32le", // raw 32-bit float little-endian PCM
        "-acodec",
        "pcm_f32le",
        "-ar",
        "16000", // whisper 要 16kHz
        "-ac",
        "1", // 单声道
        "pipe:1", // 输出到 stdout
      ];
      let child: ReturnType<FfmpegDecoderDeps["spawn"]> & {
        stdin?: {
          write(chunk: Uint8Array): void;
          end(): void;
          on(event: "error", cb: (err: Error) => void): void;
        };
      };
      try {
        child = deps.spawn(ffmpegPath, args) as typeof child;
      } catch (err) {
        reject(
          new Error(
            `createFfmpegPcmDecoder: 无法启动 ffmpeg(${ffmpegPath}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
        return;
      }

      const chunks: Uint8Array[] = [];
      let stderrTail = "";
      child.stdout.on("data", (c) => chunks.push(c));
      child.stderr.on("data", (c) => {
        stderrTail = (stderrTail + Buffer.from(c).toString("utf8")).slice(-500);
      });
      child.on("error", (err) =>
        reject(
          new Error(`createFfmpegPcmDecoder: ffmpeg 进程错误: ${err.message}`),
        ),
      );
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `createFfmpegPcmDecoder: ffmpeg 非 0 退出 (code=${code}): ${
                stderrTail || "<no stderr>"
              }`,
            ),
          );
          return;
        }
        // 拼接 f32le 字节 → Float32Array。字节数须为 4 的倍数(每个 float 4 字节)。
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
        const usable = buf.byteLength - (buf.byteLength % 4); // 丢弃尾部不足 4 字节的残片(理论上不该有)
        // 拷成对齐的 ArrayBuffer 再 view(Buffer 底层偏移不保证 4 对齐,直接 view 会抛)。
        const aligned = new Uint8Array(usable);
        aligned.set(buf.subarray(0, usable));
        resolve(
          new Float32Array(aligned.buffer, aligned.byteOffset, usable / 4),
        );
      });

      // 把音频字节写进 ffmpeg stdin(真实现有 stdin;fake 可省略)。
      if (child.stdin) {
        child.stdin.on("error", (err) =>
          reject(
            new Error(`createFfmpegPcmDecoder: ffmpeg stdin 错误: ${err.message}`),
          ),
        );
        child.stdin.write(audioBytes);
        child.stdin.end();
      }
    });
}

/** 便捷装配:host 默认 deps(真 transformers pipeline + 真 ffmpeg 解码)。测试**不用**这个,
 *  而是给 createWhisperLocalAdapter 注 fake deps。 */
export function createDefaultWhisperLocalAdapter(): MultimodalProviderAdapter {
  return createWhisperLocalAdapter({
    getPipeline: createDefaultPipelineProvider(),
    decodeAudioToFloat32: createFfmpegPcmDecoder(),
  });
}
