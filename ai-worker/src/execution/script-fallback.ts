import { createHash } from "node:crypto";
import { z } from "zod";
import {
  workerStructuredResultSchema,
  workerSkillSnapshotSchema,
  type WorkerStructuredResult,
  type structuredGenerationInputSchema,
} from "@creatoros/contract/execution-worker";
import type { EffectiveSkillSnapshotV1 } from "../prompt/effective-skill-types";
import type { ScriptShot } from "../nodes/script-node";
const optionalText = z.string().optional();
export const scriptWorkerPayloadSchema = z
  .object({
    nodeInput: z
      .object({
        positioningBrief: z.string(),
        learningsBrief: optionalText,
        knowledgeBrief: optionalText,
        projectBriefHardBrief: optionalText,
        benchmarkRefBrief: optionalText,
        projectIntelligenceBrief: optionalText,
        topicTitle: optionalText,
        topicAngle: optionalText,
        extraBrief: optionalText,
        sourceInstruction: optionalText,
        sourceMaterialsBrief: optionalText,
        targetDurationSeconds: z.number().positive().optional(),
        orientation: optionalText,
        thesisBrief: optionalText,
        contractBrief: optionalText,
        outlineBrief: optionalText,
        userMaterialHardBrief: optionalText,
        userMaterialRefBrief: optionalText,
        assetsBrief: optionalText,
      })
      .strict(),
    initialVoiceover: z
      .object({
        voiceover: z.string().min(1),
        centralClaim: optionalText,
        audienceOldBelief: optionalText,
        sha256: z.string(),
        charCount: z.number().int().nonnegative(),
        voiceoverGeneration: workerStructuredResultSchema.shape.generation,
        storyboardAttemptCount: z.number().int().min(0).max(2),
      })
      .strict()
      .optional(),
  })
  .strict();
function compactWhitespace(value: string): string {
  return value.replace(/\s/gu, "");
}

/**
 * 仅修复模型把原文段间换行/空格吞掉或挪位的协议漂移。
 * SEMANTIC_BOUNDARY_ALLOW: 逐个非空白字符必须完全相同；这里只把冻结原文的空白
 * 重新分配回原分镜边界，不做相似度、纠错、改写或内容判断。
 */
export function reanchorWhitespaceOnly(
  voiceover: string,
  shots: readonly ScriptShot[],
): ScriptShot[] | null {
  if (
    shots.length === 0 ||
    compactWhitespace(shots.map((shot) => shot.口播).join("")) !==
      compactWhitespace(voiceover)
  ) {
    return null;
  }
  let cursor = 0;
  const reanchored: ScriptShot[] = [];
  for (const [index, shot] of shots.entries()) {
    if (index === shots.length - 1) {
      reanchored.push({ ...shot, 口播: voiceover.slice(cursor) });
      cursor = voiceover.length;
      continue;
    }
    const targetNonWhitespace = compactWhitespace(shot.口播).length;
    let consumed = 0;
    const start = cursor;
    while (cursor < voiceover.length && consumed < targetNonWhitespace) {
      if (!/\s/u.test(voiceover[cursor]!)) consumed += 1;
      cursor += 1;
    }
    while (cursor < voiceover.length && /\s/u.test(voiceover[cursor]!)) {
      cursor += 1;
    }
    reanchored.push({ ...shot, 口播: voiceover.slice(start, cursor) });
  }
  return cursor === voiceover.length ? reanchored : null;
}

function splitFrozenVoiceover(voiceover: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  for (let index = 0; index < voiceover.length; index += 1) {
    const length = index - start + 1;
    const preferredBoundary = /[。！？!?；;\n]/u.test(voiceover[index]!);
    if ((preferredBoundary && length >= 24) || length >= 110) {
      let end = index + 1;
      while (end < voiceover.length && /\s/u.test(voiceover[end]!)) end += 1;
      chunks.push(voiceover.slice(start, end));
      start = end;
      index = end - 1;
    }
  }
  if (start < voiceover.length) chunks.push(voiceover.slice(start));
  return chunks.length > 0 ? chunks : [voiceover];
}

