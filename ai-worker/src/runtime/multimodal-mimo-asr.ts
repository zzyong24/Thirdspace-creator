import {
  MultimodalGenerationError,
  type GeneratedTranscript,
  type MultimodalProviderAdapter,
  type MultimodalSpec,
  type TranscribeAudioOptions,
} from "./multimodal-factory";

const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const DEFAULT_MAX_ENCODED_BYTES = 9_500_000;

export interface MimoAsrAdapterDeps {
  fetch: typeof fetch;
  /** 官方上限为 10MB；默认留出 JSON/data URL 余量，测试可注入更小值验证分段。 */
  maxEncodedBytes?: number;
}

const REAL_DEPS: MimoAsrAdapterDeps = {
  fetch: (...args) => fetch(...args),
};

function completionsUrl(spec: MultimodalSpec): string {
  const trimmed = (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function encodedDataUrlLength(rawBytes: number): number {
  return "data:audio/mpeg;base64,".length + 4 * Math.ceil(rawBytes / 3);
}

function maxRawBytes(maxEncodedBytes: number): number {
  const payload = Math.max(
    4,
    maxEncodedBytes - "data:audio/mpeg;base64,".length,
  );
  return Math.max(1, Math.floor(payload / 4) * 3);
}

function synchsafeSize(bytes: Uint8Array): number {
  return (
    ((bytes[6] ?? 0) & 0x7f) * 0x200000 +
    ((bytes[7] ?? 0) & 0x7f) * 0x4000 +
    ((bytes[8] ?? 0) & 0x7f) * 0x80 +
    ((bytes[9] ?? 0) & 0x7f)
  );
}

function mp3FrameLength(bytes: Uint8Array, offset: number): number | null {
  const b1 = bytes[offset];
  const b2 = bytes[offset + 1];
  const b3 = bytes[offset + 2];
  if (b1 !== 0xff || b2 === undefined || (b2 & 0xe0) !== 0xe0 || b3 === undefined) {
    return null;
  }
  const versionBits = (b2 >> 3) & 0x03;
  const layerBits = (b2 >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return null; // reserved / 非 Layer III
  const bitrateIndex = (b3 >> 4) & 0x0f;
  const sampleIndex = (b3 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null;
  const mpeg1Bitrates = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ];
  const mpeg2Bitrates = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
  ];
  const baseSampleRates = [44100, 48000, 32000];
  const mpeg1 = versionBits === 3;
  const divisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
  const bitrate = (mpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex]! * 1000;
  const sampleRate = Math.floor(baseSampleRates[sampleIndex]! / divisor);
  const padding = (b3 >> 1) & 0x01;
  return Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate + padding);
}

/**
 * 按 MP3 帧边界拆分，保证每段都能独立解码；不能可靠识别帧时明确失败，不做任意字节截断。
 * 当前抖音抽音固定输出 16kHz/单声道/mp3，因此会稳定走此路径。
 */
export function splitMp3ForDataUrl(
  bytes: Uint8Array,
  maxEncodedBytes = DEFAULT_MAX_ENCODED_BYTES,
  providerLabel = "ASR",
): Uint8Array[] {
  if (encodedDataUrlLength(bytes.byteLength) <= maxEncodedBytes) return [bytes];
  const rawLimit = maxRawBytes(maxEncodedBytes);
  let cursor =
    bytes.byteLength >= 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
      ? Math.min(bytes.byteLength, 10 + synchsafeSize(bytes))
      : 0;
  const frames: Array<{ start: number; end: number }> = [];
  while (cursor + 4 <= bytes.byteLength) {
    const length = mp3FrameLength(bytes, cursor);
    if (!length || cursor + length > bytes.byteLength) {
      cursor += 1;
      continue;
    }
    frames.push({ start: cursor, end: cursor + length });
    cursor += length;
  }
  if (frames.length === 0) {
    throw new MultimodalGenerationError(
      `${providerLabel} 音频超过单次上限，且无法按 MP3 帧安全分段；请重试或检查音频格式。`,
    );
  }
  const chunks: Uint8Array[] = [];
  let chunkStart = frames[0]!.start;
  let chunkEnd = chunkStart;
  for (const frame of frames) {
    if (chunkEnd > chunkStart && frame.end - chunkStart > rawLimit) {
      chunks.push(bytes.slice(chunkStart, chunkEnd));
      chunkStart = frame.start;
    }
    chunkEnd = frame.end;
  }
  if (chunkEnd > chunkStart) chunks.push(bytes.slice(chunkStart, chunkEnd));
  if (
    chunks.length === 0 ||
    chunks.some((chunk) => encodedDataUrlLength(chunk.byteLength) > maxEncodedBytes)
  ) {
    throw new MultimodalGenerationError(
      `${providerLabel} 音频分段后仍超过单次上限，请重试。`,
    );
  }
  return chunks;
}

export function splitMp3ForMimo(
  bytes: Uint8Array,
  maxEncodedBytes = DEFAULT_MAX_ENCODED_BYTES,
): Uint8Array[] {
  return splitMp3ForDataUrl(bytes, maxEncodedBytes, "MiMo ASR");
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

interface MimoResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function transcribeChunk(
  spec: MultimodalSpec,
  bytes: Uint8Array,
  language: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  const data = `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
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
        language: language === "zh" || language === "en" ? language : "auto",
      },
    }),
  });
  if (!res.ok) {
    throw new MultimodalGenerationError(
      `MiMo ASR HTTP ${res.status}: ${await safeText(res)}`,
    );
  }
  const json = (await res.json()) as MimoResponse;
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new MultimodalGenerationError("MiMo ASR 未返回逐字稿正文");
  }
  return text.trim();
}

async function transcribeAudio(
  spec: MultimodalSpec,
  opts: TranscribeAudioOptions,
  deps: MimoAsrAdapterDeps,
): Promise<GeneratedTranscript> {
  const chunks = splitMp3ForMimo(
    opts.audioBytes,
    deps.maxEncodedBytes ?? DEFAULT_MAX_ENCODED_BYTES,
  );
  const texts: string[] = [];
  for (const chunk of chunks) {
    texts.push(await transcribeChunk(spec, chunk, opts.language, deps.fetch));
  }
  return {
    text: texts.join("\n"),
    ...(opts.language === "zh" || opts.language === "en"
      ? { language: opts.language }
      : {}),
  };
}

export function createMimoAsrAdapter(
  deps: MimoAsrAdapterDeps = REAL_DEPS,
): MultimodalProviderAdapter {
  return {
    transcribeAudio: (spec, opts) => transcribeAudio(spec, opts, deps),
  };
}
