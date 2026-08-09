/**
 * 创作任务可以同时存在「已保存稿面」与「后台候选」。审核永远以当前已保存稿面为准；
 * 只有稿面本身不可审时，才用后台任务状态解释缺口，不能让未采纳候选反向锁死旧稿。
 */
export type ScriptReviewBlockReason = "running" | "awaiting_adoption" | "empty";

export function getScriptReviewBlockReason(
  currentScript: string,
  taskStatuses: readonly string[],
  minReviewableChars: number,
): ScriptReviewBlockReason | null {
  if (currentScript.trim().length >= minReviewableChars) {
    return null;
  }
  if (taskStatuses.some((status) => status === "queued" || status === "running")) {
    return "running";
  }
  if (taskStatuses.some((status) => status === "awaiting_confirmation")) {
    return "awaiting_adoption";
  }
  return "empty";
}
