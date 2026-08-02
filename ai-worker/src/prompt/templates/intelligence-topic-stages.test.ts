import { describe, expect, it } from "vitest";

import {
  intelligenceTopicDecomposeSchema,
  normalizeIntelligenceTopicDecomposeOutput,
} from "./intelligence-topic-decompose";
import { intelligenceTopicFromDecompositionSchema } from "./intelligence-topic-from-decomposition";

describe("[T-646] 内容雷达分段输出契约", () => {
  it("来源拆解不再要求同时生成选题和长篇改写稿", () => {
    expect(
      intelligenceTopicDecomposeSchema.parse({
        hook: "反常识开场",
        structureSteps: ["提出误区", "给出方法"],
        coreClaims: ["流程优先"],
        reusablePattern: "误区—方法",
      }),
    ).toEqual({
      hook: "反常识开场",
      structureSteps: ["提出误区", "给出方法"],
      coreClaims: ["流程优先"],
      reusablePattern: "误区—方法",
      factRisks: [],
    });
  });

  it("选题候选缺少非关键字段时先保留已有内容，由采纳门再要求补齐", () => {
    expect(
      intelligenceTopicFromDecompositionSchema.parse({
        title: "先稳定流程，再选择模型",
        angle: "从交付现场切入",
      }),
    ).toEqual({
      title: "先稳定流程，再选择模型",
      angle: "从交付现场切入",
      differentiation: "",
      sourceSummary: "",
      targetAudience: "",
      audiencePain: "",
      coreConflict: "",
      format: "",
      adaptationStrategy: { keep: [], replace: [], add: [], avoid: [] },
    });
  });

  it("来源拆解兼容包装层、单值步骤、对象数组和字段别名", () => {
    expect(
      normalizeIntelligenceTopicDecomposeOutput({
        result: {
          openingHook: "先用反常识结论制造缺口",
          structure: "指出误区；解释原因",
          claims: [{ claim: "流程稳定性优先于参数竞赛" }],
          framework: "误区—原因—方法",
          risks: "案例数据需要核验",
        },
      }),
    ).toEqual({
      hook: "先用反常识结论制造缺口",
      structureSteps: ["指出误区", "解释原因"],
      coreClaims: ["流程稳定性优先于参数竞赛"],
      reusablePattern: "误区—原因—方法",
      factRisks: ["案例数据需要核验"],
    });
  });

  it("来源拆解完全没有可用表达时仍诚实失败", () => {
    expect(() => normalizeIntelligenceTopicDecomposeOutput({ result: {} })).toThrow(
      "来源拆解输出完全为空",
    );
  });
});
