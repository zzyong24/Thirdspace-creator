import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveMultimodalSpec, MultimodalConfigError } from "./resolve";

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
