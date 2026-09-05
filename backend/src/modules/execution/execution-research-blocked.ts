import { agenticToolOutcomeSchema, workerToolResultReceiptSchema } from "@creatoros/contract/execution-worker";

/** 只识别可由用户恢复的已确定、无写入副作用的研究阻断回执。 */
export function isAcknowledgableResearchBlock(call: {kind: string; status: string; resultText: string | null}): boolean {
  if (call.kind !== "tool" || call.status !== "settled") return false;
  let raw: unknown;
  try { raw = JSON.parse(call.resultText ?? ""); } catch { return false; }
  const receipt = workerToolResultReceiptSchema.safeParse(raw);
  if (!receipt.success) return false;
  const parsed = agenticToolOutcomeSchema.safeParse(receipt.data.output);
  if (!parsed.success) return false;
  const output = parsed.data;
  if (output.status !== "blocked" || output.sideEffect !== "none" || output.error?.code === "unknown_commit") return false;
  return output.error?.code === "needs_login" || output.error?.code === "captcha"
    || (!!output.data && typeof output.data === "object" && !Array.isArray(output.data) && output.data.recoveryState === "browser_runtime_unavailable");
}
