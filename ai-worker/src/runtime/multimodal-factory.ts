import {isAsrExecutionControlError,throwIfAsrAborted,type ExecuteAsrRequest} from "./asr-request";
import { toChannelManagedError } from "./provider-factory";

// 多模态 provider 工厂(SPEC 2026-07-01 多模态 model-config §2.2 / §8 M1)—— 把「一次运行
// 解析出来的多模态模型规格(MultimodalSpec)」变成统一契约的生成调用。与文本 `modelFor`
// (provider-factory.ts,产出 LanguageModel)并列的一层:文本走 Vercel AI SDK 的
// LanguageModel 抽象,多模态因 API 形状异构(image 同步 / video 异步任务)另立一条。
//
// ── [gate-F4] SDK 边界(M1 第一步查死,结论写在这)────────────────────────────
// 项目用 `ai@7.0.4`。核实结果:
//   - `ai@7` 导出 **`generateImage` / `wrapImageModel` / `NoImageGeneratedError`**(稳定名,
//     非 `experimental_generateImage`),依赖一个 `ImageModelV2` 实例。
//   - 但 `@ai-sdk/openai` 的 image 导出为 **空**(该版本无内置 image model),且**不存在
//     任何 MiniMax 的 ai-sdk provider 包**(node_modules 无 minimax provider)。
//   - video 无 SDK 标准抽象。
// → 定死:**图和视频都走自建 REST**(在各厂商适配器内直连官方 REST)。若改用 SDK 的
//   `generateImage`,得为 MiniMax 自实现 `ImageModelV2` 接口 —— 与自建 REST 工作量相当却
//   多一层 SDK 耦合,且 video 仍无处安放。统一自建 REST + `{ assetBytes }` 契约屏蔽同步/异步
//   差异,分层最干净。日后某 provider 真有官方 ImageModel adapter,可在其适配器内部改用
//   SDK,上层契约不变(见 [gate-F1] 证伪)。
//
// ── [gate-F1] 统一上层契约(provider/kind 中立)──────────────────────────────
// `generateImage` / `generateVideo` 上层**都只返 `{ assetBytes: Uint8Array }`**。异步 video 的
// 「提交 → 轮询 taskId → 下载字节」全部由适配器**内部**消化,上层不感知 taskId(绝不
// `bytes | taskId` 的 union)。按 `spec.provider` 分派到适配器(工厂 keyed by provider,与
// 文本层 keyed by apiFormat 同套路:加 provider = 加一个适配器,不改上层与业务代码)。

/** 一次多模态生成需要的最小规格(由上层 resolveMultimodalSpec 按 capability 解析后投影)。
 *  与文本 ModelSpec 并列;`provider` 名做分派开关(非 apiFormat),因各厂商 image/video REST
 *  形状彼此异构,协议族抽象不成立。 */
export interface MultimodalSpec {
  /** 分派开关:"minimax" | "openai" | …(加 provider = 在工厂注册一个适配器)。 */
  provider: string;
  /** 自定义端点;null = 用该 provider 适配器的内置默认端点。 */
  baseUrl: string | null;
  /** 模型 id,如 "image-01"(MiniMax 文生图) / "video-01"(Hailuo 文生视频)。 */
  model: string;
  /** 用户自带 API key(复用 secret 存储)。 */
  token: string;
  /** 该档位是图/视频/音频 —— 决定走 generateImage / generateVideo / transcribeAudio,
   *  并校验适配器能力。audio(T-030-D1)= ASR 逐字稿转写。 */
  kind: "image" | "video" | "audio" | "vision";
  /** 已验签渠道模型参数；各 provider 适配器必须按白名单读取，不能原样透传未知字段。 */
  settings?: Record<string, unknown>;
  displayModelKey?: "channel-managed";
  credentialLifecycle?: "persistent" | "per_request";
  serviceId?: string;
  apiFormat?: string;
}

async function protectChannelCall<T>(
  spec: MultimodalSpec,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isAsrExecutionControlError(error)) throw error;
    if (spec.displayModelKey === "channel-managed") {
      throw toChannelManagedError(error);
    }
    throw error;
  }
}

export interface GenerateImageOptions {
  prompt: string;
  /** 如 "9:16"(抖音竖屏优先)/ "16:9" / "1:1"。适配器把它翻成各厂商入参。 */
  aspectRatio?: string;
  /**
   * [T-380] 以图生图(风格参考):可选参考图字节+mime。给了 → 适配器走各家 image-to-image
   * 形态(openai 兼容 = POST /v1/images/edits multipart;minimax = subject_reference);
   * 不给 → 行为与纯文生图完全一致(零回归)。出参契约不变({ assetBytes })。
   */
  referenceImage?: { bytes: Uint8Array; mimeType: string };
  /** 服务端按本次生成意图计算的稳定幂等键；只作为请求头发送，不进入公开结果。 */
  idempotencyKey?: string;
}

