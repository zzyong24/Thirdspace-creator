import {readActualProviderTiming} from "./asr-provider-timing";
import {createHash} from "node:crypto";
import {snapshotAsrInput,type AsrRequest} from "./asr-request";
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
export function whisperModelId(level: WhisperLevel): `Xenova/whisper-${WhisperLevel}` {
  return `Xenova/whisper-${level}`;
}

/** ASR pipeline 的最小调用形状(只用到我们需要的:传 Float32Array PCM → { text })。
 *  真实现是 @xenova/transformers 的 `pipeline('automatic-speech-recognition', modelId)` 返回值。 */
export type AsrPipelineOutput={text:string;chunks?:Array<{text:string;timestamp:[number,number|null]}>};
export type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<AsrPipelineOutput | AsrPipelineOutput[]>;

/** 可注入副作用(测试零成本:注 fake pipeline/fake decode;真跑走默认 transformers + ffmpeg)。 */
export interface WhisperLocalAdapterDeps {
  /** 惰性拿到某级别的 ASR pipeline。**必须自身幂等**:同一级别第二次调用复用首次实例
   *  (不重下模型)。真实现见 createDefaultPipelineProvider(内部 memo by level)。 */
  getPipeline: (modelId: string, signal?: AbortSignal) => Promise<AsrPipeline>;
  /** 把音频字节(MP3/m4a 等容器)解成 16kHz mono Float32 PCM([-1,1] 归一)。
   *  默认 ffmpeg spawn(见 createFfmpegPcmDecoder);测试注 fake(返固定 Float32Array)。 */
  decodeAudioToFloat32: (audioBytes: Uint8Array, signal?: AbortSignal) => Promise<Float32Array>;
}

