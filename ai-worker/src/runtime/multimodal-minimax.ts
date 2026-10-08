import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
// MiniMax 多模态适配器(SPEC 2026-07-01 §2.2 / §8 M1;T-836 H3 v2)—— 实现 MultimodalProviderAdapter,
// 直连 MiniMax 官方 REST(**不是** anthropic 兼容端点)。image 同步、video 异步(提交 →
// 轮询 task_id → 下载),异步全部在本适配器内消化,对上层只返 `{ assetBytes }`([gate-F1])。
//
// ── 诚实边界(SPEC §7)────────────────────────────────────────────────────────
// 本环境无 image.generate / video.generate 真 key,**无法零成本端到端验**。以下 HTTP 结构
// 按 MiniMax 官方文档(platform.minimax.io/docs)写:
//   ✅ 已按文档核实(结构就绪):
//      - image: POST /v1/image_generation,Bearer 鉴权,body{model,prompt,aspect_ratio,
//        response_format:"base64",n,prompt_optimizer},resp data.image_base64[]。
//      - video 提交: POST /v1/video_generation,body{model,prompt,duration?,resolution?,
//        prompt_optimizer},resp task_id。
//      - video 轮询: GET /v1/query/video_generation?task_id=…,status∈
//        Preparing/Queueing/Processing/Success/Fail,Success 时给 file_id。
//   ⚠️ TODO 待 MiniMax 文档核实 + 真 key 验(下方各处标注):
//      - file 检索 endpoint(file_id → 下载直链)的确切 path 与 resp 路径。
//      - aspectRatio → video duration/resolution 的映射细节。
// 真产物验收留给用户配 key 后([gate-F4] 已定死走自建 REST,非 SDK)。装配逻辑(含异步轮询)
// 由 fake 适配器在单测里零成本覆盖。

import {
  MultimodalGenerationError,
  type GeneratedAsset,
  type GenerateImageOptions,
  type GenerateVideoOptions,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
} from "./multimodal-factory";
import {getRetryAfterMs} from "./retry-policy";
import { createHash } from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import { resolveMinimaxH3Endpoints } from "./minimax-h3-endpoints";

const DEFAULT_BASE_URL = "https://api.minimax.io";

/** 可注入的副作用(测试零成本:注入 fake fetch/sleep,真跑时用默认)。 */
export interface MinimaxAdapterDeps {
  fetch: typeof fetch;
  /** 轮询间隔的等待器。默认真 setTimeout;测试注入即时 resolve。 */
  sleep: (ms: number, signal?:AbortSignal) => Promise<void>;
  /** 轮询间隔(ms)。 */
  pollIntervalMs: number;
  /** 轮询最大次数(超出 → 超时失败,上层可接住)。M2 会把它接进 task 超时态。 */
  maxPollAttempts: number;
  /** H3 首版保守 20 分钟上限；测试可省略并复用 maxPollAttempts。 */
  h3MaxPollAttempts?: number;
}

const REAL_DEPS: MinimaxAdapterDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms,signal) => delay(ms,undefined,{signal}),
  pollIntervalMs: 5_000,
  maxPollAttempts: 60, // 5s × 60 ≈ 5 min 上限
  h3MaxPollAttempts: 240,
};

