import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { runClaudeAgent, parseJsonArray } from "./agent-run";

// 机制③④ 素材搜集 runner — the first real AI node wired into the app. It runs in the
// composition layer (NOT the AI module/service, which must stay deterministic per
// design-spec §8): assemble CreativeContext → run a real Claude agent with WebSearch →
// record the gathered materials as a `material_list` CANDIDATE via the AI service's
// recordCandidate write seam (queued→running→awaiting_confirmation). The user then 采纳s
// via confirmTask, which materializes each item into a KnowledgeItem.
//
// The agent runs against the user's Claude Code SUBSCRIPTION (CLAUDE_CODE_OAUTH_TOKEN in
// the server env) — no API key, no per-token billing. The SDK is imported through a
// variable specifier so the bundler treats it as a runtime-only dependency.

export interface MaterialItem {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
}

export interface GatherDeps extends ContextDeps {
  ai: AiService;
}

export interface GatherTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
  modelKey: string;
}

// The 素材搜集 Skill — the agent's procedure + relevance judgement, positioning-aware.
// Inlined this wave (a versioned .claude/skills/素材搜集/SKILL.md is the follow-on once
// settingSources wiring lands). Mirrors the proven smoke demo.
function buildGatherPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按选题本身的价值判断相关性即可）";
  const angle = context.topic.angle ? `\n切入角度：${context.topic.angle}` : "";
  return `你是这位创作者的「素材搜集 agent」。

【创作者定位】
${positioning}

【选题】${context.topic.title}${angle}

【任务】为这个选题主动联网搜集"相关、可信、对这个定位有用"的素材(文章/数据/案例/对标账号)。
【相关性判据】① 跟选题强相关 ② 跟创作者定位对齐(能支撑信任/转化,不是纯流量噱头) ③ 来源可信。
【做法】用 WebSearch 多角度搜(趋势/数据/反面/案例/对标),挑 5-8 条最有价值的;拿不准就 WebFetch 看一眼确认。
【输出】最后只输出一个 JSON 数组,每条 {"title","url","source","why_relevant"}(why_relevant 用一句中文说明为什么对这个定位+选题有用)。不要输出任何多余文字、不要用代码块包裹。`;
}

// Run the agent and parse its material list. Pure w.r.t. our store — only the SDK call.
async function gatherMaterials(
  context: CreativeContext,
): Promise<MaterialItem[]> {
  const text = await runClaudeAgent(buildGatherPrompt(context), {
    allowedTools: ["WebSearch", "WebFetch"],
  });
  return parseMaterials(text);
}

// Parse the agent's final text into material items (tolerant JSON-array extraction).
export function parseMaterials(text: string): MaterialItem[] {
  return parseJsonArray(text)
    .map((raw): MaterialItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      return {
        title,
        url: typeof o.url === "string" ? o.url : "",
        source: typeof o.source === "string" ? o.source : "",
        why_relevant:
          typeof o.why_relevant === "string" ? o.why_relevant : "",
      };
    })
    .filter((m): m is MaterialItem => m !== null);
}

// Orchestrate one gather task end to end. Owns its own lifecycle: on any failure it
// cancels the task (running→cancelled, a terminal the UI renders as 失败) so a stuck task
// never lingers in `running` forever.
export async function runGatherMaterial(
  ctx: RequestContext,
  task: GatherTask,
  deps: GatherDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while the agent works
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const angle =
      typeof task.inputData.angle === "string" ? task.inputData.angle : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic, angle },
      deps,
    );
    const items = await gatherMaterials(context);
    if (items.length === 0) {
      throw new Error("research-runner: agent returned no parseable materials");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "material_list",
      resultData: { items, topic: context.topic.title },
    });
  } catch (err) {
    // Best-effort cancel; swallow so a background failure never crashes the server.
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[research-runner] gather failed for task ${task.id}:`, err);
  }
}