export interface GenerateVideoOptions {
  /** Worker 的任务取消/截止信号；适配器必须传给提交、查询、下载与等待。 */
  signal?: AbortSignal;
  prompt: string;
  aspectRatio?: string;
  /** 首帧图(image-to-video 起始帧),可选。 */
  firstFrame?: Uint8Array;
  /** H3 v2 输出规格。旧 provider 可忽略；MiniMax H3 必须校验。 */
  durationSec?: number;
  resolution?: "768P" | "2K";
  /**
   * T-735：本地任务在提交后失败/重启时，使用已持久化的 provider job 继续轮询，
   * 绝不能再 POST 一次计费生成。该字段只存在于 server-only 运行时。
   */
  resumeJobId?: string;
  /** 提交拿到 job id 后立刻持久化；回调完成前不进入轮询。 */
  onJobSubmitted?: (jobId: string) => Promise<void>;
  /** 与生图相同的稳定生成意图键。 */
  idempotencyKey?: string;
}

/** ASR 逐字稿转写入参(T-030-D1)—— 与 image/video 的生成入参并列,但输入是**音频字节**
 *  (由 D2 的 ffmpeg 抽音产出),而非文本 prompt。 */
export interface TranscribeAudioOptions {
  signal?: AbortSignal;
  executeRequest?: ExecuteAsrRequest;
  /** 待转写的音频字节(如 16kHz/单声道/mp3)。 */
  audioBytes: Uint8Array;
  /** 可选语言提示(如 "zh"/"en");多数 OpenAI 兼容端点可自动检测,省略即自动。 */
  language?: string;
}

/** 统一上层返回契约([gate-F1]):无论 provider、无论同步/异步,只有字节。 */
export interface GeneratedAsset {
  assetBytes: Uint8Array;
}

/** ASR 转写返回契约(T-030-D1)—— 与 GeneratedAsset 并列,只是返回形状不同:逐字稿是**文本**
 *  而非字节。language 为端点回传的识别语言(可选)。 */
export interface GeneratedTranscript {
  text: string;
  language?: string;
}

/** 一个厂商适配器要实现的形状。image 同步、video 可能异步(轮询在适配器内消化),
 *  但对工厂/上层而言两者签名都返 `Promise<GeneratedAsset>` —— 异步性被封装。
 *  某 provider 只支持其一(如只出图)→ 另一个方法可不实现(工厂调用时报明确错误)。 */
export interface MultimodalProviderAdapter {
  /** 释放此实例拥有的执行资源；调用者须等待关闭后才交还任务归属。 */
  close?(): Promise<void>;
  generateImage?(
    spec: MultimodalSpec,
    opts: GenerateImageOptions,
  ): Promise<GeneratedAsset>;
  generateVideo?(
    spec: MultimodalSpec,
    opts: GenerateVideoOptions,
  ): Promise<GeneratedAsset>;
  /** ASR 逐字稿转写(T-030-D1),可选 —— 只做转写的 provider(OpenAI 兼容 ASR)只实现这一个;
   *  只出图/视频的 provider(如 minimax)不实现(工厂调用时报明确错误)。返回文本而非字节。 */
  transcribeAudio?(
    spec: MultimodalSpec,
    opts: TranscribeAudioOptions,
  ): Promise<GeneratedTranscript>;
}

export type MultimodalProviderRegistry = Record<
  string,
  MultimodalProviderAdapter
>;

/** 未配 / 未知 provider / provider 不支持该能力 / 适配器结构就绪但缺真实现 —— 上层适配器
 *  可接住 → cancelTask + UI 显「未配置/生成失败」,不假成功。与文本 LlmCredentialError 平行。 */
export class MultimodalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultimodalConfigError";
  }
}

export type MultimodalFailureReason =
  | "authentication"
  | "credit_exhausted"
  | "rate_limited"
  | "upstream"
  | "response_contract"
  | "download"
  | "network"
  | "timeout"
  | "unknown";

export type MultimodalFailureStage =
  | "submit"
  | "poll"
  | "download"
  | "local_persist"
  | "model_call";

export interface MultimodalFailureDetails {
  reason?: MultimodalFailureReason;
  stage?: MultimodalFailureStage;
  status?: number;
  /** 脱敏后的稳定参考号，禁止放 provider job id、URL 或凭据。 */
  reference?: string;
  retryable?: boolean;
  retryAfterMs?: number;
}

/** provider 生成过程本身失败(HTTP 非 2xx / 内容审核 / 轮询超时等)。 */
export class MultimodalGenerationError extends Error {
  readonly reason: MultimodalFailureReason;
  readonly stage: MultimodalFailureStage;
  readonly status?: number;
  readonly reference?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(message: string, details: MultimodalFailureDetails = {}) {
    super(message);
    this.name = "MultimodalGenerationError";
    this.reason = details.reason ?? "unknown";
    this.stage = details.stage ?? "model_call";
    this.status = details.status;
    this.reference = details.reference;
    this.retryable = details.retryable ?? false;
    this.retryAfterMs = details.retryAfterMs;
  }
}

