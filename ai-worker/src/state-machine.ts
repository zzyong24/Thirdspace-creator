export const AI_TASK_STATUSES = [
  "queued",
  "running",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AiTaskStatus = (typeof AI_TASK_STATUSES)[number];

const ALLOWED: Record<AiTaskStatus, readonly AiTaskStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_confirmation", "succeeded", "failed", "cancelled"],
  awaiting_confirmation: ["succeeded", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: AiTaskStatus, to: AiTaskStatus): boolean {
  return ALLOWED[from].includes(to);
}
