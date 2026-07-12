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
