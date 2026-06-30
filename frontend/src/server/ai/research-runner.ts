import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";

// 机制③④ 素材搜集 runner —— 跑在 **Vercel AI SDK** 上(弃旧 Claude Agent SDK + WebSearch)。
// 提示词走外置模板 research.gather(脊柱-1 解耦)。AI 逻辑在 @creatoros/ai-worker 的
// runResearchNode(产 MaterialItem[] + 步骤事件,内部用 anthropic 内置 web search 工具联网搜);
// 本 runner 只负责:装配 CreativeContext(定位 + 选题)/ 解析 model(按 capability)/ 落候选
// (material_list,复用既有 confirm 分支 → 每条 MaterialItem 物化为 KnowledgeItem)。onStep →
// recordStep(窗口步骤日志)。
//
// 铁律(产品定位 §9):全程 Vercel AI SDK,不留 Claude Agent SDK。Web 搜索用 @ai-sdk/anthropic
// 的 provider 内置 web search(服务端执行、随模型计费、不引第三方付费搜索 API)。该内置工具仅
// **anthropic** 协议族可用;research capability 解析出非 anthropic 端点(DeepSeek/MiniMax 兼容)
// 时无对等内置搜索 —— 不静默降级、不擅自引第三方:节点拿不到联网工具大概率产不出素材 → 抛错 →
// 本 runner 的 catch 把任务转终态(cancelTask),UI 显示失败 + 重试。

// Re-exported so callers/tests that depended on research-runner's MaterialItem keep working;
// the canonical definition now lives in @creatoros/ai-worker (the research node owns it).
export type { MaterialItem } from "@creatoros/ai-worker";

export interface GatherDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface GatherTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
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
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 素材搜集节点(外置 research.gather
    // 模板 + anthropic 内置 web search),步骤事件落 ai_task_steps(窗口步骤日志)。
    const spec = await deps.resolveModelSpec(ctx, "research.gather");
    const { modelFor, runResearchNode, anthropicWebSearchTools } = await import(
      "@creatoros/ai-worker"
    );
    // Web 搜索是 Anthropic **官方端点**的服务端内置工具 —— 只对**真 Anthropic**挂(baseUrl=null
    // 官方,或 anthropic.com relay)。MiniMax/DeepSeek 等虽走 anthropic **协议**(apiFormat),
    // 但其 anthropic-兼容端点**不支持** web_search server tool → 挂了会报 "invalid params,
    // function name or parameters is empty (2013)" 致 gather 失败(用户「帮我搜素材」卡死/失败的根因)。
    // 非真 Anthropic → 不挂工具,用模型自身知识产钩子/案例/数据点/金句(项目规则:模型用户可配,
    // 不强依赖某厂商的服务端工具)。
    const isGenuineAnthropic =
      spec.apiFormat === "anthropic" &&
      (spec.baseUrl === null || /(^|\.)anthropic\.com(\/|$)/.test(spec.baseUrl));
    const tools = isGenuineAnthropic ? anthropicWebSearchTools() : undefined;
    const { items } = await runResearchNode({
      model: modelFor(spec),
      positioningBrief: context.positioningBrief,
      topicTitle: context.topic.title,
      topicAngle: context.topic.angle || undefined,
      tools,
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
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
    console.error(`[research-runner] gather failed for task ${task.id}:`, err);
  }
}
