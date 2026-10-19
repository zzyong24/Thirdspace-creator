import { describe, it, expect } from "vitest";
import { reviewFacets } from "./review-context";
import type { CreativeContext } from "./creative-context";

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

describe("reviewFacets — 复盘作品真材料映射进 review.insights facets", () => {
  it("subject 用作品真标题;文案/数据/评论各拼成带标题行的整块", () => {
    const facets = reviewFacets(
      makeContext({
        reviewTitle: "上下文工程实战复盘",
        reviewScript: "开头三秒抛钩子……逐字稿正文",
        reviewMetrics: "播放：52000 · 点赞：3100 · 评论：420",
        reviewComments: "· 钩子太强\n· 求下集",
      }),
    );
    // subject = 真标题(不是账号级兜底)。
    expect(facets.subject).toBe("上下文工程实战复盘");
    // 三个块含真内容 + 各自的中文小标题(prompt 里会条件注入)。
    expect(facets.reviewScriptBlock).toContain("【本次复盘作品·文案】");
    expect(facets.reviewScriptBlock).toContain("逐字稿正文");
    expect(facets.reviewMetricsBlock).toContain("【本次复盘作品·真实数据】");
    expect(facets.reviewMetricsBlock).toContain("52000");
    expect(facets.reviewCommentsBlock).toContain("【本次复盘作品·观众评论】");
    expect(facets.reviewCommentsBlock).toContain("求下集");
  });

  it("overrideSubject(对话里显式指定)优先于 reviewTitle", () => {
    const facets = reviewFacets(
      makeContext({ reviewTitle: "作品真标题" }),
      "用户指定的复盘对象",
    );
    expect(facets.subject).toBe("用户指定的复盘对象");
  });

  it("无真标题也无 override → 回退账号级兜底文案(subject 非空,不触发 requiredFacet 报错)", () => {
    const facets = reviewFacets(makeContext());
    expect(facets.subject).toContain("按这个账号的整体表现");
  });

  it("空文案/指标明确证据边界，空评论仍省略，不虚构材料", () => {
    const facets = reviewFacets(makeContext({ reviewTitle: "只有标题" }));
    expect(facets.reviewScriptBlock).toBe("\n【本次复盘作品·文案】未取得真实稿件，不能评价具体开头台词、段落或叙事结构。\n");
    expect(facets.reviewMetricsBlock).toBe("\n【本次复盘作品·真实数据】未取得发布指标，不能归因传播或成交效果。\n");
    expect(facets.reviewCommentsBlock).toBe("");
  });
});
