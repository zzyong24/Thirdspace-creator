import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveSearchSpec, SearchConfigError } from "./resolve";

// [T-084a] resolveSearchSpec 三层回退单测(仿 multimodal/resolve.test.ts):
//   Tier 1 库存密钥(web.search 行 → search.default 行;secretValue > env-ref)
//   Tier 2 env 默认(CREATOROS_SEARCH_*,需 provider+key,model 选填)
//   Tier 3 未配 → SearchConfigError(无免配兜底,不假装能搜)

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

describe("resolveSearchSpec — tier 1 DB row(库存密钥优先)", () => {
  it("web.search 命中行 → 投影 SearchSpec,secretValue 优先于 env-ref", async () => {
    const spec = await resolveSearchSpec(ctx, {
      getModelConfig: async () => ({
        provider: "bocha",
        modelName: "",
        baseUrl: null,
        apiFormat: "openai_chat",
        secretReference: "env:BOCHA_KEY",
        secretValue: "sk-stored",
        settings: {},
      }),
      env: { BOCHA_KEY: "env-should-lose" },
    });
    expect(spec).toEqual({
      provider: "bocha",
      baseUrl: null,
      model: "",
      token: "sk-stored",
    });
  });

  it("用 env-ref secretReference 解 token;model(serpapi engine)透传", async () => {
    const spec = await resolveSearchSpec(ctx, {
      getModelConfig: async () => ({
        provider: "serpapi",
        modelName: "google",
        baseUrl: "https://serpapi.com",
        apiFormat: "openai_chat",
        secretReference: "env:SERP_KEY",
        secretValue: null,
        settings: {},
      }),
      env: { SERP_KEY: "tok-env" },
    });
    expect(spec.provider).toBe("serpapi");
    expect(spec.token).toBe("tok-env");
    expect(spec.model).toBe("google");
    expect(spec.baseUrl).toBe("https://serpapi.com");
  });

  it("per-capability 未命中 → 回退 search.default 行", async () => {
    const spec = await resolveSearchSpec(ctx, {
      getModelConfig: async (_c, cap) =>
        cap === "search.default"
          ? {
              provider: "tavily",
              modelName: "",
              baseUrl: null,
              apiFormat: "openai_chat",
              secretReference: "",
              secretValue: "sk-default",
              settings: {},
            }
          : null,
      env: {},
    });
    expect(spec.provider).toBe("tavily");
    expect(spec.token).toBe("sk-default");
  });

  it("行有 provider 但无可用 token → 视为未命中(继续回退)", async () => {
    // web.search 行无 token → 落到 tier 2/3;此处 env 也空 → 抛错。
    await expect(
      resolveSearchSpec(ctx, {
        getModelConfig: async (_c, cap) =>
          cap === "web.search"
            ? {
                provider: "bocha",
                modelName: "",
                baseUrl: null,
                apiFormat: "openai_chat",
                secretReference: "", // 无 env-ref
                secretValue: null, // 无库存密钥
                settings: {},
              }
            : null,
        env: {},
      }),
    ).rejects.toThrow(SearchConfigError);
  });
});

describe("resolveSearchSpec — tier 2 env 默认档", () => {
  it("CREATOROS_SEARCH_*(provider+key,model 选填)→ 成档", async () => {
    const spec = await resolveSearchSpec(ctx, {
      getModelConfig: async () => null,
      env: {
        CREATOROS_SEARCH_PROVIDER: "bocha",
        CREATOROS_SEARCH_SECRET_REF: "env:MY_SEARCH_KEY",
        MY_SEARCH_KEY: "sk-env-search",
      },
    });
    expect(spec.provider).toBe("bocha");
    expect(spec.token).toBe("sk-env-search");
    expect(spec.model).toBe(""); // model 选填,缺省空
    expect(spec.baseUrl).toBe(null);
  });

  it("env 缺 provider(只有 key)→ 不成档 → 抛错(不瞎猜默认 provider)", async () => {
    await expect(
      resolveSearchSpec(ctx, {
        getModelConfig: async () => null,
        env: {
          CREATOROS_SEARCH_SECRET_REF: "env:K",
          K: "sk-x",
          // 无 CREATOROS_SEARCH_PROVIDER
        },
      }),
    ).rejects.toThrow(SearchConfigError);
  });
});

describe("resolveSearchSpec — tier 3 未配", () => {
  it("DB 无行 + env 无档 → SearchConfigError(诚实,不假装能搜)", async () => {
    await expect(
      resolveSearchSpec(ctx, {
        getModelConfig: async () => null,
        env: {},
      }),
    ).rejects.toThrow(/未配置联网检索/);
  });
});