function abortError(): Error {
  const error = new Error("本地转写已取消");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal, error?: unknown): void {
  if (signal?.aborted || (error && typeof error === "object" && "name" in error && error.name === "AbortError")) {
    throw abortError();
  }
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
  throwIfAborted(opts.signal);
  const level = whisperLevelFromSpec(spec);
  const modelId = whisperModelId(level);

  let pcm: Float32Array;
  try {
    pcm = await deps.decodeAudioToFloat32(opts.audioBytes, opts.signal);
    throwIfAborted(opts.signal);
  } catch (err) {
    throwIfAborted(opts.signal, err);
    throw new MultimodalGenerationError(
      `whisper-local 音频解码失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { reference: "LOCAL_WHISPER_AUDIO_DECODE", retryable: true },
    );
  }
  if (!pcm || pcm.length === 0) {
    throw new MultimodalGenerationError(
      "whisper-local 解码得到空音频 PCM(直链失效/抽音无效?)",
      { reference: "LOCAL_WHISPER_AUDIO_EMPTY", retryable: false },
    );
  }

  let pipeline: AsrPipeline;
  try {
    // getPipeline 幂等:首次下模型(~几百 MB)+ 建 pipeline,后续复用(不重下)。
    pipeline = await deps.getPipeline(modelId, opts.signal);
    throwIfAborted(opts.signal);
  } catch (err) {
    throwIfAborted(opts.signal, err);
    throw new MultimodalGenerationError(
      `whisper-local 模型加载失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { reference: "LOCAL_WHISPER_MODEL_LOAD", retryable: true },
    );
  }

  let result: AsrPipelineOutput | AsrPipelineOutput[];
  try {
    // language:whisper 支持 language 提示(默认自动检测)。传 language 时映射到 whisper 的
    // language 选项(如 "zh"→中文)。
    // [T-225c] chunk_length_s/stride_length_s **必须显式给**:transformers.js 的 whisper 默认
    //   只吃前 30 秒(>30s 打 "audio longer than 30 seconds" 警告后截断)——真机实测 1-3 分钟
    //   口播逐字稿全被砍成 ~30s(avg 165 字)。30s 分块 + 5s 滑窗重叠是官方 long-form 推荐,
    //   分块间用重叠区对齐去重,拼出全长转写。
    const pipelineOptions: Record<string, unknown> = {
      ...(opts.timestampMode?{return_timestamps:opts.timestampMode==="word"?"word":true}:{}),
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(opts.language ? { language: opts.language, task: "transcribe" } : {}),
    };
    result = await pipeline(pcm, pipelineOptions, opts.signal);
    throwIfAborted(opts.signal);
  } catch (err) {
    throwIfAborted(opts.signal, err);
    if (err instanceof MultimodalGenerationError) throw err;
    throw new MultimodalGenerationError(
      `whisper-local 推理失败(${modelId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { reference: "LOCAL_WHISPER_INFERENCE", retryable: true },
    );
  }

  const text = Array.isArray(result)
    ? result.map((r) => r.text).join("")
    : result.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new MultimodalGenerationError(
      "whisper-local 推理返回空逐字稿(音频无语音内容?)",
      { reference: "LOCAL_WHISPER_TRANSCRIPT_EMPTY", retryable: false },
    );
  }
  const timing=!Array.isArray(result)&&opts.timestampMode&&opts.timingAudio?.sampleRate===16000&&pcm.length===opts.timingAudio.validSampleCount?readActualProviderTiming({rawResponse:JSON.stringify(result),response:result,audioBytes:opts.audioBytes,granularity:opts.timestampMode,...opts.timingAudio,local:true}):null;
  return { text,...(timing?{timing}:{}) };
}

/** 构造本地 whisper 适配器。deps 可注入(测试零成本);默认走真 transformers pipeline + ffmpeg 解码。
 *  仅实现 transcribeAudio —— 不出图/视频。 */
export function createWhisperLocalAdapter(
  deps: WhisperLocalAdapterDeps,
): MultimodalProviderAdapter {
  return {
    async transcribeAudio(spec, opts) {
      // 冻结输入后再等待回执；回放已确认正文时不启动解码、模型加载或推理。
      const frozen = snapshotAsrInput(spec, opts);
      if (!opts.executeRequest) return transcribeAudio(frozen.spec, frozen.opts, deps);
      const audioDigest=`sha256:${createHash('sha256').update(frozen.opts.audioBytes).digest('hex')}`;
      const audioByteLength=frozen.opts.audioBytes.byteLength;
      const request:AsrRequest={...(frozen.opts.timestampMode?{timestampMode:frozen.opts.timestampMode}:{}),protocol:'whisper-local.v1',provider:'whisper-local',model:whisperModelId(whisperLevelFromSpec(frozen.spec)),endpointDigest:null,language:frozen.opts.language??null,audioDigest,audioByteLength,chunks:[{digest:audioDigest,byteLength:audioByteLength}],chunkDigest:audioDigest,chunkByteLength:audioByteLength,chunkIndex:0,chunkCount:1};
      const result=await opts.executeRequest(request,()=>transcribeAudio(frozen.spec,frozen.opts,deps));
      throwIfAborted(opts.signal);
      return result;
    },
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
    kill(signal?: NodeJS.Signals): boolean;
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
      // [T-372 W5] windowsHide:Win 打包态 sidecar 无 console,spawn ffmpeg 会闪黑窗。
      return spawn(command, args, { windowsHide: true }) as unknown as ReturnType<
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
): (audioBytes: Uint8Array, signal?: AbortSignal) => Promise<Float32Array> {
  // kill 失败不代表进程已经停止；同实例在收到旧 child 的 close 前禁止新建解码资源。
  const unconfirmed = new Set<ReturnType<FfmpegDecoderDeps["spawn"]>>();
  return (audioBytes: Uint8Array, signal?: AbortSignal) =>
    new Promise<Float32Array>((resolve, reject) => {
      throwIfAborted(signal);
      if (unconfirmed.size > 0) {
        reject(new Error("createFfmpegPcmDecoder: 上次 ffmpeg 尚未确认退出，暂时无法开始新的解码"));
        return;
      }
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
      let failure: Error | undefined;
      let cancelled = false;
      let released = false;
      const kill = () => {
        try {
          child.kill("SIGKILL");
        } catch (err) {
          // kill 调用失败不能从事件监听器逸出，也不能永远等不会到来的 close。
          // 不声称子进程已退出；停止保留输出并向调用方报告失败。
          released = true;
          unconfirmed.add(child);
          chunks.length = 0;
          signal?.removeEventListener("abort", cancel);
          reject(cancelled ? abortError() : new Error(
            `createFfmpegPcmDecoder: 无法终止 ffmpeg: ${err instanceof Error ? err.message : String(err)}`,
          ));
        }
      };
      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        chunks.length = 0;
        // 必须等 close 确认进程和管道关闭，不能只让调用方的 Promise 提前结束。
        kill();
      };
      child.stdout.on("data", (c) => { if (!cancelled && !released) chunks.push(c); });
      child.stderr.on("data", (c) => {
        if (!cancelled && !released) stderrTail = (stderrTail + Buffer.from(c).toString("utf8")).slice(-500);
      });
      child.on("error", (err) => {
        failure = new Error(`createFfmpegPcmDecoder: ffmpeg 进程错误: ${err.message}`);
      });
      child.on("close", (code) => {
        unconfirmed.delete(child);
        signal?.removeEventListener("abort", cancel);
        if (released) return;
        if (cancelled) { reject(abortError()); return; }
        if (failure) { reject(failure); return; }
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

      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      // stdin 出错后同样等 close，确保解码资源不遗留。
      if (child.stdin) {
        child.stdin.on("error", (err) => {
          failure = new Error(`createFfmpegPcmDecoder: ffmpeg stdin 错误: ${err.message}`);
          kill();
        });
        if (!cancelled) {
          try {
            child.stdin.write(audioBytes);
            child.stdin.end();
          } catch (err) {
            failure = err instanceof Error ? err : new Error(String(err));
            kill();
          }
        }
      }
    });
}

// ── [T-356] worker 化推理 + 串行队列(白屏根因根治)────────────────────────────────
// 真机事故:Transformers.js 的 whisper 推理(mel 特征提取 + WASM/onnx 推理循环)跑在 sidecar
// **主线程**,单条音频几分钟 CPU 拉满 → 事件循环卡死 → 全 app 页面请求挂起(NODE-CRON 连报
// missed execution,用户切页白屏)。修:推理挪 **worker_threads 常驻单 worker**——
//   · 单 worker 天然串行(用户拍板「一定要队列一个个跑」):一次只推理一条,其余排队;
//   · 主线程只 postMessage/await,事件循环永不被推理阻塞;
//   · worker 代码用 **eval 内联字符串**(不落独立文件)——绕开 Next standalone tracing 会漏
//     worker 文件的打包坑(desktop-sidecar 打包三连坑先例);worker 内 createRequire(requireBase)
//     解析 @xenova/transformers(sidecar 运行时 cwd=sidecar/frontend；传统包走 node_modules，
//     Windows 分层包先加载 creatoros-module-resolver 再走 local-ai/vendor);
//   · worker 崩溃/退出 → reject 所有在途任务 + 置空句柄,下次调用重建(不永久钉死);
//   · pipeline memo 活在 worker 内(同级别模型只加载一次,与旧 provider 同语义)。

/** worker 内代码(eval 字符串;自包含,不依赖打包器追踪任何文件)。
 *  协议:主线程发 { id, modelId, cacheDir, pcm: ArrayBuffer, options } →
 *  worker 回 { id, ok: true, text } 或 { id, ok: false, error }。 */
const WHISPER_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const req = createRequire(workerData.requireBase);
let bootstrapFailed = false;
if (workerData.moduleResolverPath) {
  try {
    process.env.CREATOROS_RUNTIME_ROOT = workerData.runtimeRoot;
    req(workerData.moduleResolverPath);
  } catch (err) {
    bootstrapFailed = true;
  }
}
const memo = new Map();
function getPipeline(modelId, cacheDir) {
  let p = memo.get(modelId);
  if (p) return p;
  p = (async () => {
    const { pipeline, env } = req("@xenova/transformers");
    env.cacheDir = cacheDir;
    env.allowLocalModels = true;
    return pipeline("automatic-speech-recognition", modelId);
  })();
  memo.set(modelId, p);
  p.catch(() => memo.delete(modelId));
  return p;
}
parentPort.on("message", async (msg) => {
  if (bootstrapFailed) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      errorCode: "LOCAL_WHISPER_RUNTIME_LOAD",
      error: "runtime resolver load failed",
    });
    return;
  }
  let pipe;
  try {
    pipe = await getPipeline(msg.modelId, msg.cacheDir);
  } catch (err) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      errorCode: "LOCAL_WHISPER_MODEL_LOAD",
      error: "model load failed",
    });
    return;
  }
  try {
    const pcm = new Float32Array(msg.pcm);
    const result = await pipe(pcm, msg.options);
    const text = Array.isArray(result) ? result.map((r) => r.text).join("") : result.text;
    parentPort.postMessage({ id: msg.id, ok: true, text,...(!Array.isArray(result)&&Array.isArray(result.chunks)?{chunks:result.chunks}:{}) });
  } catch (err) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      errorCode: "LOCAL_WHISPER_INFERENCE",
      error: "inference failed",
    });
  }
});
`;

export interface WhisperWorkerRuntime {
  requireBase: string;
  moduleResolverPath?: string;
  runtimeRoot?: string;
}

export function resolveWhisperWorkerRuntime(
  options: {
    cwd?: string;
    fileExists?: (path: string) => boolean;
    resolveDependency?: (specifier: string) => string;
  } = {},
): WhisperWorkerRuntime {
  // worker 的模块根必须与 sidecar 的真实 cwd 一致。Windows 分层包的 cwd 固定为
  // <runtime>/frontend；传统 runtime/dev 没有 resolver 时继续走原生 requireBase。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const requireBase = path.join(cwd, "package.json");
  const moduleResolverPath = path.join(cwd, "creatoros-module-resolver.cjs");
  const exists = options.fileExists ?? fs.existsSync;
  if (exists(moduleResolverPath)) return {
    requireBase,
    moduleResolverPath,
    runtimeRoot: path.resolve(cwd, ".."),
  };
  // Web 从 frontend cwd fork Worker；依赖属于 ai-worker。用当前模块真正解析到的
  // 入口作为 eval Worker 的模块根，不依赖宿主恰好也安装了本地模型运行时。
  // 传统包或旧运行布局无法解析时，仍保留原 cwd 的兼容查找路径。
  try {
    const dependencyPath = (options.resolveDependency ?? ((specifier: string) => require.resolve(specifier)))("@xenova/transformers");
    return { requireBase: dependencyPath };
  } catch {
    return { requireBase };
  }
}

/** worker 句柄可注入面(单测注 fake worker,不真加载 transformers)。 */
export interface WhisperWorkerLike {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
  on(
    event: "message",
    cb: (msg: {
      id: number;
      ok: boolean;
      text?: string;
      chunks?:AsrPipelineOutput["chunks"];
      error?: string;
      errorCode?: string;
    }) => void,
  ): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "exit", cb: (code: number) => void): void;
  terminate(): Promise<number>;
}

export function createWhisperWorker(
  runtime: WhisperWorkerRuntime = resolveWhisperWorkerRuntime(),
): WhisperWorkerLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker } = require("node:worker_threads") as typeof import("node:worker_threads");
  return new Worker(WHISPER_WORKER_SOURCE, {
    eval: true,
    workerData: runtime,
  }) as unknown as WhisperWorkerLike;
}

