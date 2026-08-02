import {
  MultimodalGenerationError,
  type GeneratedAsset,
  type GenerateVideoOptions,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
} from "./multimodal-factory";

// OmniHi 的 Seedance 视频接口是异步任务协议：提交 generation → 轮询 job → 下载成品。
// `omnihi` 是规范 provider 名；宿主同时给历史 `seedance` / `seeddance` 拼写注册本适配器。
const DEFAULT_BASE_URL = "https://api.omnihi.ai/media/v1";

export interface OmnihiVideoAdapterDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  maxPollAttempts: number;
}

const REAL_DEPS: OmnihiVideoAdapterDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollIntervalMs: 5_000,
  maxPollAttempts: 120,
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function base(spec: MultimodalSpec): string {
  return (spec.baseUrl ?? DEFAULT_BASE_URL)
    .replace(/\/videos\/generations\/?$/i, "")
    .replace(/\/+$/, "");
}

function authHeaders(spec: MultimodalSpec): Record<string, string> {
  return {
    Authorization: `Bearer ${spec.token}`,
    "Content-Type": "application/json",
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

function nestedRecords(body: unknown): JsonRecord[] {
  const root = asRecord(body);
  if (!root) return [];
  return [root, asRecord(root.data), asRecord(root.result), asRecord(root.job)].filter(
    (value): value is JsonRecord => value !== null,
  );
}

function jobIdOf(body: unknown): string | null {
  for (const row of nestedRecords(body)) {
    for (const key of ["jobId", "job_id", "taskId", "task_id", "id"]) {
      const value = nonEmptyString(row[key]);
      if (value) return value;
    }
  }
  return null;
}

function statusOf(body: unknown): string {
  for (const row of nestedRecords(body)) {
    const value = nonEmptyString(row.status) ?? nonEmptyString(row.state);
    if (value) return value.toLowerCase();
  }
  return "";
}

function providerErrorOf(body: unknown): string | null {
  for (const row of nestedRecords(body)) {
    const direct =
      nonEmptyString(row.message) ??
      nonEmptyString(row.error_message) ??
      nonEmptyString(row.failed_reason);
    if (direct) return direct;
    const error = asRecord(row.error);
    const nested = error
      ? nonEmptyString(error.message) ?? nonEmptyString(error.detail)
      : null;
    if (nested) return nested;
  }
  return null;
}

const URL_KEYS = [
  "url",
  "output_url",
  "video_url",
  "videoUrl",
  "download_url",
  "downloadUrl",
] as const;
const OUTPUT_KEYS = ["output", "result", "data", "video", "file"] as const;
const OUTPUT_ARRAY_KEYS = ["outputs", "results", "videos", "files"] as const;

function outputUrlOf(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  const directString = nonEmptyString(value);
  if (directString && /^https?:\/\//i.test(directString)) return directString;
  const row = asRecord(value);
  if (!row) return null;
  for (const key of URL_KEYS) {
    const url = nonEmptyString(row[key]);
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  for (const key of OUTPUT_KEYS) {
    const url = outputUrlOf(row[key], depth + 1);
    if (url) return url;
  }
  for (const key of OUTPUT_ARRAY_KEYS) {
    const values = row[key];
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      const url = outputUrlOf(item, depth + 1);
      if (url) return url;
    }
  }
  return null;
}

const DONE_STATUSES = new Set(["completed", "complete", "succeeded", "success", "done"]);
const FAILED_STATUSES = new Set(["failed", "fail", "error", "cancelled", "canceled"]);

async function submit(
  spec: MultimodalSpec,
  opts: GenerateVideoOptions,
  deps: OmnihiVideoAdapterDeps,
): Promise<string> {
  const response = await deps.fetch(`${base(spec)}/videos/generations`, {
    method: "POST",
    headers: authHeaders(spec),
    body: JSON.stringify({
      model: spec.model,
      input: { prompt: opts.prompt },
      parameters: {
        mode: "t2v",
        // Seedance 当前最短稳定档为 4 秒；用户要 2 秒时先生成最短片段，项目内再裁切。
        duration: 4,
        resolution: "480p",
        aspect_ratio: opts.aspectRatio ?? "9:16",
        // 渠道下发的 Seedance 省钱档关闭原生音频；口播音轨由项目制作链独立处理。
        generate_audio: false,
      },
    }),
  });
  if (!response.ok) {
    throw new MultimodalGenerationError(
      `OmniHi 视频任务提交失败(HTTP ${response.status}): ${await safeText(response)}`,
    );
  }
  const body = (await response.json()) as unknown;
  const jobId = jobIdOf(body);
  if (!jobId) {
    throw new MultimodalGenerationError("OmniHi 视频任务提交成功但没有返回任务 ID");
  }
  return jobId;
}

async function waitForOutputUrl(
  spec: MultimodalSpec,
  jobId: string,
  deps: OmnihiVideoAdapterDeps,
): Promise<string> {
  for (let attempt = 0; attempt < deps.maxPollAttempts; attempt += 1) {
    const response = await deps.fetch(
      `${base(spec)}/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET", headers: authHeaders(spec) },
    );
    if (!response.ok) {
      throw new MultimodalGenerationError(
        `OmniHi 视频任务查询失败(HTTP ${response.status}): ${await safeText(response)}`,
      );
    }
    const body = (await response.json()) as unknown;
    const status = statusOf(body);
    if (FAILED_STATUSES.has(status)) {
      const detail = providerErrorOf(body);
      throw new MultimodalGenerationError(
        `OmniHi 视频任务失败${detail ? `: ${detail}` : ""}`,
      );
    }
    const outputUrl = outputUrlOf(body);
    if (outputUrl && (DONE_STATUSES.has(status) || !status)) return outputUrl;
    if (DONE_STATUSES.has(status)) {
      throw new MultimodalGenerationError("OmniHi 视频任务已完成但没有返回成品地址");
    }
    await deps.sleep(deps.pollIntervalMs);
  }
  throw new MultimodalGenerationError(
    `OmniHi 视频任务轮询超时(${deps.maxPollAttempts} 次未完成)`,
  );
}

async function generateVideo(
  spec: MultimodalSpec,
  opts: GenerateVideoOptions,
  deps: OmnihiVideoAdapterDeps,
): Promise<GeneratedAsset> {
  const jobId = await submit(spec, opts, deps);
  const outputUrl = await waitForOutputUrl(spec, jobId, deps);
  const response = await deps.fetch(outputUrl, { method: "GET" });
  if (!response.ok) {
    throw new MultimodalGenerationError(
      `OmniHi 视频成品下载失败(HTTP ${response.status})`,
    );
  }
  const assetBytes = new Uint8Array(await response.arrayBuffer());
  if (assetBytes.byteLength === 0) {
    throw new MultimodalGenerationError("OmniHi 视频成品为空");
  }
  return { assetBytes };
}

export function createOmnihiVideoAdapter(
  deps: OmnihiVideoAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    generateVideo: (spec, opts) => generateVideo(spec, opts, deps),
  };
}
