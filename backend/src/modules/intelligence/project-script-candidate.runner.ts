import {isTaskDrainStopping,type TaskDrainControl} from "../execution/task-drain-control";
import {IntelligenceGenerationSuspended} from "./topic-preview-runner";
import { randomUUID } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import type {
  ProjectIntelligenceReferenceService,
  ProjectIntelligenceSourceContext,
} from "./project-reference.service";

export interface ProjectScriptCandidateGeneratorPort {
  generate(
    ctx: RequestContext,
    input: {
      strategy: string;
      sources: ProjectIntelligenceSourceContext[];
    },
    claim?:PersistentTaskClaim,
  ): Promise<{ text: string }>;
}

export async function runProjectScriptCandidateTask(
  ctx: RequestContext,
  input: { taskId: string; existingClaim?: PersistentTaskClaim; signal?:AbortSignal },
  deps: {
    tasks: PersistentTaskService;
    references: ProjectIntelligenceReferenceService;
    generator: ProjectScriptCandidateGeneratorPort;
    workerId?: string;
  },
): Promise<void> {
  if(input.signal?.aborted)return;
  const workerId = input.existingClaim?.lease.workerId ?? deps.workerId ?? `project-script-${randomUUID()}`;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId,
      leaseSeconds: 180,
    }));
  if (!claim || input.signal?.aborted) return;
  try {
    const referenceIds = Array.isArray(claim.payload.referenceIds)
      ? claim.payload.referenceIds.filter(
          (value): value is string => typeof value === "string" && !!value,
        )
      : [];
    const strategy =
      typeof claim.payload.strategy === "string"
        ? claim.payload.strategy.trim()
        : "";
    if (!strategy || referenceIds.length === 0) {
      throw Object.assign(new Error("稿件任务缺少来源或策略"), {
        code: "INVALID_SCRIPT_TASK",
      });
    }
    const sources = await deps.references.getSourceContexts(ctx, {
      projectId: claim.task.ownerId,
      referenceIds,
    });
    input.signal?.throwIfAborted();
    const generated = await deps.generator.generate(ctx, {
      strategy,
      sources,
    },claim);
    input.signal?.throwIfAborted();
    const text = generated.text.trim();
    if (!text) {
      throw Object.assign(new Error("模型未返回可用口播稿"), {
        code: "EMPTY_SCRIPT_CANDIDATE",
      });
    }
    input.signal?.throwIfAborted();
    await deps.tasks.saveCheckpoint({
      taskId: claim.task.id,
      workerId,
      attempt: claim.lease.attempt,
      checkpoint: { candidateText: text, referenceIds, strategy },
    });
    await deps.tasks.finish({
      taskId: claim.task.id,
      workerId,
      attempt: claim.lease.attempt,
      status: "succeeded",
    });
  } catch (error) {
    if(input.signal?.aborted)return;
    if(error instanceof IntelligenceGenerationSuspended && error.taskId===claim.task.id && error.attempt===claim.lease.attempt && error.fenceToken===claim.lease.fenceToken)return;
    await deps.tasks.finish({
      taskId: claim.task.id,
      workerId,
      attempt: claim.lease.attempt,
      status: "failed",
      errorCode:
        typeof (error as { code?: unknown })?.code === "string"
          ? String((error as { code: string }).code)
          : "SCRIPT_CANDIDATE_FAILED",
      errorMessage:
        error instanceof Error ? error.message : "稿件候选生成失败",
    });
  }
}

export async function drainProjectScriptCandidateQueue(
  deps: {
    tasks: PersistentTaskService;
    references: ProjectIntelligenceReferenceService;
    generator: ProjectScriptCandidateGeneratorPort;
    workerId?: string;
  },
  maxTasks = 10,
  control:TaskDrainControl = {},
): Promise<number> {
  let processed = 0;
  for (; processed < maxTasks && !isTaskDrainStopping(control); processed += 1) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId ??
        `project-script-drain-${Date.now().toString(36)}-${processed}`,
      kinds: ["script_candidate"],
      leaseSeconds: 180,
    });
    if (!claim || isTaskDrainStopping(control)) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined,
      requestId: `execution:${claim.task.id}`,
      source: "user",
    };
    await runProjectScriptCandidateTask(
      ctx,
      { taskId: claim.task.id, existingClaim: claim, signal:control.signal },
      deps,
    );
  }
  return processed;
}
