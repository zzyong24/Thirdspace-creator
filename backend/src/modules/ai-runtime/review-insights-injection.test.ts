import { describe, it, expect } from "vitest";
import { REVIEW_INSIGHTS_TEMPLATE, bindPrompt } from "@creatoros/ai-worker";
import { reviewFacets } from "./review-context";
import type { CreativeContext } from "./creative-context";

// T-039a 端到端(prompt 层,不 mock ai-worker)—— 验证「review prompt 加占位符 + reviewFacets 映射
// 真数据」真的让本项目的文案/标题/数据/评论进入最终喂给模型的 prompt,且空块诚实省略(不留占位残留、
// 不硬塞空标题)。这一条是复盘「吃到真数据」的核心回归保护。
//
// 使用真实模板和上下文映射，验证注入材料不会改变模板边界。
// 真 template +
// 真 bindPrompt,才能断言占位符落位与空块省略。

function makeContext(over: Partial<CreativeContext> = {}): CreativeContext {
  return {
    positioningBrief: "",
    learningsBrief: "",
    assetsBrief: "",
    userMaterialHardBrief: "",
    userMaterialRefBrief: "",
    userMaterialQueryTerms: [],
    accountsBrief: "",
    signalsBrief: "",
    knowledgeBrief: "",
    thesisBrief: "",
    contractBrief: "",
    outlineBrief: "",
    orientationHint: "",
    projectBriefHard: "",
    benchmarkRefBrief: "",
    reviewTitle: "",
    reviewScript: "",
    reviewMetrics: "",
    reviewComments: "",
    topic: { title: "", angle: "" },
    projectId: null,
    ...over,
  };
}

describe("review.insights prompt — 本项目真数据注入(T-039a)", () => {
  it("真标题/文案/数据/评论都进最终 prompt", () => {
    const { prompt } = bindPrompt(
      REVIEW_INSIGHTS_TEMPLATE,
      reviewFacets(
        makeContext({
          reviewTitle: "上下文工程实战复盘",
          reviewScript: "开头三秒抛钩子 SCRIPT_MARKER 逐字稿正文",
          reviewMetrics: "播放：52000 METRIC_MARKER",
          reviewComments: "· 钩子太强 COMMENT_MARKER",
        }),
      ),
    );
    expect(prompt).toContain("上下文工程实战复盘"); // subject=真标题
    expect(prompt).toContain("【本次复盘对象】上下文工程实战复盘");
    expect(prompt).toContain("SCRIPT_MARKER"); // 文案块
    expect(prompt).toContain("METRIC_MARKER"); // 数据块
    expect(prompt).toContain("COMMENT_MARKER"); // 评论块
    // 三个小标题都在。
    expect(prompt).toContain("【本次复盘作品·文案】");
    expect(prompt).toContain("【本次复盘作品·真实数据】");
    expect(prompt).toContain("【本次复盘作品·观众评论】");
  });

  it("只有文案时指标明确证据边界，空评论省略，无未替换占位残留", () => {
    const { prompt } = bindPrompt(
      REVIEW_INSIGHTS_TEMPLATE,
      reviewFacets(
        makeContext({
          reviewTitle: "只有文案",
          reviewScript: "SCRIPT_ONLY",
        }),
      ),
    );
    expect(prompt).toContain("SCRIPT_ONLY");
    expect(prompt).toContain("【本次复盘作品·文案】");
    // 数据/评论为空 → 该块整块省略(块小标题不出现;任务段引导文字里的裸词不算)。
    expect(prompt).toContain("【本次复盘作品·真实数据】未取得发布指标，不能归因传播或成交效果。");
    expect(prompt).not.toContain("【本次复盘作品·观众评论】");
    // 不留任何未替换的 {{facet}} 占位。
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
  });

  it("完全无真数据保兜底subject、缺稿缺指标限制与空评论省略，prompt仍合法", () => {
    // 不抛错本身即证明 subject 兜底非空(positioning 也兜底非空)。
    const { prompt } = bindPrompt(
      REVIEW_INSIGHTS_TEMPLATE,
      reviewFacets(makeContext()),
    );
    expect(prompt).toContain("按这个账号的整体表现");
    expect(prompt).toContain("【本次复盘作品·文案】未取得真实稿件，不能评价具体开头台词、段落或叙事结构。");
    expect(prompt).toContain("【本次复盘作品·真实数据】未取得发布指标，不能归因传播或成交效果。");
    expect(prompt).not.toContain("【本次复盘作品·观众评论】");
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
  });

  // [T-081①] extraBrief 第三参 → 模板 {{extraBrief}} 占位:对话洞察真的进最终 prompt;
  // 不传/空则整段省略(后台 task 路径行为不变)。
  it("extraBrief 传入 → 注入【本次生成指令(来自对话,优先遵循)】段;不传则省略", () => {
    const withBrief = bindPrompt(
      REVIEW_INSIGHTS_TEMPLATE,
      reviewFacets(
        makeContext({ reviewTitle: "某作品" }),
        undefined,
        "聚焦评论区负反馈 EXTRA_MARKER",
      ),
    ).prompt;
    expect(withBrief).toContain("【本次生成指令(来自对话,优先遵循)】");
    expect(withBrief).toContain("EXTRA_MARKER");

    const without = bindPrompt(
      REVIEW_INSIGHTS_TEMPLATE,
      reviewFacets(makeContext({ reviewTitle: "某作品" })),
    ).prompt;
    expect(without).not.toContain("本次生成指令");
    expect(without).not.toMatch(/\{\{[a-zA-Z]/);
  });
});
