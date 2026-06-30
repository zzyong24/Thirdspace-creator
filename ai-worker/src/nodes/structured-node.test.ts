import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { z } from "zod";
import { runStructuredNode, extractJsonObject } from "./structured-node";
import type { PromptTemplate } from "../prompt/template";

// 一个最小四类 schema(模仿 research.gather 形状)+ 模板,验结构化节点的跨模型健壮性。
const schema = z.object({
  hooks: z.array(z.object({ text: z.string(), why: z.string() })).default([]),
  cases: z.array(z.object({ title: z.string() })).default([]),
  dataPoints: z.array(z.object({ stat: z.string() })).default([]),
  quotes: z.array(z.object({ line: z.string() })).default([]),
});
const TEMPLATE: PromptTemplate = {
  id: "test.structured",
  version: "v1",
  system: "s",
  template: "{{t}}",
  requiredFacets: ["t"],
  outputSchema: schema,
};

function textResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("runStructuredNode 跨模型健壮性", () => {
  it("generateObject 落空(端点吐纯文本不调工具)→ 文本兜底抽 JSON + 同一 schema 校验", async () => {
    // 该 mock 永远只回 fenced JSON 文本,不产 tool call —— generateObject 的 tool-mode 抽不出
    // 对象(模拟 MiniMax-M3 的 flaky 行为),触发文本兜底路径。
    const json =
      '```json\n{"hooks":[{"text":"反直觉钩子","why":"制造缺口"}],"cases":[{"title":"案例X"}],"dataPoints":[{"stat":"28%"}],"quotes":[{"line":"金句Y"}]}\n```';
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult(json),
    });
    const { object } = await runStructuredNode<z.infer<typeof schema>>({
      model,
      template: TEMPLATE,
      facets: { t: "go" },
      outputSchema: schema,
    });
    expect(object.hooks).toHaveLength(1);
    expect(object.hooks[0]?.text).toBe("反直觉钩子");
    expect(object.cases[0]?.title).toBe("案例X");
    expect(object.dataPoints[0]?.stat).toBe("28%");
    expect(object.quotes[0]?.line).toBe("金句Y");
  });

  it("generateObject 落空 + 文本也无合 schema 的 JSON → 抛错(不假成功)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult("抱歉,我没法完成。"),
    });
    await expect(
      runStructuredNode({
        model,
        template: TEMPLATE,
        facets: { t: "go" },
        outputSchema: schema,
      }),
    ).rejects.toThrow();
  });
});

describe("extractJsonObject", () => {
  it("容忍 ``` 包裹 + 前后散文", () => {
    const obj = extractJsonObject('前言\n```json\n{"a":1}\n```\n后记') as {
      a: number;
    };
    expect(obj.a).toBe(1);
  });
  it("无 JSON → null", () => {
    expect(extractJsonObject("纯文字没有对象")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});
