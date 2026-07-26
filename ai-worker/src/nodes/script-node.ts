import type { LanguageModel } from "ai";
import type { AgentStepEvent } from "../runtime/agent-runtime";
import {
  runStructuredNode,
  type RunStructuredNodeResult,
} from "./structured-node";
import { SCRIPT_DRAFT_TEMPLATE } from "../prompt/templates/script-draft";

// 分镜脚本节点(写文案,跑在 Vercel AI SDK 上,弃旧 LlmCompleter)。一个分镜 = 爆款公式的一拍。
// 产物是结构化 ScriptShot[](口播/画面/字幕/时长 四字段独立,不压扁 —— 配合 CollabField 逐字段可改),
// 由上层渲染成 artifact_version 候选。提示词走外置模板(script.draft),换方法论不动本文件。
//
// T-023 跨模型健壮性:改走 **runStructuredNode**(generateObject 绑 script.draft 的 outputSchema,
// 落空则文本兜底抽 JSON 再同 schema 校验),复用 research.gather / calibration.score 同一条防发散路。
// 旧路径(runAgentNode 拿自由文本 + parseShots 宽容解析)在用户默认的 MiniMax-M3 下常吐不出可解析
// 数组 → 抛「未产出可解析分镜」→ 任务 cancelled(AI 初稿出不来的根因)。结构化 + 兜底后任何模型都产
// 可解析分镜。parseShots 仍作纯工具导出(采纳卡预览等复用),不再是本节点的解析主路。

// [T-387b] 结构化视觉意图(与 scriptShotVisualSchema 同形):写稿阶段的**意图草稿**(非真源;
// 真源在采纳定稿时刻的「分镜凝固 pass」对照真实素材库校验后凝固,见 backend ai.service confirm)。
export interface ScriptShotVisual {
  description: string;
  assetRefs: string[];
  missing: string[];
}

export interface ScriptShot {
  /** 当前 Skill 声明的结构角色；通用内核只比较字符串序列，不识别业务词。 */
  role: string;
  口播: string;
  画面: string;
  字幕: string;
  时长: string;
  /** [T-387b] 可选结构化视觉意图(弱模型不产 → 缺省,行为同旧;画面文本列保留)。 */
  visual?: ScriptShotVisual;
}

export interface RunScriptNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context)。 */
  positioningBrief: string;
  /** 过往复盘爆款要素(选填)。 */
  learningsBrief?: string;
  // [T-062b gate-F3] 知识库参考(选填,creative-context 装配)。
  knowledgeBrief?: string;
  /**
   * [T-270] 立项 Brief 硬锚段(选填,项目态):creative-context.renderProjectBriefHard 已装配含
   * 「【本条内容立项硬约束·必须遵守】」段头(核心信息/内容目标含避免X/内容形式/目标观众)。有则注入
   * 定位之后、任务之前,让脚本主张锚定钦定核心信息、不漂移。账号态/无 brief → 空,整段省略。
   */
  projectBriefHardBrief?: string;
  /**
   * [T-284a] 复刻补链 G1 —— 「对标参照·复刻用」段(选填,复刻项目态):creative-context.renderBenchmarkRef
   * 已装配含诚实门段头「他号拆解·仅作结构参照,禁照搬原文案」+ 原爆款为什么爆/结构拆解/钩子/可借鉴点/
   * 适配建议。有则注入(照这条爆款的结构逻辑换本账号定位重做);非复刻/账号态 → 空,整段省略。
   */
  benchmarkRefBrief?: string;
  /** 本期选题标题/切入(选填)。 */
  topicTitle?: string;
  topicAngle?: string;
  /** 横屏/竖屏(SKL-02,选填):喂 AI 调 hook 与时长。 */
  orientation?: string;
  /** 策划论点树 brief(SEAM-01,选填):脚本据此把核心/支撑/证据写进口播。 */
  thesisBrief?: string;
  /** 内容合同 brief(SEAM-01,选填):脚本须遵守受众定位/价值主张/节奏/CTA。 */
  contractBrief?: string;
  /** 策划结构方案 brief(SEAM-01,选填):脚本按结构方案段落顺序铺分镜,不另起结构。 */
  outlineBrief?: string;
  /** [T-081] 对话中获得的补充指令/洞察(选填):原样注入 prompt,优先级高于既有档案。 */
  extraBrief?: string;
  /**
   * [T-146c] 用户第一手资料·最高优先·硬约束段(选填):高优先(priority=high)用户上传素材的
   * 要点卡/全文,调用方(creative-context.formatUserMaterialBrief)已装配含「最高优先 · 必须遵守」
   * 段头。文案必须紧扣其事实/数据/卖点。本节点在此段后追加「事实硬约束 + 表达自由」的 gate 平衡说明。
   */
  userMaterialHardBrief?: string;
  /**
   * [T-146c] 用户参考素材·参考级(选填):normal 优先(AI 找的二手)素材,进普通参考段,非硬约束。
   */
  userMaterialRefBrief?: string;
  /**
   * [T-387b] 项目素材库清单(选填,creative-context assetsBrief:「· id | 名称 (类型)」行列表)——
   * visual.assetRefs 点名真实 assetId 的唯一可选集。空 → 整段省略,模板指令要求 assetRefs 留空、
   * 需要的素材如实进 missing(禁虚构)。
   */
  assetsBrief?: string;
  /** 步骤回调 —— 喂窗口步骤日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
  /** 护栏:结构化校验失败的最大重试次数(默认 2,透传 runStructuredNode)。 */
  maxRetries?: number;
}

