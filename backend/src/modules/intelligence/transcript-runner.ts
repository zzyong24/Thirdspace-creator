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
  input: { taskId: string; existingClaim?: PersistentTaskClaim },
  deps: IntelligenceTranscriptRunnerDeps,
): Promise<void> {
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId:
        deps.workerId?.() ??
        `intelligence-transcript:${input.taskId}:${Date.now().toString(36)}`,
      leaseSeconds: 300,
    }));
  if (!claim) return;
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
    const result = await deps.transcript.transcribe(ctx, target);
    const text = result.text?.trim() || null;
    if (!text) {
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
    const classified = classify(error);
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
  maxTasks = 20,
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks; processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-transcript-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["transcribe"],
      leaseSeconds: 300,
    });
    if (!claim) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,
      requestId: `execution:${claim.task.id}`,
      source: "ingestion",
      ingestionRunId: claim.task.id,
    };
    await runIntelligenceTranscriptTask(
      ctx,
      { taskId: claim.task.id, existingClaim: claim },
      deps,
    );
  }
  return processed;
}
