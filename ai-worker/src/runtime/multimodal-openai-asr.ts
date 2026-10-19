import {readActualProviderTiming} from "./asr-provider-timing";
import {createAsrRequestExecutor, snapshotAsrInput} from "./asr-request";
// OpenAI 兼容 ASR 适配器(T-030-D1,SPEC §5.1 / D-d)—— 实现 MultimodalProviderAdapter 的
// `transcribeAudio`,直连 OpenAI 兼容的 `POST {baseUrl}/v1/audio/transcriptions`(multipart
// form-data:file + model,Bearer 鉴权),返回体取 `.text`。**一个适配器覆盖 SiliconFlow /
// OpenAI / Groq**——三者转写端点同形状(SPEC D-d:skill 已用 SiliconFlow `FunAudioLLM/
// SenseVoiceSmall` 验过)。minimax 的 REST 形状不同(且无转写),ASR 不复用它。
//
// 与 minimax 适配器同款:副作用(fetch)可注入 → 单测零成本(fake fetch,不走网络/不需 key)。
// image 同步、video 异步、audio(本文件)同步一次请求即回文本——结构最简。

import {
  MultimodalGenerationError,
  type GeneratedTranscript,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
  type TranscribeAudioOptions,
} from "./multimodal-factory";

// SiliconFlow 官方默认端点(SPEC §5.1 建议值;用户可在设置/env 覆盖 baseUrl)。
const DEFAULT_BASE_URL = "https://api.siliconflow.cn";

/** 可注入的副作用(测试零成本:注入 fake fetch;真跑时用默认全局 fetch)。 */
export interface OpenaiAsrAdapterDeps {
  fetch: typeof fetch;
}

const REAL_DEPS: OpenaiAsrAdapterDeps = {
  fetch: (...args) => fetch(...args),
};

/**
 * 拼出转写端点 URL。用户配的 baseUrl 三种都要 robust 归一,不重复路径:
 *   ① 裸域名 `https://api.siliconflow.cn` → `{origin}/v1/audio/transcriptions`
 *   ② 带 `/v1` `https://api.siliconflow.cn/v1` → `{origin}/v1/audio/transcriptions`(不重复 /v1)
 *   ③ **已是完整端点** `https://api.siliconflow.cn/v1/audio/transcriptions` → **原样用**
 *      (否则再拼一次 `/v1/audio/transcriptions` → 双路径 404,真机踩过)
 * null → 走 provider 默认端点。
 */
export function transcriptionsUrl(spec: MultimodalSpec): string {
  const trimmed = (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  // ③ baseUrl 已指向转写端点(含 /audio/transcriptions)→ 直接用,别再拼。
  if (trimmed.endsWith("/audio/transcriptions")) return trimmed;
  // ① / ② 归一:去掉尾部 /v1 再补全,避免重复 /v1。
  const root = trimmed.endsWith("/v1") ? trimmed.slice(0, -"/v1".length) : trimmed;
  return `${root}/v1/audio/transcriptions`;
}

async function transcribeAudio(
  spec: MultimodalSpec,
  opts: TranscribeAudioOptions,
  deps: OpenaiAsrAdapterDeps,
): Promise<GeneratedTranscript> {
  ({spec, opts} = snapshotAsrInput(spec, opts));
  const execute = createAsrRequestExecutor(spec,opts,transcriptionsUrl(spec),'openai-audio-transcriptions.v1');
  return execute(opts.audioBytes,0,1,async()=>{
  // multipart/form-data:file(音频字节)+ model(+ 可选 language)。用全局 FormData/Blob
  // (Node 22 / undici 内建),fetch 会自动带 boundary 的 Content-Type —— 故**不手动设**
  // Content-Type(手动设会漏掉 boundary,导致服务端解析失败)。
  const form = new FormData();
  // Uint8Array → Blob;filename 随便给一个(端点按 model 转写,不看扩展名语义,但需一个 name)。
  const blob = new Blob([bytesToArrayBuffer(opts.audioBytes)], {
    type: "application/octet-stream",
  });
  form.append("file", blob, "audio.mp3");
  form.append("model", spec.model);
  if(opts.timestampMode){form.append("response_format","verbose_json");form.append("timestamp_granularities[]",opts.timestampMode==="word"?"word":"segment");}
  if (opts.language) form.append("language", opts.language);

  const res = await deps.fetch(transcriptionsUrl(spec), {
    method: "POST",
    signal: opts.signal,
    headers: {
      // 仅 Authorization;Content-Type 交给 FormData 自动生成(含 multipart boundary)。
      Authorization: `Bearer ${spec.token}`,
    },
    body: form,
  });
  if (!res.ok) {
    throw Object.assign(new MultimodalGenerationError(
      `ASR audio/transcriptions HTTP ${res.status}: ${await safeText(res)}`,
    ),{statusCode:res.status});
  }
  const rawResponse=await res.text(),json=JSON.parse(rawResponse) as OpenaiTranscriptionResponse;
  const timing=opts.timestampMode&&opts.timingAudio?readActualProviderTiming({rawResponse,response:json,audioBytes:opts.audioBytes,granularity:opts.timestampMode,...opts.timingAudio}):null;
  // OpenAI 兼容转写(默认 response_format=json)返 `{ text, language? }`。
  if (typeof json.text !== "string") {
    throw new MultimodalGenerationError(
      "ASR audio/transcriptions 未返 text 字段(响应体不含逐字稿)",
    );
  }
  return {
    text: json.text,...(timing?{timing}:{}),
    ...(typeof json.language === "string" ? { language: json.language } : {}),
  };
  });
}

// Uint8Array → 精确切片的 ArrayBuffer(避免带上 view 之外的底层 buffer 尾部字节)。
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

// OpenAI 兼容转写响应(SiliconFlow / OpenAI / Groq 同形状,default json 格式)。
interface OpenaiTranscriptionResponse {
  text?: string;
  language?: string;
}

/** 构造 OpenAI 兼容 ASR 适配器。deps 可注入(测试零成本);默认走真全局 fetch。
 *  仅实现 transcribeAudio —— 不出图/视频(那些走各自 provider 的适配器)。 */
export function createOpenaiAsrAdapter(
  deps: OpenaiAsrAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    transcribeAudio: (spec, opts) => transcribeAudio(spec, opts, deps),
  };
}
