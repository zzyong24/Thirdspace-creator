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
  it("含 custom 在内共 13 条,id 唯一,apiFormat 仅两值", () => {
    expect(MODEL_PROVIDER_PRESETS).toHaveLength(13);
    const ids = MODEL_PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(["anthropic", "openai_chat"]).toContain(p.apiFormat);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("末条是 custom 哨兵;anthropic 官方 baseUrl 留空(走默认端点)", () => {
    expect(MODEL_PROVIDER_PRESETS.at(-1)?.id).toBe(CUSTOM_PRESET_ID);
    const anthropic = MODEL_PROVIDER_PRESETS.find((p) => p.id === "anthropic");
    expect(anthropic?.baseUrl).toBe("");
    expect(anthropic?.apiFormat).toBe("anthropic");
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
  it("已知预设返回其候选;custom / 未知返回空", () => {
    expect(presetModels("deepseek")).toEqual([
      "deepseek-chat",
      "deepseek-reasoner",
    ]);
    expect(presetModels(CUSTOM_PRESET_ID)).toEqual([]);
    expect(presetModels("does-not-exist")).toEqual([]);
  });
});
