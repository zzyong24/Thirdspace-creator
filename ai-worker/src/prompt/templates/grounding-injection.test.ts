import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";
import { SCRIPT_DRAFT_TEMPLATE } from "./script-draft";
import { PLANNING_THESIS_TEMPLATE } from "./planning-thesis";
import { TOPIC_ENRICH_TEMPLATE } from "./topic-enrich";
import { TOPIC_GENERATE_TEMPLATE } from "./topic-generate";

// [T-269/T-270] 接地根:验证四个生成模板都嵌入了共享的 anti-fabrication 硬约束段(单一真值),
// 且项目态模板(script.draft / planning.thesis)带 {{projectBriefHard}} 立项硬锚 + 用户素材占位。

describe("[T-269] anti-fabrication 段下沉到四个生成模板正文", () => {
  it("script.draft 模板正文含逐字一致的 ANTI_FABRICATION_CLAUSE", () => {
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain(ANTI_FABRICATION_CLAUSE);
  });
  it("planning.thesis 模板正文含 ANTI_FABRICATION_CLAUSE", () => {
    expect(PLANNING_THESIS_TEMPLATE.template).toContain(ANTI_FABRICATION_CLAUSE);
  });
  it("topic.enrich 模板正文含 ANTI_FABRICATION_CLAUSE(账号态但同禁编造)", () => {
    expect(TOPIC_ENRICH_TEMPLATE.template).toContain(ANTI_FABRICATION_CLAUSE);
  });
  it("topic.generate 模板正文含 ANTI_FABRICATION_CLAUSE(账号态但同禁编造)", () => {
    expect(TOPIC_GENERATE_TEMPLATE.template).toContain(ANTI_FABRICATION_CLAUSE);
  });
});

describe("[T-270] 项目态模板带立项 Brief 硬锚 + 用户素材占位", () => {
  it("script.draft:{{projectBriefHard}} 占位在场,brief 装配后落进 prompt 无残留", () => {
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain("{{projectBriefHard}}");
    const { prompt } = bindPrompt(SCRIPT_DRAFT_TEMPLATE, {
      positioning: "AI 编导科普",
      projectBriefHard:
        "【本条内容立项硬约束 —— 必须遵守】\n· 核心信息:纪律是最后护城河",
    });
    expect(prompt).toContain("纪律是最后护城河");
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/); // 无占位残留
  });

  it("planning.thesis:{{projectBriefHard}} + 用户素材占位在场 + 声明 contextRequirements", () => {
    expect(PLANNING_THESIS_TEMPLATE.template).toContain("{{projectBriefHard}}");
    expect(PLANNING_THESIS_TEMPLATE.template).toContain("{{userMaterialHard}}");
    expect(PLANNING_THESIS_TEMPLATE.template).toContain("{{userMaterialRef}}");
    // 论点树此前连 contextRequirements 都没声明(漏接高发区);现补 brief + projectMaterials。
    expect(PLANNING_THESIS_TEMPLATE.contextRequirements).toEqual(
      expect.arrayContaining(["brief", "projectMaterials", "positioning"]),
    );
    const { prompt } = bindPrompt(PLANNING_THESIS_TEMPLATE, {
      positioning: "AI 编导科普",
      projectBriefHard: "【本条内容立项硬约束 —— 必须遵守】\n· 核心信息:反共识主张",
      userMaterialHard: "【用户第一手资料】设计文档被多个 AI 评审",
    });
    expect(prompt).toContain("反共识主张");
    expect(prompt).toContain("设计文档被多个 AI 评审");
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
  });
});

// [T-371] topic.enrich 模板的素材依据诚实门:有【本轮联网核实素材】→ 据实引用;没有 → 如实写
// 「未联网核实,以下基于模型已有认知」;禁「待联网拉取/暂无素材需搜集」伪承诺占位(真机事故:
// 搜索没完成就出卡,materialBasis 拿占位文案冒充产出)。
describe("[T-371] topic.enrich 模板 — 素材依据诚实门 + verifiedBrief 占位", () => {
  it("模板带 {{verifiedBrief}} 选填占位(联网核实素材段通道)", () => {
    expect(TOPIC_ENRICH_TEMPLATE.template).toContain("{{verifiedBrief}}");
    // 选填:不在 requiredFacets(后台任务路径无此 facet,缺省替空串)。
    expect(TOPIC_ENRICH_TEMPLATE.requiredFacets).not.toContain("verifiedBrief");
  });

  it("素材依据指令:有核实素材据实引用,无则如实标「未联网核实」,禁伪承诺占位", () => {
    const t = TOPIC_ENRICH_TEMPLATE.template;
    expect(t).toContain("【本轮联网核实素材】");
    expect(t).toContain("据实引用");
    expect(t).toContain("未联网核实,以下基于模型已有认知");
    expect(t).toContain("待联网拉取/暂无素材,需搜集补充");
    // 旧文案「没有可依托素材就如实写『暂无现成素材,需搜集』」已移除(正是事故占位话术的出处)。
    expect(t).not.toContain("暂无现成素材,需搜集」");
  });

  it("bindPrompt:传 verifiedBrief facet(含段头)→ 落进 prompt;缺省 → 无残留占位", () => {
    const facets = {
      positioning: "AI 编导科普",
      title: "kimi 新模型解读",
      angle: "时效角",
    };
    const withBrief = bindPrompt(TOPIC_ENRICH_TEMPLATE, {
      ...facets,
      verifiedBrief:
        "\n【本轮联网核实素材(来自对话检索,据实引用)】\nKimi 今日发布新模型,来源:https://example.com/news",
    });
    expect(withBrief.prompt).toContain("Kimi 今日发布新模型");
    const without = bindPrompt(TOPIC_ENRICH_TEMPLATE, facets);
    expect(without.prompt).not.toMatch(/\{\{[a-zA-Z]/); // 无占位残留
  });
});

// [T-355] 观众心智预设写法纪律段(用户拍板文案观的消化版)嵌入文案生成面 —— 单一真值
// AUDIENCE_MINDSET_CLAUSE。核心不变量:尊重观众且不隐藏真实条件。
describe("[T-355] 观众心智预设段下沉到文案生成模板", () => {
  it("script.draft 模板正文含逐字一致的 AUDIENCE_MINDSET_CLAUSE", async () => {
    const { AUDIENCE_MINDSET_CLAUSE } = await import("../grounding-facets");
    expect(SCRIPT_DRAFT_TEMPLATE.template).toContain(AUDIENCE_MINDSET_CLAUSE);
  });
  it("platform.adapt(标题/简介物料)模板正文含 AUDIENCE_MINDSET_CLAUSE", async () => {
    const { AUDIENCE_MINDSET_CLAUSE } = await import("../grounding-facets");
    const { PLATFORM_ADAPT_TEMPLATE } = await import("./platform-adapt");
    expect(PLATFORM_ADAPT_TEMPLATE.template).toContain(AUDIENCE_MINDSET_CLAUSE);
  });
  it("尊重观众，但失败归因和使用条件仍按事实表达", async () => {
    const { AUDIENCE_MINDSET_CLAUSE } = await import("../grounding-facets");
    expect(AUDIENCE_MINDSET_CLAUSE).toContain("不羞辱能力或努力");
    expect(AUDIENCE_MINDSET_CLAUSE).toContain("必要条件和能力边界");
  });
});
