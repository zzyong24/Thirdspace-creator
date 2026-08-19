import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { z } from "zod";
import {
  runStructuredNode,
  extractJsonObject,
  isStructuredResponseCompatibilityError,
  isStructuredResponseParseError,
  resolveStructuredNodeTimeoutMs,
} from "./structured-node";
import type { PromptTemplate } from "../prompt/template";
import { modelFor } from "../runtime/provider-factory";
import {
  VIDEO_CARDS_TEMPLATE,
  normalizeVideoCardsOutput,
  videoCardsSchema,
} from "../prompt/templates/video-decisions";

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
  it("模型已声明不支持结构化输出时直接走文本兼容协议，不先发送结构化请求", async () => {
    let calls = 0;
    const model = modelFor({
      apiFormat: "openai_chat",
      baseUrl: "https://compat.example/v1",
      model: "compat-model",
      token: "sk-test",
    });
    if (typeof model === "string") throw new Error("预期模型对象");
    Object.defineProperty(model, "doGenerate", {
      configurable: true,
      value: async (options: unknown) => {
        calls += 1;
        expect((options as { responseFormat?: unknown }).responseFormat).toBeUndefined();
        return textResult(
          '{"hooks":[{"text":"直接兼容","why":"只调用一次"}],"cases":[],"dataPoints":[],"quotes":[]}',
        );
      },
    });

    const { object } = await runStructuredNode({
      model,
      template: TEMPLATE,
      facets: { t: "go" },
      outputSchema: schema,
    });

    expect(object.hooks[0]?.text).toBe("直接兼容");
    expect(calls).toBe(1);
  });

  it("兼容端点明确拒绝 response_format 时改走文本 JSON，仍用同一 schema 验收", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("response_format json_schema is not supported");
        }
        return textResult(
          '{"hooks":[{"text":"可恢复","why":"兼容协议"}],"cases":[],"dataPoints":[],"quotes":[]}',
        );
      },
    });

    const { object } = await runStructuredNode({
      model,
      template: TEMPLATE,
      facets: { t: "go" },
      outputSchema: schema,
    });

    expect(object.hooks[0]?.text).toBe("可恢复");
    expect(calls).toBe(2);
  });

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

  it("[T-865] 首次结构化响应仅一张卡枚举越界时局部恢复，不再追加第二次计费请求", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult(JSON.stringify({
          cards: [
            { sceneIdx: 0, kind: "quote", content: "保留一", at: 0 },
            { sceneIdx: 0, kind: "diagram", content: "协议外坏卡", at: 1 },
            { sceneIdx: 0, kind: "list", content: "保留二", at: 2 },
          ],
        }));
      },
    });

    const { object } = await runStructuredNode({
      model,
      template: VIDEO_CARDS_TEMPLATE,
      facets: { scenes: "场景", srt: "字幕", script: "口播" },
      outputSchema: videoCardsSchema,
      normalizeObject: normalizeVideoCardsOutput,
    });

    expect(object.cards.map((card) => card.kind)).toEqual(["quote", "list"]);
    expect(calls).toBe(1);
  });

  it("[T-868] generateObject 的根级 custom 动态错误逐卡恢复，不追加文本模型请求", async () => {
    const dynamicSchema = videoCardsSchema.refine(
      (output) =>
        output.cards.every(
          (card) =>
            card.sceneIdx >= 0 &&
            card.sceneIdx < 3 &&
            (!card.visualPlan ||
              !card.visualPlan.scene?.beats.some(
                (beat) =>
                  beat.action === "grow" &&
                  (!("scale" in beat.from) ||
                    !("scale" in beat.to) ||
                    Number(beat.to.scale) <= Number(beat.from.scale)),
              )),
        ),
      {
        message:
          "卡片 sceneIdx/at 必须合法；visualPlan 必须满足 role、引用与动作属性协议",
      },
    );
    const raw = {
      cards: [
        { sceneIdx: 0, kind: "quote", content: "保留一", at: 0 },
        {
          sceneIdx: 1,
          kind: "list",
          content: "保留卡片，降级计划",
          at: 1,
          visualPlan: {
            relation: "sequence",
            parts: [
              { text: "第一步", role: "step" },
              { text: "第二步", role: "step" },
            ],
            scene: {
              cognitiveGoal: "看见步骤推进",
              layout: "flow",
              aspectStrategy: "reflow",
              entities: [
                {
                  id: "step_one",
                  kind: "node",
                  glyph: "feature",
                  semantic: "步骤",
                },
              ],
              beats: [
                {
                  action: "grow",
                  target: "step_one",
                  start: 0,
                  duration: 0.5,
                  from: { opacity: 0 },
                  to: { opacity: 1 },
                },
              ],
            },
          },
        },
        { sceneIdx: 9, kind: "quote", content: "坏场景", at: 2 },
      ],
    };
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return textResult(JSON.stringify(raw));
      },
    });

    const { object } = await runStructuredNode({
      model,
      template: VIDEO_CARDS_TEMPLATE,
      facets: { scenes: "场景", srt: "字幕", script: "口播" },
      outputSchema: dynamicSchema,
      normalizeObject: (value) =>
        normalizeVideoCardsOutput(value, {
          validateCard: (card) =>
            dynamicSchema.safeParse({ cards: [card] }).success,
        }),
    });

    expect(object.cards.map((card) => card.content)).toEqual([
      "保留一",
      "保留卡片，降级计划",
    ]);
    expect(object.cards[1]?.visualPlan).toBeUndefined();
    expect(calls).toBe(1);
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

describe("isStructuredResponseCompatibilityError", () => {
  it("只识别明确的结构化响应协议不兼容，不把鉴权和网络失败降级", () => {
    expect(
      isStructuredResponseCompatibilityError(
        new Error("response_format json_schema is not supported"),
      ),
    ).toBe(true);
    expect(
      isStructuredResponseCompatibilityError(
        new Error("provider failed", {
          cause: new Error("structured outputs are unsupported"),
        }),
      ),
    ).toBe(true);
    expect(isStructuredResponseCompatibilityError(new Error("401 unauthorized"))).toBe(false);
    expect(isStructuredResponseCompatibilityError(new Error("ECONNRESET"))).toBe(false);
  });
});

describe("resolveStructuredNodeTimeoutMs", () => {
  it("默认 90 秒，允许节点级放宽，但始终有上下界", () => {
    expect(resolveStructuredNodeTimeoutMs(undefined)).toBe(90_000);
    expect(resolveStructuredNodeTimeoutMs(120_000)).toBe(120_000);
    expect(resolveStructuredNodeTimeoutMs(600_000)).toBe(600_000);
    expect(resolveStructuredNodeTimeoutMs(1)).toBe(15_000);
    expect(resolveStructuredNodeTimeoutMs(999_999)).toBe(900_000);
    expect(resolveStructuredNodeTimeoutMs(Number.NaN)).toBe(90_000);
  });
});
