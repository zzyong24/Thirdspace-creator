import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  resolveMultimodalSpec,
  resolveTranscribeSpec,
  MultimodalConfigError,
  describeMultimodalFailure,
} from "./resolve";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const noRow = async () => null;

describe("resolveMultimodalSpec — tier 1 DB row(库存密钥优先)", () => {
  it("configured 渠道 JSON 覆盖多模态本地行且不读取本地", async () => {
    let localReads = 0;
    const spec = await resolveMultimodalSpec(ctx, "image.generate", {
      getChannelModelConfig: async () => ({
        provider: "openai",
        baseURL: "https://channel-image.example/v1",
        apiKey: ["channel", "image", "test"].join("-"),
        model: "channel-image",
      }),
      getModelConfig: async () => {
        localReads += 1;
        return null;
      },
      env: {},
    });
    expect(localReads).toBe(0);
    expect(spec).toEqual({
      provider: "openai",
      baseUrl: "https://channel-image.example/v1",
      model: "channel-image",
      token: "channel-image-test",
      kind: "image",
      displayModelKey: "channel-managed",
    });
  });

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

  // [T-160] ASR 改选配:tier 3 未配**不再抛**,回退本地 whisper spec(免 key)。
  it("tier 3:都无 → 回退本地 whisper spec(不抛;provider=whisper-local,默认级别 small)", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      env: {},
    });
    expect(spec).toEqual({
      provider: "whisper-local",
      baseUrl: null,
      model: "small",
      token: "",
      kind: "audio",
    });
  });

  it("tier 3:CREATOROS_WHISPER_LEVEL 覆盖回退级别(medium)", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      env: { CREATOROS_WHISPER_LEVEL: "medium" },
    });
    expect(spec.provider).toBe("whisper-local");
    expect(spec.model).toBe("medium");
  });

  it("tier 3:非法 CREATOROS_WHISPER_LEVEL → 回退 small", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      env: { CREATOROS_WHISPER_LEVEL: "gigantic" },
    });
    expect(spec.model).toBe("small");
  });

  // 用户**配了**云端 ASR → 仍走用户 provider(不被 whisper 回退抢路)。
  it("配了云端 ASR 仍走用户 spec(whisper 回退只在未配时兜底)", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: async (_c, cap) =>
        cap === "transcribe.audio"
          ? ({
              provider: "siliconflow",
              baseUrl: "https://api.siliconflow.cn/v1",
              modelName: "FunAudioLLM/SenseVoiceSmall",
              secretValue: "sk-user",
              secretReference: null,
            } as never)
          : null,
      env: {},
    });
    expect(spec.provider).toBe("siliconflow");
    expect(spec.model).toBe("FunAudioLLM/SenseVoiceSmall");
  });
});

// [T-376] 失败分类人话:「未配置」vs「配置了但调用失败」——runner 写步骤流末条前的分类器。
// 病根测锚:此前一切失败被前端吞成「很可能是还没配置生图模型」,用户配了也被冤枉。
describe("describeMultimodalFailure — 失败分类(T-376)", () => {
  it("MultimodalConfigError(resolve 层,message 含「未配置」)→ 原样透传指路文案", () => {
    const err = new MultimodalConfigError(
      'capability "image.generate" 未配置生图模型:请在设置里配 provider/model/key',
    );
    const text = describeMultimodalFailure(err, "生图");
    expect(text).toContain("未配置生图模型");
    expect(text).not.toContain("已配置,但调用失败");
  });

  it("同名 MultimodalConfigError 但 message 无「未配置」(factory 层:未知 provider/不支持)→ 「配置有问题」", () => {
    // 模拟 ai-worker multimodal-factory 那份同名类(跨包 instanceof 不可靠 → 按 name 判)。
    const err = new Error('未知 provider "minimaxx":registry 里没有这个适配器');
    err.name = "MultimodalConfigError";
    const text = describeMultimodalFailure(err, "生图");
    expect(text).toContain("生图模型配置有问题");
    expect(text).toContain("minimaxx");
  });

  it("普通调用错误(key 无效/网络/审核)→ 「已配置,但调用失败:<真实原因>」,不冤枉未配置", () => {
    const text = describeMultimodalFailure(
      new Error("minimax API 401: invalid api key"),
      "生图",
    );
    expect(text).toContain("生图模型已配置,但调用失败");
    expect(text).toContain("invalid api key");
    expect(text).not.toContain("未配置");
  });

  it("LlmCredentialError(封面链的文案 LLM 凭据)→ 指明是文本模型问题,不指向生图配置", () => {
    const err = new Error("文本模型未配置可用凭据");
    err.name = "LlmCredentialError";
    const text = describeMultimodalFailure(err, "生图");
    expect(text).toContain("文本模型凭据问题");
    expect(text).toContain("非生图模型");
  });
});
