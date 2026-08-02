import { describe, it, expect } from "vitest";
import {
  CHATBOX_POSITIONING_TEMPLATE,
  chatboxPositioningSchema,
} from "./chatbox-surfaces";

describe("chatbox.positioning — T-652 选项式完整前采", () => {
  const sys = CHATBOX_POSITIONING_TEMPLATE.system;

  it("新号和老号都必须完整前采，每轮一个问题并给多选项", () => {
    expect(sys).toContain("访谈");
    expect(sys).toContain("私教");
    expect(sys).toContain("每轮只问一个");
    expect(sys).toContain("可多选");
    expect(sys).toContain("不要因为有历史作品就跳过");
  });

  it("前采包先给 2–3 个方向比较，用户选定后才调生成工具", () => {
    expect(sys).toContain("【定位前采已完成】");
    expect(sys).toContain("2–3 个");
    expect(sys).toMatch(/用户明确选定一个方向后[\s\S]*positioning\.generate/);
    expect(sys).toContain("proposals 恒留空");
  });

  it("联网只允许短关键词，不外发访谈和逐字稿", () => {
    expect(sys).toContain("短行业/IP 关键词");
    expect(sys).toContain("绝不把整份访谈");
    expect(sys).toContain("逐字稿");
  });

  it("旧定位不再无条件注入，scratch 只含前采包", () => {
    expect(CHATBOX_POSITIONING_TEMPLATE.requiredFacets).toEqual([]);
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("positioning.generate");
    expect(chatboxPositioningSchema.safeParse({ reply: "先选一个方向。" }).success).toBe(
      true,
    );
    expect(chatboxPositioningSchema.safeParse({}).success).toBe(false);
  });

  it("用户选择参考历史时仍可显式读取四类辅助证据", () => {
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.projects");
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.metrics");
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.positioning.detail");
  });
});