function base(spec: MultimodalSpec): string {
  return (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function authHeaders(spec: MultimodalSpec): Record<string, string> {
  // MiniMax 官方 REST 用 Bearer(与文本走 anthropic 兼容端点的 Bearer 是两条不同链路)。
  return {
    Authorization: `Bearer ${spec.token}`,
    "Content-Type": "application/json",
  };
}

function decodeBase64(b64: string): Uint8Array {
  // Node/edge 皆有 Buffer(ai-worker types:["node"]);避免额外依赖。
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function firstFrameDataUrl(frame: GenerateVideoOptions["firstFrame"]): string | undefined {
  if (!frame) return undefined;
  const value = frame instanceof Uint8Array ? { bytes: frame, mimeType: "image/png" } : frame;
  if (!["image/jpeg", "image/png", "image/webp"].includes(value.mimeType) || value.bytes.byteLength === 0 || value.bytes.byteLength > 20 * 1024 * 1024) {
    throw new MultimodalGenerationError("MiniMax 首帧只支持不超过 20MB 的 JPG、PNG 或 WebP", {reason:"response_contract",stage:"submit"});
  }
  return `data:${value.mimeType};base64,${Buffer.from(value.bytes).toString("base64")}`;
}

function isH3(spec: MultimodalSpec): boolean {
  return ["minimax-h3", "minimax-h3-max"].includes(spec.model.trim().toLowerCase());
}

function safeReference(value: string): string {
  return `mmx-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function httpFailure(
  stage: "submit" | "poll" | "download",
  status: number,
  detail: string,
  headers?: Headers,
): MultimodalGenerationError {
  const reason =
    status === 401 || status === 403
      ? "authentication"
      : status === 402
        ? "credit_exhausted"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "upstream"
            : "response_contract";
  return new MultimodalGenerationError(
    `MiniMax ${stage} HTTP ${status}: ${detail}`,
    {
      reason,
      stage,
      status,
      retryable: stage !== "submit" && (status === 429 || status >= 500),
      retryAfterMs:getRetryAfterMs({headers},Date.now,Infinity)??undefined,
    },
  );
}

/** GET 故障携带真实阶段，Worker 可续查原任务；提交故障仍不能当成未计费。 */
async function requestVideo(stage:"submit"|"poll"|"download",deps:MinimaxAdapterDeps,url:string,init:RequestInit){
 try{return await deps.fetch(url,init);}catch{throw new MultimodalGenerationError(`MiniMax ${stage} 网络失败`,{stage,reason:"network",retryable:stage!=="submit"});}
}

// ── image(同步)───────────────────────────────────────────────────────────
async function generateImage(
  spec: MultimodalSpec,
  opts: GenerateImageOptions,
  deps: MinimaxAdapterDeps,
): Promise<GeneratedAsset> {
  const res = await deps.fetch(`${base(spec)}/v1/image_generation`, {
    method: "POST",
    headers: authHeaders(spec),
    body: JSON.stringify({
      model: spec.model, // 如 "image-01"
      prompt: opts.prompt,
      ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
      // [T-380/T-993] 官方以图生图契约支持 subject_reference 的 Data URL；
      // 无参考图时不传该字段，保留原文生图调用。
      ...(opts.referenceImage
        ? {
            subject_reference: [
              {
                type: "character",
                image_file: `data:${opts.referenceImage.mimeType};base64,${Buffer.from(opts.referenceImage.bytes).toString("base64")}`,
              },
            ],
          }
        : {}),
      response_format: "base64", // 直接拿字节,免二次 GET url(url 24h 过期)
      n: 1,
      prompt_optimizer: true,
    }),
  });
  if (!res.ok) {
    throw new MultimodalGenerationError(
      `MiniMax image_generation HTTP ${res.status}: ${await safeText(res)}`,
    );
  }
  const json = (await res.json()) as MinimaxImageResponse;
  const b64 = json.data?.image_base64?.[0];
  if (!b64) {
    // success_count=0 常因内容审核拦截 —— 明确报错,上层 cancelTask + UI 显原因。
    throw new MultimodalGenerationError(
      `MiniMax image_generation 未返图片(可能内容审核拦截;success=${json.metadata?.success_count ?? "?"} failed=${json.metadata?.failed_count ?? "?"})`,
    );
  }
  return { assetBytes: decodeBase64(b64) };
}

// ── video(异步:提交 → 轮询 → 下载,全在适配器内消化)──────────────────────
async function generateVideo(
  spec: MultimodalSpec,
  opts: GenerateVideoOptions,
  deps: MinimaxAdapterDeps,
): Promise<GeneratedAsset> {
  if (isH3(spec) && !(opts.legacyPlain && spec.model.trim().toLowerCase() === "minimax-h3-max")) return generateH3Video(spec, opts, deps);
  if (!opts.resumeJobId && opts.firstFrame && opts.resolution === "2K") throw new MultimodalGenerationError("当前 MiniMax 视频模型不支持 2K", {reason:"response_contract",stage:"submit"});
  if (!opts.resumeJobId && opts.firstFrame && opts.durationSec !== undefined && ![6,10].includes(opts.durationSec)) throw new MultimodalGenerationError("当前 MiniMax 视频模型只支持 6 或 10 秒", {reason:"response_contract",stage:"submit"});
  // 已有 provider job 必须原号续查，不能恢复时重新计费提交。
  let taskId=opts.resumeJobId;
  if(!taskId){
  // 1) 提交 → 拿 task_id
  const submitRes = await requestVideo("submit",deps,`${base(spec)}/v1/video_generation`, {
    method: "POST",
    headers: authHeaders(spec),
    body: JSON.stringify({
      model: spec.model, // 如 "MiniMax-Hailuo-2.3" / "T2V-01"
      prompt: opts.prompt,
      prompt_optimizer: true,
      ...(!opts.legacyPlain && opts.durationSec ? { duration: opts.durationSec } : {}),
      ...(!opts.legacyPlain && opts.resolution ? { resolution: opts.resolution } : {}),
      // 首帧由任务冻结的素材版本提供；不允许静默退回文生视频。
      ...(opts.firstFrame ? { first_frame_image: firstFrameDataUrl(opts.firstFrame) } : {}),
    }),
  });
  if (!submitRes.ok) {
    throw httpFailure("submit",submitRes.status,await safeText(submitRes),submitRes.headers);
  }
  const submit = (await submitRes.json()) as MinimaxVideoSubmitResponse;
  taskId = submit.task_id;
  if (!taskId) {
    throw new MultimodalGenerationError(
      "MiniMax video_generation 提交未返 task_id",
    );
  }
  if(opts.onJobSubmitted)await opts.onJobSubmitted(taskId);
  }

  // 2) 轮询 task 直到 Success/Fail 或超时(taskId 不外泄给上层 —— [gate-F1])
  const fileId = await pollVideoTask(spec, taskId, deps);

  // 3) file_id → 下载字节
  return { assetBytes: await retrieveFile(spec, fileId, deps) };
}

async function generateH3Video(
  spec: MultimodalSpec,
  opts: GenerateVideoOptions,
  deps: MinimaxAdapterDeps,
): Promise<GeneratedAsset> {
  const prompt = opts.prompt.trim();
  const duration = opts.durationSec ?? 6;
  const resolution = opts.resolution ?? "768P";
  const h3Max = spec.model.trim().toLowerCase() === "minimax-h3-max";
  const ratio = opts.aspectRatio ?? "9:16";
  if (!opts.resumeJobId) {
  if (!prompt || prompt.length > 7_000) {
    throw new MultimodalGenerationError("MiniMax H3 prompt 必须为 1–7000 字", {
      reason: "response_contract",
      stage: "submit",
    });
  }
  if (!Number.isInteger(duration) || duration < (h3Max ? 5 : 4) || duration > 15) {
    throw new MultimodalGenerationError(`MiniMax ${h3Max ? "H3 Max" : "H3"} duration 必须为 ${h3Max ? "5" : "4"}–15 秒整数`, {
      reason: "response_contract",
      stage: "submit",
    });
  }
  if (resolution !== "768P" && (resolution !== "2K" || h3Max)) {
    throw new MultimodalGenerationError(`MiniMax ${h3Max ? "H3 Max" : "H3"} 不支持该分辨率`, {
      reason: "response_contract",
      stage: "submit",
    });
  }
  if (!["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"].includes(ratio)) {
    throw new MultimodalGenerationError("MiniMax H3 ratio 不受支持", {
      reason: "response_contract",
      stage: "submit",
    });
  }

  }

  let taskId = opts.resumeJobId;
  const endpoints = resolveMinimaxH3Endpoints(spec.baseUrl);
  if (!taskId) {
    let submitRes: Response;
    try {
      submitRes = await deps.fetch(endpoints.submitUrl, {
        method: "POST",
        headers: authHeaders(spec),
        body: JSON.stringify({
          model: spec.model,
          content: [{ type: "text", text: prompt }, ...(opts.firstFrame ? [{type:"image_url",image_url:{url:firstFrameDataUrl(opts.firstFrame)},role:"first_frame"}] : [])],
          duration,
          resolution,
          ratio: opts.firstFrame ? "adaptive" : ratio,
        }),
      });
    } catch (error) {
      throw new MultimodalGenerationError(
        "MiniMax H3 提交结果未知，请勿直接重试；请先去 MiniMax 控制台核对",
        {
          reason: "network",
          stage: "submit",
          reference: safeReference(opts.idempotencyKey ?? prompt),
          retryable: false,
        },
      );
    }
    if (!submitRes.ok) {
      throw httpFailure("submit", submitRes.status, await safeText(submitRes),submitRes.headers);
    }
    const submit = (await submitRes.json()) as MinimaxVideoSubmitResponse;
    taskId = submit.task_id;
    if (!taskId) {
      throw new MultimodalGenerationError(
        "MiniMax H3 提交响应缺 task_id，结果未知，请先去控制台核对",
        {
          reason: "response_contract",
          stage: "submit",
          reference: safeReference(opts.idempotencyKey ?? prompt),
          retryable: false,
        },
      );
    }
    if (opts.onJobSubmitted) await opts.onJobSubmitted(taskId);
  }

  const downloadUrl = await pollH3VideoTask(spec, taskId, endpoints, deps);
  let bytesRes: Response;
  try {
    bytesRes = await deps.fetch(downloadUrl, { method: "GET" });
  } catch {
    throw new MultimodalGenerationError("MiniMax H3 成片下载网络失败", {
      reason: "network",
      stage: "download",
      reference: safeReference(taskId),
      retryable: true,
    });
  }
  if (!bytesRes.ok) {
    throw httpFailure("download", bytesRes.status, "成片下载失败",bytesRes.headers);
  }
  let assetBytes:Uint8Array;
  try{assetBytes=new Uint8Array(await bytesRes.arrayBuffer());}
  catch{throw new MultimodalGenerationError("MiniMax H3 成片下载连接中断",{reason:"network",stage:"download",retryable:true});}
  if (!assetBytes.byteLength) {
    throw new MultimodalGenerationError("MiniMax H3 成片下载为空", {
      reason: "download",
      stage: "download",
      reference: safeReference(taskId),
    });
  }
  return { assetBytes };
}

async function pollH3VideoTask(
  spec: MultimodalSpec,
  taskId: string,
  endpoints: ReturnType<typeof resolveMinimaxH3Endpoints>,
  deps: MinimaxAdapterDeps,
): Promise<string> {
  const maxAttempts = deps.h3MaxPollAttempts ?? deps.maxPollAttempts;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(endpoints.queryUrl(taskId), {
        method: "GET",
        headers: authHeaders(spec),
      });
    } catch {
      throw new MultimodalGenerationError("MiniMax H3 查询网络失败", {
        reason: "network",
        stage: "poll",
        reference: safeReference(taskId),
        retryable: true,
      });
    }
    if (!res.ok) throw httpFailure("poll", res.status, await safeText(res),res.headers);
    const json = (await res.json()) as MinimaxH3QueryResponse;
    const status = json.task?.status;
    if (status === "succeeded") {
      const url = json.task?.content?.url;
      if (!url || !url.startsWith("https://")) {
        throw new MultimodalGenerationError("MiniMax H3 succeeded 但无安全下载 URL", {
          reason: "response_contract",
          stage: "poll",
          reference: safeReference(taskId),
        });
      }
      return url;
    }
    if (status === "failed" || status === "cancelled") {
      throw new MultimodalGenerationError(
        status === "cancelled" ? "MiniMax H3 任务已取消" : "MiniMax H3 任务生成失败",
        {
          reason: "upstream",
          stage: "poll",
          reference: safeReference(taskId),
        },
      );
    }
    if (status !== "queued" && status !== "running") {
      throw new MultimodalGenerationError("MiniMax H3 查询返回未知状态", {
        reason: "response_contract",
        stage: "poll",
        reference: safeReference(taskId),
      });
    }
    await deps.sleep(deps.pollIntervalMs);
  }
  throw new MultimodalGenerationError("MiniMax H3 生成超时", {
    reason: "timeout",
    stage: "poll",
    reference: safeReference(taskId),
    retryable: true,
  });
}

async function pollVideoTask(
  spec: MultimodalSpec,
  taskId: string,
  deps: MinimaxAdapterDeps,
): Promise<string> {
  for (let attempt = 0; attempt < deps.maxPollAttempts; attempt++) {
    const res = await requestVideo("poll",deps,
      `${base(spec)}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: authHeaders(spec) },
    );
    if (!res.ok) {
      throw httpFailure("poll",res.status,await safeText(res),res.headers);
    }
    const json = (await res.json()) as MinimaxVideoQueryResponse;
    const status = json.status;
    if (status === "Success") {
      if (!json.file_id) {
        throw new MultimodalGenerationError(
          "MiniMax video task Success 但无 file_id",
        );
      }
      return json.file_id;
    }
    if (status === "Fail") {
      throw new MultimodalGenerationError(
        `MiniMax video task 失败(task_id=${taskId})`,
      );
    }
    // Preparing / Queueing / Processing → 继续等
    await deps.sleep(deps.pollIntervalMs);
  }
  throw new MultimodalGenerationError(
    `MiniMax video task 轮询超时(${deps.maxPollAttempts} 次未完成)`,
    {stage:"poll",reason:"timeout",retryable:true},
  );
}

