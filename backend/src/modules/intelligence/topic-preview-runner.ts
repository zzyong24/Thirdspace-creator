import {isTaskDrainStopping,type TaskDrainControl} from "../execution/task-drain-control";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import type { IntelligenceService } from "./intelligence.service";

/** 桥已交还持久恢复，runner不能用普通失败覆盖等待/未知/控制状态。 */
export class IntelligenceGenerationSuspended extends Error {
  constructor(readonly taskId:string,readonly attempt:number,readonly fenceToken:string,readonly runtimeStatus:string){
    super('INTELLIGENCE_GENERATION_SUSPENDED');
  }
}

export interface TopicPreviewGeneratorPort {
  generate(
    ctx: RequestContext,
    input: Awaited<
      ReturnType<IntelligenceService["getTopicPreviewForExecution"]>
    >,
    onCheckpoint: (checkpoint: TopicPreviewCheckpoint) => Promise<void>,
    claim?:PersistentTaskClaim,
  ): Promise<{
    generationMode: "rewrite_only";
    adaptedDraft: string;
  } | {
    generationMode?: "strategy_backed";
    hook: string;
    structureSteps: string[];
    coreClaims: string[];
    reusablePattern: string;
    factRisks: string[];
    title: string;
    angle: string;
    differentiation: string;
    sourceSummary: string;
    targetAudience: string;
    audiencePain: string;
    coreConflict: string;
    format: string;
    contentRole?: "traffic" | "trust" | "conversion" | null;
    contentRoleReason?: string;
    adaptationStrategy: {
      keep: string[];
      replace: string[];
      add: string[];
      avoid: string[];
    };
    adaptedDraft: string;
  }>;
}

export type TopicPreviewDecomposition = {
  hook: string;
  structureSteps: string[];
  coreClaims: string[];
  reusablePattern: string;
  factRisks: string[];
};

export type TopicPreviewCandidate = {
  title: string;
  angle: string;
  differentiation: string;
  sourceSummary: string;
  targetAudience: string;
  audiencePain: string;
  coreConflict: string;
  format: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  contentRoleReason?: string;
  adaptationStrategy: {
    keep: string[];
    replace: string[];
    add: string[];
    avoid: string[];
  };
};

export type TopicPreviewCheckpoint =
  | { stage: "decomposition"; value: TopicPreviewDecomposition }
  | { stage: "topic"; value: TopicPreviewCandidate }
  | { stage: "draft"; value: { contentText: string; templateVersion?: string } };

export interface TopicPreviewRunnerDeps {
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  generator: TopicPreviewGeneratorPort;
  workerId?: () => string;
}

export interface TopicPreviewDrainOptions extends TaskDrainControl {
  /** 每轮领取上限；默认 10，积压留给下一轮唤醒。 */
  maxTasks?: number;
}

const TOPIC_PREVIEW_LEASE_SECONDS = 300;

export type TopicPreviewFailureCategory =
  | "credential"
  | "positioning"
  | "timeout"
  | "output_invalid"
  | "network"
  | "unknown";

/**
 * 只从 Error/cause 链归类，不把上游响应、URL、密钥或逐字稿写入任务与日志。
 * 旧实现只保存 `Error`，导致线上同类失败无法区分截断、超时和配置问题。
 */
export function classifyTopicPreviewFailure(error: unknown): {
  category: TopicPreviewFailureCategory;
  message: string;
} {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (typeof record.name === "string") parts.push(record.name);
      if (typeof record.message === "string") parts.push(record.message);
      current = record.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  const signal = parts.join(" ").toLowerCase();
  if (/401|403|api.?key|credential|unauthori|鉴权|密钥|model[_\s-]*(?:not[_\s-]*)?configured|模型.{0,8}(?:未配置|没有配置)/.test(signal)) {
    return {
      category: "credential",
      message: "还没有可用的 AI 模型，请完成模型设置后继续原任务",
    };
  }
  if (/positioning|定位/.test(signal)) {
    return {
      category: "positioning",
      message: "当前账号缺少可用定位，请先完成定位后重试",
    };
  }
  if (/timeout|timed.?out|abort(?:ed)?|超时/.test(signal)) {
    return {
      category: "timeout",
      message: "模型响应超时，系统正在自动恢复",

    };
  }
  if (
    /schema|json|noobject|no object|结构化|output.*(?:invalid|incomplete)|输出.*(?:不完整|校验)/.test(
      signal,
    )
  ) {
    return {
      category: "output_invalid",
      message: "模型输出不完整，系统正在继续生成选题卡",

    };
  }
  if (/502|503|504|network|econn|fetch failed|网络/.test(signal)) {
    return {
      category: "network",
      message: "模型服务暂时不可用，系统正在自动恢复",
    };
  }
  return {
    category: "unknown",
    message: "生成改写稿失败，请重试",
  };
}

