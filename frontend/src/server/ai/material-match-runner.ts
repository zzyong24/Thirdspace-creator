import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { runClaudeAgent, parseJsonArray } from "./agent-run";

// 素材匹配 runner (material.match node, 制作 stage). It scans the creator's asset library
// (assetsBrief) and proposes which REAL assets fit this content + how (role + reason). It
// records a `material_link_list` CANDIDATE; on 采纳, each match becomes a material-link
// (entityType:"asset", stage:"production") — making the 素材库⇄制作 edge a live record.
// Runs the real subscription agent (no web tools — it reasons over the supplied library).

export interface MaterialMatchItem {
  assetId: string;
  role: string; // broll|clip|cover (normalized at confirm)
  reason: string;
}

export interface MaterialMatchDeps extends ContextDeps {
  ai: AiService;
}

export interface MaterialMatchTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

function buildMatchPrompt(context: CreativeContext, topic: string): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位）";
  const library = context.assetsBrief
    ? context.assetsBrief
    : "（素材库为空——没有可用素材）";
  return `你是这位创作者的「素材匹配 agent」。要为下面这条内容,从他**已有的素材库**里挑出最合适的素材。

【创作者定位】
${positioning}

【本条内容主题】
${topic || "（未提供主题——按定位通用匹配）"}

【可用素材库】(每行: id | 名称 (类型))
${library}

【任务】判断素材库里哪些素材适合用在这条内容里,以及怎么用。
【硬约束】assetId **必须**是上面素材库列表里出现过的真实 id,绝对不要编造不存在的 id。素材库为空时返回空数组 []。
【输出】最后只输出一个 JSON 数组,每条:
{"assetId"(必须来自上面列表的真实 id),"role"(broll空镜/clip片段/cover封面 三选一),"reason"(为什么用它、用在哪里,一句中文)}。
不要输出多余文字、不要代码块包裹。`;
}

async function matchMaterials(
  context: CreativeContext,
  topic: string,
): Promise<MaterialMatchItem[]> {
  const text = await runClaudeAgent(buildMatchPrompt(context, topic), {
    allowedTools: [],
  });
  return parseJsonArray(text)
    .map((raw): MaterialMatchItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const assetId = typeof o.assetId === "string" ? o.assetId.trim() : "";
      if (!assetId) return null;
      return {
        assetId,
        role: typeof o.role === "string" ? o.role : "",
        reason: typeof o.reason === "string" ? o.reason : "",
      };
    })
    .filter((m): m is MaterialMatchItem => m !== null);
}

export async function runMaterialMatch(
  ctx: RequestContext,
  task: MaterialMatchTask,
  deps: MaterialMatchDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const outputId =
      typeof task.inputData.outputId === "string" ? task.inputData.outputId : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    const matches = await matchMaterials(context, topic);
    if (matches.length === 0) {
      throw new Error(
        "material-match-runner: agent returned no parseable matches",
      );
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "material_link_list",
      resultData: { matches, outputId },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[material-match-runner] match failed for task ${task.id}:`, err);
  }
}
