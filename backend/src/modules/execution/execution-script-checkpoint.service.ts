import {workspaceFilter} from "../../workspace-scope";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  and,
  eq,
  aiTasks,
  executionTasks,
  executionCalls,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  structuredGenerationInputSchema,
  workerStructuredResultSchema,
  workerPortInputSchemas,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import {
  extractJsonObject,
  voiceoverComposeSchema,
} from "@creatoros/ai-worker";
import { workerProviderReceiptSchema } from "@creatoros/contract/execution-worker";

/** 以已结算的模型事实保存口播；新业务重试只能继承已确认结果。 */
export function createExecutionScriptCheckpointService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  const leases = createExecutionLeaseService(db, deps);
  return {
    async save(ref: ExecutionRef, raw: unknown) {
      const input = workerPortInputSchemas.saveScriptVoiceover.parse(raw);
      const generation = workerStructuredResultSchema.shape.generation.parse(
        input.generation,
      );
      return leases.withLease(
        ref,
        "admission",
        async ({ tx, task, context }) => {
          const frozen = structuredGenerationInputSchema.parse(
            (task.payload as { modelInput?: unknown }).modelInput,
          );
          const skill = frozen.skillSnapshot.skills.find(
            (skill) => skill.skillId === "script.voiceover.compose",
          );
          if (
            task.kind !== "ai_task" ||
            frozen.skillId !== "script.draft" ||
            !frozen.facets.__scriptFingerprint ||
            !skill ||
            frozen.skillSnapshot.userId !== context.userId ||
            frozen.skillSnapshot.accountId !== (context.accountId??null) || (frozen.skillSnapshot.groupId??null)!==(context.groupId??null)
          )
            throw new ConflictError("口播断点缺少冻结执行依据");
          const [call] = await tx
            .select()
            .from(executionCalls)
            .where(
              and(
                eq(executionCalls.id, input.callId),
                eq(executionCalls.executionTaskId, task.id),
                eq(executionCalls.status, "settled"),
                eq(executionCalls.kind, "model"),
              ),
            );
          if (!call?.providerResult)
            throw new ConflictError("口播断点缺少真实模型结算回执");
          const prefix = `${frozen.operationKey}/model/`;
          if (
            !call.operationKey.startsWith(prefix) ||
            !/^[1-9][0-9]*$/.test(call.operationKey.slice(prefix.length))
          )
            throw new ConflictError("口播调用键与冻结执行不符");
          const receipt = workerProviderReceiptSchema.parse(
            call.providerResult,
          );
          const text = receipt.content
            .flatMap((part) =>
              part &&
              typeof part === "object" &&
              !Array.isArray(part) &&
              part.type === "text" &&
              typeof part.text === "string"
                ? [part.text]
                : [],
            )
            .join("");
          const actual = voiceoverComposeSchema.parse(extractJsonObject(text));
          if (
            actual.voiceover !== input.voiceover ||
            actual.centralClaim !== input.centralClaim ||
            actual.audienceOldBelief !== input.audienceOldBelief ||
            generation.finishReason !== receipt.finishReason.unified
          )
            throw new ConflictError("口播断点正文与真实供应商回执不一致");
          const calls = await tx
            .select()
            .from(executionCalls)
            .where(eq(executionCalls.executionTaskId, task.id));
          const known = calls
            .filter(
              (item) =>
                item.kind === "model" &&
                item.sequence <= call.sequence &&
                item.status === "settled",
            )
            .map((item) =>
              workerProviderReceiptSchema.parse(item.providerResult),
            );
          const sum = (values: Array<number | null | undefined>) =>
            values.every((value) => value == null)
              ? null
              : values.reduce<number>(
                  (total, value) => total + (value ?? 0),
                  0,
                );
          const usage = {
            inputTokens: sum(known.map((item) => item.usage.inputTokens.total)),
            outputTokens: sum(
              known.map((item) => item.usage.outputTokens.total),
            ),
            cachedTokens: sum(
              known.map((item) => item.usage.inputTokens.cacheRead),
            ),
            totalTokens: sum(
              known.map((item) =>
                sum([
                  item.usage.inputTokens.total,
                  item.usage.outputTokens.total,
                ]),
              ),
            ),
          };
          if (!isDeepStrictEqual(usage, generation.usage))
            throw new ConflictError("口播计量与真实调用账本不一致");
          for (const key of [
            "inputTokens",
            "outputTokens",
            "cachedTokens",
            "totalTokens",
          ] as const)
            if (
              sum(generation.attempts.map((attempt) => attempt.usage[key])) !==
              usage[key]
            )
              throw new ConflictError("口播尝试计量不一致");
          const [business] = await tx
            .select()
            .from(aiTasks)
            .where(
              and(
                eq(aiTasks.id, task.ownerId),
                eq(aiTasks.executionTaskId, task.id),
                eq(aiTasks.userId, context.userId),
                workspaceFilter(aiTasks,context),
              ),
            )
            .for("update");
          if (!business || business.taskType !== "script.draft")
            throw new ConflictError("口播任务映射不符");
          const checkpoint = {
            schemaVersion: 1,
            inputFingerprint: frozen.facets.__scriptFingerprint,
            stage: "voiceover_complete",
            voiceoverSkillVersion: skill.overlayVersion ?? skill.baseVersion,
            storyboardAttemptCount: 0,
            voiceover: input.voiceover,
            centralClaim: input.centralClaim,
            audienceOldBelief: input.audienceOldBelief,
            charCount: input.voiceover.length,
            sha256: createHash("sha256").update(input.voiceover).digest("hex"),
            voiceoverGeneration: generation,
          };
          const runtime = (business.runtimeData ?? {}) as Record<
            string,
            unknown
          >;
          if (
            runtime.scriptDraftCheckpoint &&
            !isDeepStrictEqual(runtime.scriptDraftCheckpoint, checkpoint)
          )
            throw new ConflictError("已冻结口播不能被改写");
          if (!runtime.scriptDraftCheckpoint)
            await tx
              .update(aiTasks)
              .set({
                runtimeData: { ...runtime, scriptDraftCheckpoint: checkpoint },
              })
              .where(eq(aiTasks.id, business.id));
          return { callId: call.id };
        },
      );
    },
    async readRuntime(
      context: RequestContext,
      taskId: string,
    ): Promise<Record<string, unknown>> {
      const [business] = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.id, taskId),
            eq(aiTasks.userId, context.userId),
            workspaceFilter(aiTasks,context),
          ),
        );
      if (!business || business.taskType !== "script.draft")
        throw new ConflictError("口播恢复来源不存在");
      const runtime = (business.runtimeData ?? {}) as Record<string, unknown>;
      if (!business.executionTaskId) return runtime;
      const [execution] = await db
        .select()
        .from(executionTasks)
        .where(
          and(
            eq(executionTasks.id, business.executionTaskId),
            eq(executionTasks.ownerId, business.id),
            eq(executionTasks.userId, context.userId),
            workspaceFilter(executionTasks,context),
          ),
        );
      if (!execution) throw new ConflictError("口播恢复执行映射不符");
      const calls = await db
        .select()
        .from(executionCalls)
        .where(eq(executionCalls.executionTaskId, execution.id));
      if (
        execution.status === "unknown_result" ||
        calls.some(
          (call) => call.status === "unknown" || call.status === "started",
        )
      )
        throw new ConflictError("已有模型提交结果待核对，不能另开任务重复生成");
      if (runtime.scriptDraftCheckpoint) return runtime;
      const frozen = structuredGenerationInputSchema.parse(
        (execution.payload as { modelInput?: unknown }).modelInput,
      );
      if (frozen.skillId !== "script.draft")
        throw new ConflictError("口播恢复类型不符");
      const initial = (
        JSON.parse(frozen.facets.__scriptDraft ?? "null") as {
          initialVoiceover?: Record<string, unknown>;
        } | null
      )?.initialVoiceover;
      const skill = frozen.skillSnapshot.skills.find(
        (skill) => skill.skillId === "script.voiceover.compose",
      );
      if (initial && skill)
        return {
          ...runtime,
          scriptDraftCheckpoint: {
            ...initial,
            schemaVersion: 1,
            stage: "voiceover_complete",
            inputFingerprint: frozen.facets.__scriptFingerprint,
            voiceoverSkillVersion: skill.overlayVersion ?? skill.baseVersion,
          },
        };
      if (
        calls.some(
          (call) => call.kind === "model" && call.status !== "rejected",
        )
      )
        throw new ConflictError(
          "已有模型调用但口播断点未确认，请恢复原执行核对回执",
        );
      return runtime;
    },
  };
}
