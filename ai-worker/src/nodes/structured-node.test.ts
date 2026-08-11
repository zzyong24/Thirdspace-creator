import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { z } from "zod";
import {
  runStructuredNode,
  extractJsonObject,
  isStructuredResponseParseError,
} from "./structured-node";
import type { PromptTemplate } from "../prompt/template";

// 一个最小四类 schema(模仿 research.gather 形状)+ 模板,验结构化节点的跨模型健壮性。
const schema = z.object({
  hooks: z.array(z.object({ text: z.string(), why: z.string() })).default([]),
  cases: z.array(z.object({ title: z.string() })).default([]),
  dataPoints: z.array(z.object({ stat: z.string() })).default([]),
  quotes: z.array(z.object({ line: z.string() })).default([]),
}).refine(
  (value) =>
    value.hooks.length + value.cases.length + value.dataPoints.length + value.quotes.length > 0,
  { message: "至少返回一条内容" },
);
const TEMPLATE: PromptTemplate = {
  id: "test.structured",
  version: "v1",
  system: "s",
  template: "{{t}}",
  requiredFacets: ["t"],
  outputSchema: schema,
};

function textResult(
  text: string,
  reasoning?: string,
): LanguageModelV4GenerateResult {
  return {
    content: [
      ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
      { type: "text", text },
    ],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

const reviewSchema = z.object({
  verdict: z.enum(["pass", "risk", "block"]).default("pass"),
  summary: z.string().default(""),
  findings: z.array(z.object({ quote: z.string() })).default([]),
});
const REVIEW_TEMPLATE: PromptTemplate = {
  ...TEMPLATE,
  id: "script.review",
  outputSchema: reviewSchema,
};
const isCompleteReview = (raw: unknown): boolean => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  return (
    ["pass", "risk", "block"].includes(String(record.verdict)) &&
    typeof record.summary === "string" &&
    record.summary.trim().length > 0 &&
    Array.isArray(record.findings)
  );
};

describe("runStructuredNode 跨模型健壮性", () => {
  it("generateObject 落空(端点吐纯文本不调工具)→ 文本兜底抽 JSON + 同一 schema 校验", async () => {
    // 该 mock 永远只回 fenced JSON 文本,不产 tool call —— generateObject 的 tool-mode 抽不出
    // 对象(模拟 MiniMax-M3 的 flaky 行为),触发文本兜底路径。
    const json =
      '```json\n{"hooks":[{"text":"反直觉钩子","why":"制造缺口"}],"cases":[{"title":"案例X"}],"dataPoints":[{"stat":"28%"}],"quotes":[{"line":"金句Y"}]}\n```';
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult(json),
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
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
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[structured-node\] template=test\.structured status=ok durationMs=\d+ path=text_fallback modelCalls=\d+ inputTokens=\d+ outputTokens=\d+$/,
        ),
      );
    } finally {
      log.mockRestore();
    }
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

  it("交互调用显式 maxRetries=0 时文本兜底只请求一次，避免失败路径成倍放大", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult("不是 JSON");
      },
    });
    await expect(
      runStructuredNode({
        model,
        template: TEMPLATE,
        facets: { t: "go" },
        outputSchema: schema,
        maxRetries: 0,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it("默认也只做一次结构化尝试和一次文本降级，避免所有工具隐式六次调用", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult("不是 JSON");
      },
    });
    await expect(
      runStructuredNode({
        model,
        template: TEMPLATE,
        facets: { t: "go" },
        outputSchema: schema,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });
});

