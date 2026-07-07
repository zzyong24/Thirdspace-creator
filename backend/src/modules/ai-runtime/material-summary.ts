import type { ModelSpec } from "@creatoros/ai-worker";
import type { MaterialSummary } from "./material-extract-runner";

// 模型吐的原始结构(校验前);与 jsonSchema 泛型对齐 runStructuredNode<T>,消 Schema<unknown> 不匹配。
interface RawMaterialSummary {
  keyPoints?: unknown;
  facts?: unknown;
  sellingPoints?: unknown;
}

// [T-146 切片 a SPEC §1.2 + §11 gate 处置·卖点收窄] 文档 AI 摘要要点卡的内联 skill 模板 + 输出
// 契约。**复用现有文本模型**(script.draft capability)但用一份**内联** PromptTemplate + 显式 JSON
// schema(逃生口,不注册 registry、不新增 capability,合 gate 处置)。摘要铁律:只提炼原文已有的
// 事实/数据/卖点,不补充原文没有的;卖点尤其收窄(只引用原文已声明,AI 不创造)。
//
// [T-163 Batch 4] 从 frontend persistence-client 内联节点提到 backend ai-runtime —— 这段
// runStructuredNode + jsonSchema + prompt 模板是 AI 逻辑,不该住前端包(桌面化 T-147 护城河)。
// 组合根(persistence-client)只留 resolveModelSpec + 错误映射,把解析好的 spec 传进来。
const MATERIAL_SUMMARY_TEMPLATE = {
  id: "material.summarize.inline",
  version: "v1",
  system: [
    "你是短视频创作者的资料分析员。把创作者上传的第一手资料浓缩成结构化「资料要点卡」,供后续写文案紧扣。",
    "",
    "铁律(违反即失职):",
    "1. 只提炼原文**已明确写出**的事实、数据、卖点 —— 逐字有据。原文没写的,一个字都不许补。",
    "2. keyPoints:资料的核心论点/信息(≤6 条,每条一句)。",
    "3. facts:可核验的具体事实与数据(数字、规格、时间、价格等),照抄原文口径,不改写不四舍五入。",
    "4. sellingPoints(卖点):**只允许摘录原文已声明的卖点**,AI 绝不创造新卖点。",
    "   ✅ 原文写「续航 20 小时」→ sellingPoints 可含「长续航(20 小时)」。",
    "   ❌ 原文没提防水 → 绝不得写「防水」;拿不准是不是卖点 → 不放进 sellingPoints。",
    "5. 拿不准、原文没有的字段 → 留空数组。宁缺毋滥,绝不编造。",
    "只输出 JSON,不要多余文字。",
  ].join("\n"),
  template: "以下为创作者上传的资料全文(可能已截断):\n\n{{fullText}}",
  requiredFacets: ["fullText"] as const,
} as const;

// materialSummary 输出契约(JSON Schema,frontend 不引 zod)。runStructuredNode 经 asSchema 吃它,
// generateObject 绑它校验 + 不符自动重试;落空→文本兜底同 schema 再校验(跨模型健壮)。
const MATERIAL_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    keyPoints: { type: "array", items: { type: "string" } },
    facts: { type: "array", items: { type: "string" } },
    sellingPoints: { type: "array", items: { type: "string" } },
  },
  required: ["keyPoints", "facts"],
  additionalProperties: false,
};

/**
 * 跑一次文档 AI 摘要 —— modelFor(spec) + runStructuredNode(内联模板 + 显式 JSON schema),
 * 归一成 MaterialSummary(复用 material-extract-runner 的输出契约)。spec 由组合根按
 * "script.draft" capability 解析后传入(未配的 LlmCredentialError 在组合根侧转
 * MaterialSummaryModelNotConfiguredError,诚实降级)。
 */
export async function runMaterialSummary(
  spec: ModelSpec,
  fullText: string,
): Promise<MaterialSummary> {
  const { modelFor, runStructuredNode } = await import("@creatoros/ai-worker");
  const { jsonSchema } = await import("ai");
  const { object } = await runStructuredNode<RawMaterialSummary>({
    model: modelFor(spec),
    // 内联 skill 模板(不注册 registry):抽全文摘要成结构化要点卡。
    template: MATERIAL_SUMMARY_TEMPLATE,
    facets: { fullText },
    // 逃生口:显式传 JSON schema(不引 zod,经 ai 的 jsonSchema 包装),覆盖 registry。泛型对齐
    // runStructuredNode<RawMaterialSummary>,否则 jsonSchema() 返 Schema<unknown> 不匹配 FlexibleSchema<T>。
    outputSchema: jsonSchema<RawMaterialSummary>(
      MATERIAL_SUMMARY_SCHEMA as Parameters<typeof jsonSchema>[0],
    ),
  });
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        )
      : [];
  return {
    keyPoints: asStrings(object.keyPoints),
    facts: asStrings(object.facts),
    sellingPoints: asStrings(object.sellingPoints),
  };
}
