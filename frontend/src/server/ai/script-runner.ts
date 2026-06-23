import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonArray } from "./agent-run";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

// 分镜脚本 runner (script.draft node, 机制③④). Mirrors topic-runner but DRAFTS a storyboard
// (分镜脚本) from the full creative context, then records an `artifact_version` CANDIDATE.
// On 采纳, the AI service's EXISTING artifact_version confirm branch appends a new
// ArtifactVersion (createdByType:"ai") onto the project's 分镜脚本 artifact — we REUSE that
// path (the candidate carries `artifactId` + `resultData.body`/`summary`). No web tools:
// the draft is grounded purely in positioningBrief + learningsBrief + topic.

// One storyboard shot — the agent's JSON array element. Bound to the 爆款公式
// 钩子→痛点→价值→卡点→CTA so each shot reads as a beat of that arc.
export interface ScriptShot {
  口播: string;
  画面: string;
  字幕: string;
  时长: string;
}

export interface ScriptDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface ScriptTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// The parsed storyboard the agent returns: a 前3秒 hook, the shot beats, and a CTA.
interface Storyboard {
  hook: string;
  sections: ScriptShot[];
  cta: string;
}

function buildScriptPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑写脚本）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const topic = context.topic.title
    ? `\n【本期选题】${context.topic.title}${
        context.topic.angle ? `（切入：${context.topic.angle}）` : ""
      }`
    : "";
  return `你是这位创作者的「分镜脚本 agent」。

【创作者定位】
${positioning}${learnings}${topic}

【任务】像一个专业短视频编导那样,基于定位(+过往爆款要素)+选题,写一条**分镜脚本**。
严格按爆款公式编排:钩子(前3秒抓人)→痛点(戳中人群)→价值(干货/反差)→卡点(信息密度/节奏)→CTA(行动召唤)。
【输出】只输出一个 JSON 数组(不要多余文字、不要代码块包裹),数组每一项是一个分镜:
{"口播"(这一镜要说的话),"画面"(画面/运镜/字幕板提示),"字幕"(屏幕字幕,一句),"时长"(如 "0-3s")}。
第一镜必须是前3秒钩子,最后一镜必须落在 CTA。6-10 镜为宜。`;
}

async function draftStoryboard(
  context: CreativeContext,
  complete: Complete,
): Promise<Storyboard> {
  const { text } = await complete(buildScriptPrompt(context), { schema: true });
  const shots = parseJsonArray(text)
    .map((raw): ScriptShot | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const 口播 = typeof o.口播 === "string" ? o.口播.trim() : "";
      const 画面 = typeof o.画面 === "string" ? o.画面.trim() : "";
      const 字幕 = typeof o.字幕 === "string" ? o.字幕.trim() : "";
      const 时长 = typeof o.时长 === "string" ? o.时长.trim() : "";
      if (!口播 && !画面 && !字幕) return null;
      return { 口播, 画面, 字幕, 时长 };
    })
    .filter((s): s is ScriptShot => s !== null);
  const hook = shots[0]?.字幕 || shots[0]?.口播 || "";
  const cta = shots[shots.length - 1]?.口播 || shots[shots.length - 1]?.字幕 || "";
  return { hook, sections: shots, cta };
}

// Serialize the parsed storyboard into a readable Markdown table (the ArtifactVersion's
// contentText) — one row per shot, plus the hook/CTA framing. This is what the editor
// renders after 采纳.
function renderBody(board: Storyboard): string {
  const lines: string[] = ["# 分镜脚本", ""];
  if (board.hook) lines.push(`**前3秒钩子**：${board.hook}`, "");
  lines.push("| # | 口播 | 画面 | 字幕 | 时长 |", "| --- | --- | --- | --- | --- |");
  board.sections.forEach((shot, i) => {
    const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${i + 1} | ${cell(shot.口播)} | ${cell(shot.画面)} | ${cell(shot.字幕)} | ${cell(shot.时长)} |`,
    );
  });
  if (board.cta) lines.push("", `**CTA**：${board.cta}`);
  return lines.join("\n");
}

// Build the editable 分镜 sections the editor renders after 采纳 (Plan: 脚本编辑器做真).
// One section per shot: heading = a short 时长/口播-derived label, body = 口播 + 画面 +
// 字幕. These ride alongside the Markdown `body` as `contentData.sections` so the confirmed
// ArtifactVersion carries editable structure (not only the flat contentText blob).
function renderSections(
  board: Storyboard,
): Array<{ heading: string; body: string }> {
  return board.sections.map((shot, i) => {
    const label = shot.口播 ? shot.口播.slice(0, 16) : `分镜 ${i + 1}`;
    const heading = shot.时长 ? `${i + 1}. ${label}（${shot.时长}）` : `${i + 1}. ${label}`;
    const bodyLines = [
      shot.口播 && `口播：${shot.口播}`,
      shot.画面 && `画面：${shot.画面}`,
      shot.字幕 && `字幕：${shot.字幕}`,
    ].filter((l): l is string => Boolean(l));
    return { heading, body: bodyLines.join("\n") };
  });
}

function renderSummary(board: Storyboard): string {
  const n = board.sections.length;
  const hook = board.hook ? `钩子「${board.hook}」` : "AI 分镜脚本";
  return `${hook} · ${n} 镜（钩子→痛点→价值→卡点→CTA）`;
}

export async function runScriptDraft(
  ctx: RequestContext,
  task: ScriptTask,
  deps: ScriptDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      // The confirm path appends a NEW ArtifactVersion onto this artifact; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("script-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    const board = await draftStoryboard(context, (prompt, opts) =>
      deps.llm(ctx, "script.rewrite", prompt, opts),
    );
    if (board.sections.length === 0) {
      throw new Error("script-runner: agent returned no parseable shots");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(board),
        summary: renderSummary(board),
        // Raw shots — kept so the 采纳 card preview (ScriptDraftIsland.parseShots)
        // still renders 口播/画面/字幕/时长.
        sections: board.sections,
        hook: board.hook,
        cta: board.cta,
        // Structured editable payload forwarded by the AI confirm branch to
        // createVersion as `contentData` (round-trips into the 脚本 editor).
        contentData: {
          sections: renderSections(board),
          hook: board.hook,
          cta: board.cta,
        },
      },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[script-runner] draft failed for task ${task.id}:`, err);
  }
}
