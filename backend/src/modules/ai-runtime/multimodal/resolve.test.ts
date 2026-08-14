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
  it("[T-831] 本地参考图兼容复用既有 image.generate 配置", async () => {
    const reads: string[] = [];
    const spec = await resolveMultimodalSpec(ctx, "image.edit", {
      getModelConfig: async (_ctx, capability) => {
        reads.push(capability);
        return capability === "image.generate"
          ? {
              provider: "openai",
              modelName: "dudu-image",
              baseUrl: "https://dudu.example/v1",
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "local-dudu-key",
              settings: {},
            }
          : null;
      },
      env: {},
    });

    expect(reads).toContain("image.generate");
    expect(spec).toMatchObject({
      provider: "openai",
      model: "dudu-image",
      baseUrl: "https://dudu.example/v1",
    });
    expect(spec.displayModelKey).toBeUndefined();
  });

  it("[T-831] 官方渠道已托管生图但未声明 image.edit 时不误用本地兼容配置", async () => {
    let localGenerateReads = 0;
    await expect(
      resolveMultimodalSpec(ctx, "image.edit", {
        getChannelModelConfig: async () => ({
          schemaVersion: 3,
          revision: "official-v2-compatible",
          capabilities: {
            "image.generate": {
              kind: "image",
              provider: "openai",
              model: "omnihi-text-to-image",
              baseURL: "https://api.omnihi.example/v1",
              apiFormat: "openai-images",
              credentialLifecycle: "persistent",
              serviceId: "omnihi-image-generate",
            },
          },
        } as never),
        getChannelModelCredential: async () => "official-key",
        getModelConfig: async (_ctx, capability) => {
          if (capability === "image.generate") localGenerateReads += 1;
          return capability === "image.generate"
            ? {
                provider: "openai",
                modelName: "dudu-image",
                baseUrl: "https://dudu.example/v1",
                apiFormat: "openai_chat",
                secretReference: "",
                secretValue: "local-dudu-key",
                settings: {},
              }
            : null;
        },
        env: {},
      }),
    ).rejects.toThrow(/官方|image\.edit|参考图/);
    expect(localGenerateReads).toBe(0);
  });

  it("T-645 渠道仅配置文本时，ASR 仍读取用户本地配置", async () => {
    let localReads = 0;
    const spec = await resolveTranscribeSpec(ctx, {
      getChannelModelConfig: async () => ({
        services: [{
          id: "text-service",
          name: "Text",
          credential: { type: "api_key", source: "user_input" },
        }],
        connections: [{
          id: "text-connection",
          serviceId: "text-service",
          provider: "minimax",
          baseURL: "https://api.minimaxi.com/anthropic",
          apiFormat: "anthropic",
        }],
        models: { default: [{
          id: "text-model",
          name: "Text",
          connectionId: "text-connection",
          model: "MiniMax-M3",
          isDefault: true,
          settings: {},
        }] },
      }),
      getModelConfig: async (_c, capability) => {
        localReads += 1;
        return capability === "transcribe.audio"
          ? {
              provider: "siliconflow",
              modelName: "FunAudioLLM/SenseVoiceSmall",
              baseUrl: "https://api.siliconflow.cn/v1",
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "local-asr-key",
              settings: {},
            }
          : null;
      },
      env: {},
    });
    expect(localReads).toBe(1);
    expect(spec).toMatchObject({ provider: "siliconflow", token: "local-asr-key" });
  });

  it("T-768 完整渠道 ASR 缺 service Key 时丢弃在线配置并回退本地 Whisper", async () => {
    let localReads = 0;
    const spec = await resolveTranscribeSpec(ctx, {
        getChannelModelConfig: async () => ({
          services: [{
            id: "asr-service",
            name: "ASR",
            credential: { type: "api_key", source: "user_input" },
          }],
          connections: [{
            id: "asr-connection",
            serviceId: "asr-service",
            provider: "xiaomi-mimo",
            baseURL: "https://api.xiaomimimo.com/v1",
            apiFormat: "openai_chat",
          }],
          models: { "transcribe.audio": [{
            id: "asr-model",
            name: "MiMo ASR",
            connectionId: "asr-connection",
            model: "mimo-v2.5-asr",
            isDefault: true,
            settings: {},
          }] },
        }),
        getChannelModelCredential: async () => null,
        getModelConfig: async () => {
          localReads += 1;
          return null;
        },
        env: {},
    });
    expect(spec).toEqual({
      provider: "whisper-local",
      baseUrl: null,
      model: "small",
      token: "",
      kind: "audio",
    });
    expect(localReads).toBe(0);
  });

  it("按能力从 Growth 多模型数组选择默认生图模型", async () => {
    const spec = await resolveMultimodalSpec(ctx, "image.generate", {
      getChannelModelConfig: async () => ({
        models: {
          "image.generate": [
            {
              id: "image-fast",
              name: "快速生图",
              isDefault: false,
              provider: "openai",
              baseURL: "https://image-fast.example/v1",
              apiKey: "fast-image-key",
              model: "fast-image",
            },
            {
              id: "image-quality",
              name: "高质量生图",
              isDefault: true,
              provider: "openai",
              baseURL: "https://image-quality.example/v1",
              apiKey: "quality-image-key",
              model: "quality-image",
            },
          ],
        },
      }),
      getModelConfig: noRow,
      env: {},
    });
    expect(spec).toMatchObject({
      provider: "openai",
      baseUrl: "https://image-quality.example/v1",
      model: "quality-image",
      token: "quality-image-key",
      kind: "image",
      displayModelKey: "channel-managed",
    });
  });

  it("参考图编辑按独立 image.edit capability 解析渠道编辑模型", async () => {
    const spec = await resolveMultimodalSpec(ctx, "image.edit", {
      getChannelModelConfig: async () => ({
        models: {
          "image.edit": [
            {
              id: "gpt-image-2-edit",
              name: "GPT Image 2 图片编辑",
              isDefault: true,
              provider: "openai",
              baseURL: "https://api.omnihi.ai/openai",
              apiKey: "managed-edit-key",
              model: "openai/gpt-image-2-edit",
              settings: { size: "1024x1024" },
            },
          ],
        },
      }),
      getModelConfig: noRow,
      env: {},
    });
    expect(spec).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.omnihi.ai/openai",
      model: "openai/gpt-image-2-edit",
      token: "managed-edit-key",
      kind: "image",
      displayModelKey: "channel-managed",
    });
  });

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
      settings: {},
      displayModelKey: "channel-managed",
      credentialLifecycle: undefined,
      serviceId: undefined,
      apiFormat: "legacy",
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

