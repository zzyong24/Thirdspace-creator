import "server-only";

import { createHash } from "node:crypto";

export interface ScriptDraftTaskInput {
  artifactId: string;
  projectId: string;
  topic?: string;
  angle?: string;
  targetDurationSeconds?: number;
  extraBrief?: string;
  instruction?: string;
  sourceSnapshots?: Array<{
    sourceType: "message" | "attachment" | "project_text";
    sourceId: string;
    label: string;
    order: number;
    charCount: number;
    sha256: string;
    body: string;
    complete: true;
  }>;
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
  const sourceSnapshots = input.sourceSnapshots ?? [];
  if (sourceSnapshots.length > 0) {
    const instruction = input.instruction?.trim() ?? "";
    let totalChars = 0;
    const valid =
      instruction.length > 0 &&
      instruction.length <= 4_000 &&
      sourceSnapshots.length <= 16 &&
      sourceSnapshots.every((source, index) => {
        totalChars += source.body.length;
        return (
          ["message", "attachment", "project_text"].includes(source.sourceType) &&
          Boolean(source.sourceId.trim()) &&
          source.order === index &&
          source.complete === true &&
          Boolean(source.body.trim()) &&
          source.charCount === source.body.length &&
          /^[a-f0-9]{64}$/.test(source.sha256) &&
          source.sha256 ===
            createHash("sha256").update(source.body).digest("hex")
        );
      }) &&
      totalChars <= 200_000;
    if (!valid) {
      throw new Error("资料快照校验失败，请重新选择完整资料后生成。");
    }
  }
  return {
    ...base,
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.angle ? { angle: input.angle } : {}),
    ...(typeof input.targetDurationSeconds === "number"
      ? { targetDurationSeconds: input.targetDurationSeconds }
      : {}),
    ...(input.extraBrief ? { extraBrief: input.extraBrief } : {}),
    ...(sourceSnapshots.length > 0
      ? {
          instruction: input.instruction!.trim(),
          sourceSnapshots,
        }
      : {}),
  };
}
