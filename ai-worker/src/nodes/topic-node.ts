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
}

export type TopicBasis = "positioning" | "comments" | "knowledge" | "trend";

export interface RunTopicNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context 产)。 */
  positioningBrief: string;
  /** 按出题依据装配的额外上下文(评论信号 / 知识库…),让各 basis 真的不同。 */
  basisBrief?: string;
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
function topicFacets(
  positioningBrief: string,
  basis: TopicBasis,
  basisBrief?: string,
): Record<string, string | undefined> {
  return {
    positioning:
      positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑出题）",
    basisHint: BASIS_HINT[basis],
    // Sfix:把出题依据对应的真实上下文(评论信号 / 知识库)注进去,让各 basis 真的不同。
    basisContext: basisBrief ? `\n\n【依据材料】\n${basisBrief}` : "",
  };
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
      };
    })
    .filter((t): t is TopicItem => t !== null);
}

/** 把 schema 校验后的对象归一成 TopicItem[](T-025:结构化后拿的是已解析对象,滤空/兜底原样保留)。 */
function normalizeTopics(items: TopicArrayOutput["topics"]): TopicItem[] {
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
  const { object } = await runStructuredNode<TopicArrayOutput>({
    model: input.model,
    template: TOPIC_GENERATE_TEMPLATE,
    facets: topicFacets(input.positioningBrief, input.basis, input.basisBrief),
  });
  const topics = normalizeTopics(object.topics);
  if (topics.length === 0) {
    throw new Error("topic-node: agent 未产出可解析选题");
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
