import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ContractOutput } from "@creatoros/ai-worker";
import { preparePlanningContractContext, projectPlanningContractCandidate, type PlanningContractContextDeps } from "./planning-contract-context";

// 内容合同 runner (planning.contract node, 策划 stage). It reads the creative context
// (定位 + 选题 + 过往复盘) and DRAFTS a 内容合同 — the creator's contract with the
// audience across four fixed angles: 受众定位 / 价值主张 / 核心节奏 / 行动召唤(CTA). It
// records an `artifact_version` CANDIDATE; on 采纳, the AI service's EXISTING
// artifact_version confirm branch appends a new ArtifactVersion (createdByType:"ai") onto
// the project's `content_contract` artifact — we REUSE that path (the candidate carries
// `artifactId` + `resultData.body`/`summary`/`contentData`). No web tools: the draft is
// grounded in positioningBrief + learningsBrief + topic.
//
// The contentData shape (writer ↔ reader contract):
//   `{ cards: [{ id, title, body }] }`
// where id ∈ "contract-audience"|"contract-value"|"contract-pacing"|"contract-cta" —
// exactly the ContractCard ids the 策划 workspace reads back (planning-workspace-data.ts).

export interface PlanningContractDeps extends PlanningContractContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PlanningContractTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

export async function runPlanningContract(
  ctx: RequestContext,
  task: PlanningContractTask,
  deps: PlanningContractDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const facets = await preparePlanningContractContext(ctx, task, deps);
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 planning.contract 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),让 MiniMax
    // 也稳定吐可解析合同(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败→cancelled)。
    const spec = await deps.resolveModelSpec(ctx, "planning.contract");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 planning.contract 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<ContractOutput>({
      model: modelFor(spec),
      template: getTemplate("planning.contract"),
      facets,
    });
    const candidate = projectPlanningContractCandidate(task.inputData, object);
    const cardCount = (candidate.resultData.cards as unknown[]).length;
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已生成内容合同（${cardCount} 条承诺）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, candidate);
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    console.error(
      `[planning-contract-runner] draft failed for task ${task.id}:`,
      err,
    );
  }
}