/**
 * 分镜模型不可用或真实改写了冻结口播时的最终安全底座。
 * SEMANTIC_BOUNDARY_ALLOW: 代码只按字符与标点确定性切片，并填入不含新事实的通用制作字段；
 * 不判断内容优劣、不匹配素材、不创作新口播，所有口播字符均直接来自冻结原文。
 */
export function buildDeterministicStoryboard(
  voiceover: string,
  targetDurationSeconds?: number,
): ScriptShot[] {
  const chunks = splitFrozenVoiceover(voiceover);
  const totalWeight = Math.max(
    1,
    chunks.reduce((sum, chunk) => sum + compactWhitespace(chunk).length, 0),
  );
  const requestedTotalSeconds =
    typeof targetDurationSeconds === "number" &&
    Number.isFinite(targetDurationSeconds) &&
    targetDurationSeconds > 0
      ? targetDurationSeconds
      : Math.max(3, Math.ceil(totalWeight / 4));
  // T-835：基础分镜不能为了强塞进过短目标时长而生成重叠或 0 秒镜头。
  // 每镜至少 1 秒；目标时长不足时诚实延长到镜头数，剩余秒数再按口播字数分配。
  const totalSeconds = Math.max(
    chunks.length,
    Math.ceil(requestedTotalSeconds),
  );
  const extraSeconds = totalSeconds - chunks.length;
  let elapsedWeight = 0;
  let allocatedExtraSeconds = 0;
  let elapsedSeconds = 0;
  return chunks.map((chunk, index) => {
    const startSeconds = elapsedSeconds;
    elapsedWeight += compactWhitespace(chunk).length;
    const cumulativeExtraSeconds =
      index === chunks.length - 1
        ? extraSeconds
        : Math.round((elapsedWeight / totalWeight) * extraSeconds);
    const endSeconds =
      startSeconds + 1 + cumulativeExtraSeconds - allocatedExtraSeconds;
    allocatedExtraSeconds = cumulativeExtraSeconds;
    elapsedSeconds = endSeconds;
    const subtitle = chunk.trim();
    return {
      role:
        chunks.length === 1
          ? "body"
          : index === 0
            ? "hook"
            : index === chunks.length - 1
              ? "cta"
              : "body",
      口播: chunk,
      画面: "主播口播，辅以与本段原文一致的画面",
      字幕: subtitle.length > 32 ? `${subtitle.slice(0, 31)}…` : subtitle,
      时长: `${startSeconds}-${endSeconds}s`,
      visual: {
        description: "基础分镜：画面只承接本段冻结口播，不引入新事实",
        assetRefs: [],
        missing: [],
      },
    };
  });
}

export function firstMismatchIndex(left: string, right: string): number | null {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return left.length === right.length ? null : length;
}

