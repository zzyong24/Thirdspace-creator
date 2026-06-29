import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { TopicTaskPorts } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";

// 选题节点 live 接线(Phase 3 A 路径)—— 把 topic.generate 任务跑在新 Agent Runtime 上,
// 而不是旧的 runClaudeAgent 订阅路径。这层只做「装配 + 注入」:解析按 capability 配的 model
// (用户在设置页配的 DeepSeek/GPT/Claude/MiniMax)、装配 positioningBrief、把 ai service 包成
// runTopicTask 的 ports。runtime / 节点 / 编排在 @creatoros/ai-worker(懒加载,避免把 AI SDK
// 顶层 bundle 进 Next server)。
//
// 没配 model(resolveModelSpec 抛 LlmCredentialError)→ cancelTask:任务进终态、前端显示
// 失败+重试,绝不假成功。配了 key 自动启用步骤日志。

const TOPIC_BASES = new Set(["positioning", "comments", "knowledge", "trend"]);
type Basis = "positioning" | "comments" | "knowledge" | "trend";
function normalizeBasis(raw: unknown): Basis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as Basis)
    : "positioning";
}

export interface ModelSpec {
  apiFormat: "anthropic" | "openai_chat";
  baseUrl: string | null;
  model: string;
  token: string;
}

export interface TopicTaskAdapterDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析出可用 model 规格;无可用 key 时抛错(LlmCredentialError)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface TopicTask {
  id: string;
  inputData: Record<string, unknown>;
}

/** topic.generate 触发器调用入口:跑在新 Agent Runtime 上,落步骤 + 候选。 */
export async function runTopicGenerateV2(
  ctx: RequestContext,
  task: TopicTask,
  deps: TopicTaskAdapterDeps,
): Promise<void> {
  const basis = normalizeBasis(task.inputData.basis);
  try {
    // 1) 解析 model(没配 key 在这里抛错 → 下面 catch → cancelTask)。
    const spec = await deps.resolveModelSpec(ctx, "topic.generate");
    // 2) 懒加载 runtime(AI SDK 不进 Next server 顶层 bundle)。
    const { modelFor, runTopicTask } = await import("@creatoros/ai-worker");
    // 3) 装配定位简报。
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      deps,
    );
    // 4) 跑整条编排:markRunning → 跑节点(发步骤)→ recordCandidate;失败 cancelTask。
    await runTopicTask({
      taskId: task.id,
      model: modelFor(spec),
      positioningBrief: context.positioningBrief,
      basis,
      ports: {
        markRunning: (id: string) => deps.ai.markRunning(ctx, id),
        recordStep: (id: string, step) => deps.ai.recordStep(ctx, id, step),
        recordCandidate: async (id: string, items) => {
          await deps.ai.recordCandidate(ctx, id, {
            resultType: "candidate_list",
            resultData: { items },
          });
        },
        cancelTask: async (id: string) => {
          await deps.ai.cancelTask(ctx, id);
        },
      } satisfies TopicTaskPorts,
    });
  } catch (err) {
    // model 解析 / 上下文装配在 markRunning 之前就失败 → 兜底 cancelTask(queued→cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[topic-v2] setup failed for task ${task.id}:`, err);
  }
}
