import { createHash } from "node:crypto";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { workerStructuredResultSchema } from "@creatoros/contract/execution-worker";
import {
  getActiveEffectiveSkillSnapshot,
  getEffectiveSkill,
} from "../prompt/effective-skill-runtime";
import { runScriptNode, type ScriptShot } from "../nodes/script-node";
import {
  runVoiceoverComposeNode,
  runStoryboardSegmentNode,
} from "../nodes/script-pipeline";
import { GenerationFailure, generationFailure } from "./generation-error";
const optionalText = z.string().optional();
const payloadSchema = z
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
function reanchorWhitespaceOnly(
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
function buildDeterministicStoryboard(
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

function firstMismatchIndex(left: string, right: string): number | null {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return left.length === right.length ? null : length;
}

export async function runScriptWorkerPipeline(
  raw: unknown,
  deps: {
    model: LanguageModel;
    signal: AbortSignal;
    maxOutputTokens: number;
    onVoiceover?: (
      value: Awaited<ReturnType<typeof runVoiceoverComposeNode>>,
    ) => Promise<void>;
  },
) {
  const input = payloadSchema.parse(raw);
  const { model, signal, maxOutputTokens } = deps;
  signal.throwIfAborted();
  const initial = input.initialVoiceover;
  if (
    initial &&
    (initial.voiceover.length !== initial.charCount ||
      createHash("sha256").update(initial.voiceover).digest("hex") !==
        initial.sha256)
  )
    throw new Error("冻结口播校验失败");
  const active = getActiveEffectiveSkillSnapshot();
  const draft = getEffectiveSkill("script.draft");
  const ids = new Set(active.skills.map((s) => s.skillId));
  if (
    draft.overlayVersion !== null ||
    !ids.has("script.voiceover.compose") ||
    !ids.has("script.storyboard.segment")
  ) {
    const result = await runScriptNode({
      ...input.nodeInput,
      model,
      signal,
      maxOutputTokens,
    });
    signal.throwIfAborted();
    return {
      object: {
        shots: result.shots,
        pipelineMetadata: {} as Record<string, unknown>,
      },
      generation: result.generation,
      validation: result.validation,
    };
  }
  const voiceoverSkill = getEffectiveSkill("script.voiceover.compose"),
    storyboardSkill = getEffectiveSkill("script.storyboard.segment");
  const composed = initial
    ? {
        voiceover: initial.voiceover,
        centralClaim: initial.centralClaim ?? "",
        audienceOldBelief: initial.audienceOldBelief ?? "",
        generation: initial.voiceoverGeneration,
      }
    : await runVoiceoverComposeNode({
        ...input.nodeInput,
        model,
        signal,
        maxOutputTokens,
      });
  signal.throwIfAborted();
  if (!initial && deps.onVoiceover) {
    await deps.onVoiceover(composed);
    signal.throwIfAborted();
  }
  const voiceover = composed.voiceover,
    sha256 = createHash("sha256").update(voiceover).digest("hex");
  let storyboard:
    Awaited<ReturnType<typeof runStoryboardSegmentNode>> | undefined;
  let recovery: Record<string, unknown> | undefined;
  let attempts = initial?.storyboardAttemptCount ?? 0;
  let retryGuidance: string | undefined;
  // 历史尝试没有逐调用证据，不能靠新分镜请求猜测是否重做。
  const historicalAttempts = attempts > 0;
  while (!historicalAttempts && attempts < 2) {
    attempts++;
    try {
      storyboard = await runStoryboardSegmentNode({
        model,
        voiceover,
        voiceoverSha256: sha256,
        storyboardAttempt: attempts,
        orientation: input.nodeInput.orientation,
        targetDurationSeconds: input.nodeInput.targetDurationSeconds,
        assetsBrief: input.nodeInput.assetsBrief,
        retryGuidance,
        signal,
        maxOutputTokens,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GenerationFailure) throw error;
      const failure = generationFailure(error, false);
      if (
        failure.outcome === "retry_wait" ||
        failure.outcome === "waiting_user"
      )
        throw failure;
      recovery = {
        mode: "deterministic_fallback",
        reason: "model_error",
        firstMismatchIndex: null,
        expectedLength: voiceover.length,
        actualLength: null,
      };
      break;
    }
    signal.throwIfAborted();
    const joined = storyboard.shots.map((s) => s.口播).join("");
    if (joined === voiceover) break;
    const anchored = reanchorWhitespaceOnly(voiceover, storyboard.shots);
    if (anchored) {
      storyboard = { ...storyboard, shots: anchored };
      recovery = {
        mode: "whitespace_reanchored",
        reason: "whitespace_only",
        firstMismatchIndex: firstMismatchIndex(voiceover, joined),
        expectedLength: voiceover.length,
        actualLength: joined.length,
      };
      break;
    }
    recovery = {
      mode: "deterministic_fallback",
      reason: "voiceover_mismatch",
      firstMismatchIndex: firstMismatchIndex(voiceover, joined),
      expectedLength: voiceover.length,
      actualLength: joined.length,
    };
    storyboard = undefined;
    retryGuidance =
      "上次逐字切分失败：shots[].口播 无分隔拼接后与冻结口播不一致。只重新切分原文，不得改任何字符。";
  }
  if (!storyboard) {
    signal.throwIfAborted();
    const violation = {
      code: "OUTPUT_INCOMPLETE" as const,
      path: "shots[].口播",
      message:
        "分镜建议未通过逐字保真校验，已自动使用冻结原文生成基础分镜；口播内容完整保留。",
    };
    const shots = buildDeterministicStoryboard(
      voiceover,
      input.nodeInput.targetDurationSeconds,
    );
    const policy = storyboardSkill.effective.completionPolicy ?? {
      schemaVersion: 1 as const,
      minSegments: 1,
      maxSegments: null,
      requiredSequence: [],
      repairAttempts: 0,
    };
    const adapter = storyboardSkill.effective.completionPolicyAdapter ?? {
      id: "script.draft.shots",
      version: "1",
    };
    recovery ??= {
      mode: "deterministic_fallback",
      reason: "voiceover_mismatch",
      firstMismatchIndex: null,
      expectedLength: voiceover.length,
      actualLength: null,
    };
    storyboard = {
      shots,
      generation: {
        finishReason: "deterministic_fallback",
        usage: {
          inputTokens: null,
          outputTokens: null,
          cachedTokens: null,
          totalTokens: null,
        },
        attempts: [],
      },
      validation: {
        status: "partial",
        errors: [violation],
        policySnapshot: { policy, adapter },
        originalSegmentCount: shots.length,
        finalSegmentCount: shots.length,
        repairAttemptsUsed: attempts,
        repairReasons: [violation],
      },
    };
  }
  const sum = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const left = composed.generation.usage,
    right = storyboard.generation.usage;
  signal.throwIfAborted();
  return {
    object: {
      shots: storyboard.shots,
      pipelineMetadata: {
        generationPipeline: "voiceover_storyboard_v1",
        voiceoverSha256: sha256,
        ...(recovery ? { storyboardRecovery: recovery } : {}),
        generationSkills: [voiceoverSkill, storyboardSkill].map((s) => ({
          skillId: s.skillId,
          baseVersion: s.baseVersion,
          overlayVersion: s.overlayVersion,
        })),
      },
    },
    generation: {
      finishReason: storyboard.generation.finishReason,
      usage: {
        inputTokens: sum(left.inputTokens, right.inputTokens),
        outputTokens: sum(left.outputTokens, right.outputTokens),
        cachedTokens: sum(left.cachedTokens, right.cachedTokens),
        totalTokens: sum(left.totalTokens, right.totalTokens),
      },
      attempts: [
        ...composed.generation.attempts,
        ...storyboard.generation.attempts,
      ],
    },
    validation: storyboard.validation,
  };
}
