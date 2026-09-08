// 持续任务的 null 上限由后端显式授权；有限任务仍累计记账并遵守冻结限制。

/** 步数 + token 预算硬顶(SPEC §4.2)。 */
export interface LoopBudget {
  /** 最大循环步数(每步 = 一次模型请求或一次工具调用；确定性适配器按工具计步)。 */
  maxSteps: number | null;
  /** 最大累计 token(引擎每步推理烧的 token 之和)。 */
  maxTokens: number | null;
}

/** 循环终止原因(诚实写进产物 summary,供人判断是「干完了」还是「到顶被截断」)。 */
export type StopReason =
  | "completed" // 引擎自认干完(无更多动作)
  | "max_steps" // 步数到顶(诚实截断)
  | "budget_exhausted" // token 预算耗尽(诚实截断)
  | "aborted" // 用户中止 / 超时
  | "llm_error"; // 引擎推理 LLM 调用失败(如未配模型/凭据)—— 诚实停止,不吞不崩不编

/** 从上次检查点恢复的进度(续跑时注入;首跑省略)。 */
export interface LoopCheckpoint {
  stepsUsed: number;
  tokensUsed: number;
}

/** 循环控制器 —— 引擎每步与它交互;硬顶在这里唯一强制。 */
export interface LoopController {
  readonly budget: LoopBudget;
  stepsUsed(): number;
  tokensUsed(): number;
  /**
   * 开一步:未到步数顶 → 记一步、返回 true;已到顶 → 返回 false(引擎须诚实停,不再动作)。
   * 到顶时终止原因置 max_steps。
   */
  beginStep(): boolean;
  /** 调用前检查停止状态与剩余预算，不消耗一步。 */
  canContinue(): boolean;
  /**
   * 记账本步推理烧的 token;未超预算 → 返回 true;超了 → 返回 false + 终止原因置 budget_exhausted
   * (引擎须诚实停)。
   */
  chargeTokens(n: number): boolean;
  /** 引擎自认干完。 */
  markCompleted(): void;
  /** 用户中止 / 超时。 */
  markAborted(): void;
  /** 当前终止原因(未终止 → null)。 */
  terminationReason(): StopReason | null;
}

/**
 * 建控制器。checkpoint 存在 = 续跑:stepsUsed/tokensUsed 从检查点起算(硬顶跨续跑生效,
 * 续跑绝不重置预算 —— SPEC §4.3 安全性质)。
 */
export function createLoopController(
  budget: LoopBudget,
  checkpoint?: LoopCheckpoint,
): LoopController {
  let steps = Math.max(0, checkpoint?.stepsUsed ?? 0);
  let tokens = Math.max(0, checkpoint?.tokensUsed ?? 0);
  let reason: StopReason | null = null;

  const canContinue = (): boolean => {
    if (reason) return false;
    if (budget.maxTokens !== null && tokens >= budget.maxTokens) { reason = "budget_exhausted"; return false; }
    if (budget.maxSteps !== null && steps >= budget.maxSteps) { reason = "max_steps"; return false; }
    return true;
  };

  return {
    budget,
    canContinue,
    stepsUsed: () => steps,
    tokensUsed: () => tokens,
    beginStep() {
      if (!canContinue()) return false;
      steps += 1;
      return true;
    },
    chargeTokens(n) {
      tokens += Math.max(0, Math.floor(n));
      if (budget.maxTokens !== null && tokens >= budget.maxTokens) {
        if (!reason) reason = "budget_exhausted";
        return false;
      }
      return true;
    },
    markCompleted() {
      if (!reason) reason = "completed";
    },
    markAborted() {
      reason = "aborted";
    },
    terminationReason: () => reason,
  };
}

/** 粗略 token 估算(chars/4 启发式)—— 引擎 LLM 端口不回 token 数时的诚实兜底,喂预算硬顶。 */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}