/**
 * [T-356] worker 化 pipeline provider:返回与 createDefaultPipelineProvider 同签名的
 * `(modelId) => Promise<AsrPipeline>`,但拿到的 AsrPipeline 实际是「经串行队列发给常驻
 * worker」的代理 —— transcribeAudio 主逻辑零改动即吃到 worker 化。
 * spawnWorker 可注入(单测 fake;默认真 worker_threads eval)。
 */
export function createWorkerPipelineProvider(
  spawnWorker?: () => WhisperWorkerLike,
): (modelId: string) => Promise<AsrPipeline> {
  let worker: WhisperWorkerLike | null = null;
  let nextId = 1;
  type Pending = { owner: WhisperWorkerLike; resolve: (text: string,chunks?:AsrPipelineOutput["chunks"]) => void; reject: (err: Error) => void };
  const pending = new Map<number, Pending>();
  const exits = new WeakMap<WhisperWorkerLike, Promise<number>>();
  let queue: Promise<unknown> = Promise.resolve();
  const spawn = spawnWorker ?? (() => createWhisperWorker());

  function failPending(owner: WhisperWorkerLike, err: Error): void {
    if (worker === owner) worker = null;
    for (const [id, p] of pending) {
      if (p.owner !== owner) continue;
      pending.delete(id);
      p.reject(err);
    }
  }

  function ensureWorker(): WhisperWorkerLike {
    if (worker) return worker;
    const w = spawn();
    let confirmExit!: (code: number) => void;
    exits.set(w, new Promise<number>((resolve) => { confirmExit = resolve; }));
    w.on("message", (msg) => {
      const p = pending.get(msg.id);
      if (!p || p.owner !== w) return;
      pending.delete(msg.id);
      if (msg.ok && typeof msg.text === "string") p.resolve(msg.text,msg.chunks);
      else p.reject(new MultimodalGenerationError(
        `whisper-local(worker)执行失败: ${msg.error ?? "未知错误"}`,
        { reference: msg.errorCode ?? "LOCAL_WHISPER_WORKER_UNKNOWN", retryable: true },
      ));
    });
    w.on("error", (err) => failPending(w, new MultimodalGenerationError(
      `whisper-local worker 崩溃: ${err.message}`,
      { reference: "LOCAL_WHISPER_WORKER_CRASH", retryable: true },
    )));
    w.on("exit", (code) => {
      confirmExit(code);
      failPending(w, new MultimodalGenerationError(
        `whisper-local worker 退出 (code=${code})`,
        { reference: "LOCAL_WHISPER_WORKER_EXIT", retryable: true },
      ));
    });
    worker = w;
    return w;
  }

  return async (modelId: string) => {
    const proxy: AsrPipeline = (audio, options, signal) => {
      const job = async () => {
        throwIfAborted(signal);
        const w = ensureWorker();
        const id = nextId++;
        let stopping: Promise<number> | undefined;
        const result = new Promise<AsrPipelineOutput>((resolve, reject) => {
          const cancel = () => {
            // 删除 pending，使 terminate 引发的 exit/error 不会提前放行队列。
            pending.delete(id);
            if (worker === w) worker = null;
            // terminate 自身也可能失败；同步抛错和异步拒绝都不能算退出确认。
            // 此时继续等待该 owner 的 exit，期间队列保留屏障，不创建替代 worker。
            stopping = Promise.resolve().then(() => w.terminate()).catch(() => exits.get(w)!);
            stopping.then(() => reject(abortError()), reject);
          };
          const cleanup = () => signal?.removeEventListener("abort", cancel);
          pending.set(id, {
            owner: w,
            resolve: (text,chunks) => { cleanup(); resolve({ text,...(chunks?{chunks}:{}) }); },
            reject: (err) => { cleanup(); reject(err); },
          });
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) { cancel(); return; }
          try {
            // 有偏移或共享底层存储时复制有效范围，避免传入其它音频/哨兵数据。
            const buf = audio.byteOffset === 0 && audio.byteLength === audio.buffer.byteLength && audio.buffer instanceof ArrayBuffer
              ? audio.buffer : audio.slice().buffer as ArrayBuffer;
            w.postMessage({ id, modelId, cacheDir: defaultCacheDir(), pcm: buf, options: options ?? {} }, [buf]);
          } catch (err) {
            pending.delete(id);
            cleanup();
            reject(err);
          }
        });
        try {
          return await result;
        } finally {
          // 保留真实终止完成屏障，后续任务不能与被取消的推理重叠。
          if (stopping) await stopping;
        }
      };
      const run = queue.then(job, job);
      queue = run.catch(() => {});
      return run;
    };
    return proxy;
  };
}

/** 便捷装配:host 默认 deps(真 transformers pipeline + 真 ffmpeg 解码)。测试**不用**这个,
 *  而是给 createWhisperLocalAdapter 注 fake deps。
 *  [T-356] 推理走 worker 化 provider(常驻单 worker + 串行队列)—— 主线程永不被推理阻塞。 */
export function createDefaultWhisperLocalAdapter(): MultimodalProviderAdapter {
  return createWhisperLocalAdapter({
    getPipeline: createWorkerPipelineProvider(),
    decodeAudioToFloat32: createFfmpegPcmDecoder(),
  });
}
