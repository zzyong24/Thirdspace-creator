import type { LanguageModel } from "ai";
import { runAgentNode, type AgentStepEvent } from "../runtime/agent-runtime.js";

// 选题节点(Phase 3 第一个跑在新 Agent Runtime 上的真节点)。一个「节点」= 一个 skill:
// 系统提示(角色/方法论)+ 用哪个 capability 的模型(由调用方解析后传 model)+ 输出怎么解析。
// 这版先纯生成(无工具);搜热点/读知识等工具随工具注册表绑到 backend reader 后加进来 ——
// 加工具不动本文件的结构。最终产物是 TopicItem[],由上层 recordCandidate 成 candidate_list。

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

function buildPrompt(
  positioningBrief: string,
  basis: TopicBasis,
): { system: string; prompt: string } {
  const positioning = positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑出题）";
  const system =
    "你是这位创作者的「选题会 agent」,像专业自媒体编导那样按依据产高潜力选题。";
  const prompt = `【创作者定位】\n${positioning}\n\n【出题依据】${BASIS_HINT[basis]}\n\n【任务】产 6-8 条高潜力选题。每条按 钩子强度/定位契合/变现潜力 衡量。\n【输出】只输出一个 JSON 数组,每条:{"title","angle"(切入一句),"contentRole"(traffic|trust|conversion),"source"(trend|benchmark|demand),"predictedScore"(0-100),"reason"(一句中文)}。不要多余文字、不要代码块包裹。`;
  return { system, prompt };
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

export interface RunTopicNodeResult {
  topics: TopicItem[];
  steps: AgentStepEvent[];
}

/** 跑一次选题节点 —— 在新 Agent Runtime 上,产出可解析的选题 + 步骤事件。 */
export async function runTopicNode(
  input: RunTopicNodeInput,
): Promise<RunTopicNodeResult> {
  const { system, prompt } = buildPrompt(input.positioningBrief, input.basis);
  const res = await runAgentNode({
    model: input.model,
    system,
    prompt,
    maxSteps: 4,
    onStep: input.onStep,
  });
  const topics = parseTopics(res.text);
  if (topics.length === 0) {
    throw new Error("topic-node: agent 未产出可解析选题");
  }
  return { topics, steps: res.steps };
}
