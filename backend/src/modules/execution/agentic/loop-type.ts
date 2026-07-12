// [T-256b] 循环类型判定规则(SPEC §2/§8 gate-m1)—— **纯函数真 gate,非文档**。
//
// 三种循环各归各位(SPEC §2):对话循环=自研 chat-runner;确定性活=脚本 runner;
// 自主任务循环=专门引擎(Pi)+ 领域工具/护栏。判定规则挡住「什么都塞 agent」(SPEC §7):
//   - 能写成确定脚本 / 有硬安全约束且流程固定 → deterministic;
//   - 开放式、多步、边做边判断、无固定终点 → agentic;
//   - 人每轮在场的对话 → conversation。
//
// 落地为建任务端的真校验(execution.service.create + executor-registry.register 双门):
// taskType 与其 executor 声明的循环类型不匹配 → 拒建/拒注册(assertLoopType 抛错)。

/** 一个任务落哪类循环。 */
export type LoopType = "conversation" | "agentic" | "deterministic";

/** 自主任务 taskType 命名空间(agentic.research / agentic.collect / agentic.material)。 */
export const AGENTIC_TASK_TYPE_PREFIX = "agentic.";

/** 执行层 ai_tasks taskType 前缀(exec.<type>);判定前先剥壳。 */
const EXEC_PREFIX = "exec.";

export function isAgenticTaskType(taskType: string): boolean {
  const bare = stripExecPrefix(taskType.trim());
  return bare.startsWith(AGENTIC_TASK_TYPE_PREFIX);
}

function stripExecPrefix(taskType: string): string {
  return taskType.startsWith(EXEC_PREFIX)
    ? taskType.slice(EXEC_PREFIX.length)
    : taskType;
}

/**
 * 纯函数判定:taskType → 循环类型(SPEC §8 gate-m1)。
 *   - `agentic.*`(或 `exec.agentic.*`)→ agentic(自主循环,交 Pi 引擎);
 *   - `chat` / `chat.*` → conversation(自研对话循环,人每轮在场);
 *   - 其余(echo.manifest / video.render / scheduled.* / asset.generate …)→ deterministic。
 * 命名约定是单一真值:executor 的声明循环类型必须与此一致(register/create 两处强制)。
 */
export function classifyLoopType(taskType: string): LoopType {
  const bare = stripExecPrefix(taskType.trim());
  if (bare.startsWith(AGENTIC_TASK_TYPE_PREFIX)) return "agentic";
  if (bare === "chat" || bare.startsWith("chat.")) return "conversation";
  return "deterministic";
}

/** 判定规则违背 —— taskType 命名与声明循环类型不一致(拒建/拒注册)。 */
export class LoopTypeMismatchError extends Error {
  constructor(
    readonly taskType: string,
    readonly declared: LoopType,
    readonly actual: LoopType,
  ) {
    super(
      `任务循环类型不匹配:taskType "${taskType}" 判定为 ${actual},但 executor 声明为 ${declared}` +
        `(判定规则 SPEC §8:agentic.* 才走自主引擎,别把确定性/对话任务塞进 agent 循环)`,
    );
    this.name = "LoopTypeMismatchError";
  }
}

/**
 * 真 gate:断言 taskType 的判定循环类型 === 声明循环类型,否则抛 LoopTypeMismatchError。
 * register 期(结构门:app 装配就拦)+ create 期(纵深防御:建任务再拦)两处调用。
 */
export function assertLoopType(taskType: string, declared: LoopType): void {
  const actual = classifyLoopType(taskType);
  if (actual !== declared) {
    throw new LoopTypeMismatchError(taskType, declared, actual);
  }
}
