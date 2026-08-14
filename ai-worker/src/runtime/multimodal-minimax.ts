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
//      - image-to-video 首帧(firstFrame)在 /v1/video_generation 的确切入参名(文档未列)。
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
import { createHash } from "node:crypto";
import { resolveMinimaxH3Endpoints } from "./minimax-h3-endpoints";

const DEFAULT_BASE_URL = "https://api.minimax.io";

/** 可注入的副作用(测试零成本:注入 fake fetch/sleep,真跑时用默认)。 */
export interface MinimaxAdapterDeps {
  fetch: typeof fetch;
  /** 轮询间隔的等待器。默认真 setTimeout;测试注入即时 resolve。 */
  sleep: (ms: number) => Promise<void>;
  /** 轮询间隔(ms)。 */
  pollIntervalMs: number;
  /** 轮询最大次数(超出 → 超时失败,上层可接住)。M2 会把它接进 task 超时态。 */
  maxPollAttempts: number;
  /** H3 首版保守 20 分钟上限；测试可省略并复用 maxPollAttempts。 */
  h3MaxPollAttempts?: number;
}

const REAL_DEPS: MinimaxAdapterDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
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

function isH3(spec: MultimodalSpec): boolean {
  return spec.model.trim().toLowerCase() === "minimax-h3";
}

function safeReference(value: string): string {
  return `mmx-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function httpFailure(
  stage: "submit" | "poll" | "download",
  status: number,
  detail: string,
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
    `MiniMax H3 ${stage} HTTP ${status}: ${detail}`,
    {
      reason,
      stage,
      status,
      retryable: stage !== "submit" && (status === 429 || status >= 500),
    },
  );
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
      // [T-380] 以图生图(风格/主体参考):MiniMax image_generation 的 subject_reference
      // 入参 —— 数组,每项 { type:"character", image_file:<data URL base64> }(按官方公开
      // 文档惯例写;⚠️ 本环境无真 key,字段名/编码待真 key 实测核实,与本文件头部诚实边界
      // 一致)。无参考图 → 不发该字段,行为与纯文生图完全一致(零回归)。
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
  if (isH3(spec)) return generateH3Video(spec, opts, deps);
  // 1) 提交 → 拿 task_id
  const submitRes = await deps.fetch(`${base(spec)}/v1/video_generation`, {
    method: "POST",
    headers: authHeaders(spec),
    body: JSON.stringify({
      model: spec.model, // 如 "MiniMax-Hailuo-2.3" / "T2V-01"
      prompt: opts.prompt,
      prompt_optimizer: true,
      // TODO 待 MiniMax 文档核实 + 真 key 验:aspectRatio → duration/resolution 映射;
      //   firstFrame(image-to-video 首帧)在此端点的确切入参名(文档未列 first_frame_image)。
      //   结构位已留,真参数名/编码(base64 or file_id)待文档核实。
      ...(opts.firstFrame ? { /* first_frame_image: <TODO 编码方式待核实> */ } : {}),
    }),
  });
  if (!submitRes.ok) {
    throw new MultimodalGenerationError(
      `MiniMax video_generation 提交 HTTP ${submitRes.status}: ${await safeText(submitRes)}`,
    );
  }
  const submit = (await submitRes.json()) as MinimaxVideoSubmitResponse;
  const taskId = submit.task_id;
  if (!taskId) {
    throw new MultimodalGenerationError(
      "MiniMax video_generation 提交未返 task_id",
    );
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
  const ratio = opts.aspectRatio ?? "9:16";
  if (!prompt || prompt.length > 7_000) {
    throw new MultimodalGenerationError("MiniMax H3 prompt 必须为 1–7000 字", {
      reason: "response_contract",
      stage: "submit",
    });
  }
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new MultimodalGenerationError("MiniMax H3 duration 必须为 4–15 秒整数", {
      reason: "response_contract",
      stage: "submit",
    });
  }
  if (resolution !== "768P" && resolution !== "2K") {
    throw new MultimodalGenerationError("MiniMax H3 resolution 只支持 768P / 2K", {
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
          content: [{ type: "text", text: prompt }],
          duration,
          resolution,
          ratio,
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
      throw httpFailure("submit", submitRes.status, await safeText(submitRes));
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
      reason: "download",
      stage: "download",
      reference: safeReference(taskId),
      retryable: true,
    });
  }
  if (!bytesRes.ok) {
    throw httpFailure("download", bytesRes.status, "成片下载失败");
  }
  const assetBytes = new Uint8Array(await bytesRes.arrayBuffer());
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
    if (!res.ok) throw httpFailure("poll", res.status, await safeText(res));
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
    const res = await deps.fetch(
      `${base(spec)}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: authHeaders(spec) },
    );
    if (!res.ok) {
      throw new MultimodalGenerationError(
        `MiniMax query/video_generation HTTP ${res.status}: ${await safeText(res)}`,
      );
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
    `MiniMax video task 轮询超时(task_id=${taskId},${deps.maxPollAttempts} 次未完成)`,
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
  const metaRes = await deps.fetch(
    `${base(spec)}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { method: "GET", headers: authHeaders(spec) },
  );
  if (!metaRes.ok) {
    throw new MultimodalGenerationError(
      `MiniMax files/retrieve HTTP ${metaRes.status}: ${await safeText(metaRes)}`,
    );
  }
  const meta = (await metaRes.json()) as MinimaxFileRetrieveResponse;
  const downloadUrl = meta.file?.download_url;
  if (!downloadUrl) {
    throw new MultimodalGenerationError(
      `MiniMax files/retrieve 无 download_url(file_id=${fileId})`,
    );
  }
  const bytesRes = await deps.fetch(downloadUrl, { method: "GET" });
  if (!bytesRes.ok) {
    throw new MultimodalGenerationError(
      `MiniMax 视频下载 HTTP ${bytesRes.status}`,
    );
  }
  return new Uint8Array(await bytesRes.arrayBuffer());
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
  return {
    generateImage: (spec, opts) => generateImage(spec, opts, deps),
    generateVideo: (spec, opts) => generateVideo(spec, opts, deps),
  };
}
