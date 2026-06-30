import "server-only";
import { tool, jsonSchema, type Tool, type ToolSet } from "ai";

// 首波工具(本切片 2 个):topic.generate + topic.enrich,注册为 Vercel AI SDK tool
// (SPEC §3.4)。每个工具 = { description, parameters(JSON Schema), execute → 复用现有
// runner 核心 }。**工具结果 = 候选(非实体)**:execute 只产候选数组,绝不写领域实体 ——
// AI 不直接物化,人在对话里把候选渲成 AdoptCandidateCard 逐条采纳走 confirm 门(铁律②)。
//
// 工具白名单按 ChatContext 解析的 skill 暴露(getTools(skillId)):路由据此**过滤**真正挂给
// 模型的工具 —— 选题编导(chatbox.topic)的白名单是 ["topic.generate","topic.enrich"],正好
// 是本切片这两个。白名单外的(calibration.diagnose / review.analyze / positioning.generate)
// 是后续切片的活,此处不实现(它们不在任何已落地 skill 的白名单里,挂不上)。
//
// parameters 用 ai 的 jsonSchema()(而非 Zod):frontend 不直引 zod,且 JSON Schema 本就是
// 工具入参契约的可序列化载体(与 SPEC §4.3 配置口子同源)。execute 复用 ai-worker 的
// runTopicNode(产 TopicItem[] 候选)/ 选题卡补全(产 topic_card 候选),都经懒加载(AI SDK
// 不进 Next server 顶层 bundle,与各 runner 一致)。

// execute 复用现有 runner 所需的最小注入面:解析好的 model + 装配好的上下文 briefs。
// 路由在请求期解析(resolveModelSpec + assembleCreativeContext)后注入,故工具本身无副作用、
// 不碰持久化、不直连模块 repo —— 可单测(注入 fake 的 generate/enrich 实现即可)。
export interface ChatToolDeps {
  /** topic.generate 核心 —— 复用 ai-worker.runTopicNode,产选题候选(TopicItem[])。 */
  generateTopics: (input: {
    basis: "positioning" | "comments" | "knowledge" | "trend";
    extraBrief?: string;
  }) => Promise<
    Array<{
      title: string;
      angle: string;
      contentRole: string;
      predictedScore: number | null;
      reason: string;
    }>
  >;
  /** topic.enrich 核心 —— 把一条选题补全成选题卡候选(复用 enrich prompt + parseCard)。 */
  enrichTopic: (input: { title: string; angle: string }) => Promise<{
    oneLiner: string;
    targetAudience: string;
    audiencePain: string;
    coreConflict: string;
    hook: string;
    contentStructure: string[];
    format: string;
    materialBasis: string;
    riskNote: string;
    proposal: string;
    audiencePainScore: number | null;
    materialScore: number | null;
    productionDifficulty: "low" | "mid" | "high" | null;
  } | null>;
}

// ── 工具结果形状(候选,非实体)──────────────────────────────────────────────────────
// 工具 execute 的返回值会随 tool-result part 流回前端;前端据 `kind` 把候选渲成
// AdoptCandidateCard。形状刻意与现有候选解析对齐(topic.generate 的 items / 选题卡字段),
// 这样对话内卡片与一键岛弹窗读同一份候选结构。

export interface TopicGenerateToolResult {
  kind: "topic.candidates";
  /** 渲成候选卡的 items —— 与 ai_task_results 的 candidate_list.items 同形(可走采纳门)。 */
  items: Array<{
    title: string;
    angle: string;
    contentRole: string;
    predictedScore: number | null;
    reason: string;
  }>;
}

export interface TopicEnrichToolResult {
  kind: "topic.card";
  card: Awaited<ReturnType<ChatToolDeps["enrichTopic"]>>;
}

// ── 工具入参 JSON Schema(可序列化契约)─────────────────────────────────────────────
const TOPIC_GENERATE_PARAMS = jsonSchema<{
  basis?: "positioning" | "comments" | "knowledge" | "trend";
}>({
  type: "object",
  properties: {
    basis: {
      type: "string",
      enum: ["positioning", "comments", "knowledge", "trend"],
      description:
        "出题依据:positioning=按定位 / comments=按真实评论需求 / knowledge=按知识库 / trend=按热点。缺省 positioning。",
    },
  },
  additionalProperties: false,
});

const TOPIC_ENRICH_PARAMS = jsonSchema<{ title: string; angle?: string }>({
  type: "object",
  properties: {
    title: { type: "string", description: "要补全的选题标题(必填)。" },
    angle: { type: "string", description: "切入角度(可选,没有就留空让 AI 补)。" },
  },
  required: ["title"],
  additionalProperties: false,
});

/**
 * 工具实现表(全部首波工具)。每个 execute 复用注入的 runner 核心产**候选**(非实体)。
 * 路由用 buildChatTools(skillTools, deps) 按 skill 白名单过滤后挂给 streamText。
 */
function allChatTools(deps: ChatToolDeps): Record<string, Tool> {
  return {
    "topic.generate": tool({
      description:
        "围绕创作者定位 + 真实信号生成一批选题候选(每条含 title/angle/理由)。结果是候选,需人逐条采纳后才入候选池——不直接写库。",
      inputSchema: TOPIC_GENERATE_PARAMS,
      execute: async ({ basis }): Promise<TopicGenerateToolResult> => {
        const items = await deps.generateTopics({
          basis: basis ?? "positioning",
        });
        return { kind: "topic.candidates", items };
      },
    }),
    "topic.enrich": tool({
      description:
        "把一条已有选题补全成完整选题卡(观众/痛点/钩子/结构/风险/立项建议)。结果是候选卡,需人采纳后才落到该选题——不直接写库。",
      inputSchema: TOPIC_ENRICH_PARAMS,
      execute: async ({ title, angle }): Promise<TopicEnrichToolResult> => {
        const card = await deps.enrichTopic({ title, angle: angle ?? "" });
        return { kind: "topic.card", card };
      },
    }),
  };
}

/**
 * 按 skill 的工具白名单(getTools(skillId))过滤出真正挂给模型的工具集(SPEC §3.2 第 2 层)。
 * 白名单里有但本切片未实现的工具(后续波)直接跳过 —— 不报错、不挂空壳,留给后续切片补齐。
 * 返回的 ToolSet 直接喂 streamText({ tools })。
 */
export function buildChatTools(
  skillToolWhitelist: readonly string[],
  deps: ChatToolDeps,
): ToolSet {
  const impls = allChatTools(deps);
  const out: Record<string, Tool> = {};
  for (const name of skillToolWhitelist) {
    const impl = impls[name];
    if (impl) out[name] = impl;
  }
  return out as ToolSet;
}
