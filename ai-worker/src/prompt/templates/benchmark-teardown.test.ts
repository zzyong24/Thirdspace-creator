import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import {
  BENCHMARK_TEARDOWN_TEMPLATE,
  benchmarkTeardownSchema,
} from "./benchmark-teardown";

// [T-212c] benchmark.teardown 模板 + Zod 输出契约。断言:必需 facet 注入、硬约束在 system、
// schema 卡六段拆解 + 转化选题(fit 枚举)、缺字段走 default 过校验(跨模型稳)。

const POSITIONING = "领域：AI 编导；定位一句：把复杂 AI 流程讲成普通人能用的干货";
const BRIEF = "· 标题：3 个提示词技巧\n· 点赞：52000\n· 爆款倍数：8.7x";

describe("benchmark.teardown 模板", () => {
  it("positioning + benchmarkBrief 注入 → 落进最终 prompt,无占位残留", () => {
    const { system, prompt } = bindPrompt(BENCHMARK_TEARDOWN_TEMPLATE, {
      positioning: POSITIONING,
      benchmarkBrief: BRIEF,
    });
    expect(prompt).toContain(POSITIONING);
    expect(prompt).toContain("爆款倍数：8.7x");
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
    // 硬约束「不抄袭 / 换角度」写进 system(防抄袭红线)。
    expect(system).toContain("绝不抄袭");
    expect(system).toContain("换一个属于本账号的角度");
  });

  it("缺必需 facet → bindPrompt 报错(不静默拼空)", () => {
    expect(() =>
      bindPrompt(BENCHMARK_TEARDOWN_TEMPLATE, { positioning: POSITIONING }),
    ).toThrow(/benchmarkBrief/);
  });

  it("requiredFacets = [positioning, benchmarkBrief]", () => {
    expect(BENCHMARK_TEARDOWN_TEMPLATE.requiredFacets).toEqual([
      "positioning",
      "benchmarkBrief",
    ]);
  });

  it("outputSchema 卡六段拆解 + 转化选题(fit 枚举)", () => {
    const parsed = benchmarkTeardownSchema.parse({
      钩子拆解: "开头抛反常识数字",
      结构拆解: "总-分-总",
      为什么爆: "戳中效率焦虑 + 高信息增量",
      可借鉴点: ["数字化钩子", "分步骤"],
      适配本账号建议: "换成本账号擅长的工作流场景",
      转化选题: [
        { title: "普通人也能用的 3 个 AI 工作流", angle: "落地场景", fit: "high" },
        { title: "偏题的选题", angle: "", fit: "low" },
      ],
    });
    expect(parsed.转化选题).toHaveLength(2);
    expect(parsed.转化选题[0]!.fit).toBe("high");
    expect(parsed.可借鉴点).toContain("数字化钩子");
  });

  it("缺字段走 default 过校验(跨模型偶尔缺字段也不崩)", () => {
    const parsed = benchmarkTeardownSchema.parse({ 为什么爆: "信息增量高" });
    expect(parsed.钩子拆解).toBe("");
    expect(parsed.可借鉴点).toEqual([]);
    expect(parsed.转化选题).toEqual([]);
  });

  it("fit 非法枚举 → 校验失败", () => {
    expect(() =>
      benchmarkTeardownSchema.parse({
        转化选题: [{ title: "x", fit: "super" }],
      }),
    ).toThrow();
  });
});
