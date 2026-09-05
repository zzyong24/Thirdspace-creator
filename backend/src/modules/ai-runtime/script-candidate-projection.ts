import type {
  ScriptShot,
  RunScriptNodeResult,
  EffectiveSkill,
} from "@creatoros/ai-worker";
import type { RecordCandidateInput } from "../ai/ai.service";
import type { WorkerStructuredResult } from "@creatoros/contract/execution-worker";
import type {
  FrozenScriptSource,
  prepareScriptDraftContext,
} from "./script-preparation";

export interface ScriptDraftProjectionInput {
  artifactId: string;
  shots: ScriptShot[];
  // 旧口播断点中的 attempts 是不透明记录；这里只原样呈现，不重新解释历史计量。
  generation: Omit<RunScriptNodeResult["generation"], "attempts"> & {
    attempts: Array<Record<string, unknown>>;
  };
  validation: WorkerStructuredResult["validation"];
  accountId: string;
  effectiveSkill: Pick<
    EffectiveSkill,
    "skillId" | "baseVersion" | "overlayRevision" | "overlayVersion"
  >;
  pipelineMetadata: Record<string, unknown>;
  sourceMetadata: Array<Omit<FrozenScriptSource, "body">>;
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

function renderSections(board: Storyboard): Array<{
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

/** 纯呈现：不生成内容，不写库；partial整稿继续保留采纳能力。 */
export function projectScriptDraftCandidate(
  input: ScriptDraftProjectionInput,
): RecordCandidateInput {
  const {
    artifactId,
    shots,
    generation,
    validation,
    accountId,
    effectiveSkill,
    pipelineMetadata,
    sourceMetadata,
  } = input;
  if (!validation)
    throw new Error(
      "script-runner: 整稿缺少有效的 completionPolicy 校验结果，禁止记录候选",
    );
  const board: Storyboard = { sections: shots };
  if (shots.length === 0)
    throw new Error("script-runner: agent returned no parseable shots");
  return {
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
      accountId,
      skillSnapshot: {
        skillId: effectiveSkill.skillId,
        baseVersion: effectiveSkill.baseVersion,
        overlayRevision: effectiveSkill.overlayRevision,
        overlayVersion: effectiveSkill.overlayVersion,
        completionPolicy: structuredClone(validation.policySnapshot.policy),
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
      ...(sourceMetadata.length > 0 ? { sourceSnapshots: sourceMetadata } : {}),
    },
  };
}

/** 输入只能来自prepareScriptDraftContext完成的原文校验结果。 */
export function projectVerbatimScriptCandidate(
  prepared: Extract<
    Awaited<ReturnType<typeof prepareScriptDraftContext>>,
    { mode: "verbatim" }
  >,
): RecordCandidateInput {
  const { artifactId, sourceText, sourceRef, sourceLength, sourceSha256 } =
    prepared;
  return {
    resultType: "artifact_version",
    artifactId,
    resultData: {
      body: sourceText,
      summary: `原文保真导入 · ${sourceLength} 字符`,
      draftMode: "verbatim",
      sourceRef,
      sourceLength: sourceLength,
      sourceSha256: sourceSha256,
      sections: [{ heading: "", body: sourceText }],
      contentData: {
        sections: [{ id: "script-saved-0", heading: "", body: sourceText }],
      },
      validationStatus: "valid",
      validationErrors: [],
      qualityWarnings: [],
      canAdopt: true,
    },
  };
}