// ── ASR 逐字稿(transcribe.audio,T-030-D1/T-641)—— 用户配置 → 环境变量两层；都没有
//    自动回退本地 Whisper，保证未配置云端也能完成转录。──────────────────────────────
describe("resolveTranscribeSpec — 云端优先、本地兜底(kind=audio)", () => {
  it("tier 1:Qwen ASR 用户配置可原样解析到运行时 spec", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: async (_c, cap) =>
        cap === "transcribe.audio"
          ? {
              provider: "qwen-asr",
              modelName: "qwen3-asr-flash",
              baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "dashscope-key",
              settings: { language: "zh" },
            }
          : null,
      env: {},
    });

    expect(spec).toEqual({
      provider: "qwen-asr",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen3-asr-flash",
      token: "dashscope-key",
      kind: "audio",
    });
  });

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

  it("两层都无 → 自动回退本地 Whisper，并沿用合法级别", async () => {
    await expect(
      resolveTranscribeSpec(ctx, {
        getModelConfig: noRow,
        env: { CREATOROS_WHISPER_LEVEL: "medium" },
      }),
    ).resolves.toEqual({
      provider: "whisper-local",
      baseUrl: null,
      model: "medium",
      token: "",
      kind: "audio",
    });
  });

  it("本地 Whisper 级别非法时回退 small", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      env: { CREATOROS_WHISPER_LEVEL: "huge" },
    });
    expect(spec.provider).toBe("whisper-local");
    expect(spec.model).toBe("small");
  });

  it("渠道配置解析抛出任意异常时也丢弃在线配置并回退本地", async () => {
    const spec = await resolveTranscribeSpec(ctx, {
      getModelConfig: noRow,
      getChannelModelConfig: async () => {
        throw new Error("bad signed config: should-not-leak");
      },
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

  it("配了云端 ASR 走用户 spec", async () => {
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
