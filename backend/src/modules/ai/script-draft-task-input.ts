import { createHash } from "node:crypto";
import {outputConversionContext,type OutputConversionContext} from "@creatoros/contract";

export interface ScriptDraftTaskInput {
  conversion?:OutputConversionContext;
  conversionConstraints?:{factItems:unknown[];sourceRefs:Array<{location:string;refs:unknown[]}>;ruleSnapshotRef:unknown};
  artifactId: string;
  projectId: string;
  outputId?: string;
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
  const conversion=input.conversion?outputConversionContext.parse(input.conversion):undefined;
  if(conversion && (conversion.request.targetType!=="video" || input.draftMode==="verbatim" || !input.sourceSnapshots?.length || !input.conversionConstraints))
    throw new Error("转换脚本须具有完整来源快照与事实约束");
  if(!conversion && input.conversionConstraints!==undefined)throw new Error("转换约束缺少完整请求");
  const base: Record<string, unknown> = {
    ...(conversion?{conversion:structuredClone(conversion),conversionConstraints:structuredClone(input.conversionConstraints)}:{}),
    artifactId: input.artifactId,
    projectId: input.projectId,
    ...(input.outputId ? {outputId: input.outputId} : {}),
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
  const instruction=input.instruction?.trim();
  if(instruction && instruction.length>210_000)throw new Error("本轮要求超过可处理长度，请拆分消息后重试。");
  const sourceSnapshots = input.sourceSnapshots ?? [];
  if (sourceSnapshots.length > 0) {
    const instruction = input.instruction?.trim() ?? "";
    let totalChars = 0;
    const valid =
      instruction.length > 0 &&
      instruction.length <= 210_000 &&
      sourceSnapshots.length <= 17 &&
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
      totalChars <= 400_000;
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
    ...(instruction ? {instruction} : {}),
    ...(sourceSnapshots.length > 0
      ? {
          sourceSnapshots,
        }
      : {}),
  };
}
