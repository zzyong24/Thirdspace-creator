import {isTaskDrainStopping,type TaskDrainControl} from "@creatoros/backend/modules/execution";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "@creatoros/backend/modules/execution";
import type {
  IntelligenceAdapterItem,
  IntelligenceService,
} from "@creatoros/backend/modules/intelligence";

export interface DouyinShareImportFetcher {
  fetch(
    ctx: RequestContext,
    input: { shareText: string; capturedAt: string; signal?:AbortSignal },
  ): Promise<{
    shareUrl: string;
    resolvedUrl: string;
    item: IntelligenceAdapterItem;
    browserSessionRef: string;
  }>;
}

export interface RunDouyinShareImportDeps {
  tasks: PersistentTaskService;
  intelligence: Pick<IntelligenceService, "importDouyinSharedItem">;
  fetcher: DouyinShareImportFetcher;
  /**
   * 领域层已把子任务持久化后，host 可立即唤醒转写 worker；失败只影响实时启动，
   * 持久队列仍会在启动恢复/下一轮 drain 中续跑，不能反转已成功的父任务。
   */
  onTranscriptTasksQueued?: (
    ctx: RequestContext,
    taskIds: string[],
  ) => Promise<void> | void;
  now?: () => string;
  workerId?: () => string;
}

function taskFailure(error: unknown): {
  status: "failed" | "blocked";
  code: string;
} {
  const text =
    error instanceof Error
      ? `${error.name}:${error.message}`
      : String(error ?? "");
  if (/login|notloggedin|登录/i.test(text)) {
    return { status: "blocked", code: "LOGIN_REQUIRED" };
  }
  if (/captcha|验证码|人机校验/i.test(text)) {
    return { status: "blocked", code: "CAPTCHA" };
  }
  if (/非抖音域名|没有可识别|未解析出作品 ID|unsafe/i.test(text)) {
    return { status: "failed", code: "UNSAFE_URL" };
  }
  return { status: "failed", code: "IMPORT_FAILED" };
}

export async function runDouyinShareImportTask(
  ctx: RequestContext,
  input: { taskId: string; existingClaim?: PersistentTaskClaim; signal?:AbortSignal },
  deps: RunDouyinShareImportDeps,
): Promise<void> {
  if(input.signal?.aborted)return;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId:
        deps.workerId?.() ??
        `intelligence-share-import:${input.taskId}:${Date.now().toString(36)}`,
      leaseSeconds: 180,
    }));
  if (!claim||input.signal?.aborted) return;
  const lease = {
    taskId: input.taskId,
    workerId: claim.lease.workerId,
    attempt: claim.lease.attempt,
  };
  try {
    const collectionId =
      typeof claim.payload.collectionId === "string"
        ? claim.payload.collectionId
        : null;
    const shareText =
      typeof claim.payload.shareInput === "string"
        ? claim.payload.shareInput.trim()
        : typeof claim.payload.shareText === "string"
          ? claim.payload.shareText.trim()
          : "";
    if (!shareText) throw new Error("分享文本不能为空");

    const fetched = await deps.fetcher.fetch(ctx, {
      shareText,
      signal:input.signal,
      capturedAt: deps.now?.() ?? new Date().toISOString(),
    });
    input.signal?.throwIfAborted();
    const result = await deps.intelligence.importDouyinSharedItem(ctx, {
      taskId: input.taskId,
      lease,
      collectionId,
      item: fetched.item,
      browserSessionRef: fetched.browserSessionRef,
      transcribeAfterImport: claim.payload.transcribeAfterImport === true,
    });
    const transcriptTaskIds = Array.isArray(result.transcriptTaskIds)
      ? result.transcriptTaskIds.filter(
          (taskId): taskId is string =>
            typeof taskId === "string" && taskId.length > 0,
        )
      : [];
    if (transcriptTaskIds.length > 0 && deps.onTranscriptTasksQueued) {
      try {
        await deps.onTranscriptTasksQueued(ctx, transcriptTaskIds);
      } catch {
        // 已持久化的子任务是真值；live dispatch 失败留给启动恢复/队列 drain。
      }
    }
  } catch (error) {
    if(input.signal?.aborted)return;
    const failure = taskFailure(error);
    await deps.tasks.finish({
      ...lease,
      status: failure.status,
      errorCode: failure.code,
      // 不持久化上游 URL、签名或页面正文，只记异常类。
      errorMessage: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function drainDouyinShareImportQueue(
  deps: RunDouyinShareImportDeps,
  maxTasks = 20,
  control:TaskDrainControl = {},
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks && !isTaskDrainStopping(control); processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-share-import-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["share_import"],
      leaseSeconds: 180,
    });
    if (!claim || isTaskDrainStopping(control)) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,
      requestId: `execution:${claim.task.id}`,
      source: "ingestion",
      ingestionRunId: claim.task.id,
    };
    await runDouyinShareImportTask(
      ctx,
      { taskId: claim.task.id, existingClaim: claim, signal:control.signal },
      deps,
    );
  }
  return processed;
}
