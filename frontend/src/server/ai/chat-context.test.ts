import { describe, it, expect } from "vitest";
import {
  resolveSkillForSurface,
  assembleChatSystem,
  DEFAULT_CHAT_SKILL,
} from "./chat-context";

// ChatContext 三层注入的纯装配单测(SPEC §3.2 / §7「ChatContext 三层注入选对 skill」)。
// 这层是 ChatBox 的心脏:页面层 surface → 基础 skill;数据层 facets → system。

describe("resolveSkillForSurface — 页面层(surface → 基础 skill)", () => {
  it("topics → chatbox.topic(选题编导)", () => {
    expect(resolveSkillForSurface("topics")).toBe("chatbox.topic");
  });

  it("未知 surface 回落到默认 ChatBox skill(路由不崩)", () => {
    expect(resolveSkillForSurface("calibration")).toBe(DEFAULT_CHAT_SKILL);
    expect(resolveSkillForSurface("")).toBe(DEFAULT_CHAT_SKILL);
    expect(resolveSkillForSurface("nope")).toBe(DEFAULT_CHAT_SKILL);
  });
});

describe("assembleChatSystem — 数据层(facets → system)", () => {
  const base = "你是选题编导。";

  it("拼上非空 facet(定位/飞轮/受众信号/知识库),空的不喂噪声", () => {
    const sys = assembleChatSystem(base, {
      positioningBrief: "定位一句话：把论文落成代码",
      learningsBrief: "· 反直觉开头有效",
      signalsBrief: "· [评论] 怎么落地",
      knowledgeBrief: "", // 空 → 不出现
    });
    expect(sys).toContain(base);
    expect(sys).toContain("【创作者定位】");
    expect(sys).toContain("把论文落成代码");
    expect(sys).toContain("【过往复盘爆款要素】");
    expect(sys).toContain("【受众信号(真实评论/咨询)】");
    // 知识库空 → 该块不应出现。
    expect(sys).not.toContain("【可依托的知识库资料】");
  });

  it("全空 facet → 只有 skill 的 system(纯净)", () => {
    const sys = assembleChatSystem(base, {
      positioningBrief: "",
      learningsBrief: "",
      signalsBrief: "",
      knowledgeBrief: "",
    });
    expect(sys).toBe(base);
  });

  it("facet 只含空白 → 视为空,不注入", () => {
    const sys = assembleChatSystem(base, {
      positioningBrief: "   ",
      learningsBrief: "\n",
      signalsBrief: "",
      knowledgeBrief: "· 一条知识",
    });
    expect(sys).not.toContain("【创作者定位】");
    expect(sys).not.toContain("【过往复盘爆款要素】");
    expect(sys).toContain("【可依托的知识库资料】");
    expect(sys).toContain("一条知识");
  });
});