export interface RunScriptNodeResult {
  shots: ScriptShot[];
  steps: AgentStepEvent[];
  generation: RunStructuredNodeResult<{
    shots: ScriptShot[];
  }>["generation"];
  validation?: RunStructuredNodeResult<{
    shots: ScriptShot[];
  }>["validation"];
}

/** [T-387b] visual 归一(纯函数,导出供单测):trim、滤空串;三段全空 → null(不带字段)。 */
export function normalizeShotVisual(
  raw:
    | { description?: string; assetRefs?: string[]; missing?: string[] }
    | undefined,
): ScriptShotVisual | null {
  if (!raw) return null;
  const description = (raw.description ?? "").trim();
  const clean = (arr: string[] | undefined) =>
    (arr ?? []).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  const assetRefs = clean(raw.assetRefs);
  const missing = clean(raw.missing);
  if (!description && assetRefs.length === 0 && missing.length === 0) return null;
  return { description, assetRefs, missing };
}

/** 从 agent 文本里宽容抽出分镜 JSON 数组(容忍 ``` 包裹 / 前后散文)。 */
export function parseShots(text: string): ScriptShot[] {
  if (!text) return [];
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw): ScriptShot | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const role = typeof o.role === "string" ? o.role.trim() : "";
      const 口播 = typeof o.口播 === "string" ? o.口播.trim() : "";
      const 画面 = typeof o.画面 === "string" ? o.画面.trim() : "";
      const 字幕 = typeof o.字幕 === "string" ? o.字幕.trim() : "";
      const 时长 = typeof o.时长 === "string" ? o.时长.trim() : "";
      if (!口播 && !画面 && !字幕) return null;
      return { role, 口播, 画面, 字幕, 时长 };
    })
    .filter((s): s is ScriptShot => s !== null);
}

/**
 * 跑一次写文案节点 —— runStructuredNode(generateObject 绑 script.draft outputSchema,落空则文本兜底)
 * 产**被 schema 卡死**的 { shots } + 一条步骤事件。facets 装配同旧路径(定位/过往爆款/选题/横竖屏/
 * 策划产物);SEAM-01 有策划产物就注入,让脚本铺它们的结构与论点。
 */
