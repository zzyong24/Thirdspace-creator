/**
 * [Bug #3] onboarding-data 装配层单测 —— 锁 `loadConfiguredCapabilities` 的核心铁律:
 * **「已配」= 真能跑(provider 非空 且 hasSecret),不是「行存在」**。
 *
 * T-135 中性化保留了各 AI capability 的空占位骨架(行存在,但 provider 空 / secret
 * 空)。旧判定只看 provider 非空,会把「有 provider 占位但没配 key」误算成已配 →
 * 新手清单「配置文本模型」假打勾。这些用例证明修正后:未真配一律不入集合。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listModels = vi.hoisted(() => vi.fn());

vi.mock("@/lib/contract-client", () => ({
  client: { listModels },
}));

import { loadConfiguredCapabilities } from "./onboarding-data";

/** 造一行 listModels DTO —— 默认「真配了」,各 case 覆写要考察的字段。 */
function modelRow(over: Record<string, unknown> = {}) {
  return {
    capability: "default",
    provider: "anthropic",
    modelName: "claude-3-5-sonnet",
    hasSecret: true,
    ...over,
  };
}

describe("loadConfiguredCapabilities — 「真配了」才入集合", () => {
  beforeEach(() => {
    listModels.mockReset();
  });

  it("真配了(provider 非空 且 hasSecret)→ capability 入集合", async () => {
    listModels.mockResolvedValue([modelRow({ capability: "default" })]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(true);
  });

  it("T-135 空占位骨架(provider 非空但 hasSecret=false,没配 key)→ 不入集合", async () => {
    // 这是 Bug #3 的核心:行存在、provider 占位,但没配 key(hasSecret=false),
    // 真跑不通 → 绝不打勾。旧判定会误算成已配。
    listModels.mockResolvedValue([
      modelRow({ capability: "default", hasSecret: false }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(false);
  });

  it("provider 空占位(且无 secret)→ 不入集合", async () => {
    listModels.mockResolvedValue([
      modelRow({ capability: "default", provider: "", hasSecret: false }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(false);
  });

  it("配了 key 但 provider 仍空(异常态)→ 不入集合(provider 是硬下限)", async () => {
    listModels.mockResolvedValue([
      modelRow({ capability: "default", provider: "", hasSecret: true }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(false);
  });

  it("web.search 档同理:真配(带 key/env-ref)→ 入;空占位 → 不入(不误伤)", async () => {
    listModels.mockResolvedValue([
      // 真配了搜索(provider + secret 齐)
      modelRow({ capability: "web.search", provider: "tavily", hasSecret: true }),
      // 空占位的生图骨架(有 provider 占位,没 key)
      modelRow({
        capability: "image.generate",
        provider: "minimax",
        hasSecret: false,
      }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("web.search")).toBe(true);
    expect(set?.has("image.generate")).toBe(false);
  });

  it("混合:只有真配的那几档入集合,占位骨架全部落选", async () => {
    listModels.mockResolvedValue([
      modelRow({ capability: "default", hasSecret: true }), // 真配
      modelRow({ capability: "image.generate", hasSecret: false }), // 占位
      modelRow({ capability: "video.generate", hasSecret: false }), // 占位
      modelRow({ capability: "script.review", provider: "openai", hasSecret: true }), // 真配
    ]);
    const set = await loadConfiguredCapabilities();
    expect([...set!].sort()).toEqual(["default", "script.review"]);
  });

  it("读失败(listModels reject)→ undefined(诚实降级,deriveSteps 当未完成)", async () => {
    listModels.mockRejectedValue(new Error("read failed"));
    const set = await loadConfiguredCapabilities();
    expect(set).toBeUndefined();
  });
});
