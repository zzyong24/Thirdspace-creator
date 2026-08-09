import "server-only";

import { createHash } from "node:crypto";

export interface ScriptDraftTaskInput {
  artifactId: string;
  projectId: string;
  topic?: string;
  angle?: string;
  targetDurationSeconds?: number;
  extraBrief?: string;
  draftMode?: "verbatim";
  verbatimSourceRef?: string;
  verbatimSourceText?: string;
  verbatimSourceLength?: number;
  verbatimSourceSha256?: string;
}

/**
 * [T-727] script.draft task 的单一输入装配点。保真正文在真正入队前再次校验 hash/长度，防止
 * 组合根漏字段或误把摘要写成原文；普通 generate 保持旧形状。
 */
export function buildScriptDraftTaskInputData(
  input: ScriptDraftTaskInput,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    artifactId: input.artifactId,
    projectId: input.projectId,
  };
  if (input.draftMode === "verbatim") {
    const sourceRef = input.verbatimSourceRef ?? "";
    const sourceText = input.verbatimSourceText ?? "";
    const sourceLength = input.verbatimSourceLength;
    const sourceSha256 = input.verbatimSourceSha256 ?? "";
    const actualHash = createHash("sha256").update(sourceText).digest("hex");
    if (
      !sourceRef ||
      !sourceText.trim() ||
      sourceText.length > 200_000 ||
      sourceLength !== sourceText.length ||
      !/^[a-f0-9]{64}$/.test(sourceSha256) ||
      sourceSha256 !== actualHash
    ) {
      throw new Error("原文保真任务输入校验失败，请重新选择原稿。");
    }
    return {
      ...base,
      draftMode: "verbatim",
      verbatimSourceRef: sourceRef,
      verbatimSourceText: sourceText,
      verbatimSourceLength: sourceLength,
      verbatimSourceSha256: sourceSha256,
    };
  }
  return {
    ...base,
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.angle ? { angle: input.angle } : {}),
    ...(typeof input.targetDurationSeconds === "number"
      ? { targetDurationSeconds: input.targetDurationSeconds }
      : {}),
    ...(input.extraBrief ? { extraBrief: input.extraBrief } : {}),
  };
}