// ── [gate-F1] 证伪「加 provider = 加适配器不改上层」───────────────────────────
// 下面用两个**假想的非-MiniMax provider 签名**反推,确认上层 `{ assetBytes }` 契约能容纳
// 它们(尤其异步 provider)——若容纳不了,说明这套接口只是照 MiniMax 长出来的空头支票。
//
// (A) 假想同步 provider —— OpenAI images(`POST /v1/images/generations` 返 b64_json):
//       generateImage(spec, {prompt, aspectRatio}) {
//         const r = await fetch(`${base}/images/generations`, { headers:{Authorization:`Bearer ${spec.token}`},
//                     body: JSON.stringify({ model: spec.model, prompt, size: aspectToSize(aspectRatio) }) });
//         const { data:[{ b64_json }] } = await r.json();
//         return { assetBytes: base64ToBytes(b64_json) };   // ← 直接塞进 { assetBytes },契约合身
//       }
//   → 同步 provider 天然合身:上层无差别。
//
// (B) 假想**异步** provider —— 一个通用 async 视频 provider(submit → poll → download,和 MiniMax
//     video 同构但换厂商/换字段名):
//       generateVideo(spec, {prompt}) {
//         const { jobId } = await POST(`${base}/jobs`, { model: spec.model, prompt });  // 提交拿 jobId
//         const bytes = await pollUntilReady(jobId);   // 轮询直到 status=ready 再 GET 结果 URL
//         return { assetBytes: bytes };                // ← taskId/jobId 全在适配器内部消化,上层只见字节
//       }
//   → **关键证伪点**:异步 provider 的 jobId/轮询/下载全封在适配器内,`generateVideo` 仍只返
//     `{ assetBytes }`。上层(asset.generate runner)对「同步 image / 异步 minimax video / 异步
//     通用 video」写同一段 `const { assetBytes } = await generateVideo(spec, opts)` —— **零分支**。
//   → 结论:契约 `{ assetBytes }` 对同步/异步、对已知/未知 provider 都成立;加 provider 确实只需
//     加一个实现 MultimodalProviderAdapter 的适配器,上层不改。承诺兑现,非空头支票。
//   (可运行的 fake 异步 provider 见 multimodal-factory.fake.ts —— 单测里真跑「先 taskId、N 次
//    轮询后返 bytes」的装配,把这条证伪从注释坐实成绿测。)

/** 按 spec.provider 取适配器,调 image 生成 → 统一 `{ assetBytes }`。 */
export async function generateImage(
  spec: MultimodalSpec,
  opts: GenerateImageOptions,
  registry: MultimodalProviderRegistry,
): Promise<GeneratedAsset> {
  return protectChannelCall(spec, async () => {
    const adapter = registry[spec.provider];
    if (!adapter) {
      throw new MultimodalConfigError(
        `未知多模态 provider: "${spec.provider}"(未在工厂注册适配器)`,
      );
    }
    if (!adapter.generateImage) {
      throw new MultimodalConfigError(
        `provider "${spec.provider}" 不支持文生图(image.generate)`,
      );
    }
    return adapter.generateImage(spec, opts);
  });
}

/** 按 spec.provider 取适配器,调 video 生成 → 统一 `{ assetBytes }`(异步轮询在适配器内)。 */
export async function generateVideo(
  spec: MultimodalSpec,
  opts: GenerateVideoOptions,
  registry: MultimodalProviderRegistry,
): Promise<GeneratedAsset> {
  return protectChannelCall(spec, async () => {
    const adapter = registry[spec.provider];
    if (!adapter) {
      throw new MultimodalConfigError(
        `未知多模态 provider: "${spec.provider}"(未在工厂注册适配器)`,
      );
    }
    if (!adapter.generateVideo) {
      throw new MultimodalConfigError(
        `provider "${spec.provider}" 不支持文生视频(video.generate)`,
      );
    }
    return adapter.generateVideo(spec, opts);
  });
}

/** 按 spec.provider 取适配器,调 ASR 转写 → 统一 `{ text, language? }`(T-030-D1)。
 *  与 generateImage/generateVideo 同构:加 provider = 在工厂注册一个实现 transcribeAudio 的
 *  适配器,上层不改。未知 provider / provider 不支持转写 → MultimodalConfigError(上层可接住
 *  → 停任务 + UI「未配置/不支持逐字稿」)。 */
export async function transcribeAudio(
  spec: MultimodalSpec,
  opts: TranscribeAudioOptions,
  registry: MultimodalProviderRegistry,
): Promise<GeneratedTranscript> {
  throwIfAsrAborted(opts.signal);
  spec = structuredClone(spec);
  opts = {...opts};
  return protectChannelCall(spec, async () => {
    const adapter = registry[spec.provider];
    if (!adapter) {
      throw new MultimodalConfigError(
        `未知多模态 provider: "${spec.provider}"(未在工厂注册适配器)`,
      );
    }
    if (!adapter.transcribeAudio) {
      throw new MultimodalConfigError(
        `provider "${spec.provider}" 不支持逐字稿转写(transcribe.audio)`,
      );
    }
    try{return await adapter.transcribeAudio(spec, opts);}
    catch(error){throwIfAsrAborted(opts.signal);throw error;}
  });
}
