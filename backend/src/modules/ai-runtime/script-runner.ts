import { createHash } from "node:crypto";
import { scriptDraftInputFingerprint, effectiveVersion, readScriptDraftCheckpoint, type ScriptDraftCheckpoint } from "./script-checkpoint";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ScriptShot } from "@creatoros/ai-worker";
import type { ContextDeps } from "./creative-context";
import { prepareScriptDraftContext } from "./script-preparation";
import { projectScriptDraftCandidate, projectVerbatimScriptCandidate } from "./script-candidate-projection";
export { readFrozenScriptSources } from "./script-preparation";
import {
  formatErrorDiagnostic,
  observableModelKey,
  safeModelFailureMessage,
} from "./error-diagnostics";

export type { ScriptShot };

// 分镜脚本 runner (script.draft node) —— 写文案的旗舰例子,跑在 **Vercel AI SDK** 上(弃旧 LlmCompleter)。
// 提示词走外置模板 script.draft(脊柱-1 解耦):写文案 = 模板 ⊕ {定位,过往爆款,选题,横竖屏}。
// AI 逻辑在 @creatoros/ai-worker 的 runScriptNode(产 ScriptShot[] + 步骤事件);本 runner 只负责
// 装配上下文 / 解析 model / 落候选(artifact_version,复用既有 confirm 分支 append 新 ArtifactVersion)。

export interface ScriptDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface ScriptTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
  retryOfTaskId?: string;
}

function addUsage(
  left: ScriptDraftCheckpoint["voiceoverGeneration"] extends infer T
    ? T extends { usage: infer U }
      ? U
      : never
    : never,
  right: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  },
) {
  const add = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    inputTokens: add(left.inputTokens, right.inputTokens),
    outputTokens: add(left.outputTokens, right.outputTokens),
    cachedTokens: add(left.cachedTokens, right.cachedTokens),
    totalTokens: add(left.totalTokens, right.totalTokens),
  };
}

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
  const totalSeconds = Math.max(chunks.length, Math.ceil(requestedTotalSeconds));
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

