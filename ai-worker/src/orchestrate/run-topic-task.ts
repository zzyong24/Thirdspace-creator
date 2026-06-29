import type { LanguageModel } from "ai";
import { runTopicNode, type TopicBasis, type TopicItem } from "../nodes/topic-node";

// 选题任务编排(Phase 3)—— 把「一次选题 AI 任务」从开跑到落候选的完整生命周期串起来,
// 跑在新 Agent Runtime 上。这层是厂商中立 + 不碰具体持久化:所有副作用走注入的 ports
// (= ai 模块的 service 方法,带 ownership 守卫)。persistence-client 只需:解析 model
// (provider-factory)+ 装配 positioningBrief(creative-context)+ 注入真 ports,然后调它。
//
// 不变量:AI 不直接写领域实体 —— recordCandidate 只产候选(candidate_list),用户采纳后
// 才由 backend service 落库。出错则 cancelTask(任务进终态,不假成功)。

export interface TopicTaskPorts {
  markRunning(taskId: string): Promise<void>;
  /** runtime 每步落一行 ai_task_steps,喂窗口步骤日志。 */
  recordStep(
    taskId: string,
    step: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  /** 跑成功:把选题列表记成 candidate_list 候选(任务 → awaiting_confirmation)。 */
  recordCandidate(taskId: string, items: TopicItem[]): Promise<void>;
  /** 跑失败:取消任务(进终态)。 */
  cancelTask(taskId: string): Promise<void>;
}

export interface RunTopicTaskInput {
  taskId: string;
  model: LanguageModel;
  positioningBrief: string;
  /** 按出题依据装配的额外上下文(评论信号 / 知识库…),让各 basis 真的不同。 */
  basisBrief?: string;
  basis: TopicBasis;
  ports: TopicTaskPorts;
}

/** 跑完整一次选题任务。fire-and-forget 调用方无需 await 结果,异常已内部收敛成 cancelTask。 */
export async function runTopicTask(input: RunTopicTaskInput): Promise<void> {
  const { taskId, model, positioningBrief, basisBrief, basis, ports } = input;
  try {
    await ports.markRunning(taskId);
    const { topics } = await runTopicNode({
      model,
      positioningBrief,
      basisBrief,
      basis,
      onStep: async (e) => {
        await ports.recordStep(taskId, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    await ports.recordCandidate(taskId, topics);
  } catch (err) {
    try {
      await ports.cancelTask(taskId);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[run-topic-task] task ${taskId} failed:`, err);
  }
}
