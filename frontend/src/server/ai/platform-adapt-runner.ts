import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonArray } from "./agent-run";

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
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

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

// 把 CreativeContext + 脚本 + 目标平台映射成 platform.adapt 模板的 facets(占位化原 buildAdaptPrompt
// 的上下文块）。targets(目标平台清单)是必需 facet,调用方按 platforms 计算。
function adaptFacets(
  context: CreativeContext,
  scriptText: string,
  platforms: string[],
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑适配）",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
    script: scriptText ? `\n【原始脚本/内容】\n${scriptText}` : "",
    targets: platforms
      .map((p) => `· ${p}：${PLATFORM_LABEL[p] ?? p}`)
      .join("\n"),
  };
}

// Parse the agent's final text into per-platform drafts (parse 逻辑原样保留)。
function parsePlatformDrafts(text: string): PlatformDraft[] {
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
    // Vercel AI SDK 路径:按 "script.rewrite" capability 解析 model + 跑 ai-worker 通用模板节点
    // (外置 platform.adapt 模板),步骤事件落 ai_task_steps。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "script.rewrite");
    const { modelFor, runTemplatedNode, PLATFORM_ADAPT_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { text } = await runTemplatedNode({
      model: modelFor(spec),
      template: PLATFORM_ADAPT_TEMPLATE,
      facets: adaptFacets(context, scriptText, platforms),
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    const drafts = parsePlatformDrafts(text);
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
