import type { LanguageModel } from "ai";
import type { RunStructuredNodeResult } from "./structured-node";
import { runStructuredNode } from "./structured-node";
import {
  SCRIPT_STORYBOARD_SEGMENT_TEMPLATE,
  SCRIPT_VOICEOVER_COMPOSE_TEMPLATE,
  type VoiceoverComposeOutput,
} from "../prompt/templates/script-voiceover-storyboard";
import type { ScriptShot } from "./script-node";
import { normalizeShotVisual } from "./script-node";

export const SCRIPT_PIPELINE_MODEL_TIMEOUT_MS = 150_000;

export interface RunVoiceoverComposeNodeInput {
  model: LanguageModel;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  positioningBrief: string;
  learningsBrief?: string;
  knowledgeBrief?: string;
  projectBriefHardBrief?: string;
  benchmarkRefBrief?: string;
  projectIntelligenceBrief?: string;
  topicTitle?: string;
  topicAngle?: string;
  orientation?: string;
  targetDurationSeconds?: number;
  thesisBrief?: string;
  contractBrief?: string;
  outlineBrief?: string;
  extraBrief?: string;
  sourceInstruction?: string;
  sourceMaterialsBrief?: string;
  userMaterialHardBrief?: string;
  userMaterialRefBrief?: string;
}

export interface RunVoiceoverComposeNodeResult extends VoiceoverComposeOutput {
  generation: RunStructuredNodeResult<VoiceoverComposeOutput>["generation"];
}

function durationFacet(seconds: number | undefined): string {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? `\n【目标口播时长】约 ${Math.round(seconds)} 秒。按自然中文口播节奏控制整体篇幅，不靠重复和空话硬凑。`
    : "\n【目标口播时长】未指定。按资料密度和说服完整性给出自然长度。";
}

export async function runVoiceoverComposeNode(
  input: RunVoiceoverComposeNodeInput,
): Promise<RunVoiceoverComposeNodeResult> {
  const result = await runStructuredNode<VoiceoverComposeOutput>({
    model: input.model,
    template: SCRIPT_VOICEOVER_COMPOSE_TEMPLATE,
    facets: {
      positioning:
        input.positioningBrief || "（创作者尚未设置定位——按当前资料诚实写作）",
      projectBriefHard: input.projectBriefHardBrief
        ? `\n${input.projectBriefHardBrief}`
        : "",
      projectIntelligence: input.projectIntelligenceBrief
        ? `\n${input.projectIntelligenceBrief}`
        : "",
      benchmarkRef: input.benchmarkRefBrief
        ? `\n${input.benchmarkRefBrief}`
        : "",
      learnings: input.learningsBrief
        ? `\n【过往复盘爆款要素】\n${input.learningsBrief}`
        : "",
      knowledge: input.knowledgeBrief
        ? `\n【知识库参考】\n${input.knowledgeBrief}`
        : "",
      userMaterialHard: input.userMaterialHardBrief
        ? `\n${input.userMaterialHardBrief}`
        : "",
      userMaterialRef: input.userMaterialRefBrief
        ? `\n【参考素材】\n${input.userMaterialRefBrief}`
        : "",
      topic: input.topicTitle
        ? `\n【本期选题】${input.topicTitle}${input.topicAngle ? `（切入：${input.topicAngle}）` : ""}`
        : "",
      orientation: input.orientation ? `\n【形式】${input.orientation}` : "",
      durationTarget: durationFacet(input.targetDurationSeconds),
      thesis: input.thesisBrief
        ? `\n【论点树·覆盖要求】\n${input.thesisBrief}`
        : "",
      contract: input.contractBrief
        ? `\n【内容合同·覆盖要求】\n${input.contractBrief}`
        : "",
      outline: input.outlineBrief
        ? `\n【结构方案·覆盖要求，不是成稿目录】\n${input.outlineBrief}`
        : "",
      extraBrief: input.extraBrief
        ? `\n【本次生成指令】\n${input.extraBrief}`
        : "",
      sourceInstruction: input.sourceInstruction
        ? `【本轮明确写作方向·最高优先】\n${input.sourceInstruction}\n\n`
        : "",
      sourceMaterials: input.sourceMaterialsBrief
        ? `【本轮受信资料·完整正文】\n${input.sourceMaterialsBrief}\n\n`
        : "",
    },
    timeoutMs: SCRIPT_PIPELINE_MODEL_TIMEOUT_MS,
    signal: input.signal,
    maxOutputTokens: input.maxOutputTokens,
  });
  return {
    centralClaim: result.object.centralClaim.trim(),
    audienceOldBelief: result.object.audienceOldBelief.trim(),
    voiceover: result.object.voiceover.trim(),
    generation: result.generation,
  };
}

export interface RunStoryboardSegmentNodeInput {
  model: LanguageModel;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  voiceover: string;
  voiceoverSha256: string;
  storyboardAttempt: number;
  orientation?: string;
  targetDurationSeconds?: number;
  assetsBrief?: string;
  retryGuidance?: string;
}

export interface RunStoryboardSegmentNodeResult {
  shots: ScriptShot[];
  generation: RunStructuredNodeResult<{ shots: ScriptShot[] }>["generation"];
  validation?: RunStructuredNodeResult<{ shots: ScriptShot[] }>["validation"];
}

export async function runStoryboardSegmentNode(
  input: RunStoryboardSegmentNodeInput,
): Promise<RunStoryboardSegmentNodeResult> {
  const result = await runStructuredNode<{ shots: ScriptShot[] }>({
    model: input.model,
    template: SCRIPT_STORYBOARD_SEGMENT_TEMPLATE,
    facets: {
      voiceover: input.voiceover,
      voiceoverSha256: input.voiceoverSha256,
      orientation: input.orientation ? `\n【画幅】${input.orientation}` : "",
      durationTarget: durationFacet(input.targetDurationSeconds),
      assetsLibrary: input.assetsBrief
        ? `\n【项目素材库】\n${input.assetsBrief}`
        : "",
      retryGuidance: input.retryGuidance
        ? `\n【上次逐字切分失败，本次必须修正】\n${input.retryGuidance}`
        : "",
    },
    timeoutMs: SCRIPT_PIPELINE_MODEL_TIMEOUT_MS,
    signal: input.signal,
    maxOutputTokens: input.maxOutputTokens,
  });
  const shots = result.object.shots.map((shot) => {
    const visual = normalizeShotVisual(shot.visual);
    return {
      role: (shot.role ?? "").trim().toLowerCase(),
      口播: shot.口播 ?? "",
      画面: (shot.画面 ?? "").trim(),
      字幕: (shot.字幕 ?? "").trim(),
      时长: (shot.时长 ?? "").trim(),
      ...(visual ? { visual } : {}),
    };
  });
  return {
    shots,
    generation: result.generation,
    ...(result.validation ? { validation: result.validation } : {}),
  };
}