describe("runStructuredNode reasoning 恢复边界", () => {
  it("正文为空且调用方显式开启时，只恢复原始字段完整的审核 JSON", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        textResult(
          "",
          '分析过程。最终：{"verdict":"pass","summary":"语义审核已完成。","findings":[]}',
        ),
    });
    const { object } = await runStructuredNode({
      model,
      template: REVIEW_TEMPLATE,
      facets: { t: "go" },
      outputSchema: reviewSchema,
      reasoningFallback: { acceptRaw: isCompleteReview },
    });
    expect(object).toEqual({
      verdict: "pass",
      summary: "语义审核已完成。",
      findings: [],
    });
  });

  it.each(["{}", "先想想 {} 后面没有报告", "完全没有 JSON"])(
    "原始 reasoning 不完整时失败：%s",
    async (reasoning) => {
      const model = new MockLanguageModelV4({
        doGenerate: async () => textResult("", reasoning),
      });
      await expect(
        runStructuredNode({
          model,
          template: REVIEW_TEMPLATE,
          facets: { t: "go" },
          outputSchema: reviewSchema,
          reasoningFallback: { acceptRaw: isCompleteReview },
        }),
      ).rejects.toThrow();
    },
  );

  it("正文非空但无合法 JSON 时不回读 reasoning", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        textResult(
          "正文不是 JSON",
          '{"verdict":"pass","summary":"不应采用。","findings":[]}',
        ),
    });
    await expect(
      runStructuredNode({
        model,
        template: REVIEW_TEMPLATE,
        facets: { t: "go" },
        outputSchema: reviewSchema,
        reasoningFallback: { acceptRaw: isCompleteReview },
      }),
    ).rejects.toThrow();
  });

  it("未显式开启的结构化任务不读取 reasoning", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        textResult(
          "",
          '{"verdict":"pass","summary":"不应采用。","findings":[]}',
        ),
    });
    await expect(
      runStructuredNode({
        model,
        template: REVIEW_TEMPLATE,
        facets: { t: "go" },
        outputSchema: reviewSchema,
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

  it("reasoning 前后各有花括号时提取第一个真实 JSON，而不是首尾粘连", () => {
    expect(
      extractJsonObject(
        '我先考虑 {这不是 JSON}。最终结果：{"hooks":[],"cases":[],"dataPoints":[],"quotes":[]}。补充 {也不是 JSON}',
      ),
    ).toEqual({ hooks: [], cases: [], dataPoints: [], quotes: [] });
  });
});

describe("runStructuredNode 创作型本地归一化", () => {
  it("提供商把对象包进 result 时复用首次返回，仍由原 schema 严格验收", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult(
          '{"result":{"hooks":[{"text":"已生成","why":"真实内容"}],"cases":[],"dataPoints":[],"quotes":[]}}',
        );
      },
    });
    const { object } = await runStructuredNode({
      model,
      template: TEMPLATE,
      facets: { t: "go" },
      outputSchema: schema,
    });
    expect(object.hooks[0]?.text).toBe("已生成");
    expect(calls).toBe(1);
  });

  it("generateObject 已返回可恢复 JSON 时本地归一化成功，不再发起第二次模型调用", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult('{"headline":"先展示可用结果"}');
      },
    });
    const smallSchema = z.object({ title: z.string().min(1) });
    const { object } = await runStructuredNode({
      model,
      template: TEMPLATE,
      facets: { t: "go" },
      outputSchema: smallSchema,
      normalizeObject: (raw) => ({
        title: (raw as { headline?: unknown }).headline,
      }),
    });
    expect(object).toEqual({ title: "先展示可用结果" });
    expect(calls).toBe(1);
  });
});

describe("isStructuredResponseParseError", () => {
  it("识别 provider JSON 解析类错误及 cause 链，不把鉴权/网络错误误降级", () => {
    expect(isStructuredResponseParseError(new Error("Invalid JSON response"))).toBe(true);
    expect(
      isStructuredResponseParseError(
        new Error("provider failed", { cause: { name: "AI_JSONParseError" } }),
      ),
    ).toBe(true);
    expect(isStructuredResponseParseError(new Error("401 unauthorized"))).toBe(false);
    expect(isStructuredResponseParseError(new Error("ECONNRESET"))).toBe(false);
  });
});
