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
  /** provider 可提供时记录真实 token 用量；缺失即不伪造。 */
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  };
}

