import { findGenerationFailure } from "./generation-error";
import {scriptWorkerPayloadSchema,buildDeterministicStoryboard,reanchorWhitespaceOnly,firstMismatchIndex,buildScriptFallbackResult} from "./script-fallback";
import { createHash } from "node:crypto";
import type { LanguageModel } from "ai";
import {
  getActiveEffectiveSkillSnapshot,
  getEffectiveSkill,
} from "../prompt/effective-skill-runtime";
import { runScriptNode, type ScriptShot } from "../nodes/script-node";
import {
  runVoiceoverComposeNode,
  runStoryboardSegmentNode,
} from "../nodes/script-pipeline";
import { generationFailure } from "./generation-error";
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
  const input = scriptWorkerPayloadSchema.parse(raw);
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
  if(historicalAttempts)return buildScriptFallbackResult({voiceover,voiceoverGeneration:composed.generation,skillSnapshot:active,nodeInput:input.nodeInput,reason:"historical_attempts",storyboardAttempts:attempts});
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
      const knownFailure=findGenerationFailure(error);
      if(knownFailure)throw knownFailure;
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
