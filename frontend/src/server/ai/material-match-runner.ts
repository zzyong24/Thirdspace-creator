import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, MaterialMatchOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// 素材匹配 runner (material.match node, 制作 stage). It scans the creator's asset library
// (assetsBrief) and proposes which REAL assets fit this content + how (role + reason). It
// records a `material_link_list` CANDIDATE; on 采纳, each match becomes a material-link
// (entityType:"asset", stage:"production") — making the 素材库⇄制作 edge a live record.
//
// 跑在 **Vercel AI SDK** 上(弃旧 LlmCompleter):resolveModelSpec 按 capability 解析用户配的
// model,提示词走外置模板 material.match(脊柱-1 模板化解耦)。T-025b:改 runStructuredNode
// (generateObject 绑 material.match 的 outputSchema,落空→文本兜底抽 JSON 再同 schema 校验),
// 让用户默认的 MiniMax-M3 也稳定吐可解析匹配(旧路径:单发 messages.create + parseJsonArray,
// MiniMax 下常吐不出规整 JSON → parseJsonArray 返回 [] → 抛「no parseable matches」→ 任务
// cancelled,和刚修的 8 个节点同类 bug)。normalizeMatches 保留原「assetId 必须真实、缺则滤掉」
// 的容错语义(只换"拿数组"的来源)。

export interface MaterialMatchItem {
  assetId: string;
  role: string; // broll|clip|cover (normalized at confirm)
  reason: string;
}

export interface MaterialMatchDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface MaterialMatchTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// 把 CreativeContext + 主题映射成 material.match 模板的 facets(占位化原 buildMatchPrompt 的上下文块)。
// library(可用素材库)是必需 facet,沿用原 prompt 的兜底文案(素材库为空时的提示)。
function matchFacets(
  context: CreativeContext,
  topic: string,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位）",
    topic: topic || "（未提供主题——按定位通用匹配）",
    library: context.assetsBrief
      ? context.assetsBrief
      : "（素材库为空——没有可用素材）",
  };
}

// Normalize the schema-validated matches array into asset matches (T-025:结构化后拿的是已解析
// 对象,归一逻辑原样保留 —— trim、滤掉缺 assetId 的项,保持"assetId 必须真实"的容错语义)。
function normalizeMatches(
  matches: MaterialMatchOutput["matches"],
): MaterialMatchItem[] {
  return (matches ?? [])
    .map((o): MaterialMatchItem | null => {
      const assetId = (o.assetId ?? "").trim();
      if (!assetId) return null;
      return {
        assetId,
        role: o.role ?? "",
        reason: o.reason ?? "",
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
    // Vercel AI SDK 路径:按 "material.match" capability 解析 model + 跑 ai-worker 结构化节点(外置
    // material.match 模板 + outputSchema)。T-026:runStructuredNode 绑 generateObject,落空→文本
    // 兜底,让用户默认的 MiniMax 也稳定吐可解析匹配。顶层是对象,取 object.matches 再 normalize。
    // (原为 "copy.generate" —— 迁移前 LlmCompleter 的 copy-paste 遗留;改回本节点自己的 capability,
    //  未配则回退 default(行为中性),且让用户可单独为素材匹配配模型。)
    const spec = await deps.resolveModelSpec(ctx, "material.match");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 material.match 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<MaterialMatchOutput>({
      model: modelFor(spec),
      template: getTemplate("material.match"),
      facets: matchFacets(context, topic),
    });
    const matches = normalizeMatches(object.matches);
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
