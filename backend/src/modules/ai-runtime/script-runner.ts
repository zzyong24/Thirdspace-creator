import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ScriptShot } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
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

interface ScriptDraftCheckpoint extends Record<string, unknown> {
  schemaVersion: 1;
  inputFingerprint: string;
  stage: "voiceover_started" | "voiceover_failed" | "voiceover_complete";
  voiceover?: string;
  centralClaim?: string;
  audienceOldBelief?: string;
  charCount?: number;
  sha256?: string;
  voiceoverSkillVersion: string;
  storyboardAttemptCount: number;
  voiceoverGeneration?: {
    finishReason: string;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      cachedTokens: number | null;
      totalTokens: number | null;
    };
    attempts: Array<Record<string, unknown>>;
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function scriptDraftInputFingerprint(value: unknown): string {
  // SEMANTIC_BOUNDARY_ALLOW: 指纹只判断恢复输入与 Skill 快照是否逐字段相同，
  // 不做写作语义、内容质量或素材匹配判断。
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function effectiveVersion(skill: {
  baseVersion: string;
  overlayVersion: string | null;
}): string {
  return skill.overlayVersion ?? skill.baseVersion;
}

function readScriptDraftCheckpoint(
  runtimeData: Record<string, unknown>,
  expected: { inputFingerprint: string; voiceoverSkillVersion: string },
): ScriptDraftCheckpoint | null {
  const raw = runtimeData.scriptDraftCheckpoint;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    value.inputFingerprint !== expected.inputFingerprint ||
    value.voiceoverSkillVersion !== expected.voiceoverSkillVersion ||
    !["voiceover_started", "voiceover_failed", "voiceover_complete"].includes(
      String(value.stage),
    ) ||
    typeof value.storyboardAttemptCount !== "number" ||
    !Number.isInteger(value.storyboardAttemptCount) ||
    value.storyboardAttemptCount < 0 ||
    value.storyboardAttemptCount > 2
  ) {
    throw new Error("写稿恢复断点与当前输入或 Skill 版本不一致，已停止重复生成。");
  }
  const checkpoint = value as unknown as ScriptDraftCheckpoint;
  if (checkpoint.stage === "voiceover_complete") {
    const voiceover = typeof checkpoint.voiceover === "string" ? checkpoint.voiceover : "";
    const hash = createHash("sha256").update(voiceover).digest("hex");
    if (
      !voiceover ||
      checkpoint.charCount !== voiceover.length ||
      checkpoint.sha256 !== hash ||
      !checkpoint.voiceoverGeneration
    ) {
      throw new Error("写稿恢复断点中的连续口播不完整，已停止重复生成。");
    }
  }
  return checkpoint;
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

interface Storyboard {
  sections: ScriptShot[];
}

function renderBody(board: Storyboard): string {
  const lines: string[] = ["# 分镜脚本", ""];
  lines.push(
    "| # | 结构角色 | 口播 | 画面 | 字幕 | 时长 |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  board.sections.forEach((shot, i) => {
    const cell = (value: string) =>
      value.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${i + 1} | ${cell(shot.role)} | ${cell(shot.口播)} | ${cell(shot.画面)} | ${cell(shot.字幕)} | ${cell(shot.时长)} |`,
    );
  });
  return lines.join("\n");
}

function renderSections(
  board: Storyboard,
): Array<{
  id: string;
  heading: string;
  body: string;
  visual?: { description: string; assetRefs: string[]; missing: string[] };
}> {
  return board.sections.map((shot, i) => {
    const label = shot.口播 ? shot.口播.slice(0, 16) : `分镜 ${i + 1}`;
    const role = shot.role ? ` · ${shot.role}` : "";
    const heading = shot.时长
      ? `${i + 1}. ${label}${role}（${shot.时长}）`
      : `${i + 1}. ${label}${role}`;
    const bodyLines = [
      shot.口播 && `口播：${shot.口播}`,
      shot.画面 && `画面：${shot.画面}`,
      shot.字幕 && `字幕：${shot.字幕}`,
    ].filter((line): line is string => Boolean(line));
    return {
      id: `script-saved-${i}`,
      heading,
      body: bodyLines.join("\n"),
      ...(shot.visual ? { visual: shot.visual } : {}),
    };
  });
}

function renderSummary(board: Storyboard): string {
  return `AI 分镜脚本 · ${board.sections.length} 镜`;
}

interface FrozenScriptSource {
  sourceType: "message" | "attachment" | "project_text";
  sourceId: string;
  label: string;
  order: number;
  charCount: number;
  sha256: string;
  body: string;
  complete: true;
}

function readFrozenScriptSources(inputData: Record<string, unknown>): {
  instruction?: string;
  sources: FrozenScriptSource[];
  brief?: string;
  metadata: Array<Omit<FrozenScriptSource, "body">>;
} {
  const raw = inputData.sourceSnapshots;
  if (raw === undefined) return { sources: [], metadata: [] };
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 16) {
    throw new Error("资料快照校验失败：来源清单为空或数量异常。");
  }
  const instruction =
    typeof inputData.instruction === "string" ? inputData.instruction.trim() : "";
  if (!instruction || instruction.length > 4_000) {
    throw new Error("资料快照校验失败：本轮写作方向缺失或过长。");
  }
  let totalChars = 0;
  const sources = raw.map((value, order): FrozenScriptSource => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("资料快照校验失败：来源格式无效。");
    }
    const item = value as Record<string, unknown>;
    const body = typeof item.body === "string" ? item.body : "";
    const sourceType = item.sourceType;
    const sourceId = typeof item.sourceId === "string" ? item.sourceId.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const sha256 = typeof item.sha256 === "string" ? item.sha256 : "";
    totalChars += body.length;
    if (
      !["message", "attachment", "project_text"].includes(String(sourceType)) ||
      !sourceId ||
      item.order !== order ||
      item.complete !== true ||
      !body.trim() ||
      item.charCount !== body.length ||
      sha256 !== createHash("sha256").update(body).digest("hex") ||
      totalChars > 200_000
    ) {
      throw new Error("资料快照校验失败：正文、顺序、字符数或 SHA-256 不一致。");
    }
    return {
      sourceType: sourceType as FrozenScriptSource["sourceType"],
      sourceId,
      label: label || `来源 ${order + 1}`,
      order,
      charCount: body.length,
      sha256,
      body,
      complete: true,
    };
  });
  const brief = sources
    .map(
      (source) =>
        `【受信资料 ${source.order + 1}｜${source.sourceType}｜${source.label}｜${source.charCount} 字符｜sha256=${source.sha256}】\n` +
        "<user_source_data>\n" +
        source.body +
        "\n</user_source_data>",
    )
    .join("\n\n");
  return {
    instruction,
    sources,
    brief,
    metadata: sources.map(({ body: _body, ...metadata }) => metadata),
  };
}

export async function runScriptDraft(
  ctx: RequestContext,
  task: ScriptTask,
  deps: ScriptDeps,
): Promise<void> {
  let resolvedSpec: ModelSpec | null = null;
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      // The confirm path appends a NEW ArtifactVersion onto this artifact; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("script-runner: inputData.artifactId is required");
    }
    if (task.inputData.draftMode === "verbatim") {
      const sourceText =
        typeof task.inputData.verbatimSourceText === "string"
          ? task.inputData.verbatimSourceText
          : "";
      const sourceRef =
        typeof task.inputData.verbatimSourceRef === "string"
          ? task.inputData.verbatimSourceRef
          : "";
      const expectedLength = task.inputData.verbatimSourceLength;
      const expectedHash = task.inputData.verbatimSourceSha256;
      const actualHash = createHash("sha256").update(sourceText).digest("hex");
      if (
        !sourceRef ||
        !sourceText.trim() ||
        sourceText.length > 200_000 ||
        typeof expectedLength !== "number" ||
        expectedLength !== sourceText.length ||
        typeof expectedHash !== "string" ||
        expectedHash !== actualHash
      ) {
        throw new Error(
          "原文校验失败：来源内容、字符数或 SHA-256 与任务输入不一致，已停止生成候选。",
        );
      }

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
      await deps.ai.recordCandidate(ctx, task.id, {
        resultType: "artifact_version",
        artifactId,
        resultData: {
          body: sourceText,
          summary: `原文保真导入 · ${sourceText.length} 字符`,
          draftMode: "verbatim",
          sourceRef,
          sourceLength: sourceText.length,
          sourceSha256: actualHash,
          sections: [{ heading: "", body: sourceText }],
          contentData: {
            sections: [
              { id: "script-saved-0", heading: "", body: sourceText },
            ],
          },
          validationStatus: "valid",
          validationErrors: [],
          qualityWarnings: [],
          canAdopt: true,
        },
      });
      return;
    }
    const frozenSources = readFrozenScriptSources(task.inputData);
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:解析 model(按 capability) + 跑 ai-worker 写文案节点(外置 script.draft 模板),
    // 步骤事件落 ai_task_steps(窗口步骤日志)。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "script.draft");
    resolvedSpec = spec;
    console.info(
      `[script-runner] task=${task.id} capability=script.draft apiFormat=${spec.apiFormat} ` +
        `model=${observableModelKey(spec)} endpoint=${spec.baseUrl ? "custom" : "official"}`,
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
    const nodeInput = {
      model,
      positioningBrief: context.positioningBrief,
      learningsBrief: context.learningsBrief,
      // [T-182a 已接] 知识库沉淀喂进写文案 prompt:组合根 runScriptDraft dispatch 已绑 knowledge
      //   reader(persistence-client.ts,与 topic.generate 同一 reader)→ assembleCreativeContext
      //   产出 context.knowledgeBrief(库空/读失败降级空)→ 此处真喂进写脚本节点。
      knowledgeBrief: context.knowledgeBrief || undefined,
      // [T-270] 立项 Brief 硬锚(项目态):核心信息=钦定主张 / 内容目标含避免X / 内容形式 / 目标观众。
      // creative-context 已按 projectId 决定是否装配(账号态为空,整段省略)。
      projectBriefHardBrief: context.projectBriefHard || undefined,
      // [T-284a] 复刻补链 G1:复刻项目携带的原爆款拆解要素(对标参照·复刻用,段头带诚实门)。
      // creative-context 已按 projectId + briefDetail.benchmarkRef 决定是否装配(非复刻/账号态空,整段省略)。
      benchmarkRefBrief: context.benchmarkRefBrief || undefined,
      projectIntelligenceBrief: context.projectIntelligenceBrief || undefined,
      topicTitle: context.topic.title,
      topicAngle: context.topic.angle,
      extraBrief:
        typeof task.inputData.extraBrief === "string" &&
        task.inputData.extraBrief.trim()
          ? task.inputData.extraBrief.trim()
          : undefined,
      sourceInstruction: frozenSources.instruction,
      sourceMaterialsBrief: frozenSources.brief,
      targetDurationSeconds:
        typeof task.inputData.targetDurationSeconds === "number" &&
        Number.isFinite(task.inputData.targetDurationSeconds) &&
        task.inputData.targetDurationSeconds > 0
          ? task.inputData.targetDurationSeconds
          : undefined,
      orientation: context.orientationHint || undefined,
      // T-730：这里只透传 reader 已验证为当前项目、当前版本且显式 adopted 的论点。
      thesisBrief: context.thesisBrief || undefined,
      contractBrief: context.contractBrief || undefined,
      outlineBrief: context.outlineBrief || undefined,
      // [T-146c] 用户上传素材主权:高优先(用户第一手)进「必须遵守」硬约束段,normal(AI 找的)进
      // 参考段。creative-context 已按 material_link.priority 分流 + 装配好段头(硬约束 + 事实地基)。
      userMaterialHardBrief: context.userMaterialHardBrief || undefined,
      userMaterialRefBrief: context.userMaterialRefBrief || undefined,
      // [T-387b] 项目素材库清单(assets reader 装配「· id | 名称 (类型)」行)—— visual.assetRefs
      // 点名真实 assetId 的唯一可选集;库空/未装配 → undefined(模板整段省略,missing 承接诚实缺)。
      assetsBrief: context.assetsBrief || undefined,
    };
    let pipelineMetadata: Record<string, unknown> = {};
    const result = useLegacyPipeline
      ? await runScriptNode({
          ...nodeInput,
          onStep: async (e) => {
            const terminal = JSON.stringify({
              taskId: task.id,
              accountId: activeSnapshot.accountId,
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
            context: {
              positioningBrief: context.positioningBrief,
              learningsBrief: context.learningsBrief,
              knowledgeBrief: context.knowledgeBrief,
              projectBriefHard: context.projectBriefHard,
              benchmarkRefBrief: context.benchmarkRefBrief,
              projectIntelligenceBrief: context.projectIntelligenceBrief,
              topic: context.topic,
              orientationHint: context.orientationHint,
              thesisBrief: context.thesisBrief,
              contractBrief: context.contractBrief,
              outlineBrief: context.outlineBrief,
              userMaterialHardBrief: context.userMaterialHardBrief,
              userMaterialRefBrief: context.userMaterialRefBrief,
              assetsBrief: context.assetsBrief,
            },
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
              await deps.ai.putScriptDraftCheckpoint(ctx, task.id, checkpoint);
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
          let retryGuidance: string | undefined;
          while (frozen.storyboardAttemptCount < 2) {
            frozen = {
              ...frozen,
              storyboardAttemptCount: frozen.storyboardAttemptCount + 1,
            };
            await deps.ai.putScriptDraftCheckpoint(ctx, task.id, frozen);
            storyboardResult = await runStoryboardSegmentNode({
              model,
              voiceover: frozenVoiceover,
              voiceoverSha256: frozenSha256,
              storyboardAttempt: frozen.storyboardAttemptCount,
              orientation: context.orientationHint || undefined,
              targetDurationSeconds:
                typeof task.inputData.targetDurationSeconds === "number" &&
                Number.isFinite(task.inputData.targetDurationSeconds) &&
                task.inputData.targetDurationSeconds > 0
                  ? task.inputData.targetDurationSeconds
                  : undefined,
              assetsBrief: context.assetsBrief || undefined,
              retryGuidance,
            });
            const joined = storyboardResult.shots
              .map((shot) => shot.口播)
              .join("");
            if (
              joined === frozenVoiceover &&
              createHash("sha256").update(joined).digest("hex") === frozenSha256
            ) {
              break;
            }
            storyboardResult = null;
            retryGuidance =
              "上次逐字切分失败：shots[].口播 无分隔拼接后与冻结口播不一致。只重新切分原文，不得改任何字符。";
          }
          if (!storyboardResult) {
            throw new Error(
              "制作分镜未能保留完整口播，已停止生成候选；请检查模型后重试。",
            );
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
            }),
            toolCalls: [],
          });
          pipelineMetadata = {
            generationPipeline: "voiceover_storyboard_v1",
            voiceoverSha256: frozenSha256,
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
    const { shots, generation, validation } = result;
    if (!validation) {
      throw new Error(
        "script-runner: 整稿缺少有效的 completionPolicy 校验结果，禁止记录候选",
      );
    }
    const board: Storyboard = {
      sections: shots,
    };
    if (board.sections.length === 0) {
      throw new Error("script-runner: agent returned no parseable shots");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(board),
        summary: renderSummary(board),
        // Raw shots — kept so the 采纳 card preview (ScriptDraftIsland.parseShots)
        // still renders 口播/画面/字幕/时长.
        sections: board.sections,
        // Structured editable payload forwarded by the AI confirm branch to
        // createVersion as `contentData` (round-trips into the 脚本 editor).
        contentData: { sections: renderSections(board) },
        // schema 已经保证 sections 非空且字段合法。镜数、角色顺序、输出截断等
        // completion policy 问题降级成质量提醒，不能再让已有整稿消失或无法采纳。
        validationStatus: "valid",
        validationErrors: [],
        qualityWarnings:
          validation.status === "valid"
            ? []
            : validation.errors.map((error) => error.message),
        canAdopt: true,
        accountId: activeSnapshot.accountId,
        skillSnapshot: {
          skillId: effectiveSkill.skillId,
          baseVersion: effectiveSkill.baseVersion,
          overlayRevision: effectiveSkill.overlayRevision,
          overlayVersion: effectiveSkill.overlayVersion,
          completionPolicy: structuredClone(
            validation.policySnapshot.policy,
          ),
          completionPolicyAdapter: structuredClone(
            validation.policySnapshot.adapter,
          ),
        },
        originalSegmentCount: validation.originalSegmentCount,
        finalSegmentCount: validation.finalSegmentCount,
        repairAttemptsUsed: validation.repairAttemptsUsed,
        repairReasons: validation.repairReasons.map(
          (violation) => violation.message,
        ),
        finishReason: generation.finishReason,
        usage: generation.usage,
        generationAttempts: generation.attempts,
        ...pipelineMetadata,
        ...(frozenSources.metadata.length > 0
          ? { sourceSnapshots: frozenSources.metadata }
          : {}),
      },
    });
  } catch (err) {
    const channelManaged =
      resolvedSpec?.displayModelKey === "channel-managed";
    const failureMessage = safeModelFailureMessage(err, resolvedSpec);
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
            accountId: activeSnapshot.accountId,
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
