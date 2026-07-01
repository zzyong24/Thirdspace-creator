import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  resolveMultimodalSpec,
  resolveTranscribeSpec,
  MultimodalConfigError,
  TranscribeConfigError,
} from "./resolve";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const noRow = async () => null;

describe("resolveMultimodalSpec — tier 1 DB row(库存密钥优先)", () => {
  it("按 image.generate 命中行 → 投影成 MultimodalSpec(kind=image),secretValue 优先", async () => {
    const spec = await resolveMultimodalSpec(ctx, "image.generate", {
      getModelConfig: async () => ({
        provider: "minimax",
        modelName: "image-01",
        baseUrl: null,
        apiFormat: "anthropic", // 多模态解析不看 apiFormat,用 provider 分派
        secretReference: "env:MINIMAX_API_KEY",
        secretValue: "sk-stored",
        settings: {},
      }),
      env: { MINIMAX_API_KEY: "env-should-lose" },
    });
    expect(spec).toEqual({
      provider: "minimax",
      baseUrl: null,
      model: "image-01",
      token: "sk-stored", // 库存 secretValue 赢过 env-ref
      kind: "image",
    });
  });

  it("video.generate 用 env-ref secretReference 解 token,kind=video", async () => {
    const spec = await resolveMultimodalSpec(ctx, "video.generate", {
      getModelConfig: async () => ({
        provider: "minimax",
        modelName: "T2V-01",
        baseUrl: "https://api.minimax.io",
        apiFormat: "anthropic",
        secretReference: "env:MINIMAX_API_KEY",
        secretValue: null,
        settings: {},
      }),
      env: { MINIMAX_API_KEY: "tok-env" },
    });
    expect(spec.kind).toBe("video");
    expect(spec.token).toBe("tok-env");
    expect(spec.model).toBe("T2V-01");
    expect(spec.baseUrl).toBe("https://api.minimax.io");
  });

  it("per-capability 未命中 → 回退该 kind 的默认行(image.default)", async () => {
    const spec = await resolveMultimodalSpec(ctx, "image.generate", {
      getModelConfig: async (_c, cap) =>
        cap === "image.default"
          ? {
              provider: "openai",
              modelName: "gpt-image-1",
              baseUrl: null,
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "sk-img-default",
              settings: {},
            }
          : null,
      env: {},
    });
    expect(spec.provider).toBe("openai");
    expect(spec.model).toBe("gpt-image-1");
    expect(spec.token).toBe("sk-img-default");
  });

  it("空 token 的行被跳过(first_non_empty)→ 落到未配抛错", async () => {
    await expect(
      resolveMultimodalSpec(ctx, "image.generate", {
        getModelConfig: async () => ({
          provider: "minimax",
          modelName: "image-01",
          baseUrl: null,
          apiFormat: "anthropic",
          secretReference: "env:MISSING",
          secretValue: null,
          settings: {},
        }),
        env: {}, // MISSING 未定义 → token 空 → 该行不成档
      }),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
  });
});

describe("resolveMultimodalSpec — tier 2 env 默认", () => {
  it("无 DB 行时用 CREATOROS_IMAGE_*(需 provider+model+key 齐全)", async () => {
    const spec = await resolveMultimodalSpec(ctx, "image.generate", {
      getModelConfig: noRow,
      env: {
        CREATOROS_IMAGE_PROVIDER: "minimax",
        CREATOROS_IMAGE_MODEL: "image-01",
        CREATOROS_IMAGE_BASE_URL: "https://api.minimax.io",
        CREATOROS_IMAGE_SECRET_REF: "env:MINIMAX_API_KEY",
        MINIMAX_API_KEY: "tok-env",
      },
    });
    expect(spec).toEqual({
      provider: "minimax",
      baseUrl: "https://api.minimax.io",
      model: "image-01",
      token: "tok-env",
      kind: "image",
    });
  });

  it("env 有 key 但缺 provider/model → 不成档 → 抛错(不瞎猜 provider)", async () => {
    await expect(
      resolveMultimodalSpec(ctx, "video.generate", {
        getModelConfig: noRow,
        env: {
          CREATOROS_VIDEO_SECRET_REF: "env:MINIMAX_API_KEY",
          MINIMAX_API_KEY: "tok-env",
          // 缺 CREATOROS_VIDEO_PROVIDER / _MODEL
        },
      }),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
  });
});

describe("resolveMultimodalSpec — tier 3 未配抛错(诚实禁用)", () => {
  it("啥都没配 → MultimodalConfigError(错误信息含能力名,供 UI 引导去设置)", async () => {
    await expect(
      resolveMultimodalSpec(ctx, "video.generate", {
        getModelConfig: noRow,
        env: {},
      }),
    ).rejects.toThrow(/video\.generate/);
  });

  it("多模态无 anthropic 官方免配兜底:仅 ANTHROPIC_API_KEY 不足以成档", async () => {
    // 文本层此时会用内置 anthropic 默认;多模态必须真配 → 仍抛错。
    await expect(
      resolveMultimodalSpec(ctx, "image.generate", {
        getModelConfig: noRow,
        env: { ANTHROPIC_API_KEY: "k" },
      }),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
  });
});

// ── ASR 逐字稿(transcribe.audio,T-030-D1)—— 与 image/video 同款三层回退,只是 capability
//    固定 transcribe.audio、未配错误类型换成 TranscribeConfigError。────────────────────────
describe("resolveTranscribeSpec — 3 层回退(kind=audio)", () => {
  it("tier 1:transcribe.audio 命中 DB 行 → 出 spec(kind=audio),secretValue 优先", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: async (_c, cap) =>
        cap === "transcribe.audio"
          ? {
              provider: "siliconflow",
              modelName: "FunAudioLLM/SenseVoiceSmall",
              baseUrl: "https://api.siliconflow.cn/v1",
              apiFormat: "openai_chat",
              secretReference: "env:SILICONFLOW_API_KEY",
              secretValue: "sk-asr-stored",
              settings: {},
            }
          : null,
      env: { SILICONFLOW_API_KEY: "env-should-lose" },
    });
    expect(spec).toEqual({
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "FunAudioLLM/SenseVoiceSmall",
      token: "sk-asr-stored",
      kind: "audio",
    });
  });

  it("tier 1 回退:per-capability 未命中 → asr.default 行", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: async (_c, cap) =>
        cap === "asr.default"
          ? {
              provider: "groq",
              modelName: "whisper-large-v3",
              baseUrl: null,
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "sk-asr-default",
              settings: {},
            }
          : null,
      env: {},
    });
    expect(spec.provider).toBe("groq");
    expect(spec.model).toBe("whisper-large-v3");
    expect(spec.token).toBe("sk-asr-default");
    expect(spec.kind).toBe("audio");
  });

  it("tier 2:无 DB 行时用 CREATOROS_ASR_*(需 provider+model+key 齐全)", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      env: {
        CREATOROS_ASR_PROVIDER: "siliconflow",
        CREATOROS_ASR_MODEL: "FunAudioLLM/SenseVoiceSmall",
        CREATOROS_ASR_BASE_URL: "https://api.siliconflow.cn/v1",
        CREATOROS_ASR_SECRET_REF: "env:SILICONFLOW_API_KEY",
        SILICONFLOW_API_KEY: "tok-env-asr",
      },
    });
    expect(spec).toEqual({
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "FunAudioLLM/SenseVoiceSmall",
      token: "tok-env-asr",
      kind: "audio",
    });
  });

  it("tier 3:都无 → 抛 TranscribeConfigError(非 MultimodalConfigError,供 D2 精确接住)", async () => {
    await expect(
      resolveTranscribeSpec(ctx, { getModelConfig: noRow, env: {} }),
    ).rejects.toBeInstanceOf(TranscribeConfigError);
  });

  it("tier 3:错误信息含 capability 名(供 UI 引导去设置配 ASR)", async () => {
    await expect(
      resolveTranscribeSpec(ctx, { getModelConfig: noRow, env: {} }),
    ).rejects.toThrow(/transcribe\.audio/);
  });
});
