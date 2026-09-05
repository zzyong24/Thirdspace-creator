import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  and,
  eq,
  aiTasks,
  aiTaskResults,
  executionTasks,
  executionCalls,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  structuredGenerationInputSchema,
  workerStructuredResultSchema,
} from "@creatoros/contract/execution-worker";
import { scriptDraftSchema } from "@creatoros/ai-worker";
import { projectScriptDraftCandidate } from "@creatoros/backend/modules/ai-runtime";
import { ConflictError } from "./ai.errors";
/** 只读真实结算与冻结上下文；公开展示字段不能授权partial采纳。 */
export async function assertScriptPartialAdoptable(
  db: Db,
  context: RequestContext,
  input: {
    taskId: string;
    candidateId: string;
  },
): Promise<void> {
  const fail = () =>
    new ConflictError("该部分脚本缺少完整、可核验的执行结果，不能采纳");
  if (!context.accountId) throw fail();
  const [row] = await db
    .select({
      task: aiTasks,
      candidate: aiTaskResults,
      execution: executionTasks,
      call: executionCalls,
    })
    .from(aiTasks)
    .innerJoin(
      aiTaskResults,
      and(
        eq(aiTaskResults.aiTaskId, aiTasks.id),
        eq(aiTaskResults.id, input.candidateId),
      ),
    )
    .innerJoin(executionTasks, eq(executionTasks.id, aiTasks.executionTaskId))
    .innerJoin(
      executionCalls,
      and(
        eq(executionCalls.id, aiTaskResults.executionCallId),
        eq(executionCalls.executionTaskId, executionTasks.id),
      ),
    )
    .where(
      and(
        eq(aiTasks.id, input.taskId),
        eq(aiTasks.userId, context.userId),
        eq(aiTasks.accountId, context.accountId),
        eq(executionTasks.userId, context.userId),
        eq(executionTasks.accountId, context.accountId),
      ),
    );
  if (
    !row ||
    row.task.taskType !== "script.draft" ||
    row.candidate.resultType !== "artifact_version" ||
    !row.candidate.artifactId ||
    row.candidate.artifactId !==
      (row.task.inputData as { artifactId?: unknown }).artifactId ||
    row.execution.kind !== "ai_task" ||
    row.execution.ownerType !== "ai_task" ||
    row.execution.ownerId !== row.task.id ||
    !["partial", "succeeded"].includes(row.execution.status) ||
    row.call.status !== "settled" ||
    row.call.resultRef !== row.candidate.id
  )
    throw fail();
  try {
    const frozen = structuredGenerationInputSchema.parse(
      (
        row.execution.payload as {
          modelInput?: unknown;
        }
      ).modelInput,
    );
    if (
      frozen.skillId !== "script.draft" ||
      frozen.skillSnapshot.userId !== context.userId ||
      frozen.skillSnapshot.accountId !== context.accountId
    )
      throw fail();
    const result = workerStructuredResultSchema.parse(
      JSON.parse(row.call.resultText ?? "null"),
    );
    if (result.validation?.status !== "partial") throw fail();
    const object = z
      .object({
        shots: scriptDraftSchema.shape.shots,
        pipelineMetadata: z.record(z.string(), z.json()),
      })
      .strict()
      .parse(result.object);
    const skills = frozen.skillSnapshot.skills.filter(
      (s) => s.skillId === "script.draft",
    );
    if (skills.length !== 1) throw fail();
    const payload =
      frozen.facets.__scriptDraft === undefined
        ? {}
        : z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(frozen.facets.__scriptDraft));
    if (row.call.kind !== "model") {
      const initial = z
        .object({ storyboardAttemptCount: z.number().int().positive() })
        .parse(payload.initialVoiceover);
      if (
        row.call.kind !== "tool" ||
        row.call.operationKey !== `${frozen.operationKey}/frozen-fallback` ||
        result.generation.finishReason !== "deterministic_fallback" ||
        !initial.storyboardAttemptCount
      )
        throw fail();
    }
    // SEMANTIC_BOUNDARY_ALLOW: 哈希仅验证已冻结完整口播逐字保留，不判断创作质量。
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const spokenHash = hash(object.shots.map((shot) => shot.口播).join(""));
    if (payload.initialVoiceover !== undefined) {
      const initial = z
        .object({
          voiceover: z.string().min(1),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(payload.initialVoiceover);
      if (
        hash(initial.voiceover) !== initial.sha256 ||
        spokenHash !== initial.sha256
      )
        throw fail();
    }
    const voiceoverHash = object.pipelineMetadata.voiceoverSha256;
    if (voiceoverHash !== undefined && voiceoverHash !== "") {
      if (
        typeof voiceoverHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(voiceoverHash) ||
        voiceoverHash !== spokenHash
      )
        throw fail();
    }
    const sourceMetadata =
      frozen.facets.__scriptSources === undefined
        ? []
        : z
            .array(z.record(z.string(), z.unknown()))
            .parse(JSON.parse(frozen.facets.__scriptSources));
    const expected = projectScriptDraftCandidate({
      artifactId: row.candidate.artifactId,
      shots: object.shots,
      generation: result.generation,
      validation: result.validation,
      accountId: context.accountId,
      effectiveSkill: skills[0]!,
      pipelineMetadata: object.pipelineMetadata,
      sourceMetadata: sourceMetadata as Parameters<
        typeof projectScriptDraftCandidate
      >[0]["sourceMetadata"],
    }).resultData;
    const actual = z
      .record(z.string(), z.unknown())
      .parse(row.candidate.resultData);
    if (
      !isDeepStrictEqual(actual.sections, object.shots) ||
      !isDeepStrictEqual(actual.usage, result.generation.usage) ||
      !isDeepStrictEqual(actual.sourceSnapshots ?? [], sourceMetadata)
    )
      throw fail();
    for (const [key, value] of Object.entries(expected ?? {})) {
      if (["canAdopt", "validationStatus", "validationErrors"].includes(key))
        continue;
      if (!isDeepStrictEqual(actual[key], value)) throw fail();
    }
    if (
      !isDeepStrictEqual(actual.executionGeneration, result.generation) ||
      !isDeepStrictEqual(actual.executionValidation, result.validation)
    )
      throw fail();
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    throw fail();
  }
}
