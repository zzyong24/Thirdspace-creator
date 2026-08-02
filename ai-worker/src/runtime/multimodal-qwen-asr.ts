import {
  MultimodalGenerationError,
  type GeneratedTranscript,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
  type TranscribeAudioOptions,
} from "./multimodal-factory";
import { splitMp3ForDataUrl } from "./multimodal-mimo-asr";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

// Qwen3-ASR-Flash 同步接口单文件上限 10MB / 5 分钟。CreatorOS 抽音固定为
// 16kHz、单声道、64kbps MP3；3.1MB data URL 约对应 2.32MB 原始 MP3（约 4分50秒），
// 同时为 JSON 开销留余量。更长音频按 MP3 帧边界依次转写，不做危险字节截断。
const DEFAULT_MAX_ENCODED_BYTES = 3_100_000;

export interface QwenAsrAdapterDeps {
  fetch: typeof fetch;
  maxEncodedBytes?: number;
}

const REAL_DEPS: QwenAsrAdapterDeps = {
  fetch: (...args) => fetch(...args),
};

function completionsUrl(spec: MultimodalSpec): string {
  const trimmed = (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

interface QwenAsrResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function transcribeChunk(
  spec: MultimodalSpec,
  bytes: Uint8Array,
  language: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  const data = `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
  const normalizedLanguage = language?.trim();
  // CreatorOS 既有转写链默认传 `zh`，但 Qwen 的 `zh` 不包含粤语（需 `yue`）。
  // 对未知来源音频保留 Qwen 自动语种/方言识别，只有调用方明确指定非默认语种时才锁定。
  const requestedLanguage =
    normalizedLanguage && normalizedLanguage !== "zh"
      ? normalizedLanguage
      : undefined;
  const res = await fetchImpl(completionsUrl(spec), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${spec.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: spec.model,
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data } }],
        },
      ],
      asr_options: {
        ...(requestedLanguage ? { language: requestedLanguage } : {}),
        enable_itn: true,
      },
    }),
  });
  if (!res.ok) {
    throw new MultimodalGenerationError(
      `Qwen ASR HTTP ${res.status}: ${await safeText(res)}`,
    );
  }
  const json = (await res.json()) as QwenAsrResponse;
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new MultimodalGenerationError("Qwen ASR 未返回逐字稿正文");
  }
  return text.trim();
}

async function transcribeAudio(
  spec: MultimodalSpec,
  opts: TranscribeAudioOptions,
  deps: QwenAsrAdapterDeps,
): Promise<GeneratedTranscript> {
  const chunks = splitMp3ForDataUrl(
    opts.audioBytes,
    deps.maxEncodedBytes ?? DEFAULT_MAX_ENCODED_BYTES,
    "Qwen ASR",
  );
  const texts: string[] = [];
  for (const chunk of chunks) {
    texts.push(await transcribeChunk(spec, chunk, opts.language, deps.fetch));
  }
  const language = opts.language?.trim();
  return {
    text: texts.join("\n"),
    ...(language ? { language } : {}),
  };
}

export function createQwenAsrAdapter(
  deps: QwenAsrAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    transcribeAudio: (spec, opts) => transcribeAudio(spec, opts, deps),
  };
}
