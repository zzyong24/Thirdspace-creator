import {isTaskDrainStopping,type TaskDrainControl} from "../execution/task-drain-control";
import {IntelligenceGenerationSuspended} from "./topic-preview-runner";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import type { IntelligenceService } from "./intelligence.service";

export interface IntelligenceTranscriptPort {
  transcribe(
    ctx: RequestContext,
    input: {
      itemId: string;
      canonicalUrl: string;
      externalId: string | null;
    },
    claim?: PersistentTaskClaim,
  ): Promise<{
    text: string | null;
    provider: string | null;
    model: string | null;
    language: string | null;
    skippedReason?: string | null;
  }>;
}

export interface IntelligenceTranscriptRunnerDeps {
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  transcript: IntelligenceTranscriptPort;
  workerId?: () => string;
}

export interface IntelligenceTranscriptDrainOptions extends TaskDrainControl {
  /** 每轮领取上限；默认 10，积压留给下一轮唤醒。 */
  maxTasks?: number;
  /** 小并发保护抖音取流、ASR 配额与本机资源，禁止按积压数量同时发起。 */
  concurrency?: number;
}

function classify(error: unknown): {
  taskStatus: "failed" | "blocked";
  transcriptStatus: "failed" | "blocked";
  errorCode: string;
} {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const text = `${name}:${message}`;
  if (/config|modelnotconfigured|credential|未配置/i.test(text)) {
    return {
      taskStatus: "blocked",
      transcriptStatus: "blocked",
      errorCode: "MODEL_NOT_CONFIGURED",
    };
  }
  if (/login|notloggedin|登录/i.test(text)) {
    return {
      taskStatus: "blocked",
      transcriptStatus: "blocked",
      errorCode: "LOGIN_REQUIRED",
    };
  }
  return {
    taskStatus: "failed",
    transcriptStatus: "failed",
    errorCode: "TRANSCRIBE_FAILED",
  };
}

export async function runIntelligenceTranscriptTask(
  ctx: RequestContext,
  input: { taskId: string; existingClaim?: PersistentTaskClaim; signal?:AbortSignal },
  deps: IntelligenceTranscriptRunnerDeps,
): Promise<void> {
  if(input.signal?.aborted)return;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId:
        deps.workerId?.() ??
        `intelligence-transcript:${input.taskId}:${Date.now().toString(36)}`,
      leaseSeconds: 300,
    }));
  if (!claim || input.signal?.aborted) return;
  const lease = {
    taskId: input.taskId,
    workerId: claim.lease.workerId,
    attempt: claim.lease.attempt,
  };
  try {
    const target = await deps.intelligence.getTranscriptTaskForExecution(
      ctx,
      input.taskId,
    );
    await deps.intelligence.markTranscriptRunning(ctx, input.taskId);
    input.signal?.throwIfAborted();
    const result = await deps.transcript.transcribe(ctx, target, claim);
    input.signal?.throwIfAborted();
    const text = result.text?.trim() || null;
    if (!text) {
      input.signal?.throwIfAborted();
      await deps.intelligence.finishTranscript(ctx, {
        taskId: input.taskId,
        status: "skipped",
        provider: result.provider,
        model: result.model,
        language: result.language,
        errorCode: result.skippedReason ?? "NO_SPEECH",
      });
      await deps.tasks.finish({
        ...lease,
        status: "succeeded",
      });
      return;
    }
    input.signal?.throwIfAborted();
    await deps.intelligence.finishTranscript(ctx, {
      taskId: input.taskId,
      status: "done",
      text,
      provider: result.provider,
      model: result.model,
      language: result.language,
    });
    await deps.tasks.finish({ ...lease, status: "succeeded" });
  } catch (error) {
    if(input.signal?.aborted)return;
    if(error instanceof IntelligenceGenerationSuspended && error.taskId===claim.task.id && error.attempt===claim.lease.attempt && error.fenceToken===claim.lease.fenceToken)return;
    const classified = classify(error);
    input.signal?.throwIfAborted();
    await deps.intelligence.finishTranscript(ctx, {
      taskId: input.taskId,
      status: classified.transcriptStatus,
      errorCode: classified.errorCode,
    });
    await deps.tasks.finish({
      ...lease,
      status: classified.taskStatus,
      errorCode: classified.errorCode,
      errorMessage: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function drainIntelligenceTranscriptQueue(
  deps: IntelligenceTranscriptRunnerDeps,
  options: number | IntelligenceTranscriptDrainOptions = {},
): Promise<number> {
  const maxTasks =
    typeof options === "number"
      ? options
      : (options.maxTasks ?? 10);
  const concurrency =
    typeof options === "number" ? 1 : (options.concurrency ?? 2);
  if (
    (!Number.isInteger(maxTasks) && maxTasks !== Number.POSITIVE_INFINITY) ||
    maxTasks <= 0
  ) {
    throw new RangeError("maxTasks 必须是正整数或 Infinity");
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError("concurrency 必须是正整数");
  }

  const control=typeof options==="number"?{}:options;
  let processed = 0;
  while (processed < maxTasks && !isTaskDrainStopping(control)) {
    const slots = Math.min(concurrency, maxTasks - processed);
    const claims: PersistentTaskClaim[] = [];
    // PGlite 是单写者；先顺序领取并锁定任务，再并发执行，避免并发 claim 的事务快照
    // 互相看见同一候选而让第二个 worker 空转。
    for (let offset = 0; offset < slots && !isTaskDrainStopping(control); offset += 1) {
      const claim = await deps.tasks.claimNext({
        workerId:
          deps.workerId?.() ??
          `intelligence-transcript-drain:${Date.now().toString(36)}:${processed + offset}`,
        kinds: ["transcribe"],
        leaseSeconds: 300,
      });
      if (!claim || isTaskDrainStopping(control)) break;
      claims.push(claim);
    }
    if (claims.length === 0 || isTaskDrainStopping(control)) break;

    await Promise.all(
      claims.map(async (claim) => {
        const ctx: RequestContext = {
          userId: claim.task.userId,
          accountId: claim.task.accountId,
          requestId: `execution:${claim.task.id}`,
          source: "ingestion",
          ingestionRunId: claim.task.id,
        };
        await runIntelligenceTranscriptTask(
          ctx,
          { taskId: claim.task.id, existingClaim: claim, signal:control.signal },
          deps,
        );
      }),
    );
    processed += claims.length;
  }
  return processed;
}
