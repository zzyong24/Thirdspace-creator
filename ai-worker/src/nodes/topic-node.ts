import { StructuredOutputError } from "./structured-output-error";
import type { LanguageModel } from "ai";
import type { AgentStepEvent } from "../runtime/agent-runtime";
import { runStructuredNode } from "./structured-node";
import {
  TOPIC_GENERATE_TEMPLATE,
  type TopicArrayOutput,
} from "../prompt/templates/topic-generate";

// 选题节点(Phase 3 第一个跑在新 Agent Runtime 上的真节点)。一个「节点」= 一个 skill:
// 系统提示(角色/方法论)+ 用哪个 capability 的模型(由调用方解析后传 model)+ 输出怎么解析。
// 最终产物是 TopicItem[],由上层 recordCandidate 成 candidate_list。
//
// T-025 跨模型健壮性:改走 runStructuredNode(generateObject 绑 topic.generate 的 outputSchema,
// 落空→文本兜底抽 JSON 再同 schema 校验),复用 script.draft / research.gather 同一条防发散路。
// 旧路径(runAgentNode 拿自由文本 + parseTopics 宽容解析)在用户默认的 MiniMax-M3 下常吐不出可解析
// 数组 → 抛「未产出可解析选题」→ 任务 cancelled(选题会出不来的根因)。parseTopics 仍作纯工具导出。

export interface TopicItem {
  title: string;
  angle: string;
  contentRole: string; // traffic | trust | conversion(confirm 时归一化)
  source: string; // trend | benchmark | demand
  predictedScore: number | null;
  reason: string;
  /** [T-066] 该选题依据的原始评论(逐字引用);非评论依据为空数组。 */
  sourceComments: string[];
}

export type TopicBasis = "positioning" | "comments" | "knowledge" | "trend";

export interface RunTopicNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context 产)。 */
  positioningBrief: string;
  /** 按出题依据装配的额外上下文(评论信号 / 知识库…),让各 basis 真的不同。 */
  basisBrief?: string;
  // [T-062b gate-F3] 知识库参考 + 已验证经验约束(全 basis 注入;basis=knowledge 时
  // knowledgeBrief 已进 basisBrief,调用方置空防重复)。
  knowledgeBrief?: string;
  learningsBrief?: string;
  /** [T-238] 依据质量画像 brief(选填)—— 装配层按各依据源真实数据算好渲成「依据质量说明」段
   *  (signal-quality.renderSignalQualityBrief);模板据它动态定权。空/未传 → 该 facet 整段省略。 */
  signalQualityBrief?: string;
  /** 出题依据。 */
  basis: TopicBasis;
  /** 步骤回调 —— 喂窗口步骤日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
}

const BASIS_HINT: Record<TopicBasis, string> = {
  positioning: "围绕定位(领域/人群/差异化)出题,兼顾钩子/争议/实用。",
  comments: "优先从真实受众评论/咨询里提炼,每条直指被反复问到的需求,source 取 demand。",
  knowledge: "优先从已积累的知识库出题,每条要有现成素材可依托。",
  trend: "蹭当下热点/对标近期爆款到自己定位上,source 取 trend / benchmark。",
};

// 装配 topic.generate 模板的 facets(定位兜底 + 依据提示 + 依据上下文)。runStructuredNode 内部
// bindPrompt(模板, facets)。换写作方法论 = 换 TOPIC_GENERATE_TEMPLATE,不动本 runner。
export function topicFacets(
  positioningBrief: string,
  basis: TopicBasis,
  basisBrief?: string,
  knowledgeBrief?: string,
  learningsBrief?: string,
  signalQualityBrief?: string,
): Record<string, string | undefined> {
  return {
    positioning:
      positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑出题）",
    basisHint: BASIS_HINT[basis],
    // Sfix:把出题依据对应的真实上下文(评论信号 / 知识库)注进去,让各 basis 真的不同。
    basisContext: basisBrief ? `\n\n【依据材料】\n${basisBrief}` : "",
    // [T-062b gate-F3] KNOW-X 修真:知识库参考 + 已验证经验约束,空库诚实标注不编。
    knowledgeRef: `\n\n--- 知识库参考 ---\n${knowledgeBrief || "（暂无沉淀）"}`,
    learningsConstraint: `\n\n--- 已验证经验约束 ---\n${learningsBrief || "（暂无沉淀）"}`,
    // [T-238] 依据质量画像(装配层已渲好含段头「【依据质量画像…】」;空 → 整段省略,不注空壳)。
    signalQuality: signalQualityBrief ? `\n\n${signalQualityBrief}` : "",
  };
}

// [T-066] sourceComments 容错归一:模型可能吐非数组/混入非字符串项/把同一条评论重复贴多次
// (MiniMax 真机实测),只留非空字符串(逐字评论)并按原文去重。
function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return [...new Set(out)];
}

/** 从 agent 最终文本里宽容地抽出 JSON 数组(容忍 ``` 包裹 / 前后散文)。 */
export function parseTopics(text: string): TopicItem[] {
  if (!text) return [];
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw): TopicItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      return {
        title,
        angle: typeof o.angle === "string" ? o.angle : "",
        contentRole: typeof o.contentRole === "string" ? o.contentRole : "",
        source: typeof o.source === "string" ? o.source : "trend",
        predictedScore:
          typeof o.predictedScore === "number" ? o.predictedScore : null,
        reason: typeof o.reason === "string" ? o.reason : "",
        sourceComments: asStrings(o.sourceComments),
      };
    })
    .filter((t): t is TopicItem => t !== null);
}

