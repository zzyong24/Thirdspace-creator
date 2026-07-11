import { describe, it, expect } from "vitest";
import {
  CHATBOX_POSITIONING_TEMPLATE,
  chatboxPositioningSchema,
} from "./chatbox-surfaces";

// [T-210] 定位编导改「结构化多轮访谈」—— 锚定 system prompt 的访谈语义,防回退成「一次出提案」。
// 会话本就多轮(chat-runner 收全量 messages 历史),本改动只在 system 层把「先出提案」改成
// 「按 5 问一问一答访谈 → 答齐才合成」;采纳链(positioning.generate 工具 + confirm 门)不动。
describe("chatbox.positioning — T-210 访谈式多轮定位", () => {
  const sys = CHATBOX_POSITIONING_TEMPLATE.system;

  it("system 定调为访谈式一问一答(私教 / 一次一个问题)", () => {
    expect(sys).toContain("访谈");
    expect(sys).toContain("私教");
    // 每轮只问一个尚未答的问题 —— 反「一次抛多个 / 提前合成」的核心约束。
    expect(sys).toContain("每轮只问一个");
  });

  it("system 含用户认可的 5 问序列要点(新手老手 / 领域受众 / 目标 / 内容形态 / 对标风格)", () => {
    // Q1 新手 vs 老手分支(老手结合已注入的账号画像/真实作品数据)。
    expect(sys).toContain("新手");
    expect(sys).toContain("老手");
    expect(sys).toContain("真实作品数据");
    // Q2 领域 + 目标受众;Q3 目标(变现/涨粉/影响力);Q4 内容形态 + 卖货;Q5 对标风格。
    expect(sys).toContain("领域");
    expect(sys).toContain("目标受众");
    expect(sys).toContain("变现");
    expect(sys).toContain("内容形态");
    expect(sys).toContain("对标账号");
  });

  it("system 要求答齐才调 positioning.generate 并把访谈回答整理进 extraBrief", () => {
    expect(sys).toContain("positioning.generate");
    expect(sys).toContain("extraBrief");
    // 铁律:答齐之前绝不调工具、绝不在 reply 里写提案。
    expect(sys).toMatch(/答齐之前[\s\S]*绝不调 positioning\.generate/);
    expect(sys).toContain("proposals 字段恒留空");
  });

  it("template facet 契约不变(positioning 必需 + 每轮两段 reply/proposals)", () => {
    expect(CHATBOX_POSITIONING_TEMPLATE.requiredFacets).toContain("positioning");
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("positioning.generate");
    // 每轮输出契约仍是两段(reply 必填,proposals 走工具产)—— 采纳链不动。
    expect(chatboxPositioningSchema.safeParse({ reply: "你是想开始做,还是已经在做了?" }).success).toBe(
      true,
    );
    expect(chatboxPositioningSchema.safeParse({}).success).toBe(false);
  });
});
