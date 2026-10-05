import {describe, expect, it} from "vitest";
import {getTemplate} from "../prompt/registry";
import {graphicCardBriefSchema} from "../prompt/templates/graphic-card-brief";
import {projectGraphicCardPlan} from "./graphic-card-plan";

describe("T-1029 图卡专属视觉简报", () => {
  it("注册独立 Skill，不使用封面文案 schema", () => {
    const template = getTemplate("graphic.card-brief");
    expect(template.id).toBe("graphic.card-brief");
    expect(graphicCardBriefSchema.parse({imagePrompt: "A detailed body illustration with a clear visual relationship", altText: "关系图"}))
      .toMatchObject({altText: "关系图"});
    expect(() => graphicCardBriefSchema.parse({headline: "封面标题"})).toThrow();
  });

  it("图卡投影保留模型选择的画面提示词与真实 role 意图", () => {
    const result = projectGraphicCardPlan({imagePrompt: "A detailed body illustration with two contrasting workflows", altText: "流程对比"},
      {topic: {title: "主题", angle: ""}});
    expect(result).toMatchObject({name: "图文配图候选", prompt: "A detailed body illustration with two contrasting workflows",
      graphicCardPlan: {altText: "流程对比"}});
    expect(result).not.toHaveProperty("coverPlan");
  });
});
