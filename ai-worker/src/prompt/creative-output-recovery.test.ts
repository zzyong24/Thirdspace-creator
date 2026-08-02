import { describe, expect, it } from "vitest";
import { topicArraySchema } from "./templates/topic-generate";
import { researchMaterialSchema } from "./templates/research-gather";
import {
  recoverCreativeZodOutput,
  structuredProtocolCandidates,
} from "./creative-output-recovery";

describe("recoverCreativeZodOutput", () => {
  it("非关键字段类型错误时让 schema 默认值接管，保留同一条可用选题", () => {
    const recovered = recoverCreativeZodOutput(topicArraySchema, {
      topics: [
        {
          title: "保留这条选题",
          angle: "真实切入",
          predictedScore: "高",
          sourceComments: "不是数组",
        },
      ],
    });
    const parsed = topicArraySchema.parse(recovered);
    expect(parsed.topics).toEqual([
      expect.objectContaining({
        title: "保留这条选题",
        predictedScore: null,
        sourceComments: [],
      }),
    ]);
  });

  it("一条素材缺关键字段时只丢该条，其他真实素材继续可见", () => {
    const recovered = recoverCreativeZodOutput(researchMaterialSchema, {
      hooks: [{ why: "缺钩子正文" }],
      cases: [],
      dataPoints: [{ stat: "仍保留的事实", source: "用户资料" }],
      quotes: [],
    });
    const parsed = researchMaterialSchema.parse(recovered);
    expect(parsed.hooks).toEqual([]);
    expect(parsed.dataPoints[0]?.stat).toBe("仍保留的事实");
  });

  it("所有关键内容都坏时不会补造结果，最终 schema 继续拒绝", () => {
    const recovered = recoverCreativeZodOutput(researchMaterialSchema, {
      hooks: [{ why: "缺钩子正文" }],
    });
    expect(researchMaterialSchema.safeParse(recovered).success).toBe(false);
  });
});

describe("structuredProtocolCandidates", () => {
  it("兼容嵌套包装与双重编码 JSON，但不把包装本身当成功", () => {
    const candidates = structuredProtocolCandidates({
      response: {
        output: '{"title":"真实对象"}',
      },
    });
    expect(candidates).toContainEqual({ title: "真实对象" });
  });
});
