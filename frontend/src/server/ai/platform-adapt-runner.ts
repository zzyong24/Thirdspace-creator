import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
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

// 一稿多平台 runner (publish.platform_adapt node, 机制③④). Mirrors topic-runner but ADAPTS
// one finished script into a per-platform draft (抖音竖屏短 / B站横屏中视频 / 小红书图文 /
// 公众号长文), each with its own title/body/tags/coverIdea. Records a `publication_drafts`
// CANDIDATE; on 采纳, each draft becomes a real Publication (+ revision) through the AI
// service's publishing port. No web tools — the adaptation is grounded purely in the
// positioning brief + topic + scriptText.

export interface PlatformDraft {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverIdea: string;
}

export interface PlatformAdaptDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface PlatformAdaptTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// Default fan-out when the caller names no platforms — the four 编导 surfaces. "wechat"
// here is the agent-facing label; the materialization port maps it to the publishing
// platform enum (wechatVideo).
const DEFAULT_PLATFORMS = ["douyin", "bilibili", "xiaohongshu", "wechat"];

const PLATFORM_LABEL: Record<string, string> = {
  douyin: "抖音（竖屏短视频，强钩子、快节奏、口语化）",
  bilibili: "B站（横屏中视频，信息密度高、可展开、标题党适度）",
  xiaohongshu: "小红书（图文/笔记体，emoji、分点、种草感、话题标签）",
  wechat: "公众号（长文，结构完整、有标题有小标题、可深读）",
};

function buildAdaptPrompt(
  context: CreativeContext,
  scriptText: string,
  platforms: string[],
): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑适配）";
  const topic = context.topic.title
    ? `\n【本期选题】${context.topic.title}${
        context.topic.angle ? `（切入：${context.topic.angle}）` : ""
      }`
    : "";
  const script = scriptText
    ? `\n【原始脚本/内容】\n${scriptText}`
    : "";
  const targets = platforms
    .map((p) => `· ${p}：${PLATFORM_LABEL[p] ?? p}`)
    .join("\n");
  return `你是这位创作者的「一稿多平台 agent」。

【创作者定位】
${positioning}${topic}${script}

【任务】像一个专业自媒体编导那样,把同一份内容**一稿改多平台**。针对下面每个目标平台,产出符合该平台调性的标题/正文/标签/封面创意:
${targets}

【输出】只输出一个 JSON 数组(不要多余文字、不要代码块包裹、不要前言),每个目标平台一项:
{"platform"(平台标识,用上面给的英文标识),"title"(该平台标题),"body"(该平台正文/文案),"tags"(标签数组,3-6个),"coverIdea"(封面创意,一句)}。
【严格 JSON 要求】① 正文/标题里如需引号,一律用中文「」或『』,**禁止用英文半角双引号 "**(否则会破坏 JSON);② 换行用 \\n,不要真实换行;③ 每个平台 body 控制在 200 字以内,精炼即可。`;
}

async function adaptDrafts(
  context: CreativeContext,
  scriptText: string,
  platforms: string[],
  complete: Complete,
): Promise<PlatformDraft[]> {
  const { text } = await complete(
    buildAdaptPrompt(context, scriptText, platforms),
    { schema: true },
  );
  return parseJsonArray(text)
    .map((raw): PlatformDraft | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const platform = typeof o.platform === "string" ? o.platform.trim() : "";
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!platform || !title) return null;
      const tags = Array.isArray(o.tags)
        ? o.tags
            .map((t) => (typeof t === "string" ? t.trim() : ""))
            .filter((t): t is string => t.length > 0)
        : [];
      return {
        platform,
        title,
        body: typeof o.body === "string" ? o.body : "",
        tags,
        coverIdea: typeof o.coverIdea === "string" ? o.coverIdea : "",
      };
    })
    .filter((d): d is PlatformDraft => d !== null);
}

export async function runPlatformAdapt(
  ctx: RequestContext,
  task: PlatformAdaptTask,
  deps: PlatformAdaptDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const outputId =
      typeof task.inputData.outputId === "string" ? task.inputData.outputId : "";
    if (!outputId) {
      // The confirm path creates Publications under this output; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("platform-adapt-runner: inputData.outputId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const scriptText =
      typeof task.inputData.scriptText === "string"
        ? task.inputData.scriptText
        : "";
    const platforms =
      Array.isArray(task.inputData.platforms) &&
      task.inputData.platforms.length > 0
        ? task.inputData.platforms.filter(
            (p): p is string => typeof p === "string",
          )
        : DEFAULT_PLATFORMS;
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    const drafts = await adaptDrafts(
      context,
      scriptText,
      platforms,
      (prompt, opts) => deps.llm(ctx, "script.rewrite", prompt, opts),
    );
    if (drafts.length === 0) {
      throw new Error(
        "platform-adapt-runner: agent returned no parseable drafts",
      );
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "publication_drafts",
      resultData: { drafts, outputId },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    console.error(
      `[platform-adapt-runner] adapt failed for task ${task.id}:`,
      err,
    );
  }
}
