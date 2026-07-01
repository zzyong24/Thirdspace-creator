import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * AI 编导诊断 skill 模板(calibration.diagnose)—— 从 calibration-diagnose-runner 的内联 buildDiagnosePrompt 提取。
 * 对一条发布前内容按创作者的变现加权 rubric 逐维度盲评,估发布前表现,写编导诊断。
 * facets 由 CreativeContext + rubric + subject 映射:
 *   positioning(必需,调用方已兜底)· learnings(过往爆款要素,选填)·
 *   rubricBlock(必需:逐维度评分清单,调用方按 dimensions 计算并注入)·
 *   title(必需:待诊断内容标题)· script(必需:文稿,调用方按 scriptText 计算并兜底)。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让用户默认的 MiniMax 也稳定吐可解析诊断(旧 runTemplatedNode 自由文本路径 MiniMax 下常吐不出
 * →parseDiagnosis 返回 null→任务 cancelled)。score/performance 用宽容类型(z.number().nullable()),
 * runner 侧 dimScore/perf/confidence + rubricKeys 交集再归一,保留原容错。字段各给默认值让缺字段也过校验。
 */
export const diagnosisSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.string().default(""),
        score: z.number().nullable().default(null),
        reason: z.string().default(""),
        suggestion: z.string().default(""),
      }),
    )
    .default([]),
  performance: z
    .object({
      完播率: z.number().nullable().default(null),
      收藏率: z.number().nullable().default(null),
      评论率: z.number().nullable().default(null),
      转化意向: z.number().nullable().default(null),
    })
    .default({ 完播率: null, 收藏率: null, 评论率: null, 转化意向: null }),
  verdict: z.string().default(""),
  mainIssues: z.array(z.string()).default([]),
  priorityFixes: z.array(z.string()).default([]),
  confidence: z.string().default("med"),
});
export type DiagnosisOutput = z.infer<typeof diagnosisSchema>;

export const CALIBRATION_DIAGNOSE_TEMPLATE: PromptTemplate = {
  id: "calibration.diagnose",
  version: "v2",
  outputSchema: diagnosisSchema,
  tools: [],
  system: "你是这位创作者的「AI 编导」,按变现加权评分标准逐维度盲评并给出诊断。",
  template: `你是这位创作者的「AI 编导」。下面是一条**发布前的内容**，请你按创作者的**变现加权评分标准**逐维度盲评，并给出编导诊断。

【创作者定位】
{{positioning}}{{learnings}}

【评分维度（必须逐条打分，key 原样回填）】
{{rubricBlock}}

【待诊断内容】
标题：{{title}}
文稿：
{{script}}

【任务】像一个严苛的内容主编：① 对上面每个维度给 1-5 分（1=很差 5=极强），写一句**打分理由**和一句**修改建议**；② 估计发布后表现（完播率/收藏率/评论率/转化意向，0-100，拿不准给 null，别编）；③ 写综合判断、主要问题、优先修改。confidence 给你对这次诊断的整体把握（high/med/low）。

【输出】只输出一个 JSON 对象（不要多余文字、不要代码块包裹），形如：
{"dimensions":[{"key":"原样回填的key","score":1到5的整数,"reason":"打分理由一句","suggestion":"修改建议一句"}],
 "performance":{"完播率":0-100或null,"收藏率":0-100或null,"评论率":0-100或null,"转化意向":0-100或null},
 "verdict":"综合判断一句",
 "mainIssues":["主要问题1","主要问题2"],
 "priorityFixes":["优先修改1","优先修改2"],
 "confidence":"high|med|low"}`,
  requiredFacets: ["positioning", "rubricBlock", "title", "script"],
};
