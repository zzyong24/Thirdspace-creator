import { describe, it, expect } from "vitest";
import {
  CHATBOX_POSITIONING_TEMPLATE,
  chatboxPositioningSchema,
} from "./chatbox-surfaces";

describe("chatbox.positioning — T-707 Copilot 自适应定位", () => {
  const sys = CHATBOX_POSITIONING_TEMPLATE.system;
  it("T1408 默认无需登录抖音，不把未绑定当成scratch或虚构平台实绩",()=>{
    expect(sys).toContain("无需登录抖音");expect(sys).toContain("未绑定不等于从零开始");
    expect(sys).toContain("本人自述");expect(sys).toContain("不得编造粉丝量、播放量");
    expect(sys).toContain("每轮最多追问一个");expect(sys).toContain("暂不确定和跳过");
  });

  it("先做三路场景判断，但信息清楚时不重复确认", () => {
    expect(sys).toContain("基于当前账号继续深入");
    expect(sys).toContain("调整到新方向");
    expect(sys).toContain("重新定位");
    expect(sys).toContain("用户已经说清楚时直接继续");
  });

  it("六类信息不是门禁，用户可随时直接生成", () => {
    expect(sys).toContain("不是六个必填问题");
    expect(sys).toContain("立即调用 positioning.generate");
    expect(sys).toContain("selectedDirectionKey 可省略");
    expect(sys).not.toContain("只有用户明确选定一个方向后才能调用");
    expect(sys).toContain("proposals 恒留空");
  });

  it("纯人设与产品型账号共用一套流程，不强塞产品", () => {
    expect(sys).toContain("同时支持纯人设/个人表达型和有产品或服务的账号");
    expect(sys).toContain("纯人设不强塞产品");
    expect(sys).toContain("未确认字段可留空");
  });

  it("旧定位不再无条件注入，scratch 维持物理隔离", () => {
    expect(CHATBOX_POSITIONING_TEMPLATE.requiredFacets).toEqual([]);
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("positioning.generate");
    expect(sys).toContain("禁止调用或引用旧定位、账号画像和旧作品");
    expect(chatboxPositioningSchema.safeParse({ reply: "先选一个方向。" }).success).toBe(
      true,
    );
    expect(chatboxPositioningSchema.safeParse({}).success).toBe(false);
  });

  it("非 scratch 场景仍可按需读取真实辅助证据", () => {
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.projects");
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.metrics");
    expect(CHATBOX_POSITIONING_TEMPLATE.tools).toContain("context.positioning.detail");
  });
});