export async function runIntelligenceTopicPreviewTask(
  ctx: RequestContext,
  input: { taskId: string; existingClaim?: PersistentTaskClaim; signal?:AbortSignal },
  deps: TopicPreviewRunnerDeps,
): Promise<void> {
  if(input.signal?.aborted)return;
  const claim =
    input.existingClaim ??
    (await deps.tasks.claimTask({
      taskId: input.taskId,
      workerId:
        deps.workerId?.() ??
        `intelligence-topic:${input.taskId}:${Date.now().toString(36)}`,
      leaseSeconds: TOPIC_PREVIEW_LEASE_SECONDS,
    }));
  if (!claim || input.signal?.aborted) return;
  const lease = {
    taskId: input.taskId,
    workerId: claim.lease.workerId,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  let pendingStage: TopicPreviewCheckpoint["stage"] = "decomposition";
  let targetTransformId: string | null = null;
  const rewriteDraftCheckpoint: { value: { contentText: string } | null } = { value: null };
  try {
    const target = await deps.intelligence.getTopicPreviewForExecution(
      ctx,
      input.taskId,
    );
    targetTransformId = target.transformId;
    if (target.generationMode === "rewrite_only") pendingStage = "draft";
    input.signal?.throwIfAborted();
    const generated = await deps.generator.generate(
      ctx,
      target,
      async (checkpoint) => {
        input.signal?.throwIfAborted();
        await deps.intelligence.saveTopicPreviewCheckpoint(
          ctx,
          target.transformId,
          {
            ...checkpoint,
            sourceUrl: target.item.canonicalUrl,
            transcriptHash: target.transcript.hash,
          },
        );
        if (target.generationMode === "rewrite_only" && checkpoint.stage === "draft") {
          rewriteDraftCheckpoint.value = { contentText: checkpoint.value.contentText };
        }
        await deps.tasks.heartbeat({
          ...lease,
          leaseSeconds: TOPIC_PREVIEW_LEASE_SECONDS,
        });
        pendingStage =
          checkpoint.stage === "decomposition"
            ? "topic"
            : checkpoint.stage === "topic"
              ? "draft"
              : "draft";
      },
      claim,
    );
    input.signal?.throwIfAborted();
    await deps.intelligence.finishTopicPreview(
      ctx,
      target.transformId,
      generated.generationMode === "rewrite_only"
        ? generated
        : {
            ...generated,
            sourceUrl: target.item.canonicalUrl,
            transcriptHash: target.transcript.hash,
          },
    );
    await deps.tasks.finish({
      ...lease,
      status: "succeeded",
    });
  } catch (error) {
    if(input.signal?.aborted)return;
    if(error instanceof IntelligenceGenerationSuspended && error.taskId===claim.task.id && error.attempt===claim.lease.attempt && error.fenceToken===claim.lease.fenceToken)return;
    if (targetTransformId && rewriteDraftCheckpoint.value) {
      try {
        await deps.intelligence.finishTopicPreview(ctx, targetTransformId, {
          generationMode: "rewrite_only",
          adaptedDraft: rewriteDraftCheckpoint.value.contentText,
        });
        await deps.tasks.finish({ ...lease, status: "succeeded" });
        return;
      } catch {
        // 保存的 checkpoint 只有在来源与逐字稿证明仍有效时才可收敛为成功；
        // 若租约已失效或证据变动，继续报告原任务状态。
      }
    }
    const failure = classifyTopicPreviewFailure(error);
    const waitingForUser =
      failure.category === "positioning" || failure.category === "credential";
    const recoverable = ["timeout", "output_invalid", "network"].includes(
      failure.category,
    );
    console.warn(
      `[intelligence-topic] generation_failed category=${failure.category}`,
    );
    if (targetTransformId && !waitingForUser && !recoverable) {
      try {
        await deps.intelligence.markTopicPreviewStageFailed(
          ctx,
          targetTransformId,
          {
            stage: pendingStage,
            errorCode: failure.category,
          },
        );
      } catch {
        console.warn(
          "[intelligence-topic] failed_to_persist_stage_failure",
        );
      }
    }
    await deps.tasks.finish({
      ...lease,
      status: waitingForUser
        ? "waiting_user"
        : recoverable
          ? "retry_wait"
          : "failed",
      errorCode:
        failure.category === "positioning"
          ? "POSITIONING_MISSING"
          : failure.category === "credential"
            ? "MODEL_CONFIGURATION_REQUIRED"
            : failure.category === "timeout"
              ? "TOPIC_PREVIEW_TIMEOUT"
              : failure.category === "output_invalid"
                ? "TOPIC_PREVIEW_OUTPUT_INVALID"
                : failure.category === "network"
                  ? "TOPIC_PREVIEW_NETWORK"
                  : "TOPIC_PREVIEW_FAILED",
      errorMessage: failure.message,
    });
  }
}

/**
 * 启动恢复消费者：`recoverExpiredLeases` 只负责把中断任务收敛回 queued，本函数负责真正接走
 * 既有 `topic_preview`。顺序消费避免应用重启时把历史改写同时打向模型；新请求的即时 dispatch
 * 与这里共用条件领取，因此不会重复执行同一任务。
 */
export async function drainIntelligenceTopicPreviewQueue(
  deps: TopicPreviewRunnerDeps,
  options: TopicPreviewDrainOptions = {},
): Promise<number> {
  const maxTasks = options.maxTasks ?? 10;
  if (
    (!Number.isInteger(maxTasks) && maxTasks !== Number.POSITIVE_INFINITY) ||
    maxTasks <= 0
  ) {
    throw new RangeError("maxTasks 必须是正整数或 Infinity");
  }

  let processed = 0;
  while (processed < maxTasks && !isTaskDrainStopping(options)) {
    const claim = await deps.tasks.claimNext({
      workerId:
        deps.workerId?.() ??
        `intelligence-topic-drain:${Date.now().toString(36)}:${processed}`,
      kinds: ["topic_preview"],
      leaseSeconds: TOPIC_PREVIEW_LEASE_SECONDS,
    });
    if (!claim || isTaskDrainStopping(options)) break;
    const ctx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined,
      requestId: `execution:${claim.task.id}`,
      source: "user",
    };
    await runIntelligenceTopicPreviewTask(
      ctx,
      { taskId: claim.task.id, existingClaim: claim, signal:options.signal },
      deps,
    );
    processed += 1;
  }
  return processed;
}