export interface ScriptFallbackInput {
  voiceover: string;
  voiceoverGeneration: WorkerStructuredResult["generation"];
  skillSnapshot:
    z.infer<typeof workerSkillSnapshotSchema> | EffectiveSkillSnapshotV1;
  nodeInput: { targetDurationSeconds?: number };
  reason: "historical_attempts" | "budget_exhausted" | "deadline";
  storyboardAttempts?: number;
}
export type ScriptFallbackResult = WorkerStructuredResult & {
  object: { shots: ScriptShot[]; pipelineMetadata: Record<string, unknown> };
};
/** 纯同步保真投影，只有冻结原文与版本证据，不读取模型或外部状态。 */
export function buildScriptFallbackResult(
  input: ScriptFallbackInput,
): ScriptFallbackResult {
  const voiceover = z.string().min(1).max(200000).parse(input.voiceover);
  if (!voiceover.trim()) throw new Error("冻结口播为空");
  const generation = workerStructuredResultSchema.shape.generation.parse(
    input.voiceoverGeneration,
  );
  const snapshot = workerSkillSnapshotSchema.parse(input.skillSnapshot);
  const compose = snapshot.skills.find(
    (s) => s.skillId === "script.voiceover.compose",
  );
  const storyboard = snapshot.skills.find(
    (s) => s.skillId === "script.storyboard.segment",
  );
  if (!compose || !storyboard) throw new Error("基础分镜缺少冻结两阶段Skill");
  const attempts = z
    .number()
    .int()
    .min(0)
    .max(2)
    .parse(input.storyboardAttempts ?? 0);
  const reason = z
    .enum(["historical_attempts", "budget_exhausted", "deadline"])
    .parse(input.reason);
  const shots = buildDeterministicStoryboard(
    voiceover,
    input.nodeInput.targetDurationSeconds,
  );
  const violation = {
    code: "OUTPUT_INCOMPLETE",
    path: "shots[].口播",
    message:
      reason === "budget_exhausted"
        ? "调用预算已用完，已保留完整口播并生成基础分镜。"
        : reason === "deadline"
          ? "执行时间已到，已保留完整口播并生成基础分镜。"
          : "历史分镜调用缺少可重放事实，已保留完整口播并生成基础分镜。",
  };
  return workerStructuredResultSchema.parse({
    object: {
      shots,
      pipelineMetadata: {
        generationPipeline: "voiceover_storyboard_v1",
        voiceoverSha256: createHash("sha256").update(voiceover).digest("hex"),
        storyboardRecovery: {
          mode: "deterministic_fallback",
          reason,
          firstMismatchIndex: null,
          expectedLength: voiceover.length,
          actualLength: null,
        },
        generationSkills: [compose, storyboard].map((s) => ({
          skillId: s.skillId,
          baseVersion: s.baseVersion,
          overlayVersion: s.overlayVersion,
        })),
      },
    },
    generation: { ...generation, finishReason: "deterministic_fallback" },
    validation: {
      status: "partial",
      errors: [violation],
      policySnapshot: {
        policy: storyboard.effective.completionPolicy ?? {
          schemaVersion: 1,
          minSegments: 1,
          maxSegments: null,
          requiredSequence: [],
          repairAttempts: 0,
        },
        adapter: storyboard.effective.completionPolicyAdapter ?? {
          id: "script.draft.shots",
          version: "1",
        },
      },
      originalSegmentCount: shots.length,
      finalSegmentCount: shots.length,
      repairAttemptsUsed: attempts,
      repairReasons: [violation],
    },
  }) as ScriptFallbackResult;
}
/** 只识别冻结的两阶段历史尝试；legacy覆盖仍走其原有执行路径。 */
export function getHistoricalScriptFallback(
  input: z.infer<typeof structuredGenerationInputSchema>,
): ScriptFallbackResult | null {
  if (input.skillId !== "script.draft" || input.facets.__scriptVerbatim)
    return null;
  const draft = input.skillSnapshot.skills.find(
    (s) => s.skillId === "script.draft",
  );
  if (
    !draft ||
    draft.overlayVersion !== null ||
    !["script.voiceover.compose", "script.storyboard.segment"].every((id) =>
      input.skillSnapshot.skills.some((s) => s.skillId === id),
    )
  )
    return null;
  const parsed = scriptWorkerPayloadSchema.parse(
    JSON.parse(input.facets.__scriptDraft ?? "null"),
  );
  const initial = parsed.initialVoiceover;
  if (!initial || initial.storyboardAttemptCount === 0) return null;
  if (
    initial.voiceover.length !== initial.charCount ||
    createHash("sha256").update(initial.voiceover).digest("hex") !==
      initial.sha256
  )
    throw new Error("冻结口播校验失败");
  return buildScriptFallbackResult({
    voiceover: initial.voiceover,
    voiceoverGeneration: initial.voiceoverGeneration,
    skillSnapshot: input.skillSnapshot,
    nodeInput: parsed.nodeInput,
    reason: "historical_attempts",
    storyboardAttempts: initial.storyboardAttemptCount,
  });
}