export async function runScriptDraft(
  ctx: RequestContext,
  task: ScriptTask,
  deps: ScriptDeps,
): Promise<void> {
  let resolvedSpec: ModelSpec | null = null;
  try {
    await deps.ai.markRunning(ctx, task.id);
    const prepared = await prepareScriptDraftContext(ctx, task, deps);
    const { artifactId } = prepared;
    if (prepared.mode === "verbatim") {
      const { sourceText, sourceRef, sourceSha256: actualHash } = prepared;
      // [T-727] 原文保真是确定性数据恢复，不是创作生成：不得装配 Brief/定位、不得解析模型、
      // 不得让 completion policy “修复”原文。AI 仍只产候选，用户采纳后才追加版本。
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "validation",
        text: JSON.stringify({
          taskId: task.id,
          draftMode: "verbatim",
          sourceRef,
          sourceLength: sourceText.length,
          sourceSha256: actualHash,
          validationStatus: "valid",
        }),
        toolCalls: [],
      });
      await deps.ai.recordCandidate(ctx, task.id, projectVerbatimScriptCandidate(prepared));
      return;
    }
    const { frozenSources, fingerprintContext: context } = prepared;
    // Vercel AI SDK 路径:解析 model(按 capability) + 跑 ai-worker 写文案节点(外置 script.draft 模板),
    // 步骤事件落 ai_task_steps(窗口步骤日志)。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "script.draft");
    resolvedSpec = spec;
    console.info(
      `[script-runner] task=${task.id} capability=script.draft apiFormat=${("engine" in spec ? spec.protocolKind : spec.apiFormat)} ` +
        `model=${("engine" in spec ? "codex" : observableModelKey(spec))} endpoint=${!("engine" in spec) && spec.baseUrl ? "custom" : "official"}`,
    );
    const {
      modelFor,
      runScriptNode,
      runStoryboardSegmentNode,
      runVoiceoverComposeNode,
      getActiveEffectiveSkillSnapshot,
      getEffectiveSkill,
    } = await import("@creatoros/ai-worker");
    const activeSnapshot = getActiveEffectiveSkillSnapshot();
    const effectiveSkill = getEffectiveSkill("script.draft");
    const snapshotSkillIds = new Set(
      activeSnapshot.skills.map((skill) => skill.skillId),
    );
    const hasTwoStageSkills =
      snapshotSkillIds.has("script.voiceover.compose") &&
      snapshotSkillIds.has("script.storyboard.segment");
    const useLegacyPipeline =
      effectiveSkill.overlayVersion !== null || !hasTwoStageSkills;
    const model = modelFor(spec);
    const nodeInput = { ...prepared.nodeInput, model };
    let pipelineMetadata: Record<string, unknown> = {};
    const result = useLegacyPipeline
      ? await runScriptNode({
          ...nodeInput,
          onStep: async (e) => {
            const terminal = JSON.stringify({
              taskId: task.id,
              accountId: activeSnapshot.accountId,groupId:activeSnapshot.groupId,
              skillId: effectiveSkill.skillId,
              baseVersion: effectiveSkill.baseVersion,
              overlayVersion: effectiveSkill.overlayVersion,
              completionPolicy: effectiveSkill.effective.completionPolicy,
              mode: effectiveSkill.overlayVersion
                ? "legacy_overlay_compat"
                : "legacy_snapshot_compat",
              finishReason: e.finishReason,
              ...(e.usage ? { usage: e.usage } : {}),
            });
            await deps.ai.recordStep(ctx, task.id, {
              stepNo: e.stepNo,
              kind: e.toolCalls.length > 0 ? "tool_call" : "step",
              text: `${e.text}\n${terminal}`,
              toolCalls: e.toolCalls,
            });
          },
        })
      : await (async () => {
          const voiceoverSkill = getEffectiveSkill("script.voiceover.compose");
          const storyboardSkill = getEffectiveSkill("script.storyboard.segment");
          const voiceoverSkillVersion = effectiveVersion(voiceoverSkill);
          const inputFingerprint = scriptDraftInputFingerprint({
            projectId: task.projectId,
            inputData: task.inputData,
            context,
            skills: activeSnapshot.skills
              .filter((skill) => skill.skillId.startsWith("script."))
              .map((skill) => ({
                skillId: skill.skillId,
                baseVersion: skill.baseVersion,
                overlayRevision: skill.overlayRevision,
                overlayVersion: skill.overlayVersion,
              })),
          });
          const checkpointTaskId = task.retryOfTaskId ?? task.id;
          const sourceRuntime = await deps.ai.getTaskRuntimeData(
            ctx,
            checkpointTaskId,
          );
          let checkpoint = readScriptDraftCheckpoint(sourceRuntime, {
            inputFingerprint,
            voiceoverSkillVersion,
          });
          if (
            checkpoint &&
            checkpoint.stage !== "voiceover_complete" &&
            !(task.retryOfTaskId && checkpoint.stage === "voiceover_failed")
          ) {
            throw new Error(
              "连续口播生成状态不完整，无法安全恢复，已停止重复调用模型。",
            );
          }

          if (!checkpoint || checkpoint.stage === "voiceover_failed") {
            const started: ScriptDraftCheckpoint = {
              schemaVersion: 1,
              inputFingerprint,
              stage: "voiceover_started",
              voiceoverSkillVersion,
              storyboardAttemptCount: 0,
            };
            await deps.ai.putScriptDraftCheckpoint(ctx, task.id, started);
            try {
              const voiceover = await runVoiceoverComposeNode({
                ...nodeInput,
                model,
              });
              const sha256 = createHash("sha256")
                .update(voiceover.voiceover)
                .digest("hex");
              checkpoint = {
                ...started,
                stage: "voiceover_complete",
                voiceover: voiceover.voiceover,
                centralClaim: voiceover.centralClaim,
                audienceOldBelief: voiceover.audienceOldBelief,
                charCount: voiceover.voiceover.length,
                sha256,
                voiceoverGeneration: {
                  finishReason: voiceover.generation.finishReason,
                  usage: voiceover.generation.usage,
                  attempts: voiceover.generation.attempts,
                },
              };
            } catch (error) {
              try {
                await deps.ai.putScriptDraftCheckpoint(ctx, task.id, {
                  ...started,
                  stage: "voiceover_failed",
                });
              } catch {
                /* 原始模型/断点错误优先 */
              }
              throw error;
            }
            // 模型已返回成功；保存失败或回执丢失不能改写成模型失败。
            // 重试只复用已落库的 complete；仍为 started 时保守停止重复生成。
            await deps.ai.putScriptDraftCheckpoint(ctx, task.id, checkpoint);
          } else if (checkpointTaskId !== task.id) {
            await deps.ai.putScriptDraftCheckpoint(ctx, task.id, checkpoint);
          }

          let frozen = checkpoint;
          if (
            frozen.stage !== "voiceover_complete" ||
            !frozen.voiceover ||
            !frozen.sha256 ||
            !frozen.voiceoverGeneration
          ) {
            throw new Error("连续口播断点不完整，无法进入制作分镜。");
          }
          const frozenVoiceover = frozen.voiceover;
          const frozenSha256 = frozen.sha256;
          const voiceoverGeneration = frozen.voiceoverGeneration;
          await deps.ai.recordStep(ctx, task.id, {
            stepNo: 1,
            kind: "step",
            text: JSON.stringify({
              taskId: task.id,
              skillId: voiceoverSkill.skillId,
              baseVersion: voiceoverSkill.baseVersion,
              overlayVersion: voiceoverSkill.overlayVersion,
              stage: "voiceover_complete",
              reused: checkpointTaskId !== task.id,
              charCount: frozen.charCount,
              sha256: frozenSha256,
              finishReason: voiceoverGeneration.finishReason,
              usage: voiceoverGeneration.usage,
            }),
            toolCalls: [],
          });

          let storyboardResult: Awaited<
            ReturnType<typeof runStoryboardSegmentNode>
          > | null = null;
          let storyboardRecovery:
            | {
                mode: "whitespace_reanchored" | "deterministic_fallback";
                reason: "whitespace_only" | "voiceover_mismatch" | "model_error";
                firstMismatchIndex: number | null;
                expectedLength: number;
                actualLength: number | null;
                diagnostic?: string;
              }
            | undefined;
          let retryGuidance: string | undefined;
          const storyboardDurationTarget =
            typeof task.inputData.targetDurationSeconds === "number" &&
            Number.isFinite(task.inputData.targetDurationSeconds) &&
            task.inputData.targetDurationSeconds > 0
              ? task.inputData.targetDurationSeconds
              : undefined;
          while (frozen.storyboardAttemptCount < 2) {
            frozen = {
              ...frozen,
              storyboardAttemptCount: frozen.storyboardAttemptCount + 1,
            };
            await deps.ai.putScriptDraftCheckpoint(ctx, task.id, frozen);
            try {
              storyboardResult = await runStoryboardSegmentNode({
                model,
                voiceover: frozenVoiceover,
                voiceoverSha256: frozenSha256,
                storyboardAttempt: frozen.storyboardAttemptCount,
                orientation: context.orientationHint || undefined,
                targetDurationSeconds: storyboardDurationTarget,
                assetsBrief: context.assetsBrief || undefined,
                retryGuidance,
              });
            } catch (error) {
              storyboardResult = null;
              storyboardRecovery = {
                mode: "deterministic_fallback",
                reason: "model_error",
                firstMismatchIndex: null,
                expectedLength: frozenVoiceover.length,
                actualLength: null,
                diagnostic: formatErrorDiagnostic(error),
              };
              break;
            }
            const joined = storyboardResult.shots
              .map((shot) => shot.口播)
              .join("");
            if (
              joined === frozenVoiceover &&
              createHash("sha256").update(joined).digest("hex") === frozenSha256
            ) {
              storyboardRecovery = undefined;
              break;
            }
            const reanchored = reanchorWhitespaceOnly(
              frozenVoiceover,
              storyboardResult.shots,
            );
            if (reanchored) {
              storyboardResult = { ...storyboardResult, shots: reanchored };
              storyboardRecovery = {
                mode: "whitespace_reanchored",
                reason: "whitespace_only",
                firstMismatchIndex: firstMismatchIndex(
                  frozenVoiceover,
                  joined,
                ),
                expectedLength: frozenVoiceover.length,
                actualLength: joined.length,
              };
              break;
            }
            storyboardRecovery = {
              mode: "deterministic_fallback",
              reason: "voiceover_mismatch",
              firstMismatchIndex: firstMismatchIndex(
                frozenVoiceover,
                joined,
              ),
              expectedLength: frozenVoiceover.length,
              actualLength: joined.length,
            };
            storyboardResult = null;
            retryGuidance =
              "上次逐字切分失败：shots[].口播 无分隔拼接后与冻结口播不一致。只重新切分原文，不得改任何字符。";
          }
          if (!storyboardResult) {
            const recoveryViolation = {
              code: "OUTPUT_INCOMPLETE" as const,
              path: "shots[].口播",
              message:
                "分镜建议未通过逐字保真校验，已自动使用冻结原文生成基础分镜；口播内容完整保留。",
            };
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
            const fallbackShots = buildDeterministicStoryboard(
              frozenVoiceover,
              storyboardDurationTarget,
            );
            storyboardRecovery ??= {
              mode: "deterministic_fallback",
              reason: "voiceover_mismatch",
              firstMismatchIndex: null,
              expectedLength: frozenVoiceover.length,
              actualLength: null,
            };
            storyboardResult = {
              shots: fallbackShots,
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
                errors: [recoveryViolation],
                policySnapshot: { policy, adapter },
                originalSegmentCount: fallbackShots.length,
                finalSegmentCount: fallbackShots.length,
                repairAttemptsUsed: frozen.storyboardAttemptCount,
                repairReasons: [recoveryViolation],
              },
            };
          }
          await deps.ai.recordStep(ctx, task.id, {
            stepNo: 2,
            kind: "step",
            text: JSON.stringify({
              taskId: task.id,
              skillId: storyboardSkill.skillId,
              baseVersion: storyboardSkill.baseVersion,
              overlayVersion: storyboardSkill.overlayVersion,
              stage: "storyboard_complete",
              storyboardAttemptCount: frozen.storyboardAttemptCount,
              voiceoverSha256: frozenSha256,
              finishReason: storyboardResult.generation.finishReason,
              usage: storyboardResult.generation.usage,
              ...(storyboardRecovery ? { storyboardRecovery } : {}),
            }),
            toolCalls: [],
          });
          pipelineMetadata = {
            generationPipeline: "voiceover_storyboard_v1",
            voiceoverSha256: frozenSha256,
            ...(storyboardRecovery ? { storyboardRecovery } : {}),
            generationSkills: [
              {
                skillId: voiceoverSkill.skillId,
                baseVersion: voiceoverSkill.baseVersion,
                overlayVersion: voiceoverSkill.overlayVersion,
              },
              {
                skillId: storyboardSkill.skillId,
                baseVersion: storyboardSkill.baseVersion,
                overlayVersion: storyboardSkill.overlayVersion,
              },
            ],
          };
          return {
            shots: storyboardResult.shots,
            steps: [],
            generation: {
              finishReason: storyboardResult.generation.finishReason,
              usage: addUsage(
                voiceoverGeneration.usage,
                storyboardResult.generation.usage,
              ),
              attempts: [
                ...voiceoverGeneration.attempts,
                ...storyboardResult.generation.attempts,
              ],
            },
            validation: storyboardResult.validation,
          };
        })();
    await deps.ai.recordCandidate(ctx, task.id, projectScriptDraftCandidate({
      artifactId,
      shots: result.shots,
      generation: result.generation,
      validation: result.validation,
      accountId: activeSnapshot.accountId,groupId:activeSnapshot.groupId,
      effectiveSkill,
      pipelineMetadata,
      sourceMetadata: frozenSources.metadata,
    }));
  } catch (err) {
    const channelManaged =
      (resolvedSpec && !("engine" in resolvedSpec) ? resolvedSpec.displayModelKey : undefined) === "channel-managed";
    const failureMessage = safeModelFailureMessage(err, resolvedSpec && !("engine" in resolvedSpec) ? resolvedSpec : null);
    const failure = err as {
      code?: unknown;
      violations?: Array<{ message?: unknown }>;
      originalSegmentCount?: unknown;
      finalSegmentCount?: unknown;
      evidence?: unknown;
    };
    // repair exhaustion 没有成功 step 回调，单独落一条真实终态验证日志；任何日志写失败
    // 都不能掩盖原错误，任务仍由 cancelTask 收尾且不产生 candidate。
    if (failure.code === "COMPLETION_POLICY_REPAIR_EXHAUSTED") {
      try {
        const { getActiveEffectiveSkillSnapshot, getEffectiveSkill } =
          await import("@creatoros/ai-worker");
        const activeSnapshot = getActiveEffectiveSkillSnapshot();
        const effectiveSkill = getEffectiveSkill("script.draft");
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: 1,
          kind: "validation",
          text: JSON.stringify({
            taskId: task.id,
            accountId: activeSnapshot.accountId,groupId:activeSnapshot.groupId,
            skillId: effectiveSkill.skillId,
            baseVersion: effectiveSkill.baseVersion,
            overlayVersion: effectiveSkill.overlayVersion,
            completionPolicy:
              effectiveSkill.effective.completionPolicy,
            validationStatus: "invalid",
            validationErrors: Array.isArray(failure.violations)
              ? failure.violations
                  .map((violation) =>
                    typeof violation.message === "string"
                      ? violation.message
                      : "",
                  )
                  .filter(Boolean)
              : [],
            canAdopt: false,
            originalSegmentCount: failure.originalSegmentCount ?? null,
            finalSegmentCount: failure.finalSegmentCount ?? null,
            generation: failure.evidence ?? null,
          }),
          toolCalls: [],
        });
      } catch {
        /* best-effort failure telemetry */
      }
    }
    try {
      await deps.ai.cancelTask(ctx, task.id, failureMessage);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[script-runner] draft failed task=${task.id} ${formatErrorDiagnostic(err, {
        omitMessage: channelManaged,
      })}`,
    );
  }
}