async function retrieveFile(
  spec: MultimodalSpec,
  fileId: string,
  deps: MinimaxAdapterDeps,
): Promise<Uint8Array> {
  // TODO 待 MiniMax 文档核实 + 真 key 验:file 检索 endpoint 的确切 path 与 resp 结构。
  //   按 MiniMax files 惯例:GET /v1/files/retrieve?file_id=… → resp.file.download_url,
  //   再 GET download_url 拿字节。path/字段名待真文档 + 真 key 核实(下方按惯例实现,结构就绪)。
  const metaRes = await requestVideo("download",deps,
    `${base(spec)}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { method: "GET", headers: authHeaders(spec) },
  );
  if (!metaRes.ok) {
    throw httpFailure("download",metaRes.status,await safeText(metaRes),metaRes.headers);
  }
  const meta = (await metaRes.json()) as MinimaxFileRetrieveResponse;
  const downloadUrl = meta.file?.download_url;
  if (!downloadUrl) {
    throw new MultimodalGenerationError(
      `MiniMax files/retrieve 无 download_url(file_id=${fileId})`,
    );
  }
  const bytesRes = await requestVideo("download",deps,downloadUrl, { method: "GET" });
  if (!bytesRes.ok) {
    throw httpFailure("download",bytesRes.status,await safeText(bytesRes),bytesRes.headers);
  }
  try{return new Uint8Array(await bytesRes.arrayBuffer());}catch{throw new MultimodalGenerationError("MiniMax 下载字节中断",{stage:"download",reason:"network",retryable:true});}
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

// ── MiniMax REST 响应形状(按官方文档;TODO 项已在上方标注)────────────────────
interface MinimaxImageResponse {
  data?: { image_base64?: string[]; image_urls?: string[] };
  metadata?: { success_count?: number; failed_count?: number };
}
interface MinimaxVideoSubmitResponse {
  task_id?: string;
}
interface MinimaxVideoQueryResponse {
  status?: "Preparing" | "Queueing" | "Processing" | "Success" | "Fail";
  file_id?: string;
}
interface MinimaxFileRetrieveResponse {
  file?: { download_url?: string };
}
interface MinimaxH3QueryResponse {
  task?: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    content?: { url?: string };
  };
}

/** 构造 MiniMax 适配器。deps 可注入(测试零成本);默认走真 fetch + 真 setTimeout 轮询。 */
export function createMinimaxAdapter(
  deps: MinimaxAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  // 最大尝试次数是有限轮询总预算；零间隔仅用于注入即时等待器，按真实默认周期解释。
  const intervalMs=deps.pollIntervalMs || REAL_DEPS.pollIntervalMs;
  const floorAttempts=(attempts:number)=>Math.max(attempts,Math.ceil(executionTimeoutMs(Math.max(1,Math.round(attempts*intervalMs)))/intervalMs));
  deps={...deps,maxPollAttempts:floorAttempts(deps.maxPollAttempts),h3MaxPollAttempts:floorAttempts(deps.h3MaxPollAttempts??deps.maxPollAttempts)};

  return {
    generateImage: (spec, opts) => generateImage(spec, opts, deps),
    async generateVideo(spec, opts) {
      // 固定本次恢复号和取消信号；调用方修改 options 不得把续查变成新提交。
      const frozen={...opts},signal=frozen.signal;
      signal?.throwIfAborted();
      const bounded:MinimaxAdapterDeps=signal?{...deps,
        fetch:async(input,init)=>{
          signal.throwIfAborted();
          return deps.fetch(input,{...init,signal});
        },
        sleep:ms=>new Promise<void>((resolve,reject)=>{
          signal.throwIfAborted();
          const cancel=()=>{signal.removeEventListener("abort",cancel);reject(signal.reason);};
          signal.addEventListener("abort",cancel,{once:true});
          // 注入等待器也可能忽略 signal；停止仍及时返回，后续请求前再校验。
          Promise.resolve().then(()=>{signal.throwIfAborted();return deps.sleep(ms,signal);}).then(
            ()=>{signal.removeEventListener("abort",cancel);resolve();},
            error=>{signal.removeEventListener("abort",cancel);reject(error);},
          );
        }),
      }:deps;
      try{
        const result=await generateVideo(spec,frozen,bounded);
        signal?.throwIfAborted();
        return result;
      }catch(error){signal?.throwIfAborted();throw error;}
    },
  };
}
