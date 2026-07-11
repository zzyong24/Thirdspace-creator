import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import { POSITIONING_GENERATE_TEMPLATE } from "./positioning-generate";

// [T-081②] positioning.generate 模板的 {{works}} 选填占位 —— 真实作品画像块(调用方经
// formatWorksBrief 拼整块传入)。断言:传入 → 整块落进最终 prompt;不传/空 → 整段省略且无
// 占位残留;requiredFacets 仍只有 current(works 保持选填,老调用路径不崩)。

const CURRENT = "定位一句话：把论文落成代码";

describe("positioning.generate 模板 — {{works}} 真实作品画像占位 (T-081②)", () => {
  it("works facet 传入 → 注入【我的真实作品(定位必须扎根于此)】整块", () => {
    const { prompt } = bindPrompt(POSITIONING_GENERATE_TEMPLATE, {
      current: CURRENT,
      accounts: "\n【创作者抖音账号画像】\n· douyin | @硬核老王 | 粉丝 12000",
      works:
        "\n\n【我的真实作品（定位必须扎根于此）】\n· 上下文工程实战（已发布）\n· AI 编导流程（planning）WORKS_MARKER",
    });
    expect(prompt).toContain("【我的真实作品（定位必须扎根于此）】");
    expect(prompt).toContain("上下文工程实战（已发布）");
    expect(prompt).toContain("WORKS_MARKER");
    // 任务段提示模型结合真实作品列表。
    expect(prompt).toContain("真实作品列表");
  });

  it("works 不传 → 整段省略、无未替换占位(老调用路径行为不变)", () => {
    const { prompt } = bindPrompt(POSITIONING_GENERATE_TEMPLATE, {
      current: CURRENT,
      accounts: "\n（创作者尚未连接平台账号——按通用赛道判断即可）",
    });
    expect(prompt).not.toContain("我的真实作品");
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/);
    // 原有 facet 仍在。
    expect(prompt).toContain(CURRENT);
  });

  it("requiredFacets 只有 current(works/accounts 保持选填)", () => {
    expect(POSITIONING_GENERATE_TEMPLATE.requiredFacets).toEqual(["current"]);
  });
});

// [T-234] 定位硬约束:输出 schema 带 downstreamRules(键与 contract creatorProfileDownstreamRules
// 对齐),prompt 引导「只提炼聊到的、没聊到留空不编造」。老输出(无该字段)仍过校验。
describe("positioning.generate — downstreamRules 硬约束 (T-234)", () => {
  it("outputSchema 接受 downstreamRules 并对缺省键补空串", () => {
    const schema = POSITIONING_GENERATE_TEMPLATE.outputSchema!;
    const parsed = schema.parse({
      persona: "P",
      oneLiner: "O",
      downstreamRules: { topicRule: "只做实战题", forbidRule: "不贩卖焦虑" },
    }) as { downstreamRules: Record<string, string> };
    expect(parsed.downstreamRules).toEqual({
      topicRule: "只做实战题",
      scriptRule: "",
      projectRule: "",
      forbidRule: "不贩卖焦虑",
      expressionRule: "",
    });
  });

  it("老输出无 downstreamRules → 默认全空键(不崩)", () => {
    const schema = POSITIONING_GENERATE_TEMPLATE.outputSchema!;
    const parsed = schema.parse({ persona: "P" }) as {
      downstreamRules: Record<string, string>;
    };
    expect(Object.keys(parsed.downstreamRules).sort()).toEqual([
      "expressionRule",
      "forbidRule",
      "projectRule",
      "scriptRule",
      "topicRule",
    ]);
    expect(Object.values(parsed.downstreamRules).every((v) => v === "")).toBe(
      true,
    );
  });

  it("prompt 含 downstreamRules 输出形状与「不编造留空」指引", () => {
    const { prompt } = bindPrompt(POSITIONING_GENERATE_TEMPLATE, {
      current: CURRENT,
    });
    expect(prompt).toContain('"downstreamRules"');
    expect(prompt).toContain("topicRule");
    expect(prompt).toContain("留空字符串");
    expect(prompt).toContain("绝不编造");
  });
});
