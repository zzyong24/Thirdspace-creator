import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";

// 机制③④ 素材搜集 runner —— 跑在 **Vercel AI SDK** 上。L2「创作向重写」:AI 逻辑在
// @creatoros/ai-worker 的 runResearchNode,现用 **generateObject 绑四类 outputSchema**
// (钩子/案例/数据点/金句)替代旧的「自由文本解析 web-search 输出」。schema 强约束让任何模型
// (MiniMax/Claude)都产可解析输出 —— 根治旧版对 MiniMax-M3「未产出可解析素材」的卡死。
// 本 runner 只负责:装配 CreativeContext(定位 + 选题)/ 解析 model(按 capability)/ 落候选
// (material_list:items 摊平四类喂既有 confirm → KnowledgeItem;categories 原样回带供工作台分类展示)。
//
// 铁律(产品定位 §9):全程 Vercel AI SDK,不留 Claude Agent SDK。结构化节点纯生成、不挂工具
// (内置 web search 只真 Anthropic 可用,而模型用户可配;不强依赖某厂商服务端工具)。模型用自身
// 知识 + 创作者定位产四类创作素材,来源如实标注、宁缺毋滥不编造。任一失败 → catch 转终态
// (cancelTask),UI 显示失败 + 重试。

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
    // 模板 + generateObject 绑四类 outputSchema)。**schema 强约束**让任何模型(MiniMax/Claude)都产
    // 可解析输出 —— 根治旧版自由文本解析对 MiniMax-M3「未产出可解析素材」的卡死(用户配的 default
    // capability 即 MiniMax,无对等内置 web search 时旧路径必失败)。
    const spec = await deps.resolveModelSpec(ctx, "research.gather");
    const { modelFor, runResearchNode, formatUserMaterialFacet } = await import(
      "@creatoros/ai-worker"
    );
    // [T-146d] 搜索深度结合用户素材(任务链路径):高优先用户素材要点作 facet 注入,让结构化综合
    // 「贴着 PR/第一手资料产素材」而非泛搜。context 已按 material_link.priority 分流装配好硬约束段。
    const { items, categories } = await runResearchNode({
      model: modelFor(spec),
      positioningBrief: context.positioningBrief,
      topicTitle: context.topic.title,
      topicAngle: context.topic.angle || undefined,
      userMaterialFacet: context.userMaterialHardBrief
        ? formatUserMaterialFacet(context.userMaterialHardBrief)
        : undefined,
    });
    if (items.length === 0) {
      throw new Error("research-runner: agent returned no parseable materials");
    }
    // material_list 候选:items 摊平四类喂既有采纳→KnowledgeItem 路径(契约不破);categories
    // 原样回带,供研究工作台分类展示「钩子/案例/数据点/金句」候选。
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "material_list",
      resultData: { items, categories, topic: context.topic.title },
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
