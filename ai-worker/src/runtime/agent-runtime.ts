import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ToolSet,
} from "ai";

// Agent Runtime (Phase 3) — 厂商中立的薄壳 Agent。底层是 Vercel AI SDK 的 generateText
// 多步工具循环(ReAct):想 → 模型说调哪个工具 → 执行 → 喂回 → 再想,直到 stopWhen。
// 它做三件别人不替我们做的事:(1) 把每一步拍成一个领域中立的 AgentStepEvent(喂给「窗口
// 步骤日志」);(2) 跑完用调用方给的 zod schema 卡最终输出(不合格抛错,让任务进终态);
// (3) 把工具/模型/skill 全部当注入参数 —— 不绑任何厂商 SDK,模型按 capability 可换。
//
// 不在这里写:provider 的具体构造(provider-factory.ts)、任务状态机/落库(ai 模块)、
// 工具的领域实现(tools/,调 backend service port)。这层只管「一次 agent 运行」。

/** 一步的领域中立事件 —— 喂给步骤日志(第1步读人设 / 第2步搜热点…)。 */
export interface AgentStepEvent {
  /** 1-based 步号。 */
  stepNo: number;
  /** 本步模型产出的文本(可能为空,工具步常为空)。 */
  text: string;
  /** 本步发起的工具调用(name + 入参),空数组=纯思考/产出步。 */
  toolCalls: { toolName: string; input: unknown }[];
  /** 本步的终止原因(stop | tool-calls | length | …)。 */
  finishReason: string;
}

export interface RunAgentNodeOptions {
  /** 已构造好的 LanguageModel(由 provider-factory 按 capability 解析)。 */
  model: LanguageModel;
  /** 系统提示(= skill 的角色/方法论)。 */
  system: string;
  /** 用户/任务提示(= 装配好的 CreativeContext + 本次诉求)。 */
  prompt: string;
  /** 允许用的工具(函数注册表包成的 ToolSet);省略=纯生成,无工具。 */
  tools?: ToolSet;
  /** 护栏:最大步数(默认 8),防跑飞。 */
  maxSteps?: number;
  /** 每步回调 —— 落 ai_task_steps + 推前端实时日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
}

export interface RunAgentNodeResult {
  /** 最终一步的文本(供节点解析成候选)。 */
  text: string;
  /** 全部步骤事件(审计 + 日志)。 */
  steps: AgentStepEvent[];
}

/**
 * 跑一次 agent 节点。厂商中立:换模型只换 `model`,加工具只加 `tools`,加节点只换
 * `system`/output schema —— 不动这层。
 */
export async function runAgentNode(
  opts: RunAgentNodeOptions,
): Promise<RunAgentNodeResult> {
  const steps: AgentStepEvent[] = [];
  const result = await generateText({
    model: opts.model,
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 8),
    onStepFinish: async (step) => {
      const event: AgentStepEvent = {
        stepNo: steps.length + 1,
        text: step.text ?? "",
        toolCalls: (step.toolCalls ?? []).map((call) => ({
          toolName: call.toolName,
          input: call.input,
        })),
        finishReason: String(step.finishReason ?? ""),
      };
      steps.push(event);
      await opts.onStep?.(event);
    },
  });
  return { text: result.text, steps };
}
