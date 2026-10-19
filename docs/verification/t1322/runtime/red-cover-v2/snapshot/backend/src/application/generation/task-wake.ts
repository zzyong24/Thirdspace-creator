import type {RequestContext} from "@creatoros/contract";

type TaskType = "planning.thesis" | "asset.generate" | "script.review" | "script.draft" |
  "publish.platform_adapt" | "cover.generate" | "graphic.card.generate" | "work.review" | "moments.draft";
type Task = {id: string; taskType: string; status: string; attemptId: string; executionTaskId?: string};

/** Prepare the original task before waking its existing model worker. */
export function createGenerationTaskWake(ports: {
  readTask(context: RequestContext, taskId: string): Promise<Task>;
  readRuntime(context: RequestContext, taskId: string): Promise<Record<string, unknown>>;
  submitted: {prepare(context: RequestContext, taskId: string): Promise<unknown>};
  business: {prepare(context: RequestContext, taskId: string): Promise<unknown>};
  assets: {prepare(context: RequestContext, taskId: string): Promise<unknown>};
  getWorker(): {start(): unknown} | null;
  isStopping(): boolean;
}) {
  return async function wake(context: RequestContext, taskId: string, taskType: TaskType,
    source: "business" | "submitted" = "business"): Promise<void> {
    const task = await ports.readTask(context, taskId);
    if (task.taskType !== taskType) throw new Error("唤醒任务类型不符");
    if (task.status !== "queued") return;
    const worker = ports.getWorker();
    if (!worker) throw new Error("生成服务未就绪，请修复或更新应用");
    const runtime = await ports.readRuntime(context, taskId);
    // SEMANTIC_BOUNDARY_ALLOW: These are immutable protocol-origin markers, never creative intent classification.
    const submitted = source === "submitted" || Object.prototype.hasOwnProperty.call(runtime, "hostTaskSubmission") ||
      task.attemptId.startsWith("chat-submit:");
    if (submitted) await ports.submitted.prepare(context, taskId);
    else if (taskType === "asset.generate") await ports.assets.prepare(context, taskId);
    else await ports.business.prepare(context, taskId);
    const prepared = await ports.readTask(context, taskId);
    if (!prepared.executionTaskId) {
      // Submitted preparation can deliberately defer to the original durable recovery schedule.
      if (submitted) return;
      throw Object.assign(new Error("任务准备未完成，尚未启动生成。请重试原请求。"), {code: "GENERATION_NOT_PREPARED"});
    }
    if (!ports.isStopping()) worker.start();
  };
}
