import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import { createHash } from "node:crypto";
import {
  and,
  eq,
  inArray,
  lte,
  asc,
  aiTasks,
  aiTaskResults,
  executionCalls,
  executionTasks,
  type Db,
} from "@creatoros/backend";
import { gt } from "drizzle-orm";
import {
  structuredGenerationInputSchema,
  workerStructuredResultSchema,
  workerProviderReceiptSchema,
  type ExecutionRef,
  type WorkerStructuredResult,
} from "@creatoros/contract/execution-worker";
import {
  buildScriptFallbackResult,
  extractJsonObject,
  voiceoverComposeSchema,
  scriptDraftSchema,
} from "@creatoros/ai-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import type { ExecutionCandidateDeps } from "./execution-candidate.service";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** 只结算已存在的口播事实；不预留、不启动任何新模型或工具动作。 */
export function createScriptPartialFinalizationService(
  db: Db,
  deps: ExecutionCandidateDeps & {
    onRecoveryError?: (event: {
      executionTaskId: string;
      error: unknown;
    }) => void;
  },
) {
  const now = deps.now ?? (() => new Date().toISOString()),
    leases = createExecutionLeaseService(db, { now });
  const service = {
    async finalize(ref: ExecutionRef): Promise<boolean> {
      return leases.withLease(
        ref,
        "settlement",
        async ({ tx, task, context }) => {
          if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
            return false;
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
          if (!business || business.taskType !== "script.draft") return false;
          if (["partial", "succeeded"].includes(task.status))
            return (
              business.status === "awaiting_confirmation" ||
              business.status === "succeeded"
            );
          if (
            !["running", "queued", "retry_wait"].includes(task.status) ||
            !["queued", "running"].includes(business.status)
          )
            return false;
          const stamp = now();
          const reason =
            task.deadlineAt && Date.parse(task.deadlineAt) <= Date.parse(stamp)
              ? "deadline"
              : task.lastErrorCode === "EXECUTION_BUDGET_EXHAUSTED"
                ? "budget_exhausted"
                : null;
          if (!reason) return false;
          const frozen = structuredGenerationInputSchema.parse(
            (
              task.payload as {
                modelInput?: unknown;
              }
            ).modelInput,
          );
          if (
            frozen.skillId !== "script.draft" ||
            frozen.skillSnapshot.userId !== context.userId ||
            frozen.skillSnapshot.accountId !== context.accountId
          )
            return false;
          const calls = await tx
            .select()
            .from(executionCalls)
            .where(eq(executionCalls.executionTaskId, task.id))
            .orderBy(asc(executionCalls.sequence));
          if (
            calls.some((call) =>
              ["reserved", "started", "unknown"].includes(call.status),
            )
          )
            return false;
          const checkpoint = (
            business.runtimeData as {
              scriptDraftCheckpoint?: Record<string, unknown>;
            }
          )?.scriptDraftCheckpoint;
          const voiceover = checkpoint?.voiceover;
          const skill = frozen.skillSnapshot.skills.find(
            (item) => item.skillId === "script.voiceover.compose",
          );
          if (
            !checkpoint ||
            checkpoint.stage !== "voiceover_complete" ||
            checkpoint.schemaVersion !== 1 ||
            checkpoint.inputFingerprint !== frozen.facets.__scriptFingerprint ||
            !skill ||
            checkpoint.voiceoverSkillVersion !==
              (skill.overlayVersion ?? skill.baseVersion) ||
            typeof voiceover !== "string" ||
            !voiceover.trim() ||
            checkpoint.charCount !== voiceover.length ||
            checkpoint.sha256 !== hash(voiceover)
          )
            return false;
          const voiceoverGeneration =
            workerStructuredResultSchema.shape.generation.parse(
              checkpoint.voiceoverGeneration,
            );
          const source = calls.find((call) => {
            if (
              call.kind !== "model" ||
              call.status !== "settled" ||
              !call.providerResult
            )
              return false;
            try {
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
              const parsed = voiceoverComposeSchema.safeParse(
                extractJsonObject(text),
              );
              return (
                parsed.success &&
                parsed.data.voiceover === voiceover &&
                parsed.data.centralClaim === checkpoint.centralClaim &&
                parsed.data.audienceOldBelief === checkpoint.audienceOldBelief
              );
            } catch {
              return false;
            }
          });
          if (!source) return false;
          // 只汇总本执行真实结算的模型回执，每个call计一次；不能把口播断点再叠加一遍。
          const knownCalls = calls.filter(
            (call) => call.kind === "model" && call.status === "settled",
          );
          const sum = (
            values: Array<number | null | undefined>,
          ): number | null =>
            values.some((value) => value == null)
              ? null
              : values.reduce<number>(
                  (total, value) => total + (value ?? 0),
                  0,
                );
          const attempts = knownCalls.map((call) => {
            const receipt = workerProviderReceiptSchema.parse(
              call.providerResult,
            );
            const prior = knownCalls.indexOf(call);
            const inputTokens = receipt.usage.inputTokens.total ?? null,
              outputTokens = receipt.usage.outputTokens.total ?? null;
            return {
              kind:
                voiceoverGeneration.attempts[prior]?.kind ??
                ("initial" as const),
              finishReason: receipt.finishReason.unified,
              usage: {
                inputTokens,
                outputTokens,
                cachedTokens: receipt.usage.inputTokens.cacheRead ?? null,
                totalTokens: sum([inputTokens, outputTokens]),
              },
            };
          });
          const settledGeneration = {
            finishReason: voiceoverGeneration.finishReason,
            attempts,
            usage: {
              inputTokens: sum(attempts.map((item) => item.usage.inputTokens)),
              outputTokens: sum(
                attempts.map((item) => item.usage.outputTokens),
              ),
              cachedTokens: sum(
                attempts.map((item) => item.usage.cachedTokens),
              ),
              totalTokens: sum(attempts.map((item) => item.usage.totalTokens)),
            },
          };
          let anchor = source;
          const prepared = JSON.parse(
            frozen.facets.__scriptDraft ?? "null",
          ) as {
            nodeInput?: {
              targetDurationSeconds?: number;
            };
          } | null;
          let result: WorkerStructuredResult = buildScriptFallbackResult({
            voiceover,
            voiceoverGeneration: settledGeneration,
            skillSnapshot: frozen.skillSnapshot,
            nodeInput: prepared?.nodeInput ?? {},
            reason,
          });
          // 完整生成已保存但尚未提交时，保留其真实分镜，不能倒退成基础稿。
          for (const call of [...calls].reverse()) {
            if (call.status !== "settled" || !call.resultText || call.resultRef)
              continue;
            let parsed: ReturnType<typeof workerStructuredResultSchema.parse>;
            try {
              parsed = workerStructuredResultSchema.parse(
                JSON.parse(call.resultText),
              );
            } catch {
              continue;
            }
            const script = scriptDraftSchema.safeParse(parsed.object);
            if (
              script.success &&
              script.data.shots.map((shot) => shot.口播).join("") ===
                voiceover &&
              parsed.validation
            ) {
              anchor = call;
              result = parsed;
              break;
            }
          }
          if (anchor.resultRef) return false;
          const projected = deps.projectCandidate(context, {
            taskType: business.taskType,
            inputData: business.inputData,
            text: JSON.stringify(result.object),
            structuredResult: result,
            frozenInput: frozen,
          });
          const resultId = `ai-result:${anchor.id}`;
          await tx
            .insert(aiTaskResults)
            .values({
              id: resultId,
              executionCallId: anchor.id,
              aiTaskId: business.id,
              resultType: projected.resultType,
              artifactId: projected.artifactId ?? null,
              knowledgeItemId: projected.knowledgeItemId ?? null,
              assetId: projected.assetId ?? null,
              resultData: {
                ...projected.resultData,
                executionGeneration: result.generation,
                executionValidation: result.validation ?? null,
              },
            });
          await tx
            .update(executionCalls)
            .set({
              resultText: JSON.stringify(result),
              resultRef: resultId,
              updatedAt: stamp,
            })
            .where(eq(executionCalls.id, anchor.id));
          await tx
            .update(aiTasks)
            .set({
              status: "awaiting_confirmation",
              completedAt: null,
              errorMessage: null,
              leaseOwner: null,
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(aiTasks.id, business.id));
          await tx
            .update(executionTasks)
            .set({
              status:
                result.validation?.status === "valid" ? "succeeded" : "partial",
              leaseOwner: null,
              leaseExpiresAt: null,
              heartbeatAt: null,
              retryAt: null,
              retryOfCallId: null,
              lastErrorCode: null,
              lastErrorMessage: null,
              updatedAt: stamp,
            })
            .where(eq(executionTasks.id, task.id));
          return true;
        },
      );
    },
    async recoverDue() {
      let cursor: string | undefined;
      for (;;) {
        const rows = await db
          .select()
          .from(executionTasks)
          .where(
            and(
              eq(executionTasks.kind, "ai_task"),
              inArray(executionTasks.status, [
                "running",
                "queued",
                "retry_wait",
              ]),
              lte(executionTasks.deadlineAt, now()),
              ...(cursor ? [gt(executionTasks.id, cursor)] : []),
            ),
          )
          .orderBy(asc(executionTasks.id))
          .limit(50);
        if (!rows.length) return;
        for (const row of rows) {
          if (row.attempt <= 0 || !row.fenceToken) continue;
          try {
            await service.finalize({
              executionTaskId: row.id,
              attempt: row.attempt,
              fenceToken: row.fenceToken,
            });
          } catch (error) {
            // 单任务校验、投影和旧租约错误不能阻断其他队列；扫描DB故障仍由外层抛出。
            try {
              deps.onRecoveryError?.({ executionTaskId: row.id, error });
            } catch {
              /* 日志接收者失败不影响其他任务恢复。 */
            }
          }
        }
        cursor = rows.at(-1)!.id;
      }
    },
  };
  return service;
}
