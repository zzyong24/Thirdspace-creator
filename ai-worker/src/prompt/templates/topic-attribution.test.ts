import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import {
  TOPIC_ATTRIBUTION_TEMPLATE,
  topicAttributionSchema,
} from "./topic-attribution";

// [T-235d] topic.attribution 模板 + Zod 输出契约。断言:必需 facet 注入、诚实门在 system、
// schema 卡 gate-F3 枚举(非法值拒收,缺枚举不给 default —— 不把「没判」伪装成「判了」)、
// 受限自由文本缺字段走 default 过校验(跨模型稳)。

const POSITIONING = "领域:AI 编导;定位一句:把复杂 AI 流程讲成普通人能用的干货";
const WORK_BRIEF = "· 标题:3 个提示词技巧\n· 表现分层:爆款(相对本账号基线 3.2x)\n· 播放:32000";
const TRANSCRIPT = "大家好,今天讲 3 个提示词技巧,第一步……";

describe("topic.attribution 模板", () => {
  it("positioning + workBrief + transcript 注入 → 落进最终 prompt,无占位残留", () => {
    const { system, prompt } = bindPrompt(TOPIC_ATTRIBUTION_TEMPLATE, {
      positioning: POSITIONING,
      workBrief: WORK_BRIEF,
      transcript: TRANSCRIPT,
    });
    expect(prompt).toContain(POSITIONING);
    expect(prompt).toContain("3.2x");
    expect(prompt).toContain(TRANSCRIPT);
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
    // 诚实门(T-224 同源)在 system:只依据真逐字稿,引用原文佐证,无据不写。
    expect(system).toContain("真逐字稿");
    expect(system).toContain("绝不推测、绝不编造");
    // 分层由程序算好注入,模型不重算。
    expect(system).toContain("不要重新评判数据高低");
  });

  it("缺必需 facet → bindPrompt 报错(不静默拼空)", () => {
    expect(() =>
      bindPrompt(TOPIC_ATTRIBUTION_TEMPLATE, {
        positioning: POSITIONING,
        workBrief: WORK_BRIEF,
      }),
    ).toThrow(/transcript/);
  });

  it("requiredFacets = [positioning, workBrief, transcript]", () => {
    expect(TOPIC_ATTRIBUTION_TEMPLATE.requiredFacets).toEqual([
      "positioning",
      "workBrief",
      "transcript",
    ]);
  });

  it("outputSchema 卡 gate-F3 枚举 + 实验数组;受限自由文本缺字段走 default", () => {
    const parsed = topicAttributionSchema.parse({
      topic_type: "教程",
      hook_type: "具体数字",
      structure_formula: "三步教程",
      why_it_worked: "开头「3 个提示词技巧」给了数字承诺",
      next_experiments: [{ title: "5 个进阶提示词", angle: "验证数字钩子" }],
    });
    expect(parsed.topic_type).toBe("教程");
    expect(parsed.why_it_failed).toBe(""); // 缺字段 default 空(无据留空是合法诚实输出)
    expect(parsed.reusable_formula).toBe("");
    expect(parsed.next_experiments).toHaveLength(1);
  });

  it("next_experiments 缺省 → 空数组;条目缺 angle → default 空串", () => {
    const parsed = topicAttributionSchema.parse({
      topic_type: "观点",
      hook_type: "反差",
      structure_formula: "清单式",
    });
    expect(parsed.next_experiments).toEqual([]);
    const withPartial = topicAttributionSchema.parse({
      topic_type: "观点",
      hook_type: "反差",
      structure_formula: "清单式",
      next_experiments: [{ title: "只有标题" }],
    });
    expect(withPartial.next_experiments[0]!.angle).toBe("");
  });

  it("枚举非法值 / 枚举缺失 → 校验失败(runStructuredNode 重试,不给 default 伪装)", () => {
    expect(() =>
      topicAttributionSchema.parse({
        topic_type: "带货", // 不在 gate-F3 枚举里
        hook_type: "反差",
        structure_formula: "清单式",
      }),
    ).toThrow();
    expect(() =>
      topicAttributionSchema.parse({
        hook_type: "反差",
        structure_formula: "清单式",
      }),
    ).toThrow(); // topic_type 缺失也拒收
  });
});
