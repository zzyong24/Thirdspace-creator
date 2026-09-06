import type { executionCalls } from "@creatoros/backend";
import { ConflictError } from "./execution.errors";
type Call = typeof executionCalls.$inferSelect;

/** 消息投影只消费根调用；内部回执仍属于同一账本，不能过滤掉损坏的归属。 */
export function partitionExecutionCalls(calls: Call[]) {
  const byId = new Map(calls.map(call => [call.id, call]));
  const roots = calls.filter(call => call.parentCallId === null);
  const children = calls.filter(call => call.parentCallId !== null);
  for (const child of children) {
    const parent = byId.get(child.parentCallId!);
    if (child.kind !== "model" || !parent || parent.kind !== "tool" || parent.parentCallId !== null || parent.executionTaskId !== child.executionTaskId || parent.sequence >= child.sequence)
      throw new ConflictError("内部模型调用的父工具归属损坏");
    if (parent.status === "rejected" || (parent.status === "settled" && child.status !== "rejected" && (child.status !== "settled" || child.totalTokens === null || !child.providerResult)))
      throw new ConflictError("已结束父工具仍有未确认的内部调用");
  }
  return { roots, children };
}
