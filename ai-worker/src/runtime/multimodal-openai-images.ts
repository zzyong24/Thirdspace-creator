// OpenAI 兼容生图适配器(T-379,调研 docs/research/2026-07-17-image-video-gen-provider-
// landscape-research.md)—— 实现 MultimodalProviderAdapter 的 `generateImage`,直连 OpenAI
// 兼容的 `POST {baseUrl}/v1/images/generations`(JSON body:model+prompt+size,Bearer 鉴权),
// 响应取 `data[0].b64_json` 或 `data[0].url`(两种都支持:b64 直接解码,url 再 GET 下载字节)。
// **一个适配器覆盖一大片**:gpt-image 系(OpenAI 官方)+ one-api/new-api 系中转站(把
// Seedream/Flux/Nano Banana 等各家生图统一转发成同一端点形状)—— 与 ASR 的
// multimodal-openai-asr.ts(一个 adapter 覆盖 SiliconFlow/OpenAI/Groq)完全同款套路。
// 用户真实样例(2026-07-17):`POST https://dudu.mom/v1/images/generations
//   {"model":"gpt-image-2-4K","prompt":"...","size":"1024x1024"}`。
//
// 与 minimax 适配器同一出参契约([gate-F1]):只返 `{ assetBytes: Uint8Array }`,上层零分支。
// 副作用(fetch)可注入 → 单测零成本(fake fetch,不走网络/不需 key)。
//
// 注意两处「按需省略」的兼容性抉择(都是为覆盖面最大化):
//   - **不发 response_format**:gpt-image 系(gpt-image-1 起)不接受该参数(发了报 4xx),
//     DALL·E 系默认返 url —— 故省略之,响应侧 b64_json/url 双支持,谁来接谁。
//   - **size 仅在能安全映射时才发**:aspectRatio → size 的映射按 gpt-image 系公版尺寸
//     (1024x1024 / 1024x1536 / 1536x1024);映射不到的比例省略 size(端点用自身默认),
//     不瞎猜尺寸招 4xx。

import {
  MultimodalGenerationError,
  type GeneratedAsset,
  type GenerateImageOptions,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
} from "./multimodal-factory";

// OpenAI 官方默认端点(用户可在设置/env 覆盖 baseUrl;中转站必配自己的 baseUrl)。
const DEFAULT_BASE_URL = "https://api.openai.com";

/** 可注入的副作用(测试零成本:注入 fake fetch;真跑时用默认全局 fetch)。 */
export interface OpenaiImagesAdapterDeps {
  fetch: typeof fetch;
}

const REAL_DEPS: OpenaiImagesAdapterDeps = {
  fetch: (...args) => fetch(...args),
};

/**
 * 拼出生图端点 URL。与 multimodal-openai-asr 的 transcriptionsUrl 同款三态归一:
 *   ① 裸域名 `https://dudu.mom` → `{origin}/v1/images/generations`
 *   ② 带 `/v1` `https://dudu.mom/v1` → `{origin}/v1/images/generations`(不重复 /v1)
 *   ③ **已是完整端点** `…/v1/images/generations` → **原样用**(不重复拼,ASR 真机踩过双路径 404)
 * null → OpenAI 官方默认端点。
 */
function generationsUrl(spec: MultimodalSpec): string {
  const trimmed = (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (trimmed.endsWith("/images/generations")) return trimmed;
  const root = trimmed.endsWith("/v1") ? trimmed.slice(0, -"/v1".length) : trimmed;
  return `${root}/v1/images/generations`;
}

// aspectRatio → OpenAI 兼容 size。只映射 gpt-image 系公版三档;别的比例(如 21:9)不硬猜
// —— 省略 size 让端点用默认,比发一个各家都可能拒的尺寸稳。竖屏(抖音 9:16/3:4)→ 竖版,
// 横屏 → 横版,方 → 方。
function sizeFromAspectRatio(aspectRatio?: string): string | undefined {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024";
    case "9:16":
    case "3:4":
    case "2:3":
      return "1024x1536";
    case "16:9":
    case "4:3":
    case "3:2":
      return "1536x1024";
    default:
      return undefined;
  }
}

// 错误分类成人话(与 T-376 describeMultimodalFailure 的分层配合:这里给出可判读的原因,
// 上层统一包「已配置,但调用失败:<原因>」)。401/403=鉴权;其余 4xx=参数/模型名;5xx=服务端。
function classifyHttpError(status: number, bodyHead: string): string {
  if (status === 401 || status === 403) {
    return `鉴权失败(HTTP ${status}):API key 无效或无权限。${bodyHead}`;
  }
  if (status >= 400 && status < 500) {
    return `请求被拒(HTTP ${status}):多为模型名不对或参数不被该端点支持。${bodyHead}`;
  }
  if (status >= 500) {
    return `服务端错误(HTTP ${status}),稍后重试。${bodyHead}`;
  }
  return `HTTP ${status}:${bodyHead}`;
}

async function generateImage(
  spec: MultimodalSpec,
  opts: GenerateImageOptions,
  deps: OpenaiImagesAdapterDeps,
): Promise<GeneratedAsset> {
  const size = sizeFromAspectRatio(opts.aspectRatio);
  const res = await deps.fetch(generationsUrl(spec), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spec.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: spec.model, // 如 "gpt-image-2-4K" / 中转站转发的任意生图 model id
      prompt: opts.prompt,
      n: 1,
      ...(size ? { size } : {}),
      // 不发 response_format(gpt-image 系拒收该参数);响应侧 b64_json / url 双支持。
    }),
  });
  if (!res.ok) {
    throw new MultimodalGenerationError(
      `OpenAI 兼容 images/generations ${classifyHttpError(res.status, await safeText(res))}`,
    );
  }
  const json = (await res.json()) as OpenaiImagesResponse;
  const first = json.data?.[0];
  if (first?.b64_json) {
    return { assetBytes: new Uint8Array(Buffer.from(first.b64_json, "base64")) };
  }
  if (first?.url) {
    return { assetBytes: await downloadBytes(first.url, deps) };
  }
  throw new MultimodalGenerationError(
    "OpenAI 兼容 images/generations 未返图片(data[0] 无 b64_json 也无 url;可能被内容审核拦截或端点不支持该模型出图)",
  );
}

// url 型响应 → 下载字节(产出 URL 通常短时效,当场拉下来落成 bytes,与 b64 同一出参)。
async function downloadBytes(
  url: string,
  deps: OpenaiImagesAdapterDeps,
): Promise<Uint8Array> {
  const res = await deps.fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new MultimodalGenerationError(
      `生图产物下载失败(HTTP ${res.status}):${url}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

// OpenAI 兼容生图响应(官方 + one-api/new-api 中转同形状):data[] 每项 url 或 b64_json 其一。
interface OpenaiImagesResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
}

/** 构造 OpenAI 兼容生图适配器。deps 可注入(测试零成本);默认走真全局 fetch。
 *  仅实现 generateImage —— 生视频各家形态不统一(见调研裁决),不在此适配器做。 */
export function createOpenaiImagesAdapter(
  deps: OpenaiImagesAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    generateImage: (spec, opts) => generateImage(spec, opts, deps),
  };
}
