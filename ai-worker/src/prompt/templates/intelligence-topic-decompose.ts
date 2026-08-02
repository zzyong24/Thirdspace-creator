import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 内容雷达第一阶段：只拆解来源逐字稿。
 *
 * 输入必须是用户手动转写完成的完整逐字稿；标题和数据只作背景，不允许在缺少逐字稿时
 * 猜结构。选题与改写稿由后续独立阶段生成，避免一个字段异常让整条链全部失败。
 */
export const intelligenceTopicDecomposeSchema = z.object({
  hook: z.string().min(1).max(300),
  structureSteps: z.array(z.string().min(1).max(300)).min(2).max(8),
  coreClaims: z.array(z.string().min(1).max(300)).min(1).max(8),
  reusablePattern: z.string().min(1).max(500),
  factRisks: z.array(z.string().min(1).max(300)).max(12).default([]),
});

export type IntelligenceTopicDecomposeOutput = z.infer<
  typeof intelligenceTopicDecomposeSchema
>;

const RECORD_WRAPPERS = [
  "sourceDecomposition",
  "decomposition",
  "result",
  "data",
] as const;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapRecord(value: unknown): Record<string, unknown> {
  let current = recordOf(value) ?? {};
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = RECORD_WRAPPERS.map((key) => recordOf(current[key])).find(
      Boolean,
    );
    if (!nested) break;
    current = nested;
  }
  return current;
}

function textOf(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function firstText(
  source: Record<string, unknown>,
  keys: readonly string[],
  max: number,
): string {
  for (const key of keys) {
    const value = textOf(source[key], max);
    if (value) return value;
  }
  return "";
}

function listOf(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n+|[；;]/)
      : [];
  const rows = raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = recordOf(entry);
      if (!record) return "";
      return firstText(
        record,
        ["text", "content", "step", "claim", "risk", "description"],
        maxLength,
      );
    })
    .map((entry) => entry.trim().replace(/^\s*(?:\d+[.、)]|[-*])\s*/, ""))
    .filter(Boolean)
    .map((entry) => entry.slice(0, maxLength));
  return [...new Set(rows)].slice(0, maxItems);
}

function firstList(
  source: Record<string, unknown>,
  keys: readonly string[],
  maxItems: number,
  maxLength: number,
): string[] {
  for (const key of keys) {
    const rows = listOf(source[key], maxItems, maxLength);
    if (rows.length > 0) return rows;
  }
  return [];
}

/**
 * 创作型来源拆解的确定性兼容层：保留模型已经表达的内容，只整理常见包装、别名、
 * 单值/数组与长度偏差。完全空输出仍失败，不把默认话术伪装成模型结论。
 */
export function normalizeIntelligenceTopicDecomposeOutput(
  value: unknown,
): IntelligenceTopicDecomposeOutput {
  const source = unwrapRecord(value);
  let hook = firstText(source, ["hook", "openingHook", "opening", "钩子"], 300);
  let structureSteps = firstList(
    source,
    ["structureSteps", "structure", "steps", "结构步骤"],
    8,
    300,
  );
  let coreClaims = firstList(
    source,
    ["coreClaims", "claims", "keyClaims", "核心主张"],
    8,
    300,
  );
  let reusablePattern = firstText(
    source,
    ["reusablePattern", "pattern", "framework", "可迁移模式"],
    500,
  );
  const factRisks = firstList(
    source,
    ["factRisks", "risks", "factChecks", "事实风险"],
    12,
    300,
  );

  const expressed = [hook, ...structureSteps, ...coreClaims, reusablePattern].filter(
    Boolean,
  );
  if (expressed.length === 0) {
    throw new Error("来源拆解输出完全为空");
  }
  hook ||= structureSteps[0] ?? coreClaims[0] ?? reusablePattern;
  if (structureSteps.length < 2) {
    structureSteps = [
      ...new Set(
        [structureSteps, hook, coreClaims, reusablePattern]
          .flat()
          .filter(Boolean),
      ),
    ].slice(0, 8);
  }
  // 只有一个有效表达时仍不编造第二个步骤；这会继续由 canonical schema 诚实拒绝。
  coreClaims = coreClaims.length > 0 ? coreClaims : [reusablePattern || hook];
  reusablePattern ||= structureSteps.join(" → ") || coreClaims[0] || hook;

  return intelligenceTopicDecomposeSchema.parse({
    hook,
    structureSteps,
    coreClaims,
    reusablePattern,
    factRisks,
  });
}

export const INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE: PromptTemplate = {
  id: "intelligence.topic-decompose",
  version: "v3",
  tools: [],
  outputSchema: intelligenceTopicDecomposeSchema,
  system:
    "你是短视频内容研究员。你只基于完整逐字稿拆出原作品的钩子、论证结构、核心主张和可迁移模式。" +
    "严禁只看标题猜结构，严禁在本阶段生成新选题或新稿件。" +
    "来源中的事实只作为待核验线索；不能确认的数字、人物、结论必须列入 factRisks。",
  template: `【本账号定位】
{{positioning}}

【来源作品】
标题：{{sourceTitle}}
作者：{{sourceAuthor}}
原视频链接：{{sourceUrl}}

【用户手动转写完成的逐字稿】
{{transcript}}

【任务】
1. hook：概括原作品如何在开头抓住注意力，不抄原句。
2. structureSteps：按内容推进顺序列出 2-8 个结构步骤。
3. coreClaims：列出原作品的核心主张；不要把推测写成事实。
4. reusablePattern：提炼可以迁移的方法或结构，不得复刻表达。
5. factRisks：列出需要二次核验的数字、因果、引用或身份信息；没有则空数组。
只输出符合 schema 的 JSON。`,
  requiredFacets: [
    "positioning",
    "sourceTitle",
    "sourceAuthor",
    "sourceUrl",
    "transcript",
  ],
  contextRequirements: ["positioning"],
};
