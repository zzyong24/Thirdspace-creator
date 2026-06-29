import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { runClaudeAgent, parseJsonArray } from "./agent-run";

// 选题会 runner (topic.generate node, 机制③④). Like research-runner but it GENERATES topic
// candidates from the creator's positioning (+ learnings once 机制② is extended). Records
// a `candidate_list` CANDIDATE; on 采纳, each item becomes a real Candidate (选题池) via
// the candidate module's C-3 createFromAIResult seam. Runs the real subscription agent.

export interface TopicItem {
  title: string;
  angle: string;
  contentRole: string; // traffic|trust|conversion (normalized at confirm)
  source: string; // trend|benchmark|demand
  predictedScore: number | null;
  reason: string;
}

export interface TopicDeps extends ContextDeps {
  ai: AiService;
}

export interface TopicTask {
  id: string;
  inputData: Record<string, unknown>;
}

// 出题依据 (选题中心大改) — the four bases a topic.generate run can stand on. The
// `basis` drives WHICH context slice the prompt foregrounds + the source bias:
//   - positioning (缺省): 定位出题 — 钩子/争议/实用, balanced sources.
//   - comments: 基于评论信号出题 — start from REAL audience demand (signalsBrief),
//     bias source → demand.
//   - knowledge: 基于知识库出题 — start from accumulated material (knowledgeBrief),
//     so every topic has 素材依据.
//   - trend: 基于热点出题 — WebSearch 当下热点/对标近期爆款, bias source → trend.
export type TopicBasis = "positioning" | "comments" | "knowledge" | "trend";

const TOPIC_BASES: ReadonlySet<string> = new Set([
  "positioning",
  "comments",
  "knowledge",
  "trend",
]);

export function normalizeBasis(raw: unknown): TopicBasis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as TopicBasis)
    : "positioning"; // 缺省 positioning
}

function basisInstruction(basis: TopicBasis, context: CreativeContext): string {
  switch (basis) {
    case "comments": {
      const signals = context.signalsBrief
        ? context.signalsBrief
        : "（暂无受众信号——退化为按定位出题,但每条尽量贴近真实观众提问/痛点)";
      return `【出题依据:基于评论/咨询信号】优先从下面这位创作者收集到的**真实受众信号**(评论/私信/咨询/复盘)里提炼选题——每条都要直指一个被反复问到或抱怨的真实需求,source 尽量取 demand。
【受众信号】
${signals}`;
    }
    case "knowledge": {
      const knowledge = context.knowledgeBrief
        ? context.knowledgeBrief
        : "（知识库暂空——退化为按定位出题,但每条仍要说明可依托的素材方向)";
      return `【出题依据:基于知识库资料】优先从下面这位创作者已积累的**知识库资料**里出题——每条选题都要有现成素材可依托(让 angle 体现「这条我已经有料」)。
【知识库资料】
${knowledge}`;
    }
    case "trend":
      return `【出题依据:基于行业热点】用 WebSearch 查当下与该定位相关的**热点/对标账号近期爆款**,把热点蹭到自己的定位上,source 尽量取 trend(对标取 benchmark)。`;
    case "positioning":
    default:
      return `【出题依据:基于定位】围绕该创作者的定位(领域/人群/差异化)出选题,兼顾钩子强度/争议性/实用性;可用 WebSearch 做佐证。`;
  }
}

function buildTopicPrompt(context: CreativeContext, basis: TopicBasis): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑出选题）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  return `你是这位创作者的「选题会 agent」。

【创作者定位】
${positioning}${learnings}

${basisInstruction(basis, context)}

【任务】像一个专业自媒体编导那样,按上面的【出题依据】产 6-8 条**高潜力选题**。
【每条打分维度】爆款潜力(钩子强度/争议性/实用性)· 定位契合 · 变现潜力(能不能往产品/信任铺路)。
【输出】最后只输出一个 JSON 数组,每条:
{"title","angle"(切入角度,一句),"contentRole"(traffic引流|trust信任|conversion转化 三选一),"source"(trend热点|benchmark对标|demand需求 三选一),"predictedScore"(0-100 综合爆款潜力),"reason"(为什么值得做,一句中文)}。
不要输出多余文字、不要代码块包裹。`;
}

async function generateTopics(
  context: CreativeContext,
  basis: TopicBasis,
): Promise<TopicItem[]> {
  const text = await runClaudeAgent(buildTopicPrompt(context, basis), {
    allowedTools: ["WebSearch", "WebFetch"],
  });
  return parseJsonArray(text)
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

export async function runTopicGenerate(
  ctx: RequestContext,
  task: TopicTask,
  deps: TopicDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const basis = normalizeBasis(task.inputData.basis);
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      deps,
    );
    const items = await generateTopics(context, basis);
    if (items.length === 0) {
      throw new Error("topic-runner: agent returned no parseable topics");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "candidate_list",
      resultData: { items },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[topic-runner] generate failed for task ${task.id}:`, err);
  }
}
