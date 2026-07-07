import { describe, it, expect } from "vitest";
import {
  resolveSkillForSurface,
  applyFunctionKey,
  assembleChatSystem,
  assembleSelectionContext,
  DEFAULT_CHAT_SKILL,
} from "./chat-context";

// ChatContext 三层注入的纯装配单测(SPEC §3.2 / §7「ChatContext 三层注入选对 skill」)。
// 这层是 ChatBox 的心脏:页面层 surface → 基础 skill;数据层 facets → system。

describe("resolveSkillForSurface — 页面层(surface → 基础 skill)", () => {
  it("各工作台 surface 选对应对话编导 skill(slice 2 补齐四面)", () => {
    expect(resolveSkillForSurface("topics")).toBe("chatbox.topic");
    expect(resolveSkillForSurface("calibration")).toBe("chatbox.calibration");
    expect(resolveSkillForSurface("positioning")).toBe("chatbox.positioning");
    expect(resolveSkillForSurface("review")).toBe("chatbox.review");
    // project 先复用选题编导(深化留后续)。
    expect(resolveSkillForSurface("project")).toBe("chatbox.topic");
    // [T-094] 倾倒场蒸馏对话面(Copilot 化入口)。
    expect(resolveSkillForSurface("knowledge-distill")).toBe("chatbox.distill");
  });

  it("未知 surface 回落到默认 ChatBox skill(路由不崩)", () => {
    expect(resolveSkillForSurface("")).toBe(DEFAULT_CHAT_SKILL);
    expect(resolveSkillForSurface("nope")).toBe(DEFAULT_CHAT_SKILL);
  });
});

describe("applyFunctionKey — 按钮层(functionKey 叠加 → 专用工具置顶)", () => {
  const base = ["topic.generate", "topic.enrich"] as const;

  it("functionKey 命中白名单 → 该工具置顶,其余保序", () => {
    expect(applyFunctionKey(base, "topic.enrich")).toEqual([
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("functionKey 已在首位 → 顺序不变(去重不重复)", () => {
    expect(applyFunctionKey(base, "topic.generate")).toEqual([
      "topic.generate",
      "topic.enrich",
    ]);
  });

  it("functionKey 为空 → 原样返回", () => {
    expect(applyFunctionKey(base, undefined)).toEqual(base);
    expect(applyFunctionKey(base, "")).toEqual(base);
  });

  it("functionKey 不在白名单(越权)→ 原样返回,不臆造工具", () => {
    // 校准工具不在选题编导白名单里 → 不挂(防越权)。
    expect(applyFunctionKey(base, "calibration.diagnose")).toEqual(base);
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

  it("T-039b:includeAccounts=true 且 accountsBrief 非空 → 注入账号画像块(定位对话专属)", () => {
    const sys = assembleChatSystem(
      base,
      {
        positioningBrief: "",
        learningsBrief: "",
        signalsBrief: "",
        knowledgeBrief: "",
        accountsBrief: "· douyin | @硬核老王 | 粉丝 12000",
      },
      { includeAccounts: true },
    );
    expect(sys).toContain("【抖音账号画像");
    expect(sys).toContain("@硬核老王");
  });

  it("T-039b:默认(无 opts)不注入账号画像 —— 其它 surface 不塞账号噪声", () => {
    const sys = assembleChatSystem(base, {
      positioningBrief: "",
      learningsBrief: "",
      signalsBrief: "",
      knowledgeBrief: "",
      accountsBrief: "· douyin | @硬核老王 | 粉丝 12000",
    });
    expect(sys).not.toContain("抖音账号画像");
    expect(sys).not.toContain("@硬核老王");
  });

  it("T-039b:includeAccounts=true 但 accountsBrief 空 → 不注入(诚实,不摆空块)", () => {
    const sys = assembleChatSystem(
      base,
      {
        positioningBrief: "",
        learningsBrief: "",
        signalsBrief: "",
        knowledgeBrief: "",
        accountsBrief: "  ",
      },
      { includeAccounts: true },
    );
    expect(sys).toBe(base);
  });
});

describe("assembleSelectionContext(T-027 选中态注入)", () => {
  it("有 label → 注入选中内容块(标题 + 别再问标题)", () => {
    const block = assembleSelectionContext({
      kind: "publication",
      ids: ["pub-1"],
      label: "为什么你的 RAG 检索总召回废话",
    });
    expect(block).toContain("已发布内容");
    expect(block).toContain("《为什么你的 RAG 检索总召回废话》");
    expect(block).toContain("不要再问");
  });

  it("未知 kind → 回落到通用「内容」标签", () => {
    const block = assembleSelectionContext({
      kind: "whatever",
      ids: ["x"],
      label: "某条内容",
    });
    expect(block).toContain("选中的内容");
    expect(block).toContain("《某条内容》");
  });

  it("无选中态 / 无标题 → 空串(不喂噪声)", () => {
    expect(assembleSelectionContext(undefined)).toBe("");
    expect(assembleSelectionContext({ kind: "project", ids: ["p"] })).toBe("");
    expect(
      assembleSelectionContext({ kind: "project", ids: ["p"], label: "  " }),
    ).toBe("");
  });
});
