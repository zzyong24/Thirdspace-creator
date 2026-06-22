import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
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

function buildTopicPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑出选题）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  return `你是这位创作者的「选题会 agent」。

【创作者定位】
${positioning}${learnings}

【任务】像一个专业自媒体编导那样,基于定位(+过往爆款要素)产 6-8 条**高潜力选题**。可用 WebSearch 看当下热点/对标账号近期爆款。
【每条打分维度】爆款潜力(钩子强度/争议性/实用性)· 定位契合 · 变现潜力(能不能往产品/信任铺路)。
【输出】最后只输出一个 JSON 数组,每条:
{"title","angle"(切入角度,一句),"contentRole"(traffic引流|trust信任|conversion转化 三选一),"source"(trend热点|benchmark对标|demand需求 三选一),"predictedScore"(0-100 综合爆款潜力),"reason"(为什么值得做,一句中文)}。
不要输出多余文字、不要代码块包裹。`;
}

async function generateTopics(context: CreativeContext): Promise<TopicItem[]> {
  const text = await runClaudeAgent(buildTopicPrompt(context), {
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
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      deps,
    );
    const items = await generateTopics(context);
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