/** 把 schema 校验后的对象归一成 TopicItem[](T-025:结构化后拿的是已解析对象,滤空/兜底原样保留)。 */
export function normalizeTopics(items: TopicArrayOutput["topics"]): TopicItem[] {
  return (items ?? [])
    .map((o): TopicItem | null => {
      const title = (o.title ?? "").trim();
      if (!title) return null;
      return {
        title,
        angle: o.angle ?? "",
        contentRole: o.contentRole ?? "",
        source: o.source ?? "trend",
        predictedScore:
          typeof o.predictedScore === "number" ? o.predictedScore : null,
        reason: o.reason ?? "",
        // [T-066] 透传原始评论引用(schema 已 default [];再过 asStrings 滤掉空串项)。
        sourceComments: asStrings(o.sourceComments),
      };
    })
    .filter((t): t is TopicItem => t !== null);
}

export interface RunTopicNodeResult {
  topics: TopicItem[];
  steps: AgentStepEvent[];
}

/**
 * 跑一次选题节点 —— runStructuredNode(generateObject 绑 topic.generate outputSchema,落空则文本兜底)
 * 产**被 schema 卡死**的 { topics } + 一条步骤事件。结构化路径单发,合成一条完成步喂窗口日志(诚实:就一步)。
 */
export async function runTopicNode(
  input: RunTopicNodeInput,
): Promise<RunTopicNodeResult> {
  let object: TopicArrayOutput;
  try {
    ({ object } = await runStructuredNode<TopicArrayOutput>({
      model: input.model,
      template: TOPIC_GENERATE_TEMPLATE,
      facets: topicFacets(
        input.positioningBrief,
        input.basis,
        input.basisBrief,
        input.knowledgeBrief,
        input.learningsBrief,
        input.signalQualityBrief,
      ),
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("结构化节点:")) {
      throw new Error("topic-node: agent 未产出可解析选题", { cause: error });
    }
    throw error;
  }
  const topics = normalizeTopics(object.topics);
  if (topics.length === 0) {
    throw new StructuredOutputError("topic-node: agent 未产出可解析选题");
  }
  const step: AgentStepEvent = {
    stepNo: 1,
    text: `已生成 ${topics.length} 条选题`,
    toolCalls: [],
    finishReason: "stop",
  };
  await input.onStep?.(step);
  return { topics, steps: [step] };
}
