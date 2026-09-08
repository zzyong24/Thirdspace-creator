/** 保留冻结任务输入的 maxSteps 字段格式；Pi 循环不以此字段终止执行。 */
export function resolveChatMaxSteps(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_MAX_STEPS?.trim();
  if (!raw) return 6;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.min(12, Math.max(2, Math.floor(n)));
}

/**
 * [T-443] forcedTool 的 **system 层**强指令 —— 替代 API 层 toolChoice 强制。
 * 传入的必须是**发给模型的合规工具名**(sanitizeToolName 之后),否则模型按名找不到该工具。
 */
export function buildForcedToolInstruction(safeToolName: string): string {
  return [
    "【本轮硬性要求】用户是通过界面按钮/深链明确指定了要执行的操作,",
    `你**必须首先调用 \`${safeToolName}\` 工具**来完成它。`,
    "不要用文字描述你「将要做」或「已经做了」——必须真正发起这次工具调用,让结果以卡片呈现;",
    "只有在该工具返回结果之后,才继续做后续说明。",
  ].join("");
}

export function buildForcedToolSequenceInstruction(
  safeToolNames: readonly string[],
): string {
  return [
    "【本轮硬性顺序】用户已明确要求执行一个组合操作。",
    `必须依次调用 ${safeToolNames.map((name) => `\`${name}\``).join(" → ")}；后一步必须读取前一步的真实结果填写参数。`,
    "不要跳过中间读取，不要改用相邻工具，不要只给文字建议，也不要把系统已有事实再抛回用户选择。",
  ].join("");
}
