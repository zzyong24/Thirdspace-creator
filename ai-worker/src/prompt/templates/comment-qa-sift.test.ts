import { describe, it, expect } from "vitest";
import {
  commentQaSiftSchema,
  commentQaCandidateSchema,
  COMMENT_QA_SIFT_TEMPLATE,
} from "./comment-qa-sift";
import { bindPrompt } from "../template";
import { getTemplate, hasOutputSchema, _resetRegistry } from "../registry";

// T-092 评论回流蒸馏筛:comment.qa-sift 模板 + 输出 schema 契约锁。
// runner(frontend comment-qa-sift-runner)绑 runStructuredNode 消费这份 schema;
// 前端确认门依赖 candidates[]{title,note,sourceNote,signalIds} 形状。

describe("commentQaSiftSchema(输出契约)", () => {
  it("完整输出照单全收(signalIds 聚合 = 同义合并)", () => {
    const parsed = commentQaSiftSchema.parse({
      candidates: [
        {
          title: "怎么在本地跑大模型?",
          note: "多位观众问本地部署",
          sourceNote: "抖音评论 ×3,最高赞 57",
          signalIds: ["sig-1", "sig-2", "sig-3"],
        },
      ],
    });
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.candidates[0]!.signalIds).toHaveLength(3);
  });

  it("缺字段走默认(空候选诚实空数组)", () => {
    const parsed = commentQaSiftSchema.parse({});
    expect(parsed.candidates).toEqual([]);
    const c = commentQaCandidateSchema.parse({});
    expect(c.title).toBe("");
    expect(c.signalIds).toEqual([]);
  });
});

describe("COMMENT_QA_SIFT_TEMPLATE(模板本体)", () => {
  it("id/version/必需 facet 齐(comments 必需),outputSchema 挂载", () => {
    expect(COMMENT_QA_SIFT_TEMPLATE.id).toBe("comment.qa-sift");
    expect(COMMENT_QA_SIFT_TEMPLATE.requiredFacets).toEqual(["comments"]);
    expect(COMMENT_QA_SIFT_TEMPLATE.outputSchema).toBe(commentQaSiftSchema);
  });

  it("bindPrompt 注入 comments facet;prompt 带同义合并/只留疑问硬约束", () => {
    const bound = bindPrompt(COMMENT_QA_SIFT_TEMPLATE, {
      comments: "[sig-1] (赞 57) 本地模型怎么装?",
    });
    expect(bound.prompt).toContain("[sig-1] (赞 57)");
    expect(bound.prompt).toContain("同义合并");
    expect(bound.prompt).toContain("疑问");
  });

  it("registry 注册且带输出契约(惰性 bootstrap)", () => {
    _resetRegistry();
    const tpl = getTemplate("comment.qa-sift");
    expect(tpl.id).toBe("comment.qa-sift");
    expect(hasOutputSchema("comment.qa-sift")).toBe(true);
  });
});
