/**
 * model-provider-presets 单元测(T-325)。
 *
 * 锚定预设目录形状 + 回显匹配(matchPresetByConfig)+ 候选取用(presetModels)的
 * 纯逻辑,与 UI 解耦(UI 集成断言在 settings-interactive-region.test.tsx)。
 */

import { describe, expect, it } from "vitest";

import {
  MODEL_PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
  presetModels,
} from "./model-provider-presets";

describe("MODEL_PROVIDER_PRESETS 目录形状", () => {
  it("含 custom 在内共 14 条,id 唯一,apiFormat 为三种正式协议", () => {
    expect(MODEL_PROVIDER_PRESETS).toHaveLength(14);
    const ids = MODEL_PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(["anthropic", "openai_chat", "openai_responses"]).toContain(
        p.apiFormat,
      );
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("末条是 custom 哨兵;anthropic 官方 baseUrl 留空(走默认端点)", () => {
    expect(MODEL_PROVIDER_PRESETS.at(-1)?.id).toBe(CUSTOM_PRESET_ID);
    const anthropic = MODEL_PROVIDER_PRESETS.find((p) => p.id === "anthropic");
    expect(anthropic?.baseUrl).toBe("");
    expect(anthropic?.apiFormat).toBe("anthropic");
  });

  it("OpenAI 官方预设默认使用 Responses", () => {
    const openai = MODEL_PROVIDER_PRESETS.find((p) => p.id === "openai");
    expect(openai?.apiFormat).toBe("openai_responses");
    expect(
      matchPresetByConfig("https://api.openai.com/v1", "openai_responses")?.id,
    ).toBe("openai");
  });

  it("Kimi 开放平台与 Kimi Code 分开，默认都使用 OpenAI Chat", () => {
    const openPlatform = MODEL_PROVIDER_PRESETS.find((p) => p.id === "kimi");
    expect(openPlatform).toMatchObject({
      label: "Kimi 开放平台",
      apiFormat: "openai_chat",
      baseUrl: "https://api.moonshot.cn/v1",
    });
    const code = MODEL_PROVIDER_PRESETS.find((p) => p.id === "kimi-code");
    expect(code).toMatchObject({
      label: "Kimi Code",
      apiFormat: "openai_chat",
      baseUrl: "https://api.kimi.com/coding/v1",
    });
  });

  it("非 custom 预设 baseUrl 互不重复(保证回显匹配唯一)", () => {
    const urls = MODEL_PROVIDER_PRESETS.filter(
      (p) => p.id !== CUSTOM_PRESET_ID,
    ).map((p) => p.baseUrl.toLowerCase().replace(/\/+$/, ""));
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("matchPresetByConfig 回显匹配", () => {
  it("精确 baseUrl + apiFormat → 命中该预设", () => {
    expect(
      matchPresetByConfig("https://api.deepseek.com", "openai_chat")?.id,
    ).toBe("deepseek");
    expect(
      matchPresetByConfig("https://api.minimaxi.com/anthropic", "anthropic")?.id,
    ).toBe("minimax");
  });

  it("末尾斜杠 / 首尾空白 / 大小写差异仍归一化命中", () => {
    expect(
      matchPresetByConfig("  https://api.deepseek.com/  ", "openai_chat")?.id,
    ).toBe("deepseek");
  });

  it("空 baseUrl + anthropic → Anthropic 官方;空 + openai_chat → 无命中", () => {
    expect(matchPresetByConfig("", "anthropic")?.id).toBe("anthropic");
    expect(matchPresetByConfig("", "openai_chat")).toBeUndefined();
  });

  it("apiFormat 不一致不命中(deepseek 端点配 anthropic 格式 → 自定义)", () => {
    expect(
      matchPresetByConfig("https://api.deepseek.com", "anthropic"),
    ).toBeUndefined();
  });

  it("未知端点 → undefined;custom 永不作为命中项", () => {
    const hit = matchPresetByConfig("https://unknown.example.com/v1", "openai_chat");
    expect(hit).toBeUndefined();
    expect(hit?.id).not.toBe(CUSTOM_PRESET_ID);
  });
});

describe("presetModels 候选取用", () => {
  // [T-377] 模型候选不再硬编码:供应商上新频繁,旧候选(如 MiniMax-M2)会误导用户以为
  // 没有更新型号 —— model 名一律自由填,以服务商最新为准。presetModels 恒空。
  it("所有预设候选恒为空(去硬编码;model 名自由填)", () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(presetModels(p.id)).toEqual([]);
    }
    expect(presetModels(CUSTOM_PRESET_ID)).toEqual([]);
    expect(presetModels("does-not-exist")).toEqual([]);
  });
});
