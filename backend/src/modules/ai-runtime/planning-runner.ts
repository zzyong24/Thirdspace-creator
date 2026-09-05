import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ThesisTreeOutput } from "@creatoros/ai-worker";
import type { ContextDeps } from "./creative-context";
import {preparePlanningThesisContext} from "./planning-thesis-context";

// 论点树 runner (planning.thesis node, 机制③④). Mirrors script-runner but DRAFTS a
// thesis tree (论点树) from the creative context, then records an `artifact_version`
// CANDIDATE. On 采纳, the AI service's EXISTING artifact_version confirm branch appends
// a new ArtifactVersion (createdByType:"ai") onto the project's `thesis_tree` artifact —
// we REUSE that path (the candidate carries `artifactId` + `resultData.body`/`summary`/
// `contentData`). No web tools: the draft is grounded purely in positioningBrief +
// topic + learningsBrief.
//
// The contentData shape (writer ↔ reader contract): `{ nodes: [{ column, title, summary }] }`
// where column ∈ "core"|"support"|"evidence"|"counter" — exactly the ThesisNodeView shape
// the planning workspace reads back (planning-workspace-data.ts).

export interface PlanningDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PlanningTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

export async function runPlanningThesis(
  ctx: RequestContext,
  task: PlanningTask,
  deps: PlanningDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const prepared = await preparePlanningThesisContext(ctx, task, deps);
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 planning.thesis 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),
    // 让用户默认的 MiniMax 也稳定吐可解析论点树(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败)。
    const spec = await deps.resolveModelSpec(ctx, "planning.thesis");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 planning.thesis 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate, projectPlanningThesis } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<ThesisTreeOutput>({
      model: modelFor(spec),
      template: getTemplate("planning.thesis"),
      facets: prepared.facets,
    });
    const resultData = projectPlanningThesis(object, prepared.grounding);
    const nodes = resultData.nodes;
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已生成论点树（${nodes.length} 节点）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: null,
      resultData,
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[planning-runner] draft failed for task ${task.id}:`, err);
  }
}