export async function runScriptNode(
  input: RunScriptNodeInput,
): Promise<RunScriptNodeResult> {
  let structured: RunStructuredNodeResult<{ shots: ScriptShot[] }>;
  try {
    structured = await runStructuredNode<{ shots: ScriptShot[] }>({
      model: input.model,
      template: SCRIPT_DRAFT_TEMPLATE,
      facets: {
      positioning:
        input.positioningBrief ||
        "（创作者尚未设置定位——按通用爆款逻辑写脚本）",
      // [T-270] 立项 Brief 硬锚(项目态)—— creative-context 已装配含「必须遵守」段头,原样注入;
      // 空(账号态/无 brief)则整段省略。放在 positioning 之后,让模型先读到本条立项的钦定前提。
      projectBriefHard: input.projectBriefHardBrief
        ? `\n${input.projectBriefHardBrief}`
        : "",
      // [T-284a] 复刻补链 G1:复刻参照段(段头含诚实门,creative-context 已装配)。空(非复刻/账号态)
      // 则整段省略。放在立项硬约束之后,让模型先读到本条立项的钦定前提、再读复刻参照。
      benchmarkRef: input.benchmarkRefBrief
        ? `\n${input.benchmarkRefBrief}`
        : "",
      learnings: input.learningsBrief
        ? `\n【过往复盘爆款要素】\n${input.learningsBrief}`
        : "",
      // [T-062b gate-F3] 知识库参考 —— 让脚本能引用创作者沉淀的素材/金句/逐字稿。
      knowledge: input.knowledgeBrief
        ? `\n--- 知识库参考 ---\n${input.knowledgeBrief}`
        : "",
      topic: input.topicTitle
        ? `\n【本期选题】${input.topicTitle}${
            input.topicAngle ? `（切入：${input.topicAngle}）` : ""
          }`
        : "",
      orientation: input.orientation
        ? `\n【形式】${input.orientation}（据此调整钩子与时长）`
        : "",
      // SEAM-01:策划阶段产物 —— 论点树 / 内容合同 / 结构方案。有则注入,让脚本铺它们的结构与论点。
      thesis: input.thesisBrief
        ? `\n【论点树（核心/支撑/证据/反驳）】\n${input.thesisBrief}`
        : "",
      contract: input.contractBrief
        ? `\n【内容合同（受众定位/价值主张/核心节奏/行动召唤）】\n${input.contractBrief}`
        : "",
      outline: input.outlineBrief
        ? `\n【策划结构方案（脚本按此铺分镜）】\n${input.outlineBrief}`
        : "",
      // [T-081] 对话洞察/补充指令 —— ChatBox 对话里聊出的生成方向经此进 prompt(空则整段省略)。
      extraBrief: input.extraBrief
        ? `\n【本次生成指令（来自对话，优先遵循）】\n${input.extraBrief}`
        : "",
      // [T-146c] 用户第一手资料硬约束段 —— creative-context 已装配含「最高优先 · 必须遵守」段头
      // (要点/事实/卖点)。这里在段后追加 gate 平衡说明:事实/数据/卖点必须忠于资料(不许改、不许
      // 编造原文没有的卖点),但开头/角度/钩子/叙述结构由你创作 —— 既紧扣核心事实,又不沦为复读机。
      userMaterialHard: input.userMaterialHardBrief
        ? `\n${input.userMaterialHardBrief}\n（说明：以上资料的**事实、数据、卖点**必须忠于原文——不得改动、弱化，也不得编造原文未声明的卖点；但开头、切入角度、钩子、叙述结构由你自由创作，写出有传播力的文案，而不是机械复述资料。）`
        : "",
      // [T-146c] 参考素材段 —— normal 优先(AI 找的),参考级注入,不套硬约束头。
      userMaterialRef: input.userMaterialRefBrief
        ? `\n【参考素材（AI 搜集，参考级）】\n${input.userMaterialRefBrief}`
        : "",
      // [T-387b] 项目素材库清单 —— visual.assetRefs 只能点名这里出现过的真实 assetId(诚实门
      // 指令在模板正文);库空/未装配 → 整段省略。
      assetsLibrary: input.assetsBrief
        ? `\n【项目素材库（visual.assetRefs 可点名的真实素材清单，每行: assetId | 名称 (类型)）】\n${input.assetsBrief}`
        : "",
      },
      maxRetries: input.maxRetries,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("结构化节点:")
    ) {
      throw new Error(
        "script-node: agent 未产出可解析分镜（结构校验与重试均失败）",
        { cause: err },
      );
    }
    throw err;
  }
  const { object, generation, validation } = structured;
  // schema 让缺字段落成空串,故这里 trim + 滤掉三主字段全空的空镜(不摆空格子)。
  // [T-387b] visual 归一:trim、滤空串;三段全空 → 不带字段(与「模型没产」同义,诚实缺省)。
  const shots: ScriptShot[] = (object.shots ?? [])
    .map((s) => {
      const visual = normalizeShotVisual(s.visual);
      return {
        role: (s.role ?? "").trim().toLowerCase(),
        口播: (s.口播 ?? "").trim(),
        画面: (s.画面 ?? "").trim(),
        字幕: (s.字幕 ?? "").trim(),
        时长: (s.时长 ?? "").trim(),
        ...(visual ? { visual } : {}),
      };
    })
    .filter((s) => s.口播 || s.画面 || s.字幕);
  if (shots.length === 0) {
    throw new Error("script-node: agent 未产出可解析分镜");
  }
  // 结构化路径是单发(无多步工具循环),合成一条完成步事件喂窗口步骤日志(诚实:就一步)。
  const step: AgentStepEvent = {
    stepNo: 1,
    text:
      `已生成 ${shots.length} 个分镜；finishReason=${generation.finishReason}` +
      (generation.usage.totalTokens === null
        ? ""
        : `；usage=${JSON.stringify(generation.usage)}`),
    toolCalls: [],
    finishReason: generation.finishReason,
    usage: generation.usage,
  };
  await input.onStep?.(step);
  return {
    shots,
    steps: [step],
    generation,
    ...(validation ? { validation } : {}),
  };
}
