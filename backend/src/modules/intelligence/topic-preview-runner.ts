import type { RequestContext } from "@creatoros/contract";
import type { PersistentTaskService } from "../execution";
import type { IntelligenceService } from "./intelligence.service";

export interface TopicPreviewGeneratorPort {
  generate(
    ctx: RequestContext,
    input: Awaited<
      ReturnType<IntelligenceService["getTopicPreviewForExecution"]>
    >,
  ): Promise<{
    hook: string;
    structureSteps: string[];
    coreClaims: string[];
    reusablePattern: string;
    factRisks: string[];
    title: string;
    angle: string;
    differentiation: string;
    sourceSummary: string;
  }>;
}

export interface TopicPreviewRunnerDeps {
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  generator: TopicPreviewGeneratorPort;
  workerId?: () => string;
}

export async function runIntelligenceTopicPreviewTask(
  ctx: RequestContext,
  input: { taskId: string },
  deps: TopicPreviewRunnerDeps,
): Promise<void> {
  const claim = await deps.tasks.claimTask({
    taskId: input.taskId,
    workerId:
      deps.workerId?.() ??
      `intelligence-topic:${input.taskId}:${Date.now().toString(36)}`,
    leaseSeconds: 120,
  });
  if (!claim) return;
  try {
    const target = await deps.intelligence.getTopicPreviewForExecution(
      ctx,
      input.taskId,
    );
    const generated = await deps.generator.generate(ctx, target);
    await deps.intelligence.finishTopicPreview(
      ctx,
      target.transformId,
      {
        ...generated,
        sourceUrl: target.item.canonicalUrl,
        transcriptHash: target.transcript.hash,
      },
    );
    await deps.tasks.finish({
      taskId: input.taskId,
      workerId: claim.lease.workerId,
      attempt: claim.lease.attempt,
      status: "succeeded",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const blocked = /positioning|配置|credential/i.test(
      `${name}:${error instanceof Error ? error.message : ""}`,
    );
    await deps.tasks.finish({
      taskId: input.taskId,
      workerId: claim.lease.workerId,
      attempt: claim.lease.attempt,
      status: blocked ? "blocked" : "failed",
      errorCode: blocked ? "POSITIONING_MISSING" : "TOPIC_PREVIEW_FAILED",
      errorMessage: name,
    });
  }
}
