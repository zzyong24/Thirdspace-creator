// MiniMax 多模态适配器(SPEC 2026-07-01 §2.2 / §8 M1)—— 实现 MultimodalProviderAdapter,
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
}

const REAL_DEPS: MinimaxAdapterDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  pollIntervalMs: 5_000,
  maxPollAttempts: 60, // 5s × 60 ≈ 5 min 上限
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

/** 构造 MiniMax 适配器。deps 可注入(测试零成本);默认走真 fetch + 真 setTimeout 轮询。 */
export function createMinimaxAdapter(
  deps: MinimaxAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    generateImage: (spec, opts) => generateImage(spec, opts, deps),
    generateVideo: (spec, opts) => generateVideo(spec, opts, deps),
  };
}
