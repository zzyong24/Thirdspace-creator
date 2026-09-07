import { describe, expect, it, vi } from "vitest";
import type { GeneratedTranscript, MultimodalSpec } from "./multimodal-factory";
import { AsrExecutionInterruption } from "./asr-request";
import { localWhisperSpec, LocalWhisperTranscribeError, transcribeWithLocalFallback } from "./transcribe-local-fallback";

const SPEC: MultimodalSpec = {
  provider: "qwen",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3-asr-flash",
  token: "",
  kind: "audio",
  credentialLifecycle: "per_request",
  serviceId: "qwen-asr-main",
  apiFormat: "qwen_chat_audio",
  displayModelKey: "channel-managed",
  settings: { maxDurationSeconds: 300, maxBytes: 10_485_760, chargeUnits: 25_000 },
};

describe("transcribeWithLocalFallback", () => {
  it("短效凭据调用失败后只改走本地，不再次申请凭据", async () => {
    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.credentialLifecycle === "per_request") throw new Error("timeout");
      return { text: "本地逐字稿" };
    });
    const result = await transcribeWithLocalFallback(
      { ...SPEC, token: "temporary" },
      invoke,
    );
    expect(result.transcript.text).toBe("本地逐字稿");
    expect(result.mode).toBe("whisper-local");
    expect(result.effectiveSpec.provider).toBe("whisper-local");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toMatchObject({ provider: "whisper-local" });
  });

  it("用户自配云端 ASR 失败也回退本地", async () => {
    const configuredCloud: MultimodalSpec = {
      provider: "siliconflow",
      baseUrl: "https://api.example.com/v1",
      model: "asr-model",
      token: "user-secret",
      kind: "audio",
    };
    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.provider !== "whisper-local") throw new Error("HTTP 401");
      return { text: "本地结果" };
    });
    const result = await transcribeWithLocalFallback(configuredCloud, invoke);
    expect(result.mode).toBe("whisper-local");
    expect(result.transcript.text).toBe("本地结果");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("在线返回空文本也计为失败并只回退一次", async () => {
    const invoke = vi.fn(async (current: MultimodalSpec) =>
      current.provider === "whisper-local"
        ? { text: "本地补回的逐字稿" }
        : { text: "   " });
    const result = await transcribeWithLocalFallback(SPEC, invoke);
    expect(result.transcript.text).toBe("本地补回的逐字稿");
    expect(result.mode).toBe("whisper-local");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("在线成功不调用本地，并返回真实在线执行模式", async () => {
    const invoke = vi.fn(async () => ({ text: "在线逐字稿" }));
    const result = await transcribeWithLocalFallback(SPEC, invoke);
    expect(result.transcript.text).toBe("在线逐字稿");
    expect(result.mode).toBe("channel-managed");
    expect(result.effectiveSpec).toBe(SPEC);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("用户自配云端成功记录 configured-cloud，而不是渠道或本地", async () => {
    const configuredCloud: MultimodalSpec = {
      provider: "siliconflow",
      baseUrl: "https://api.example.com/v1",
      model: "asr-model",
      token: "user-secret",
      kind: "audio",
    };
    const invoke = vi.fn(async () => ({ text: "用户云端逐字稿" }));
    const result = await transcribeWithLocalFallback(configuredCloud, invoke);
    expect(result.mode).toBe("configured-cloud");
    expect(result.effectiveSpec).toBe(configuredCloud);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("本地 Whisper 自身失败不递归，且不泄露底层路径和 stderr", async () => {
    const invoke = vi.fn(async () => {
      throw Object.assign(
        new Error(
          "ffmpeg /Users/private/bin/ffmpeg stderr=token-secret; ONNX worker crashed",
        ),
        { reference: "LOCAL_WHISPER_MODEL_LOAD" },
      );
    });
    await expect(
      transcribeWithLocalFallback(
        {
          provider: "whisper-local",
          baseUrl: null,
          model: "small",
          token: "",
          kind: "audio",
        },
        invoke,
      ),
    ).rejects.toEqual(expect.objectContaining({
      name: "LocalWhisperTranscribeError",
      message: "本地转写失败，请重试。",
      code: "LOCAL_WHISPER_MODEL_LOAD",
    } satisfies Partial<LocalWhisperTranscribeError>));
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

it('取消和持久回执未知不能进入本地回退，局部本地取消也不包装成失败',async()=>{
 const {AsrExecutionInterruption}=await import('./asr-request');
 for(const error of [new DOMException('stopped','AbortError'),new AsrExecutionInterruption()]){
  const invoke=vi.fn(async()=>{throw error;});
  await expect(transcribeWithLocalFallback(SPEC,invoke)).rejects.toBe(error);
  expect(invoke).toHaveBeenCalledTimes(1);
  await expect(transcribeWithLocalFallback({...SPEC,provider:'whisper-local'},invoke)).rejects.toBe(error);
 }
});

describe("回退边界不因迁移改变", () => {
  it("本地入口仍固定 small，且不继承云端或输入本地的凭据与配置", async () => {
    const expected = { provider: "whisper-local", baseUrl: null, model: "small", token: "", kind: "audio" };
    expect(localWhisperSpec()).toEqual(expected);
    const invoke = vi.fn(async () => ({ text: "本地结果" }));
    const result = await transcribeWithLocalFallback({ ...SPEC, provider: "whisper-local", model: "medium", token: "must-not-inherit" }, invoke);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(expected);
    expect(result.effectiveSpec).toEqual(expected);
  });

  it.each([
    "LOCAL_WHISPER_AUDIO_DECODE", "LOCAL_WHISPER_AUDIO_EMPTY", "LOCAL_WHISPER_RUNTIME_LOAD",
    "LOCAL_WHISPER_MODEL_LOAD", "LOCAL_WHISPER_INFERENCE", "LOCAL_WHISPER_TRANSCRIPT_EMPTY",
    "LOCAL_WHISPER_WORKER_CRASH", "LOCAL_WHISPER_WORKER_EXIT", "LOCAL_WHISPER_WORKER_UNKNOWN", "LOCAL_WHISPER_UNKNOWN",
  ])("保留 %s 稳定失败码，但丢弃 message/cause/任意上游字段", async reference => {
    const upstream = Object.assign(new Error("private-path token-secret stderr-secret", { cause: "secret-cause" }), { reference, token: "secret" });
    const result = await transcribeWithLocalFallback(localWhisperSpec(), async () => { throw upstream; }).catch(error => error);
    expect(result).toBeInstanceOf(LocalWhisperTranscribeError);
    expect(result.code).toBe(reference);
    expect(result.message).toBe("本地转写失败，请重试。");
    expect(result).not.toHaveProperty("cause");
    expect(JSON.stringify(result)).not.toMatch(/secret|private-path/);
  });

  it.each([undefined, "HTTP_401", "secret-reference"])("非白名单失败码 %s 归 unknown，不泄露正文", async reference => {
    const invoke = vi.fn(async () => { throw Object.assign(new Error("secret"), { reference }); });
    await expect(transcribeWithLocalFallback(SPEC, invoke)).rejects.toMatchObject({ code: "LOCAL_WHISPER_UNKNOWN", message: "本地转写失败，请重试。" });
    expect(invoke).toHaveBeenCalledTimes(2); // 一次云端，一次本地，不递归。
  });

  it.each(["", " \n "])("本地空稿 %j 失败不递归", async text => {
    const invoke = vi.fn(async () => ({ text }));
    await expect(transcribeWithLocalFallback(localWhisperSpec(), invoke)).rejects.toMatchObject({ code: "LOCAL_WHISPER_TRANSCRIPT_EMPTY" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("云端坏结果仍仅改走一次本地", async () => {
    const invoke = vi.fn(async (spec: MultimodalSpec): Promise<GeneratedTranscript> => spec.provider === "whisper-local" ? { text: "本地" } : null as unknown as GeneratedTranscript);
    expect((await transcribeWithLocalFallback(SPEC, invoke)).transcript.text).toBe("本地");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it.each(["abort", "unknown"])("云端普通失败后的本地 %s 仍原对象透传", async kind => {
    const error = kind === "abort" ? new DOMException("取消", "AbortError") : new AsrExecutionInterruption();
    const invoke = vi.fn(async (spec: MultimodalSpec) => {
      if (spec.provider !== "whisper-local") throw new Error("普通云端错误");
      throw error;
    });
    await expect(transcribeWithLocalFallback(SPEC, invoke)).rejects.toBe(error);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
