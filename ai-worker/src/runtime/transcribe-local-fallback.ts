import { isAsrExecutionControlError } from "./asr-request";
import type { GeneratedTranscript, MultimodalSpec } from "./multimodal-factory";

// T-915：从宿主凭据装配中迁出纯运行时回退；不申请 lease，也不读写持久状态。
export function localWhisperSpec(): MultimodalSpec {
  return {
    provider: "whisper-local",
    baseUrl: null,
    model: "small",
    token: "",
    kind: "audio",
  };
}

export type TranscribeExecutionMode =
  | "channel-managed"
  | "configured-cloud"
  | "whisper-local";

export type TranscribeWithFallbackResult = {
  readonly transcript: GeneratedTranscript;
  readonly effectiveSpec: MultimodalSpec;
  readonly mode: TranscribeExecutionMode;
};

export type LocalWhisperFailureCode =
  | "LOCAL_WHISPER_AUDIO_DECODE"
  | "LOCAL_WHISPER_AUDIO_EMPTY"
  | "LOCAL_WHISPER_RUNTIME_LOAD"
  | "LOCAL_WHISPER_MODEL_LOAD"
  | "LOCAL_WHISPER_INFERENCE"
  | "LOCAL_WHISPER_TRANSCRIPT_EMPTY"
  | "LOCAL_WHISPER_WORKER_CRASH"
  | "LOCAL_WHISPER_WORKER_EXIT"
  | "LOCAL_WHISPER_WORKER_UNKNOWN"
  | "LOCAL_WHISPER_UNKNOWN";

const LOCAL_WHISPER_FAILURE_CODES = new Set<LocalWhisperFailureCode>([
  "LOCAL_WHISPER_AUDIO_DECODE",
  "LOCAL_WHISPER_AUDIO_EMPTY",
  "LOCAL_WHISPER_RUNTIME_LOAD",
  "LOCAL_WHISPER_MODEL_LOAD",
  "LOCAL_WHISPER_INFERENCE",
  "LOCAL_WHISPER_TRANSCRIPT_EMPTY",
  "LOCAL_WHISPER_WORKER_CRASH",
  "LOCAL_WHISPER_WORKER_EXIT",
  "LOCAL_WHISPER_WORKER_UNKNOWN",
  "LOCAL_WHISPER_UNKNOWN",
]);

function localWhisperFailureCode(error: unknown): LocalWhisperFailureCode {
  const reference =
    error && typeof error === "object" && "reference" in error
      ? String(error.reference)
      : "";
  return LOCAL_WHISPER_FAILURE_CODES.has(reference as LocalWhisperFailureCode)
    ? (reference as LocalWhisperFailureCode)
    : "LOCAL_WHISPER_UNKNOWN";
}

/** 本地推理失败的稳定用户面错误。底层 ffmpeg/ONNX/worker 信息不得进入 message。 */
export class LocalWhisperTranscribeError extends Error {
  readonly code: LocalWhisperFailureCode;

  constructor(code: LocalWhisperFailureCode = "LOCAL_WHISPER_UNKNOWN") {
    super("本地转写失败，请重试。");
    this.name = "LocalWhisperTranscribeError";
    this.code = code;
  }
}

function hasTranscriptText(value: GeneratedTranscript): boolean {
  return typeof value?.text === "string" && value.text.trim().length > 0;
}

function executionModeFor(spec: MultimodalSpec): TranscribeExecutionMode {
  if (spec.provider === "whisper-local") return "whisper-local";
  return spec.displayModelKey === "channel-managed"
    ? "channel-managed"
    : "configured-cloud";
}

async function invokeLocalWhisper(
  invoke: (current: MultimodalSpec) => Promise<GeneratedTranscript>,
): Promise<TranscribeWithFallbackResult> {
  const effectiveSpec = localWhisperSpec();
  try {
    const transcript = await invoke(effectiveSpec);
    if (!hasTranscriptText(transcript)) {
      throw Object.assign(new Error("empty local transcript"), {
        reference: "LOCAL_WHISPER_TRANSCRIPT_EMPTY",
      });
    }
    return { transcript, effectiveSpec, mode: "whisper-local" };
  } catch (error) {
    if(isAsrExecutionControlError(error))throw error;
    // 不附带 cause，避免调用方把绝对路径、stderr、token 或 worker 细节序列化到用户面。
    throw new LocalWhisperTranscribeError(localWhisperFailureCode(error));
  }
}

/**
 * 任意非本地 ASR 失败（含空文本/坏结果）后，同一音频只改走一次本地 Whisper。
 * 本函数不申请凭据，因此不会换幂等键或重复扣费；本地失败不会递归。
 */
export async function transcribeWithLocalFallback(
  spec: MultimodalSpec,
  invoke: (current: MultimodalSpec) => Promise<GeneratedTranscript>,
): Promise<TranscribeWithFallbackResult> {
  if (spec.provider === "whisper-local") {
    return invokeLocalWhisper(invoke);
  }
  try {
    const transcript = await invoke(spec);
    if (!hasTranscriptText(transcript)) throw new Error("empty online transcript");
    return {
      transcript,
      effectiveSpec: spec,
      mode: executionModeFor(spec),
    };
  } catch (error) {
    if(isAsrExecutionControlError(error))throw error;
    return invokeLocalWhisper(invoke);
  }
}
