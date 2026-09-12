import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import { assembleCreativeContext, type ContextDeps } from "./creative-context";

export interface FrozenScriptSource {
  sourceType: "message" | "attachment" | "project_text";
  sourceId: string;
  label: string;
  order: number;
  charCount: number;
  sha256: string;
  body: string;
  complete: true;
}

export function readFrozenScriptSources(inputData: Record<string, unknown>): {
  instruction?: string;
  sources: FrozenScriptSource[];
  brief?: string;
  metadata: Array<Omit<FrozenScriptSource, "body">>;
} {
  const raw = inputData.sourceSnapshots;
  if (raw === undefined) {
    const instruction = typeof inputData.instruction === "string" ? inputData.instruction.trim() : undefined;
    if ((inputData.instruction !== undefined && typeof inputData.instruction !== "string") || (instruction?.length ?? 0) > 210_000) throw new Error("写作方向格式无效或过长。");
    return { instruction: instruction || undefined, sources: [], metadata: [] };
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 17) {
    throw new Error("资料快照校验失败：来源清单为空或数量异常。");
  }
  const instruction =
    typeof inputData.instruction === "string"
      ? inputData.instruction.trim()
      : "";
  if (!instruction || instruction.length > 210_000) {
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
    const sourceId =
      typeof item.sourceId === "string" ? item.sourceId.trim() : "";
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
      totalChars > 400_000
    ) {
      throw new Error(
        "资料快照校验失败：正文、顺序、字符数或 SHA-256 不一致。",
      );
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

/** 仅校验冻结来源并读取创作上下文；不解析模型、不执行生成、不写库。 */
export async function prepareScriptDraftContext(
  ctx: RequestContext,
  task: { projectId: string | null; inputData: Record<string, unknown> },
  deps: ContextDeps,
) {
  const artifactId =
    typeof task.inputData.artifactId === "string"
      ? task.inputData.artifactId
      : "";
  if (!artifactId) {
    // 采纳时需要向真实工件追加版本；缺少目标时不能生成候选。
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

    return {
      artifactId,
      mode: "verbatim" as const,
      sourceText,
      sourceRef,
      sourceLength: sourceText.length,
      sourceSha256: actualHash,
    };
  }
  const frozenSources = readFrozenScriptSources(task.inputData);
  const topic =
    typeof task.inputData.topic === "string" ? task.inputData.topic : "";
  const context = await assembleCreativeContext(
    ctx,
    { projectId: task.projectId, topic },
    deps,
  );
  const nodeInput = {
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
  const fingerprintContext = {
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
  };
  return {
    artifactId,
    mode: "generate" as const,
    nodeInput,
    frozenSources,
    fingerprintContext,
  };
}
